from pathlib import Path
import json,re,hashlib,zipfile,datetime,collections
base=Path(__file__).resolve().parent;source='7bd1480037ddc064f5a8cb2f567f6e58285c5999';sha=lambda b:hashlib.sha256(b).hexdigest()
def clean(data):return re.sub(r'^\S+Z ','',re.sub(r'\x1b\[[0-9;]*m','',data),flags=re.M)
def objects(log):
 out=[]
 for m in re.finditer(r'^\{',log,re.M):
  try:d,n=json.JSONDecoder().raw_decode(log[m.start():])
  except ValueError:continue
  if isinstance(d,dict):out.append(d)
 return out
workflows=[];total=0;inventory={};logs={}
for run in [43185320652,43185320587]:
 folder=base/str(run);metadata=json.loads((folder/'run.json').read_text());jobs=json.loads((folder/'jobs.json').read_text())['jobs'];assert metadata['head_sha']==source and metadata['status']=='completed' and metadata['event']=='push' and metadata['run_attempt']==1
 assert metadata['conclusion']==('failure'if run==43185320652 else'success')
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
assert total==1411 and len(inventory)==5 and sum(len(v['members'])for v in inventory.values())==483
core=logs['offline-core'];go=logs['go-components'];integrated=logs['integrated-components'];reeval=logs['retained-native-evidence']
for text in ['ℹ tests 173','ℹ pass 172','ℹ skipped 1','1037 passed','27 skipped (1102)','Errors  1 error','SyntaxError: Unexpected token','convert-source-map/index.js:83','> tsc --noEmit']:assert text in core,text
assert 'native-coverage-certificates.test.ts (38 tests)'not in core and '13 passed (13)'in go
for text in ['14 passed (14)','ℹ tests 8','ℹ pass 8','ℹ tests 15','ℹ pass 15','test result: ok. 1 passed','test result: ok. 14 passed']:assert text in integrated,text
ij=objects(integrated);sem=[v for v in ij if v.get('childOraclesVerified')is True];assert len(sem)==1 and sem[0]['source']==source and len(sem[0]['findings'])==6
published=[v for v in ij if'"verifiedPublishedIntegrationArchives"'in json.dumps(v)];assert len(published)==1;p=published[0];assert p['verifiedPublishedIntegrationArchives']==14 and p['verifiedPublishedIntegrationAttempts']==17 and p['semantic']is True and len(p['bundles'])==31
counts=dict(collections.Counter(a['result']for lane in matrix['lanes']for r in lane['runs']for a in r['assertions']));assert counts=={'PASS':584,'FAIL':6}
desc=[v for v in ij if v.get('verified')is True and v.get('directions')==4];assert len(desc)==1 and desc[0]['result']=='PASS'
rj=objects(reeval);verified=[v for v in rj if v.get('claim')=='RETAINED_NATIVE_EVIDENCE_REEVALUATION'and v.get('verified')is True];assert len(verified)==1;v=verified[0];assert v['evaluatorSource']==source and v['newNativeSessions']==0 and v['repetitions']==2
produced=[v for v in rj if v.get('schema')=='tpnil-native-integrated-reevaluation@1'];assert len(produced)==1;q=produced[0];assert q==artifactReeval and q['originalMembersUnchanged']is True and q['qualifiedRetainedEvidence']is True and q['completeBRC100Conformance']is False and q['evaluatorSource']==source
assert q['planSha256']=='3c7b9ba53566eaae153aed5734266f58d1bd91746a1d4bb9e08f2002e91c263b'
for r in q['repetitions']:assert r['native']['counts']=={'PASS':180,'FAIL':99,'BLOCKED':1}and r['rust']['counts']=={'PASS':48,'FAIL':0,'BLOCKED':0}and len(r['rust']['inputs'])==4 and r['counts']=={'PASS':77,'FAIL':0,'BLOCKED':0}
summary={'schema':'tpnil-native-closure-ci-log-archive@2','claim':'CI_EXECUTION_AND_RETAINED_EVIDENCE_REVIEW_ONLY','source':source,'workflows':workflows,'tests':{'core':{'pass':172,'fail':0,'skipped':1,'total':173},'synthesis':{'reportedPass':1037,'reportedSkipped':27,'declaredTotal':1102,'unreported':38,'reportedPassedFiles':63,'reportedSkippedFiles':2,'declaredFiles':66,'runnerErrors':1,'completeSuitePassed':False,'missingFile':'native-coverage-certificates.test.ts'},'goComponents':{'pass':13},'shutdownAndListenerSeparateJob':{'pass':14},'transport':{'pass':8},'services':{'pass':15},'rust':{'defaultPass':1,'graph3Pass':14},'python':'NOT_EXECUTED_AFTER_SYNTHESIS_FAILURE','typecheck':'PASS'},'failure':{'stage':'offline-core npm test --prefix synthesis','primarySourceDiagnosis':'Missing integrations/services dependency closure for the new certificate reference child. Independently reproduced MODULE_NOT_FOUND mongodb-memory-server.','secondarySourceDiagnosis':'Vitest inline-map recovery misreads the literal sourceMappingURL template in TSX register module; independently reproduces replacement-character JSON parse exception.','ciOriginalChildStderrAvailable':False,'timeoutProven':False,'initialHypothesisRetained':True,'localCorrectionOrNativeQualificationClaimedByThisArchive':False},'integratedComponentObservations':{'total':590,'counts':counts,'knownGoMessageBoxFailures':sem[0]['findings']},'publicationSemanticReplay':{'archives':14,'failedAttempts':17,'totalBundles':31},'descendantMatrix':{'verified':True,'directions':4,'result':'PASS'},'retainedReevaluation':{'plan':q['plan'],'planSha256':q['planSha256'],'newNativeSessions':0,'originalMembersUnchanged':True,'nativeOutcome':'FAIL','integrationOutcome':'PASS','rustOutcome':'PASS','repetitions':2,'nativeCountsPerRepetition':{'PASS':180,'FAIL':99,'BLOCKED':1},'integrationCountsPerRepetition':{'PASS':77,'FAIL':0,'BLOCKED':0},'rustCountsPerRepetition':{'PASS':48,'FAIL':0,'BLOCKED':0}},'completeBRC100Conformance':False,'nativeWalletConformanceClosed':False,'currentCandidateNativeSessions':0,'native7bdAdmission':'BLOCKED_BY_FOUNDATION_FAILURE_NOT_DISPATCHED','cost':{'knownJobWallSeconds':1411,'completedCohortJobSecondsBeforeIncrement':14252,'completedCohortJobSecondsAfterIncrement':15663,'historicalSeparateCohortJobSeconds':20670,'historicalCohortIncludedInIncrement':False,'actualCIChargeUSD':None,'storageAndEgressUSD':None,'operatorEffortUSD':None,'developmentAgentUsageUSD':None,'allocatedOwnedCapacityUSD':None,'totalFullCostUSD':None,'newPaidCapacityReservations':0,'unknownCostsAreZero':False,'fullCostReconciled':False,'thirtyTwoFoldImprovementMeasured':False,'unusedNativeAllowanceIsActualCost':False,'workOrder':{'repository':'network-ops','commit':'4d5659e8199f3ec4365570940b6087c5ea706070','source':source}},'scope':['Original API, complete job logs, original artifact ZIPs and all483 member byte inventories retained.','Nonempty producer and independent CI verifier receipts checked, including exact original native/Rust counts. This archive does not rerun frozen artifact semantic verifiers locally.','The failed CI suite and missing38 tests remain failures/unobserved; source diagnosis is separately reproduced local evidence, not recovered original childstderr.','No current candidate native qualification/new native execution; source7bd native allowance unused.']}
(base/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');(base/'artifact-members.json').write_text(json.dumps(inventory,indent=2)+'\n');(base/'semantic-receipts.json').write_text(json.dumps({'component':sem[0],'publication':p,'descendant':desc[0],'reevaluationProduced':q,'reevaluationVerified':v},indent=2)+'\n')
print(json.dumps({'verified':True,'jobSeconds':total,'artifactCount':len(inventory),'artifactMembers':483,'source':source,'newNativeSessions':0,'foundation':'failure'}))
