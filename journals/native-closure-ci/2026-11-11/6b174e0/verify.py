"""Verify immutable CI receipts and their limited claims, without network access."""
from pathlib import Path
from datetime import datetime
import gzip
import hashlib
import io
import json
import re
import zipfile

base = Path(__file__).resolve().parent
source = "6b174e0b903225923999a44fb1de7d67cc4e2959"
sha = lambda data: hashlib.sha256(data).hexdigest()
manifest = json.loads((base / "manifest.json").read_text())
assert manifest["schema"] == "tpnil-ci-log-archive-manifest@1"
assert manifest["source"] == source
raw = {}
paths = set()
for entry in manifest["rawReceipts"] + manifest["files"]:
    path = entry["path"]
    assert path not in paths and not Path(path).is_absolute() and ".." not in Path(path).parts
    paths.add(path)
    file = base / path
    assert file.is_file() and not file.is_symlink()
    data = file.read_bytes()
    assert len(data) == entry["bytes"] and sha(data) == entry["sha256"], path
    if "encoding" in entry:
        assert entry["encoding"] in ["identity", "gzip"]
        original = gzip.decompress(data) if entry["encoding"] == "gzip" else data
        assert len(original) == entry["originalBytes"] and sha(original) == entry["originalSha256"], path
        assert entry["originalPath"] not in raw
        raw[entry["originalPath"]] = original
assert {p.relative_to(base).as_posix() for p in base.rglob("*") if p.is_file()} == paths | {"manifest.json"}
assert len(manifest["rawReceipts"]) == 76


def read(run, name):
    return raw[f"out/native-closure-20261111/ci-6b174e0/{run}/{name}"]


def obj(run, name):
    return json.loads(read(run, name))


def clean(data):
    text = re.sub(r"^\d{4}-\d\d-\d\dT[^ ]+ ", "", data.decode(), flags=re.M)
    return re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", text)


def objects(text):
    decoder = json.JSONDecoder()
    results = []
    for start in re.finditer(r"^\{", text, re.M):
        try:
            value, _ = decoder.raw_decode(text[start.start():])
            results.append(value)
        except json.JSONDecodeError:
            pass
    return results


def only(values, predicate):
    matches = [value for value in values if predicate(value)]
    assert len(matches) == 1
    return matches[0]


def node_counts(text):
    return [dict(zip(["tests", "pass", "fail", "skipped"], map(int, counts)))
            for counts in re.findall(r"ℹ tests (\d+).*?ℹ pass (\d+).*?ℹ fail (\d+).*?ℹ skipped (\d+)", text, re.S)]


def vitest_counts(text):
    return [{"pass": int(p), "skipped": int(s or 0), "total": int(t)}
            for p, s, t in re.findall(r"Tests\s+(\d+) passed(?:\s*\|\s*(\d+) skipped)?\s*\((\d+)\)", text)]


logs = {}
job_seconds = {}
for run, conclusion, expected_jobs in [(43143699101, "failure", 3), (43143699270, "success", 1)]:
    api = obj(run, "run.json")
    assert api["id"] == run and api["head_sha"] == source and api["event"] == "push"
    assert api["status"] == "completed" and api["conclusion"] == conclusion and api["run_attempt"] == 1
    jobs = obj(run, "jobs.json")
    assert jobs["total_count"] == len(jobs["jobs"]) == expected_jobs
    durations = []
    with zipfile.ZipFile(io.BytesIO(read(run, "run-logs.zip"))) as archive:
        assert archive.testzip() is None
        for job in jobs["jobs"]:
            name = job["name"]
            assert job["run_id"] == run and job["head_sha"] == source and job["status"] == "completed"
            assert job["conclusion"] == ("failure" if name == "offline-core" else "success")
            duration = (datetime.fromisoformat(job["completed_at"].replace("Z", "+00:00")) -
                        datetime.fromisoformat(job["started_at"].replace("Z", "+00:00"))).total_seconds()
            assert duration > 0
            durations.append(duration)
            member = only(archive.namelist(), lambda value: re.fullmatch(r"\d+_" + re.escape(name) + r"\.txt", value))
            log = read(run, name + "-full-job.log")
            assert archive.read(member) == log
            logs[name] = clean(log)
            assert re.search(r"\[command\]/usr/bin/git log -1 --format=%H\n([a-f0-9]{40})", logs[name])[1] == source
    job_seconds[run] = sum(durations)
    artifacts = obj(run, "artifacts.json")
    assert artifacts["total_count"] == len(artifacts["artifacts"])
    review = obj(run, "independent-log-review.json")
    for file in review.get("files", []):
        assert len(raw[file["path"]]) == file["bytes"] and sha(raw[file["path"]]) == file["sha256"]
