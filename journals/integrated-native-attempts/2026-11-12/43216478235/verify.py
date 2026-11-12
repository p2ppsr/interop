from pathlib import Path
from collections import Counter
import json,hashlib,gzip,zipfile,datetime
root=Path(__file__).resolve().parent;sha=lambda b:hashlib.sha256(b).hexdigest();source='1f9fe0f9b979e9bbca66e90335f02ba2b80c7d41'
def safe(name):
 p=Path(name);assert not p.is_absolute()and'..'not in p.parts and p.as_posix()==name;return root/p
def raw(name):
 p=safe(name);return p.read_bytes()if p.exists()else gzip.decompress(safe(name+'.gz').read_bytes())
def read(name):return json.loads(raw(name))
m=read('attempt.json');assert m['schema']=='tpnil-integration-attempt@1'and m['source']==source and m['workflowRun']==43216478235 and m['artifactId']==13945313469
assert m['claim']=='OBSERVER_VERIFICATION_ERROR'and m['failureClassification']=='UNRESOLVED_FINAL_SUBMISSION_ANCESTRY'and m['walletExecuted']is True and m['workflowConclusion']=='failure'
assert m['qualifiedEnvironment']is False and m['completeBRC100Conformance']is False and m['officialRelease']is False and m['candidateOnly']is True
names=[x['name']for x in m['files']];assert len(names)==len(set(names));assert sorted(names)==sorted(p.relative_to(root).as_posix()for p in root.rglob('*')if p.is_file()and p!=root/'attempt.json')
for row in m['files']:
 b=safe(row['name']).read_bytes();assert len(b)==row['size']and sha(b)==row['sha256'],row['name']
for row in read('encoding.json')['receipts']:
 b=safe(row['path']).read_bytes();assert len(b)==row['storedBytes']and sha(b)==row['storedSha256'];assert row['encoding']in['gzip','identity'];v=gzip.decompress(b)if row['encoding']=='gzip'else b;assert len(v)==row['originalBytes']and sha(v)==row['originalSha256']
a=read('acquisition/run.json');assert a['id']==m['workflowRun']and a['head_sha']==source and a['event']=='workflow_dispatch'and a['run_attempt']==1 and a['status']=='completed'and a['conclusion']=='failure'
a=read('acquisition/artifacts.json');assert a['total_count']==len(a['artifacts'])==1;artifact=a['artifacts'][0];assert artifact['id']==13945313469 and artifact['name']=='native-go-yours-wallet-pr368-coverage2'
zbytes=raw('native-integrated.zip');assert len(zbytes)==artifact['size_in_bytes']==9553572 and sha(zbytes)=='6701efea0672ddf069796dfd96b221ae21415fbc478871a97b8be0c9449aad23';assert artifact['digest']=='sha256:'+sha(zbytes)
with zipfile.ZipFile(root/'native-integrated.zip')as z:
 assert z.testzip()is None;members=[n for n in z.namelist()if not n.endswith('/')];assert len(members)==len(set(members))==376;assert sorted(members)==sorted(p.relative_to(root/'original').as_posix()for p in(root/'original').rglob('*')if p.is_file())
 for name in members:assert z.read(name)==raw('original/'+name)
with zipfile.ZipFile(root/'acquisition/all-job-logs.zip')as z:assert z.testzip()is None
jobs=read('acquisition/jobs.json')['jobs'];assert len(jobs)==2;dt=lambda s:datetime.datetime.fromisoformat(s.replace('Z','+00:00'));active=[j for j in jobs if j['conclusion']!='skipped'];assert len(active)==1 and active[0]['id']==131176905928 and active[0]['conclusion']=='failure';assert(dt(active[0]['completed_at'])-dt(active[0]['started_at'])).total_seconds()==2285
assert [s['name']for s in active[0]['steps']if s['conclusion']=='failure']==['Execute and independently verify the integrated native wallet graph'];assert'Final submission has unresolved unmined ancestry'in raw('acquisition/job-131176905928.log').decode()
lock=read('original/run-lock.json');assert lock['source']==source and lock['planSha256']=='b7b2dcd4ed50df0cd5ce3b9d4c2828b1be3953d6da4a34a3f9cd31fceb57b1cd';assert lock['plan']['itcve']=='ITCVE-1@4.4.0'and lock['plan']['program']=='ISI-4@5.4.0'and lock['plan']['wallet']['version']=='5.1.1-pr368.4a954ac'and lock['plan']['claim']=='ENGINEERING_OBSERVATION_ONLY';assert len(lock['plan']['conformanceInputs'])==164
for name in ['qualification.json','integrated-qualification.json','rust-repetition-1/result.json','rust-repetition-2/result.json']:assert not(root/'original'/name).exists()
assert sha(raw('review/independent-review.json'))=='3e09fc7a8f2642cfc39c13ca62eea6ed3a757bb527b711e5ec25590348b25a43'
ind=read('review/independent-review.json');assert ind['source']==source and ind['run']==m['workflowRun']and ind['qualifiedEnvironment']is False and ind['completeBRC100Conformance']is False and ind['supplementalNativeObservationsAdmitted']==0 and ind['originalMembersVerified']==376 and ind['sourceFilesVerified']==2511 and ind['nativeInputs']==164
for f in ind['files']:
 b=raw('review/'+f['path']);assert len(b)==f['bytes']and sha(b)==f['sha256'],f['path']
