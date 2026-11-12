import datetime, hashlib, json, pathlib, subprocess, sys, zipfile

home = pathlib.Path(__file__).resolve().parent
api = pathlib.Path(sys.argv[1]).resolve()
run = json.loads((api / 'run.json').read_text())
artifacts = json.loads((api / 'artifacts.json').read_text())
assert run['id'] == 43157437280 and run['status'] == 'completed'
assert run['head_sha'] == '585211c193d0288effeb466bda38fe6ef23ac94d'
selected = [r for r in artifacts['artifacts'] if r['name'] == 'native-go-yours-wallet-pr368-7e39006']
assert len(selected) == 1 and not selected[0]['expired']
artifact = selected[0]
target = home / f'artifact-{artifact["id"]}.zip'
assert not target.exists(), 'Retain existing artifact; do not overwrite'
with target.open('xb') as output:
    child = subprocess.run(['gh', 'api', f'repos/p2ppsr/interop/actions/artifacts/{artifact["id"]}/zip'], stdout=output, stderr=subprocess.PIPE)
(home / f'artifact-{artifact["id"]}.download.stderr.log').write_bytes(child.stderr)
assert child.returncode == 0, 'Artifact download failed; partial bytes retained'
digest = hashlib.sha256(target.read_bytes()).hexdigest()
assert artifact['digest'] == f'sha256:{digest}', 'GitHub artifact digest mismatch'
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
    names = archive.namelist()
    assert len(names) == len(set(names))
receipt = {'schema': 'tpnil-native-candidate-artifact-acquisition@1', 'downloadedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'runId': run['id'], 'source': run['head_sha'], 'workflowConclusion': run['conclusion'], 'artifactId': artifact['id'], 'artifactName': artifact['name'], 'githubDigest': artifact['digest'], 'sha256': digest, 'bytes': target.stat().st_size, 'zipIntegrityVerified': True, 'members': len(names), 'candidateOnly': True, 'officialRelease': False, 'claim': 'UNSCORED_RETAINED_NATIVE_ARTIFACT', 'path': str(target), 'apiDirectory': str(api)}
(home / f'artifact-{artifact["id"]}.acquisition.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt, indent=2))
