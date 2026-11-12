from pathlib import Path
import json,hashlib,gzip,shutil
r=Path(__file__).resolve().parent;repo=r.parents[1];d=repo/'journals/integrated-native-attempts/2026-11-12/43216478235';original=r/'attempt-2026-11-12T12-57-15Z/original';assert sorted(p.name for p in d.iterdir())==['native-integrated.zip'];sha=lambda b:hashlib.sha256(b).hexdigest();encoding=[]
def retain(source,target,compress=False):
 b=source.read_bytes();p=d/target;stored=gzip.compress(b,mtime=0)if compress else b
 if compress:p=Path(str(p)+'.gz')
 p.parent.mkdir(parents=True,exist_ok=True)
 if p.exists():assert p.read_bytes()==stored
 else:p.write_bytes(stored)
 encoding.append({'path':p.relative_to(d).as_posix(),'sourcePath':source.as_posix(),'encoding':'gzip'if compress else'identity','originalBytes':len(b),'originalSha256':sha(b),'storedBytes':len(stored),'storedSha256':sha(stored)})
for p in sorted(original.rglob('*')):
 if p.is_file():retain(p,Path('original')/p.relative_to(original))
retain(r/'acquisition/original-native.zip',Path('native-integrated.zip'))
for p in sorted((r/'acquisition').iterdir()):
 if p.is_file()and p.name!='original-native.zip':retain(p,Path('acquisition')/p.name,p.suffix=='.log')
review=json.loads((r/'independent-review.json').read_text());keep={x['path']for x in review['files']}
keep.update(['independent-review.json','snapshot.json','original-location.json','safe-extract.py','extraction-controls.py','extraction-controls.json','acquire.py','watch.py','watch-initial.py','watch-initial-failure.json','monitor-initial-jobs.json','connector-observation-1.json','prepare.mjs','prepare.stderr.log','prepare.stdout.json','dependencies.mjs','dependencies.stdout.json','dependencies.stderr.log','acquisition-1.log','finalize-review.py','finalize-review-attempt1.py','finalize-review.stdout.json','finalize-review.stderr.log','finalize-review-2.stdout.json','finalize-review-2.stderr.log','nosend-diagnosis.mjs','nosend-diagnosis.json','nosend-diagnosis.log','nosend-diagnosis-initial-v1.mjs','nosend-diagnosis-initial-v1.log','clause-nosend-diagnosis.mjs','clause-nosend-diagnosis.json','clause-nosend-diagnosis.log'])
for p in(r/'monitor').rglob('*'):
 if p.is_file():keep.add(p.relative_to(r).as_posix())
for name in sorted(keep):
 p=r/name;assert p.is_file(),name;retain(p,Path('review')/name,p.suffix in ['.json','.log']and p.stat().st_size>4096)