assert'Final submission has unresolved unmined ancestry'in raw('review/native-parent.stderr.log').decode();assert ind['parent']['exitCode']==1 and ind['componentChildReplays']==10
for i in [1,2]:
 prefix=f'original/repetition-{i}/';record=read(prefix+'record.json');result=read(prefix+'evidence/conformance/result.json');counts=Counter(a['outcome']for v in result['vectors']for a in v['assertions']);assert counts==Counter(PASS=432,FAIL=27,BLOCKED=76)and sum(counts.values())==535
 assert record['claim']=='ENGINEERING_OBSERVATION_ONLY'and record['profile']=='candidate-wallet-native-engineering'and record['outcome']=='FAIL';assert sha(raw(prefix+'record.json'))==ind['repetitions'][i-1]['originalRecordSha256']
 row=ind['repetitions'][i-1];assert row['historical99']=={'PASS':97,'FAIL':2,'BLOCKED':0,'MISSING':0}and row['rawNativeCounts']==dict(counts)and row['rawIntegrationCounts']=={'PASS':77,'FAIL':0,'BLOCKED':0}and row['originalRust']=='NOT_EXECUTED'
 shutdown=read(prefix+'shutdown-submissions.json');assert all(shutdown['cleanup'][k]['closed']is True for k in ['browser','services','profile'])and shutdown['errors']==[];assert len(shutdown['submissions'])=={1:95,2:94}[i];assert read(f'original/host-repetition-{i}-cleanup.json')['removed']is True
assert read('original/host-userns.json')['restoredSuccessfully']is True
cost=read('cost.json');assert sha(raw('cost.json'))=='af97b7a71764afe2a8834ff8ef227616857347686844b947dd8d4ef8a8023509';assert cost['actualNativeJobSeconds']==2285 and cost['foundationActualJobSeconds']==1458 and cost['currentOrderActualJobSeconds']==3743 and cost['completedCohortJobSecondsAfterNative']==24957 and cost['unknownCostsAreZero']is False;assert all(cost[k]is None for k in ['actualCIChargeUSD','operatorEffortUSD','developmentAgentUsageUSD','allocatedOwnedCapacityUSD','storageAndEgressUSD','totalFullCostUSD'])
d=read('diagnosis.json');assert d['nativeQualification']is False and d['completeBRC100Conformance']is False and d['full535Raw']=={'PASS':432,'FAIL':27,'BLOCKED':76}and d['historical99Raw']=={'PASS':97,'FAIL':2,'BLOCKED':0}and d['rust']=='NOT_EXECUTED'and d['actualCleanupSucceeded']is True and d['parentAdmission']is False and d['acceptedNativeCustomerPacks']==0
print(json.dumps({'verified':True,'claim':'FAILED_ATTEMPT_ARCHIVE_INTEGRITY_AND_FROZEN_DIAGNOSIS_ONLY','source':source,'workflowRun':m['workflowRun'],'originalMembers':376,'archiveFiles':len(names),'nativeQualification':False,'raw535PerRepetition':dict(counts),'historical99PerRepetition':row['historical99'],'rust':'NOT_EXECUTED','jobSeconds':2285,'completedCohortJobSeconds':24957,'actualCleanupSucceeded':True,'parentAdmission':False}))
