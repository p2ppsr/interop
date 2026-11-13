from pathlib import Path
from collections import Counter
import json,hashlib,gzip,zipfile,datetime
root=Path(__file__).resolve().parent;sha=lambda b:hashlib.sha256(b).hexdigest()
def safe(name):
 p=Path(name);assert not p.is_absolute()and'..'not in p.parts and p.as_posix()==name;return root/p
def raw(name):
 p=safe(name);return p.read_bytes()if p.exists()else gzip.decompress(safe(name+'.gz').read_bytes())
def read(name):return json.loads(raw(name))
m=read('attempt.json');assert m['schema']=='tpnil-integration-attempt@1'and m['source']=='c648022b2d9209b7350527bd5553d73e3e82a52c'and m['workflowRun']==43195585984 and m['artifactId']==13933663308
assert m['claim']=='OBSERVER_EXECUTION_ERROR'and m['failureClassification']=='MISSING_PORTABILITY_SETTINGS_PAGE_AFTER_PERMISSION_PRELUDE'and m['walletExecuted']is True and m['workflowConclusion']=='failure'
assert m['qualifiedEnvironment']is False and m['completeBRC100Conformance']is False and m['officialRelease']is False and m['candidateOnly']is True
names=[x['name']for x in m['files']];assert len(names)==len(set(names));assert sorted(names)==sorted(p.relative_to(root).as_posix()for p in root.rglob('*')if p.is_file()and p!=root/'attempt.json')
for row in m['files']:
 b=safe(row['name']).read_bytes();assert len(b)==row['size']and sha(b)==row['sha256'],row['name']
for row in read('encoding.json')['receipts']:
 b=safe(row['path']).read_bytes();assert len(b)==row['storedBytes']and sha(b)==row['storedSha256'];assert row['encoding']in['gzip','identity'];v=gzip.decompress(b)if row['encoding']=='gzip'else b;assert len(v)==row['originalBytes']and sha(v)==row['originalSha256']
a=read('acquisition/run.json');assert a['id']==m['workflowRun']and a['head_sha']==m['source']and a['event']=='workflow_dispatch'and a['run_attempt']==1 and a['status']=='completed'and a['conclusion']=='failure'
a=read('acquisition/artifacts.json');assert a['total_count']==len(a['artifacts'])==1;artifact=a['artifacts'][0];assert artifact['id']==13933663308 and artifact['name']=='native-go-yours-wallet-pr368-coverage1'
zbytes=raw('native-integrated.zip');assert len(zbytes)==artifact['size_in_bytes']==1083055 and sha(zbytes)=='f8b4a33821d7b91c1e265117bccc340e23be074a4a0cebf9f5285422a74cb232';assert artifact['digest']=='sha256:'+sha(zbytes)
with zipfile.ZipFile(root/'native-integrated.zip')as z:
 assert z.testzip()is None;members=[n for n in z.namelist()if not n.endswith('/')];assert len(members)==len(set(members))==91;assert sorted(members)==sorted(p.relative_to(root/'original').as_posix()for p in(root/'original').rglob('*')if p.is_file())
 for name in members:assert z.read(name)==raw('original/'+name)