retain(r/'build-archive.py',Path('build-archive.py'))
(d/'encoding.json').write_text(json.dumps({'schema':'tpnil-retained-byte-encoding@1','receipts':encoding},indent=2)+'\n')
diagnosis={'schema':'tpnil-native-attempt-diagnosis@2','claim':'UNQUALIFIED_FROZEN_DIAGNOSTIC','workflowRun':43216478235,'source':'1f9fe0f9b979e9bbca66e90335f02ba2b80c7d41','qualifiedEnvironment':False,'nativeQualification':False,'candidateOnly':True,'officialRelease':False,'full535Raw':{'PASS':432,'FAIL':27,'BLOCKED':76},'historical99Raw':{'PASS':97,'FAIL':2,'BLOCKED':0},'repetitions':2,'rust':'NOT_EXECUTED','primaryFailure':'Final submission has unresolved unmined ancestry','parentAdmission':False,'actualCleanupSucceeded':True,'rawShutdownReceiptsHaveErrors':False,'independentComponentChildReplays':10,'originalArtifactMembers':376,'actualJobSeconds':2285,'completeBRC100Conformance':False,'acceptedNativeCustomerPacks':0,'futureCorrectionsNotAppliedToOriginal':True,'opsCostCloseoutCommit':'4c69f4e04541bcd07834d86288a495f344c75753'}
(d/'diagnosis.json').write_text(json.dumps(diagnosis,indent=2)+'\n');shutil.copyfile(r/'cost-closeout.json',d/'cost.json');shutil.copyfile(r/'verify-archive-template.py',d/'verify.py')
(d/'README.md').write_text('''# Native attempt 6: retained parent verification failure

[Run 43216478235](https://github.com/p2ppsr/interop/actions/runs/43216478235)
executed source 1f9fe0f9b979e9bbca66e90335f02ba2b80c7d41 with the PR368
4a954ac engineering candidate, ITCVE-1@4.4.0 / ISI-4@5.4.0. The original ZIP
and all 376 extracted files remain byte-for-byte intact. This is not an official
release qualification or an admitted native environment.

Both repetitions completed all 535 raw predicates: 432 PASS, 27 FAIL and 76 BLOCKED.
The original 99 predicate projection is 97 PASS and 2 FAIL in each repetition.
Seven present module reports and ten integrated component children were independently
replayed from the exact frozen source. Each raw integrated result has 77 PASS.
No Rust execution or complete qualification exists, and none is inferred.

The full parent verifier rejects unresolved unmined submission ancestry. Independent
diagnosis finds three controlled bridge bodies per repetition in the exact public
positive-control BEEFs that the original parent graph assembly omitted. This is a
prospective correction diagnosis; the frozen parent failure remains a failure.
Portability retains 18 outputs across nine aborted reference-only parents in each
dataset; the historical projection's signed-byte assumption is separately recorded.
Actual browser, service, profile and host cleanup completed, and both raw shutdown
receipts have no errors. Successful cleanup does not establish parent admission.

The three transaction noSend failures are preserved. Their scoped diagnosis joins
four delayed default-control transactions to the intervening submission windows;
it does not rewrite the original evaluator or qualify the environment. The original
noSendChange positive fixture emitted a 997-satoshi requested output with no managed
change, then used a dummy fallback outpoint. Its source-bound diagnosis is retained;
no future fixture or oracle result is counted here. Other failed and blocked predicate
values remain unchanged, including the signed listActions interpretation conflict.

The failed native job consumed 2,285 job-seconds, including setup and failure capture.
Together with its 1,458-second Foundation prerequisite the order consumed 3,743 seconds;
the completed cohort totals 24,957 seconds. Previously charged source6 replay is not
charged again. Reservations and actual execution are separate, and all unknown
monetary, operator, agent, allocated-capacity, storage and egress costs remain null.
No accepted native customer pack or measured efficiency improvement is claimed.
The operational closeout is network-ops commit 4c69f4e04541bcd07834d86288a495f344c75753.

Run python3 verify.py for exact inventory, original ZIP, API, timing, raw-count,
cleanup and pinned frozen-review checks. It verifies retained evidence only; it
performs no native execution and applies no prospective source correction.
''')
m={'schema':'tpnil-integration-attempt@1','source':'1f9fe0f9b979e9bbca66e90335f02ba2b80c7d41','workflowRun':43216478235,'artifactId':13945313469,'claim':'OBSERVER_VERIFICATION_ERROR','failureClassification':'UNRESOLVED_FINAL_SUBMISSION_ANCESTRY','walletExecuted':True,'workflowConclusion':'failure','qualifiedEnvironment':False,'completeBRC100Conformance':False,'candidateOnly':True,'officialRelease':False,'files':[{'name':p.relative_to(d).as_posix(),'size':p.stat().st_size,'sha256':sha(p.read_bytes())}for p in sorted(d.rglob('*'))if p.is_file()]}
(d/'attempt.json').write_text(json.dumps(m,indent=2)+'\n');print(json.dumps({'path':str(d),'files':len(m['files']),'bytes':sum(x['size']for x in m['files']),'attemptSha256':sha((d/'attempt.json').read_bytes())}))