assert job_seconds == {43143699101: 1228, 43143699270: 113}

foundation = obj(43143699101, "independent-log-review.json")
core, integrated, go = (logs[key] for key in ["offline-core", "integrated-components", "go-components"])
failed_job = only(obj(43143699101, "jobs.json")["jobs"], lambda value: value["name"] == "offline-core")
assert [s["name"] for s in failed_job["steps"] if s["conclusion"] == "failure"] == [
    "Run node journals/native-nosend-change/2026-11-09/oracle4-preflight/replay.mjs"]
assert any("python3 -m unittest" in s["name"] and s["conclusion"] == "skipped" for s in failed_job["steps"])
assert "AssertionError [ERR_ASSERTION]" in core and "oracle4-preflight/replay.mjs:16:" in core
assert "8669a2402df714ac1b71b6ab9d8e4a5c03f86095022dba38998c6b50724494a7" in core
assert "a62b420a5a42a23ae454ff65ecdea15022895b909806db26584e42518f2d1f7c" in core
tests = foundation["tests"]
assert node_counts(core) == [tests["core"]] == [{"tests": 133, "pass": 133, "fail": 0, "skipped": 0}]
assert vitest_counts(core) == tests["synthesis"] == [{"pass": 438, "skipped": 10, "total": 448}]
assert vitest_counts(go) == tests["goComponents"] == [{"pass": 12, "skipped": 0, "total": 12}]
assert vitest_counts(integrated) == tests["actualShutdownAndListener"] == [{"pass": 14, "skipped": 0, "total": 14}]
assert node_counts(integrated) == [tests["transport"], tests["services"]]
assert [value["pass"] for value in node_counts(integrated)] == [8, 14]
assert re.findall(r"test result: ok\. (\d+) passed; (\d+) failed; (\d+) ignored;", integrated) == [("1", "0", "0"), ("14", "0", "0")]
assert tests["python"]["executed"] is False and tests["python"]["pass"] is None
receipts = objects(integrated)
verification = only(receipts, lambda value: value.get("schema") == "tpnil-integrated-verification@2" and value.get("childOraclesVerified") is True)
assert verification["verified"] is True and verification["childOraclesVerified"] is True
assert verification["source"] == source and verification["profile"] == "ITCVE-1@3.0.0"
assert len(verification["findings"]) == 6
assert all(f["result"] == "FAIL" and f["lane"] == "messaging" and f["implementation"] == "go" for f in verification["findings"])
lanes = re.findall(r"\[integrated-lab\] ([^:]+): exit (\d+); (\d+) observations", integrated)
assert len(lanes) == 16 and all(code == "0" for _, code, _ in lanes) and sum(int(count) for _, _, count in lanes) == 590
published = only(receipts, lambda value: "verifiedPublishedIntegrationArchives" in value)
assert published["semantic"] is True and published["verifiedPublishedIntegrationArchives"] == 14 and published["verifiedPublishedIntegrationAttempts"] == 13
descendant = only(receipts, lambda value: value.get("claim") == "ENGINEERING_REFERENCE_STORAGE_QUALIFICATION_ONLY")
assert descendant["verified"] is True and descendant["result"] == "PASS" and descendant["sourceCommit"] == source
assert (descendant["directions"], descendant["freshExecutions"], descendant["assertions"]) == (4, 8, 80)
assert "Messaging verifier: 2 independent negative cases passed" in integrated
negative = only(receipts, lambda value: value.get("validFailurePreserved"))
assert negative["verified"] is True and negative["mutationsRejected"] == 5