with zipfile.ZipFile(root/'acquisition/all-job-logs.zip')as z:assert z.testzip()is None
jobs=read('acquisition/jobs.json')['jobs'];assert len(jobs)==2;dt=lambda s:datetime.datetime.fromisoformat(s.replace('Z','+00:00'));assert sum((dt(j['completed_at'])-dt(j['started_at'])).total_seconds()for j in jobs)==1180
active=[j for j in jobs if j['conclusion']!='skipped'];assert len(active)==1 and active[0]['id']==131105586591;assert [s['name']for s in active[0]['steps']if s['conclusion']=='failure']==['Execute and independently verify the integrated native wallet graph']
lock=read('original/run-lock.json');assert lock['source']==m['source']and lock['planSha256']=='a67ed62b96732bb321c8dd08de5ee4903853d5c460a85bf58899eb6e9a1d0b48';assert lock['plan']['itcve']=='ITCVE-1@4.3.0'and lock['plan']['program']=='ISI-4@5.3.0'and lock['plan']['wallet']['version']=='5.1.1-pr368.4a954ac'and lock['plan']['claim']=='ENGINEERING_OBSERVATION_ONLY';assert len(lock['plan']['conformanceInputs'])==157
for name in ['repetition-1/record.json','repetition-1/evidence/conformance/result.json','repetition-2','qualification.json','integrated-qualification.json','rust-repetition-1/result.json','rust-repetition-2/result.json']:assert not(root/'original'/name).exists()
prefix='original/repetition-1/';worker=read(prefix+'worker-failure.json');assert worker['message']=='Native wallet cleanup failed';assert round((dt(worker['endedAt'])-dt(worker['startedAt'])).total_seconds(),3)==122.913
assert read(prefix+'evidence/attempt-failure.json')['message']=='Native wallet settings page is absent';shutdown=read(prefix+'shutdown-submissions.json');assert all(shutdown['cleanup'][k]['closed']is True for k in ['browser','services','profile']);assert len(shutdown['errors'])==3 and all(any(s in e for e in shutdown['errors'])for s in ['record.json','permission-lifecycle.json','service-counterparts.json']);assert len(shutdown['submissions'])==15
base=read(prefix+'evidence/conformance/permission-coverage.json');assert len(base['assertions'])==29 and Counter(a['result']for a in base['assertions'])==Counter(PASS=29)
ext=read(prefix+'evidence/conformance/permission-extension.json');assert len(ext['assertions'])==15 and Counter(a['result']for a in ext['assertions'])==Counter(FAIL=15)and len(ext['steps'])==1 and ext['identity']=='';s=ext['steps'][0];assert s['id']=='identity'and s['method']=='getPublicKey'and s['outcome']['status']=='rejected'and s['outcome']['error']['code']=='ERR_PERMISSION_DENIED';assert len(s['prompts'])==1 and s['prompts'][0]['decision']=='deny'and s['prompts'][0]['trustedClick']['dispatch']['isTrusted']is True
partial=read('review/independent-diagnosis/partial-replay.json');assert partial['source']==m['source']and partial['nativeQualification']is False and partial['allOriginalMembersUnchanged']is True and partial['full535']=='NOT_EXECUTED_TO_COMPLETION'and partial['original99']=='NOT_EXECUTED';expected={'permission-coverage':{'PASS':29,'FAIL':0,'BLOCKED':0},'permission-extension-empty-observed-identity':{'PASS':0,'FAIL':15,'BLOCKED':0},'permissions':{'PASS':8,'FAIL':0,'BLOCKED':0},'lifecycle':{'PASS':3,'FAIL':0,'BLOCKED':0}};assert len(partial['modules'])==4
for row in partial['modules']:assert row['verified']is True and row['counts']==expected[row['name']]
assert partial['wholeFiveContextAdmission']['counts']=={'PASS':15,'FAIL':14,'BLOCKED':0};assert partial['extensionScope']['executedCalls']==1 and partial['extensionScope']['caseCallsAfterIdentity']==0
repro=read('review/independent-diagnosis/observer-reproduction.json');assert repro['source']==m['source']and repro['nativeQualification']is False and repro['allChecksPassed']is True and len(repro['checks'])==4 and all(c['result']=='PASS'for c in repro['checks'])
assert read('original/host-repetition-1-cleanup.json')['removed']is True and read('original/host-userns.json')['restoredSuccessfully']is True
cost=read('cost.json');assert cost['knownJobWallSeconds']==cost['failedWorkflowJobSecondsIncluded']==1180 and cost['completedCohortBefore']==18537 and cost['completedCohortAfter']==19717 and cost['historicalSeparateCohort']==20670 and cost['acceptedNativeCustomerPacks']==0 and cost['unknownCostsAreZero']is False;assert all(cost[k]is None for k in ['actualCIChargeUSD','operatorEffortUSD','developmentAgentUsageUSD','allocatedOwnedCapacityUSD','storageAndEgressUSD','totalFullCostUSD'])
d=read('diagnosis.json');assert d['nativeQualification']is False and d['full535']=='NOT_EXECUTED_TO_COMPLETION'and d['original99']=='NOT_EXECUTED'and d['rust']=='NOT_EXECUTED'and d['actualCleanupSucceeded']is True and d['shutdownBindingsAdmitted']is False
print(json.dumps({'verified':True,'claim':'FAILED_ATTEMPT_ARCHIVE_INTEGRITY_AND_DIAGNOSIS_ONLY','source':m['source'],'workflowRun':m['workflowRun'],'originalMembers':91,'archiveFiles':len(names),'nativeQualification':False,'full535':'NOT_EXECUTED_TO_COMPLETION','original99':'NOT_EXECUTED','rust':'NOT_EXECUTED','jobSeconds':1180,'completedCohortJobSeconds':19717,'actualCleanupSucceeded':True,'shutdownBindingsAdmitted':False}))
