from pathlib import Path
import json,re,hashlib,zipfile,datetime,collections
base=Path(__file__).resolve().parent;source='1f9fe0f9b979e9bbca66e90335f02ba2b80c7d41';sha=lambda b:hashlib.sha256(b).hexdigest()
def clean(data):return re.sub(r'^\S+Z ','',re.sub(r'\x1b\[[0-9;]*m','',data),flags=re.M)
def objects(log):
 out=[]
 for m in re.finditer(r'^\{',log,re.M):
  try:d,n=json.JSONDecoder().raw_decode(log[m.start():])
  except ValueError:continue
  if isinstance(d,dict):out.append(d)
 return out
enumerated=json.loads((base/'source-runs-terminal.json').read_text());assert enumerated['total_count']==1 and len(enumerated['workflow_runs'])==1 and enumerated['workflow_runs'][0]['id']==43213879582 and enumerated['workflow_runs'][0]['head_sha']==source
workflows=[];total=0;inventory={};logs={}
for run in [43213879582]:
 folder=base/str(run);metadata=json.loads((folder/'run-api.json').read_text());jobs=json.loads((folder/'jobs-api.json').read_text())['jobs'];assert metadata['head_sha']==source and metadata['status']=='completed' and metadata['event']=='push' and metadata['run_attempt']==1
 assert metadata['conclusion']=='success'
 secs=0;jobRows=[]
 for j in jobs:
  assert j['status']=='completed' and j['conclusion']=='success'
  timestamp=lambda x:datetime.datetime.fromisoformat(x.replace('Z','+00:00'));elapsed=int((timestamp(j['completed_at'])-timestamp(j['started_at'])).total_seconds());secs+=elapsed
  raw=(folder/f"job-{j['id']}.log").read_text();assert source in raw;logs[j['name']]=clean(raw)
  jobRows.append({'id':j['id'],'name':j['name'],'startedAt':j['started_at'],'completedAt':j['completed_at'],'jobSeconds':elapsed,'conclusion':j['conclusion'],'failedSteps':[s['name']for s in j['steps']if s['conclusion']not in[None,'success','skipped']],'skippedSteps':[s['name']for s in j['steps']if s['conclusion']=='skipped']})
 workflows.append({'id':run,'name':metadata['name'],'url':metadata['html_url'],'source':source,'conclusion':metadata['conclusion'],'jobSeconds':secs,'jobs':jobRows});total+=secs
 for a in json.loads((folder/'artifacts-api.json').read_text())['artifacts']:
  p=folder/f"artifact-{a['id']}.zip";assert 'sha256:'+sha(p.read_bytes())==a['digest']and p.stat().st_size==a['size_in_bytes'];seen=set();members=[]
  with zipfile.ZipFile(p)as z:
   for m in z.infolist():
    assert m.filename not in seen;seen.add(m.filename);name=Path(m.filename);assert not name.is_absolute()and'..'not in name.parts and (m.external_attr>>16)&0o170000!=0o120000
    if m.is_dir():continue
    data=z.read(m);members.append({'path':m.filename,'bytes':len(data),'sha256':sha(data),'crc32':m.CRC})
   if a['name']=='integrated-lab':matrix=json.loads(z.read('result.json'))
   if a['name']=='native-integrated-reevaluation':artifactReeval=json.loads(z.read('reevaluation.json'))
  inventory[str(a['id'])]={'name':a['name'],'githubDigest':a['digest'],'members':members}
assert {j['name']for j in workflows[0]['jobs']}=={'offline-core','go-components','integrated-components'}
core=logs['offline-core'];go=logs['go-components'];integrated=logs['integrated-components']
for text in ['ℹ tests 196','ℹ pass 195','ℹ skipped 1','1051 passed','92 skipped (1143)','66 passed | 4 skipped (70)','> tsc --noEmit','Ran 5 tests','OK']:assert text in core,text
assert '13 passed (13)'in go
for text in ['39 passed (39)','14 passed (14)','ℹ tests 8','ℹ pass 8','ℹ tests 15','ℹ pass 15','test result: ok. 1 passed','test result: ok. 14 passed']:assert text in integrated,text
ij=objects(integrated);sem=[v for v in ij if v.get('childOraclesVerified')is True];assert len(sem)==1 and sem[0]['source']==source and len(sem[0]['findings'])==6
published=[v for v in ij if 'verifiedPublishedIntegrationArchives'in v];assert len(published)==1;p=published[0];assert p['verifiedPublishedIntegrationArchives']==14 and p['verifiedPublishedIntegrationAttempts']==18 and p['semantic']is True and len(p['bundles'])==32
counts=dict(collections.Counter(a['result']for lane in matrix['lanes']for r in lane['runs']for a in r['assertions']));assert counts=={'PASS':584,'FAIL':6}
desc=[v for v in ij if v.get('verified')is True and v.get('directions')==4];assert len(desc)==1 and desc[0]['result']=='PASS'
carryFolder=base/'carried-source6';carry=json.loads((carryFolder/'carry.json').read_text())
assert carry['claim']=='UNCHANGED_SOURCE_CLOSURE_CARRY_FORWARD_NOT_NEW_REPLAY' and carry['newSource']==source and carry['resultSource']=='e47873a952c4fbb25bae241aadf41863104ae977' and carry['run']==43207730665 and carry['runRepeated']is False and carry['jobSecondsChargedAgain']==0 and carry['priorActualJobSeconds']==116
assert carry['oldArchiveManifestSha256']=='1304e87b20ee409e5080e5c1c47429fbb9308c008495210dc17a29da4d4736cc'
assert len(carry['copiedExactFiles'])==3
for row in carry['copiedExactFiles']:
 data=(carryFolder/row['path']).read_bytes();assert len(data)==row['bytes'] and sha(data)==row['sha256']
