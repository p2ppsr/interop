from pathlib import Path
import json,re,hashlib,zipfile,datetime,collections
base=Path(__file__).resolve().parent;source='e47873a952c4fbb25bae241aadf41863104ae977';sha=lambda b:hashlib.sha256(b).hexdigest()
def clean(data):return re.sub(r'^\S+Z ','',re.sub(r'\x1b\[[0-9;]*m','',data),flags=re.M)
def objects(log):
 out=[]
 for m in re.finditer(r'^\{',log,re.M):
  try:d,n=json.JSONDecoder().raw_decode(log[m.start():])
  except ValueError:continue
  if isinstance(d,dict):out.append(d)
 return out
enumerated=json.loads((base/'source-runs-terminal.json').read_text());assert enumerated['total_count']==2 and {r['id']for r in enumerated['workflow_runs']}=={43207730680,43207730665}
assert all(r['head_sha']==source and r['event']=='push' and r['run_attempt']==1 for r in enumerated['workflow_runs'])
workflows=[];total=0;inventory={};logs={}
for run in [43207730680,43207730665]:
 folder=base/str(run);metadata=json.loads((folder/'run-api.json').read_text());jobs=json.loads((folder/'jobs-api.json').read_text())['jobs'];assert metadata['head_sha']==source and metadata['status']=='completed' and metadata['event']=='push' and metadata['run_attempt']==1
 assert metadata['conclusion']==('failure'if run==43207730680 else'success')
 secs=0;jobRows=[]
 for j in jobs:
  assert j['status']=='completed' and j['conclusion']==('failure'if j['name']=='offline-core'else'success')
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
   if a['name']=='native-integrated-reevaluation':
    artifactReeval=json.loads(z.read('reevaluation.json'));childRows=[]
    for name in z.namelist():
     if not name.startswith('logs/') or name.endswith('/'):continue
     b=z.read(name);text=b.decode();candidates=[]
     for start in re.finditer(r'^\{',text,re.M):
      try:receipt,end=json.JSONDecoder().raw_decode(text[start.start():])
      except ValueError:continue
      if not text[start.start()+end:].strip():candidates.append(receipt)
     assert len(candidates)==1,name;receipt=candidates[0]
     if name in ['logs/rust-1-run.log','logs/rust-2-run.log']:
      assert receipt['schema']=='tpnil-component-result@1'
     else:assert receipt['verified']is True,name
     if name in ['logs/original-rust-1.log','logs/rust-1-verify.log','logs/rust-2-verify.log']:assert receipt['assertions']==48 and receipt['independentReplay']is True and len(receipt['inputs'])==4
     childRows.append({'path':name,'bytes':len(b),'sha256':sha(b),'receipt':receipt})
    assert len(childRows)==16
    assert json.loads((folder/'child-log-receipts.json').read_text())=={'claim':'RETAINED_SOURCE6_CI_LOG_RECEIPTS_ONLY','actualNonemptyCompleteJsonSuffixes':16,'logs':childRows}
  inventory[str(a['id'])]={'name':a['name'],'githubDigest':a['digest'],'members':members}
assert len(inventory)==5
core=logs['offline-core'];go=logs['go-components'];integrated=logs['integrated-components'];reeval=logs['retained-native-evidence']
for text in ['ℹ tests 181','ℹ pass 180','ℹ skipped 1','1051 passed','92 skipped (1143)','66 passed | 4 skipped (70)','Source differs from retained preflight: synthesis/src/wallet-lab/native/conformance-portability.ts','185f854de99df08499817b93dd902c01fb8acada93587708a8745170991ced78','137f7e786080f2088f0516317dccac08a4201bdc7b3a2a0039d23bc0ad7e33ea','> tsc --noEmit']:assert text in core,text
assert '13 passed (13)'in go
for text in ['39 passed (39)','14 passed (14)','ℹ tests 8','ℹ pass 8','ℹ tests 15','ℹ pass 15','test result: ok. 1 passed','test result: ok. 14 passed']:assert text in integrated,text
ij=objects(integrated);sem=[v for v in ij if v.get('childOraclesVerified')is True];assert len(sem)==1 and sem[0]['source']==source and len(sem[0]['findings'])==6
published=[v for v in ij if'"verifiedPublishedIntegrationArchives"'in json.dumps(v)];assert len(published)==1;p=published[0];assert p['verifiedPublishedIntegrationArchives']==14 and p['verifiedPublishedIntegrationAttempts']==18 and p['semantic']is True and len(p['bundles'])==32
counts=dict(collections.Counter(a['result']for lane in matrix['lanes']for r in lane['runs']for a in r['assertions']));assert counts=={'PASS':584,'FAIL':6}
desc=[v for v in ij if v.get('verified')is True and v.get('directions')==4];assert len(desc)==1 and desc[0]['result']=='PASS'
rj=objects(reeval);verified=[v for v in rj if v.get('claim')=='RETAINED_NATIVE_EVIDENCE_REEVALUATION'and v.get('verified')is True];assert len(verified)==1;v=verified[0];assert v['evaluatorSource']==source and v['newNativeSessions']==0 and v['repetitions']==2
produced=[v for v in rj if v.get('schema')=='tpnil-native-integrated-reevaluation@1'];assert len(produced)==1;q=produced[0];assert q==artifactReeval and q['originalMembersUnchanged']is True and q['qualifiedRetainedEvidence']is True and q['completeBRC100Conformance']is False and q['evaluatorSource']==source
assert q['planSha256']=='2a2401e1e8150ff21e966ca9aeb540ee10e527c47dcd183fc72bb708d0c6959f'
for r in q['repetitions']:assert r['native']['counts']=={'PASS':180,'FAIL':99,'BLOCKED':1}and r['rust']['counts']=={'PASS':48,'FAIL':0,'BLOCKED':0}and len(r['rust']['inputs'])==4 and r['counts']=={'PASS':77,'FAIL':0,'BLOCKED':0}

