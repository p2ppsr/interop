from pathlib import Path
import json,re,hashlib,zipfile,datetime,collections
base=Path(__file__).resolve().parent;source='39ddc7bf657df8c4c7f1a5a96e0ecfeec5200b18';sha=lambda b:hashlib.sha256(b).hexdigest()
def clean(data):return re.sub(r'^\S+Z ','',re.sub(r'\x1b\[[0-9;]*m','',data),flags=re.M)
def objects(log):
 out=[]
 for m in re.finditer(r'^\{',log,re.M):
  try:d,n=json.JSONDecoder().raw_decode(log[m.start():])
  except ValueError:continue
  if isinstance(d,dict):out.append(d)
 return out
enumerated=json.loads((base/'source-runs-terminal.json').read_text());assert enumerated['total_count']==1 and len(enumerated['workflow_runs'])==1 and enumerated['workflow_runs'][0]['id']==43189667881 and enumerated['workflow_runs'][0]['head_sha']==source
workflows=[];total=0;inventory={};logs={}
for run in [43189667881]:
 folder=base/str(run);metadata=json.loads((folder/'run.json').read_text());jobs=json.loads((folder/'jobs.json').read_text())['jobs'];assert metadata['head_sha']==source and metadata['status']=='completed' and metadata['event']=='push' and metadata['run_attempt']==1
 assert metadata['conclusion']=='failure'
 secs=0;jobRows=[]
 for j in jobs:
  assert j['status']=='completed' and j['conclusion']==('failure'if j['name']=='offline-core'else'success')
  timestamp=lambda x:datetime.datetime.fromisoformat(x.replace('Z','+00:00'));elapsed=int((timestamp(j['completed_at'])-timestamp(j['started_at'])).total_seconds());secs+=elapsed
  raw=(folder/f"job-{j['id']}.log").read_text();assert source in raw;logs[j['name']]=clean(raw)
  jobRows.append({'id':j['id'],'name':j['name'],'startedAt':j['started_at'],'completedAt':j['completed_at'],'jobSeconds':elapsed,'conclusion':j['conclusion'],'failedSteps':[s['name']for s in j['steps']if s['conclusion']not in[None,'success','skipped']],'skippedSteps':[s['name']for s in j['steps']if s['conclusion']=='skipped']})
 workflows.append({'id':run,'name':metadata['name'],'url':metadata['html_url'],'source':source,'conclusion':metadata['conclusion'],'jobSeconds':secs,'jobs':jobRows});total+=secs
 for a in json.loads((folder/'artifacts.json').read_text())['artifacts']:
  p=folder/f"artifact-{a['id']}.zip";assert 'sha256:'+sha(p.read_bytes())==a['digest']and p.stat().st_size==a['size_in_bytes'];seen=set();members=[]
  with zipfile.ZipFile(p)as z:
   for m in z.infolist():
    assert m.filename not in seen;seen.add(m.filename);name=Path(m.filename);assert not name.is_absolute()and'..'not in name.parts and (m.external_attr>>16)&0o170000!=0o120000
    if m.is_dir():continue
    data=z.read(m);members.append({'path':m.filename,'bytes':len(data),'sha256':sha(data),'crc32':m.CRC})
   if a['name']=='integrated-lab':matrix=json.loads(z.read('result.json'))
   if a['name']=='native-integrated-reevaluation':artifactReeval=json.loads(z.read('reevaluation.json'))
  inventory[str(a['id'])]={'name':a['name'],'githubDigest':a['digest'],'members':members}