carriedRun=json.loads((carryFolder/'run-api.json').read_text());carriedJobs=json.loads((carryFolder/'jobs-api.json').read_text())['jobs']
assert carriedRun['id']==43207730665 and carriedRun['head_sha']==carry['resultSource'] and carriedRun['conclusion']=='success' and carriedRun['run_attempt']==1
assert len(carriedJobs)==1 and carriedJobs[0]['conclusion']=='success'
ts=lambda value:datetime.datetime.fromisoformat(value.replace('Z','+00:00'))
assert int((ts(carriedJobs[0]['completed_at'])-ts(carriedJobs[0]['started_at'])).total_seconds())==116
planBytes=(carryFolder/'plan.json').read_bytes();assert sha(planBytes)==carry['planSha256']=='2a2401e1e8150ff21e966ca9aeb540ee10e527c47dcd183fc72bb708d0c6959f'
plan=json.loads(planBytes);inputs=plan['evaluatorSources'];assert len(inputs)==len(carry['evaluatorInputs'])==5
for row in carry['evaluatorInputs']:
 assert row['unchanged']is True and row['newSource']==source and row['carriedSource']==carry['resultSource']
 data=(carryFolder/'source'/row['path']).read_bytes();assert sha(data)==row['sha256']==inputs[row['path']]
 assert hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==row['gitBlob']
portability=[v for v in objects(core) if v.get('currentProducerExecuted')is False];assert len(portability)==1
pr=portability[0];assert pr['verified']is True and pr['replayCleanup']is True and pr['attempts']==3 and pr['retainedFailures']==2 and pr['nativeEngineeringAssertions']==9 and pr['semanticSourceFiles']==1520 and pr['installedPackages']==193 and pr['frozenSynthesisDependencies']is True and pr['semanticSource']=='d059d4e2794a83600610c0bccb82d86b69fe6c7d'
summary={'schema':'tpnil-native-closure-ci-log-archive@2','claim':'CI_EXECUTION_AND_RETAINED_EVIDENCE_REVIEW_ONLY','source':source,'workflows':workflows,
 'tests':{'core':{'pass':195,'fail':0,'skipped':1,'total':196},'synthesis':{'pass':1051,'fail':0,'skipped':92,'total':1143,'passedFiles':66,'failedFiles':0,'skippedFiles':4,'totalFiles':70,'completeSuitePassed':True},'goComponents':{'pass':13},'certificateReferenceAndMutationsSeparateJob':{'pass':39,'required':True},'shutdownAndListenerSeparateJob':{'pass':14},'transport':{'pass':8},'services':{'pass':15},'rust':{'defaultPass':1,'graph3Pass':14},'python':{'pass':5},'typecheck':'PASS'},
 'failure':None,'historicalPortabilityReplay':pr,'integratedComponentObservations':{'total':590,'counts':counts,'knownGoMessageBoxFailures':sem[0]['findings']},'publicationSemanticReplay':{'archives':14,'failedAttempts':18,'totalBundles':32},'descendantMatrix':{'verified':True,'directions':4,'result':'PASS'},
 'previousRetainedReevaluation':{'run':43207730665,'source':carry['resultSource'],'archive':'../e47873a','archiveManifestSha256':carry['oldArchiveManifestSha256'],'sourcePlanSha256':carry['planSha256'],'unchangedEvaluatorInputs':5,'newRunOnThisSource':False,'jobSecondsIncludedAgain':False,'result':'PASS'},
 'completeBRC100Conformance':False,'nativeWalletConformanceClosed':False,'currentCandidateNativeSessionsInThisArchive':0,
 'cost':{'knownJobWallSeconds':total,'completedCohortJobSecondsBeforeIncrement':21214,'completedCohortJobSecondsAfterIncrement':21214+total,'historicalSeparateCohortJobSeconds':20670,'historicalCohortIncludedInIncrement':False,'actualCIChargeUSD':None,'storageAndEgressUSD':None,'operatorEffortUSD':None,'developmentAgentUsageUSD':None,'allocatedOwnedCapacityUSD':None,'totalFullCostUSD':None,'newPaidCapacityReservations':0,'unknownCostsAreZero':False,'fullCostReconciled':False,'thirtyTwoFoldImprovementMeasured':False,'unusedNativeAllowanceIsActualCost':False,'workOrder':{'repository':'network-ops','commit':'48a151f40b4602297dbd8e315791da3c45574ff3','path':'artifacts/ops/itcve-native-closure-20261111/attempt-6-portability-replay-recovery-order/work-order.json','sha256':'4cb6e2179f551835db51aacbedbcf303b493eb9c74b37a8f0f4439a355747656','source':source}},
 'scope':['All raw API snapshots, complete job logs, original artifact ZIPs and member byte inventories retained.','Nonempty CI producer/child-verifier receipts checked. This archive does not rerun frozen artifact semantic verifiers locally.','The predecessor e478 historical portability binding failure remains unchanged in its own archive.','Required39 certificate cases run in the integrated job; their default skip is not counted as a pass.','Retained source6 succeeded on e478 and was carried through exactly five unchanged evaluator inputs; it was not rerun or charged twice.','This CI archive contains no new native session or current candidate qualification.']}
(base/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');(base/'artifact-members.json').write_text(json.dumps(inventory,indent=2)+'\n');(base/'semantic-receipts.json').write_text(json.dumps({'component':sem[0],'publication':p,'descendant':desc[0],'historicalPortability':pr},indent=2)+'\n')
print(json.dumps({'verified':True,'jobSeconds':total,'artifactCount':len(inventory),'artifactMembers':sum(len(x['members'])for x in inventory.values()),'source':source,'newNativeSessions':0,'foundation':'success'}))