retained = logs["retained-native-evidence"]
assert "test result: ok. 14 passed; 0 failed; 0 ignored;" in retained
parsed = objects(retained)
producer = only(parsed, lambda value: value.get("schema") == "tpnil-native-integrated-reevaluation@1")
verifier = only(parsed, lambda value: value.get("verified") is True and value.get("claim") == "RETAINED_NATIVE_EVIDENCE_REEVALUATION")
assert [producer, verifier] == obj(43143699270, "terminal-receipts.json")
assert verifier == obj(43143699270, "independent-log-review.json")["terminalSemanticReceipt"]
assert verifier == {"verified": True, "claim": "RETAINED_NATIVE_EVIDENCE_REEVALUATION",
                    "originalNativeSource": "c338a93c97ffebeeef318e679ff82b7dbf309dd5", "evaluatorSource": source,
                    "newNativeSessions": 0, "nativeOutcome": "FAIL", "integrationOutcome": "PASS", "rustOutcome": "PASS", "repetitions": 2}
assert producer["originalMembersUnchanged"] is True and producer["newNativeSessions"] == 0
assert producer["completeBRC100Conformance"] is False and producer["outcome"] == "FAIL"
assert len(producer["repetitions"]) == 2
for repetition in producer["repetitions"]:
    assert repetition["counts"] == {"PASS": 77, "FAIL": 0, "BLOCKED": 0}
    assert repetition["native"]["assertions"] == 280 and repetition["native"]["counts"] == {"PASS": 180, "FAIL": 99, "BLOCKED": 1}
    assert repetition["rust"]["assertions"] == 48 and repetition["rust"]["counts"] == {"PASS": 48, "FAIL": 0, "BLOCKED": 0}
    assert len(repetition["rust"]["inputs"]) == 4 and repetition["rust"]["outcome"] == "PASS"

summary = json.loads((base / "summary.json").read_text())
cost = json.loads((base / "cost.json").read_text())
assert summary["source"] == source and summary["claim"] == "CI_EXECUTION_AND_RETAINED_EVIDENCE_REVIEW_ONLY"
assert summary["nativeWalletConformanceClosed"] is False and summary["completeBRC100Conformance"] is False
assert [(w["id"], w["conclusion"], w["jobSeconds"]) for w in summary["workflows"]] == [(43143699101, "failure", 1228), (43143699270, "success", 113)]
assert summary["workflows"][0]["tests"] == tests
assert cost["includedRunIds"] == [43143699101, 43143699270] and cost["includedCompletedJobs"] == 4
assert cost["knownJobWallSeconds"] == sum(job_seconds.values()) == 1341
assert cost["failedWorkflowJobSecondsIncluded"] == 1228 and cost["successfulRetainedReplayJobSecondsIncluded"] == 113
assert all(value is None for key, value in cost.items() if key.endswith("USD"))
assert cost["unknownCostsAreZero"] is False and cost["fullCostReconciled"] is False and cost["thirtyTwoFoldImprovementMeasured"] is False
prior = cost["linkedPreviouslyRecordedRun"]
assert prior["id"] == 43140694759 and prior["jobSeconds"] == 106 and prior["includedInThisIncrement"] is False
prior_path = base.parents[3] / prior["path"]
assert sha(prior_path.read_bytes()) == prior["sha256"]
print(json.dumps({"verified": True, "claim": summary["claim"], "source": source,
                  "rawReceipts": len(manifest["rawReceipts"]), "completedJobs": 4, "knownJobWallSeconds": 1341,
                  "foundationOutcome": "FAIL", "retainedReevaluationOutcome": "PASS", "retainedNativeOutcome": "FAIL",
                  "newNativeSessions": 0, "actualMonetaryCostUSD": None}, indent=2))
