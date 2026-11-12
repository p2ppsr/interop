from pathlib import Path
from collections import Counter
import json, hashlib, gzip, zipfile, datetime
root=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
def safe(name):
 p=Path(name);assert not p.is_absolute() and '..'not in p.parts and p.as_posix()==name;return root/p
def raw(name):
 p=safe(name)
 if p.exists():return p.read_bytes()
 return gzip.decompress(safe(name+'.gz').read_bytes())
def read(name):return json.loads(raw(name))
m=read('attempt.json');assert m['schema']=='tpnil-integration-attempt@1';assert m['source']=='69b1b52f0c3d46cbfac91c78b38eb2e4dffbac99';assert m['workflowRun']==43165501159 and m['artifactId']==13921951042
assert m['claim']=='OBSERVER_VERIFICATION_ERROR' and m['failureClassification']=='INCOMPLETE_PUBLIC_ANCESTRY_BEFORE_PROOF_CLASSIFICATION';assert m['walletExecuted'] is True and m['workflowConclusion']=='failure';assert m['qualifiedEnvironment'] is False and m['completeBRC100Conformance'] is False and m['officialRelease'] is False and m['candidateOnly'] is True
names=[x['name']for x in m['files']];assert len(names)==len(set(names));assert sorted(names)==sorted(p.relative_to(root).as_posix()for p in root.rglob('*')if p.is_file()and p!=root/'attempt.json')
for x in m['files']:
 b=safe(x['name']).read_bytes();assert len(b)==x['size']and sha(b)==x['sha256'],x['name']
for x in read('encoding.json')['receipts']:
 b=safe(x['path']).read_bytes();assert len(b)==x['storedBytes']and sha(b)==x['storedSha256'];assert x['encoding']in ['gzip','identity'];decoded=gzip.decompress(b)if x['encoding']=='gzip'else b;assert len(decoded)==x['originalBytes']and sha(decoded)==x['originalSha256']
a=read('acquisition/run.json');assert a['id']==43165501159 and a['head_sha']==m['source']and a['status']=='completed'and a['conclusion']=='failure'
a=read('acquisition/artifacts.json');assert a['total_count']==len(a['artifacts'])==1;artifact=a['artifacts'][0];assert artifact['id']==13921951042 and artifact['name']=='native-go-yours-wallet-pr368-cb3c2f2'
zbytes=raw('native-integrated.zip');assert len(zbytes)==4555098 and sha(zbytes)=='2bba95b15a44036e418671f9f3e571e64da2ea70775d80fa798f0b7293a1b6f1';assert artifact['digest']=='sha256:'+sha(zbytes)
with zipfile.ZipFile(root/'native-integrated.zip')as z:
 assert z.testzip()is None;members=[n for n in z.namelist()if not n.endswith('/')];assert len(members)==len(set(members))==266;assert sorted(members)==sorted(p.relative_to(root/'original').as_posix()for p in(root/'original').rglob('*')if p.is_file())
 for n in members:assert z.read(n)==raw('original/'+n)
with zipfile.ZipFile(root/'acquisition/all-job-logs.zip')as z:assert z.testzip()is None and len(z.infolist())==15
jobs=read('acquisition/jobs.json')['jobs'];active=[j for j in jobs if j['conclusion']!='skipped'];assert len(active)==1;dt=lambda s:datetime.datetime.fromisoformat(s.replace('Z','+00:00'));assert sum((dt(j['completed_at'])-dt(j['started_at'])).total_seconds()for j in active)==2256
assert [s['name']for s in active[0]['steps']if s['conclusion']=='failure']==['Execute and independently verify the integrated native wallet graph']
lock=read('original/run-lock.json');assert lock['source']==m['source']and lock['planSha256']=='dda0628358ca220df758227b9f853b891d049097f10039d6938e8628f181bff8';assert lock['plan']['itcve']=='ITCVE-1@4.2.0'and lock['plan']['program']=='ISI-4@5.2.0';assert lock['plan']['wallet']['version']=='5.1.1-pr368.cb3c2f2'and lock['plan']['walletCandidate']['officialRelease'] is False
for p in ['qualification.json','integrated-qualification.json','rust-repetition-1/result.json','rust-repetition-2/result.json']:
 assert not(root/'original'/p).exists()and not(root/p).exists()
records=[];counts=lambda rows:dict(Counter(x.get('outcome',x.get('result'))for x in rows))
def index(record):
 rows={(v['id'],a['id']):a['outcome']for v in record['vectors']for a in v['assertions']};assert len(rows)==sum(len(v['assertions'])for v in record['vectors']);return rows
for n in (1,2):
 prefix=f'original/repetition-{n}/';record=read(prefix+'record.json');records.append(record);assert record['itcve']=='ITCVE-1@4.2.0'and record['program']=='ISI-4@5.2.0'and record['claim']=='ENGINEERING_OBSERVATION_ONLY';assert record['walletCandidate']['officialRelease'] is False
 rows=[a for v in record['vectors']for a in v['assertions']];assert len(rows)==426 and counts(rows)=={'PASS':418,'FAIL':6,'BLOCKED':2};worker=read(prefix+'worker.json');assert worker['completed']is True and worker['cleanWalletAndServiceShutdown']is True and worker['recordSha256']==sha(raw(prefix+'record.json'));assert worker['planSha256']==lock['planSha256']
 for e in record['evidence']:assert sha(raw(prefix+'evidence/'+e['name']))==e['sha256']
 report=read(prefix+'evidence/integrated/result.json');assert len(report['assertions'])==77 and counts(report['assertions'])=={'PASS':74,'BLOCKED':3}
 synthesis=read(prefix+'evidence/integrated/synthesis.json');assert synthesis['result']=='FAIL';assert synthesis['assertions'][0]['id']=='NATIVE-SYNTHESIS-UHRP'and synthesis['assertions'][0]['verdict']=='PASS';assert synthesis['assertions'][1]['id']=='NATIVE-SYNTHESIS-EXECUTION'and synthesis['assertions'][1]['verdict']=='FAIL';assert 'protocol name containing only lowercase letters, numbers and spaces'in synthesis['assertions'][1]['error'];assert not(root/prefix/'evidence/integrated/synthesis-lch.json').exists()
 assert read(f'original/host-repetition-{n}-cleanup.json')['removed']is True