EXPECTED_TOTAL=1374 # actual terminal job timestamps:259+229+886
assert total==EXPECTED_TOTAL
core=logs['offline-core'];go=logs['go-components'];integrated=logs['integrated-components']
for text in ['ℹ tests 173','ℹ pass 172','ℹ skipped 1','1038 passed','2 failed','65 skipped (1105)','> tsc --noEmit','native-coverage-extension.test.ts:91','native-shutdown-ancestry.test.ts:94','Test timed out in 5000ms.']:assert text in core,text
assert '13 passed (13)'in go
for text in ['39 passed (39)','14 passed (14)','ℹ tests 8','ℹ pass 8','ℹ tests 15','ℹ pass 15','test result: ok. 1 passed','test result: ok. 14 passed']:assert text in integrated,text
ij=objects(integrated);sem=[v for v in ij if v.get('childOraclesVerified')is True];assert len(sem)==1 and sem[0]['source']==source and len(sem[0]['findings'])==6
published=[v for v in ij if 'verifiedPublishedIntegrationArchives'in v];assert len(published)==1;p=published[0];assert p['verifiedPublishedIntegrationArchives']==14 and p['verifiedPublishedIntegrationAttempts']==17 and p['semantic']is True and len(p['bundles'])==31
counts=dict(collections.Counter(a['result']for lane in matrix['lanes']for r in lane['runs']for a in r['assertions']));assert counts=={'PASS':584,'FAIL':6}
desc=[v for v in ij if v.get('verified')is True and v.get('directions')==4];assert len(desc)==1 and desc[0]['result']=='PASS'
summary={'schema':'tpnil-native-closure-ci-log-archive@2','claim':'CI_EXECUTION_AND_RETAINED_EVIDENCE_REVIEW_ONLY','source':source,'workflows':workflows,'tests':{'core':{'pass':172,'fail':0,'skipped':1,'total':173},'synthesis':{'pass':1038,'fail':2,'skipped':65,'total':1105,'passedFiles':62,'failedFiles':2,'skippedFiles':3,'totalFiles':67,'completeSuitePassed':False,'skipBreakdown':{'certificateReferenceMovedToRequiredIntegratedJob':39,'goComponents':8,'permissionUIReference':1,'shutdown':1,'goCoverageAdmission':13,'goCoverageExtensionReferences':2,'listener':1}},'goComponents':{'pass':13},'certificateReferenceAndMutationsSeparateJob':{'pass':39,'required':True},'shutdownAndListenerSeparateJob':{'pass':14},'transport':{'pass':8},'services':{'pass':15},'rust':{'defaultPass':1,'graph3Pass':14},'python':'NOT_EXECUTED_AFTER_SYNTHESIS_FAILURE','typecheck':'PASS'},'failure':{'stage':'offline-core npm test --prefix synthesis','kind':'TWO_EXPLICIT_5000MS_TEST_TIMEOUTS','cases':[{'file':'native-coverage-extension.test.ts','line':91,'name':'retains lookup-not-found as a basket failure, never a namespace-validation pass'},{'file':'native-shutdown-ancestry.test.ts','line':94,'name':'requires explicit expanded profile for permission5 and retains every denied ancestor guard'}],'assertionsNotRelaxed':True,'suiteDurationSeconds':215.63,'previousMissingDependencyAndSourceMapIssue':'Required separate39-case certificate CI step succeeded; current failures are distinct.'},'integratedComponentObservations':{'total':590,'counts':counts,'knownGoMessageBoxFailures':sem[0]['findings']},'publicationSemanticReplay':{'archives':14,'failedAttempts':17,'totalBundles':31},'descendantMatrix':{'verified':True,'directions':4,'result':'PASS'},'previousRetainedReevaluation':{'run':43185320587,'source':'7bd1480037ddc064f5a8cb2f567f6e58285c5999','archive':'../7bd1480','newRunOnThisSource':False,'jobSecondsIncludedAgain':False},'completeBRC100Conformance':False,'nativeWalletConformanceClosed':False,'currentCandidateNativeSessions':0,'native39ddAdmission':'BLOCKED_BY_FOUNDATION_FAILURE_NOT_DISPATCHED','cost':{'knownJobWallSeconds':total,'completedCohortJobSecondsBeforeIncrement':15663,'completedCohortJobSecondsAfterIncrement':15663+total,'historicalSeparateCohortJobSeconds':20670,'historicalCohortIncludedInIncrement':False,'actualCIChargeUSD':None,'storageAndEgressUSD':None,'operatorEffortUSD':None,'developmentAgentUsageUSD':None,'allocatedOwnedCapacityUSD':None,'totalFullCostUSD':None,'newPaidCapacityReservations':0,'unknownCostsAreZero':False,'fullCostReconciled':False,'thirtyTwoFoldImprovementMeasured':False,'unusedNativeAllowanceIsActualCost':False,'workOrder':{'repository':'network-ops','commit':'de99021411289af04b46fbdfa382aba80089edd8','source':source}},'scope':['All raw API snapshots, complete job logs, original artifact ZIPs and member byte inventories retained.','Nonempty CI producer/child-verifier receipts checked. This archive does not rerun frozen artifact semantic verifiers locally.','Two timed-out regression tests remain FAIL; no new native session or current candidate qualification.','Separate required39 certificate cases passed after the previous dependency-placement fix.','Retained source5 was not rerun or charged twice; no matching workflow push-path changed.']}
(base/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');(base/'artifact-members.json').write_text(json.dumps(inventory,indent=2)+'\n');(base/'semantic-receipts.json').write_text(json.dumps({'component':sem[0],'publication':p,'descendant':desc[0]},indent=2)+'\n')
print(json.dumps({'verified':True,'jobSeconds':total,'artifactCount':len(inventory),'artifactMembers':sum(len(x['members'])for x in inventory.values()),'source':source,'newNativeSessions':0,'foundation':'failure'}))