assert {j['name']for w in workflows for j in w['jobs']}=={'offline-core','go-components','integrated-components','retained-native-evidence'}
failed=[(j['name'],j['failedSteps'])for w in workflows for j in w['jobs']if j['conclusion']=='failure'];assert failed==[('offline-core',['Run node scripts/verify-native-portability-archive.mjs'])]
assert workflows[1]['jobSeconds']==116
summary={'schema':'tpnil-native-closure-ci-log-archive@2','claim':'CI_EXECUTION_AND_RETAINED_EVIDENCE_REVIEW_ONLY','source':source,'workflows':workflows,
 'tests':{'core':{'pass':180,'fail':0,'skipped':1,'total':181},'synthesis':{'pass':1051,'fail':0,'skipped':92,'total':1143,'passedFiles':66,'failedFiles':0,'skippedFiles':4,'totalFiles':70,'completeSuitePassed':True},'goComponents':{'pass':13},'certificateReferenceAndMutationsSeparateJob':{'pass':39,'required':True},'shutdownAndListenerSeparateJob':{'pass':14},'transport':{'pass':8},'services':{'pass':15},'rust':{'defaultPass':1,'graph3Pass':14},'python':'SKIPPED_AFTER_ARCHIVE_BINDING_FAILURE','typecheck':'PASS','catalog':'PASS','standards':'PASS'},
 'failure':{'stage':'offline-core verify-native-portability-archive.mjs','kind':'HISTORICAL_ARCHIVE_CURRENT_SOURCE_HASH_COUPLING','sourceFile':'synthesis/src/wallet-lab/native/conformance-portability.ts','expectedRetainedSourceSha256':'137f7e786080f2088f0516317dccac08a4201bdc7b3a2a0039d23bc0ad7e33ea','actualCurrentSourceSha256':'185f854de99df08499817b93dd902c01fb8acada93587708a8745170991ced78','testSuiteFailure':False,'skippedAfterFailure':['clause journals1/3','Python unittest','demo/verify','journal history'],'laterLocalCorrectionReclassifiesThisCI':False},
 'integratedComponentObservations':{'total':590,'counts':counts,'knownGoMessageBoxFailures':sem[0]['findings']},'publicationSemanticReplay':{'archives':14,'failedAttempts':18,'totalBundles':32},'descendantMatrix':{'verified':True,'directions':4,'result':'PASS'},
 'retainedReevaluation':{'plan':q['plan'],'planSha256':q['planSha256'],'newNativeSessions':0,'originalMembersUnchanged':True,'nativeOutcome':'FAIL','integrationOutcome':'PASS','rustOutcome':'PASS','repetitions':2,'nativeCountsPerRepetition':{'PASS':180,'FAIL':99,'BLOCKED':1},'integrationCountsPerRepetition':{'PASS':77,'FAIL':0,'BLOCKED':0},'rustCountsPerRepetition':{'PASS':48,'FAIL':0,'BLOCKED':0}},
 'completeBRC100Conformance':False,'nativeWalletConformanceClosed':False,'currentCandidateNativeSessions':0,'nativeE478Admission':'BLOCKED_BY_FOUNDATION_FAILURE_NOT_DISPATCHED',
 'cost':{'knownJobWallSeconds':total,'completedCohortJobSecondsBeforeIncrement':19717,'completedCohortJobSecondsAfterIncrement':19717+total,'historicalSeparateCohortJobSeconds':20670,'historicalCohortIncludedInIncrement':False,'actualCIChargeUSD':None,'storageAndEgressUSD':None,'operatorEffortUSD':None,'developmentAgentUsageUSD':None,'allocatedOwnedCapacityUSD':None,'totalFullCostUSD':None,'newPaidCapacityReservations':0,'unknownCostsAreZero':False,'fullCostReconciled':False,'thirtyTwoFoldImprovementMeasured':False,'unusedNativeAllowanceIsActualCost':False,'workOrder':{'repository':'network-ops','commit':'b49c0be22769277ffec834163657d580d2c2fc44','path':'artifacts/ops/itcve-native-closure-20261111/attempt-6-observer-recovery-order/work-order.json','sha256':'bbe080f5022ed92132624ca85790c9e2830b5307bb710a0fe4b3fc6911d6d819','source':source}},
 'scope':['All raw API snapshots, complete job logs, original artifact ZIPs and member byte inventories retained.','Nonempty producer and independent CI verifier receipts checked, including exact retained native/Rust counts. This archive does not rerun frozen artifact semantic verifiers locally.','Historical portability source-binding failure remains failed. Subsequent local skipped checks and correction evidence are separate and cannot convert this CI sample.','No current candidate native qualification or new native execution; e478 native allowance unused.','Three failed HTTPS git transports and one successful SSH source push are preserved separately; these are not workflow retries. API/download read errors are likewise not workflow retries.']}
(base/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');(base/'artifact-members.json').write_text(json.dumps(inventory,indent=2)+'\n');(base/'semantic-receipts.json').write_text(json.dumps({'component':sem[0],'publication':p,'descendant':desc[0],'reevaluationProduced':q,'reevaluationVerified':v},indent=2)+'\n')
print(json.dumps({'verified':True,'jobSeconds':total,'artifactCount':len(inventory),'artifactMembers':sum(len(x['members'])for x in inventory.values()),'source':source,'newNativeSessions':0,'foundation':'failure','retainedReevaluation':'success'}))