assert index(records[0])==index(records[1]);assert read('original/host-userns.json')['restoredSuccessfully']is True
before=[]
for n,expected in [(1,'a2d718ca79f704af40346d011f2869fc06dc25aa5668b31d403f1c72b5ad4c11'),(2,'d36c02053f3077eea2442e6d596979ee900eba37ddb3f52053633e3193b12576')]:
 b=raw(f'baseline/repetition-{n}-record.json');assert sha(b)==expected;before.append(index(json.loads(b)))
assert before[0]==before[1]and len(before[0])==280;original99=[k for k,v in before[0].items()if v=='FAIL'];assert len(original99)==99;after=index(records[0]);assert Counter(after[k]for k in original99)==Counter({'PASS':98,'FAIL':1});assert [k[1]for k in original99 if after[k]=='FAIL']==['output.listActions'];assert all(after[k]=='PASS'for k,v in before[0].items()if v=='PASS')
comparison=read('review/comparison.json');assert comparison['claim']=='DERIVED_RECORD_COMPARISON_ONLY'and comparison['originalFailureOutcomes']=={'PASS':98,'FAIL':1,'BLOCKED':0,'INCONCLUSIVE':0};assert comparison['regressions']==[]and comparison['additionalCoverage']['assertions']==146
for row in comparison['failures']:assert before[0][(row['vector'],row['id'])]==row['before']=='FAIL'and after[(row['vector'],row['id'])]==row['after']
assert len(comparison['failures'])==99 and len({(r['vector'],r['id'])for r in comparison['failures']})==99
assert sorted(r['id']for r in comparison['failures']if r['attribution']=='PROSPECTIVE_NAMESPACE_ORACLE_CORRECTION')==['namespace.basket.reserved','namespace.protocol.reserved']
partial=read('review/partial.stdout.json');assert partial['qualifiedEnvironment']is False and partial['newNativeSessions']==0
for repetition in partial['repetitions']:
 assert repetition['rawNativeCounts']=={'PASS':418,'FAIL':6,'BLOCKED':2};assert len(repetition['modules'])==5;assert all(x['replay']=='VERIFIED_MODULE_ONLY'for x in repetition['modules'].values())
parent=read('review/replay.json');assert parent['result']=='NOT_VERIFIED'and parent['parent']['exitCode']==1 and parent['children']==[]and parent['originalBytesUnchanged']is True and parent['frozenSourceUnchanged']is True
message='transaction-states/input-absent-from-beef: transaction spends outside independently declared native payments';assert message in raw('review/parent.stderr.log').decode()and message in raw('review/execution-original.log').decode()
gates=read('review/gates.receipt.json');assert gates['qualifiedEnvironment']is False and gates['newNativeSessions']==0
for repetition in gates['repetitions']:
 g=repetition['gates'];assert g['nativeTransactionStateParent']['verified']is False and message in g['nativeTransactionStateParent']['error']['message'];assert all(v['verified']is True for k,v in g.items()if k!='nativeTransactionStateParent');p=g['inputAbsentIndependentGraph']['result'];assert p['sameTargetBodyAndStored']is True and p['publicOwnership']is False and p['resolvedOwnership']is True and p['publicProof']is False and p['resolvedCryptographicProof']is True
children=read('review/components-2/review.json');assert children['qualifiedEnvironment']is False and len(children['children'])==10;assert sum(c['exitCode']==0 for c in children['children'])==8;assert all(c['script']=='verify-native-synthesis.mjs'for c in children['children']if c['exitCode']!=0)
d=read('diagnosis.json');assert d['qualifiedEnvironment']is False and d['nativeQualification']is False and d['originalRust']=='NOT_EXECUTED';assert d['rawNativeEach']=={'total':426,'PASS':418,'FAIL':6,'BLOCKED':2};assert d['original99Outcomes']=={'PASS':98,'FAIL':1,'BLOCKED':0}and d['namespaceOracleCorrections']==2 and d['changedArtifactAndComponentsOtherOriginalFailuresNowPassing']==96 and d['singleCauseAttribution']is False and d['original280Regressions']==0
cost=read('cost.json');assert cost['knownJobWallSeconds']==cost['failedWorkflowJobSecondsIncluded']==2256 and cost['acceptedNativeCustomerPacks']==0 and cost['unknownCostsAreZero']is False;assert all(cost[k]is None for k in ['actualCIChargeUSD','operatorEffortUSD','developmentAgentUsageUSD','allocatedOwnedCapacityUSD','totalFullCostUSD'])
print(json.dumps({'verified':True,'claim':'FAILED_ATTEMPT_ARCHIVE_INTEGRITY_AND_DIAGNOSIS_ONLY','workflowRun':43165501159,'source':m['source'],'originalMembers':266,'archiveFiles':len(names),'nativeQualification':False,'nativeEach':{'PASS':418,'FAIL':6,'BLOCKED':2},'original99':{'PASS':98,'FAIL':1},'integrationEach':{'PASS':74,'BLOCKED':3},'rust':'NOT_EXECUTED','jobSeconds':2256}))
