from pathlib import Path
import json,re,hashlib,zipfile,datetime,collections
base=Path(__file__).resolve().parent
source='69b1b52f0c3d46cbfac91c78b38eb2e4dffbac99'
def clean(data):return re.sub(r'^\S+Z ','',re.sub(r'\x1b\[[0-9;]*m','',data),flags=re.M)
def objects(log):
 out=[]
 for m in re.finditer(r'^\{',log,re.M):
  try:d,n=json.JSONDecoder().raw_decode(log[m.start():])
  except ValueError:continue
  if isinstance(d,dict):out.append(d)
 return out
def read(run,job):return clean((base/str(run)/f'job-{job}.log').read_text())
workflows=[];total=0;inventory={}
for run in [43165476505,43165476571]:
 folder=base/str(run);metadata=json.loads((folder/'run.json').read_text());jobs=json.loads((folder/'jobs.json').read_text())['jobs']
 assert metadata['head_sha']==source and metadata['conclusion']=='success' and metadata['status']=='completed'
 secs=0
 for job in jobs:
  assert job['conclusion']=='success' and job['status']=='completed';timestamp=lambda x:datetime.datetime.fromisoformat(x.replace('Z','+00:00'))
  secs+=int((timestamp(job['completed_at'])-timestamp(job['started_at'])).total_seconds());assert source in (folder/f"job-{job['id']}.log").read_text()
 workflows.append({'id':run,'name':metadata['name'],'url':metadata['html_url'],'source':source,'conclusion':'success','jobSeconds':secs,'jobs':[{'id':j['id'],'name':j['name'],'startedAt':j['started_at'],'completedAt':j['completed_at'],'conclusion':j['conclusion']}for j in jobs]});total+=secs
 for artifact in json.loads((folder/'artifacts.json').read_text())['artifacts']:
  p=folder/f"artifact-{artifact['id']}.zip";assert 'sha256:'+hashlib.sha256(p.read_bytes()).hexdigest()==artifact['digest'];assert p.stat().st_size==artifact['size_in_bytes']
  with zipfile.ZipFile(p) as z:
   seen=set();rows=[]
   for member in z.infolist():
    assert not member.is_dir();assert member.filename not in seen;seen.add(member.filename);name=Path(member.filename);assert not name.is_absolute() and '..' not in name.parts;assert (member.external_attr>>16)&0o170000 != 0o120000
    data=z.read(member);rows.append({'path':member.filename,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'crc32':member.CRC})
   inventory[str(artifact['id'])]={'name':artifact['name'],'githubDigest':artifact['digest'],'members':rows}
assert total==1445
core=read(43165476505,131006229017);go=read(43165476505,131006229409);integrated=read(43165476505,131006229351);reeval=read(43165476571,131006229218)
for pattern in ['ℹ tests 164','ℹ pass 163','ℹ skipped 1','716 passed','10 skipped','Ran 5 tests']:assert pattern in core,pattern
assert '13 passed' in go and '14 passed' in integrated and 'ℹ tests 8' in integrated and 'ℹ tests 15' in integrated
ij=objects(integrated);sem=[v for v in ij if v.get('childOraclesVerified') is True];assert len(sem)==1 and sem[0]['source']==source and len(sem[0]['findings'])==6
published=[v for v in ij if 'verifiedPublishedIntegrationArchives' in v];assert len(published)==1;p=published[0];assert p['verifiedPublishedIntegrationArchives']==14 and p['verifiedPublishedIntegrationAttempts']==16 and p['semantic'] is True and len(p['bundles'])==30
with zipfile.ZipFile(base/'43165476505/artifact-13919868556.zip') as z:
 d=json.loads(z.read('result.json'));counts=dict(collections.Counter(a['result'] for lane in d['lanes'] for r in lane['runs'] for a in r['assertions']));assert counts=={'PASS':584,'FAIL':6}
rj=objects(reeval);receipt=[v for v in rj if v.get('claim')=='RETAINED_NATIVE_EVIDENCE_REEVALUATION' and v.get('verified') is True];assert len(receipt)==1;receipt=receipt[0];assert receipt['evaluatorSource']==source and receipt['newNativeSessions']==0 and receipt['repetitions']==2
produced=[v for v in rj if v.get('schema')=='tpnil-native-integrated-reevaluation@1'];assert len(produced)==1;produced=produced[0]
assert produced['originalMembersUnchanged'] is True and produced['qualifiedRetainedEvidence'] is True and produced['completeBRC100Conformance'] is False
for rep in produced['repetitions']:assert rep['native']['counts']=={'PASS':180,'FAIL':99,'BLOCKED':1} and rep['rust']['counts']=={'PASS':48,'FAIL':0,'BLOCKED':0} and rep['counts']=={'PASS':77,'FAIL':0,'BLOCKED':0}
summary={'schema':'tpnil-native-closure-ci-log-archive@2','claim':'CI_EXECUTION_AND_RETAINED_EVIDENCE_REVIEW_ONLY','source':source,'workflows':workflows,'tests':{'core':{'pass':163,'fail':0,'skipped':1,'total':164,'skip':'Frozen historical replay unit requires local dependencies; dedicated frozen replay steps subsequently passed.'},'synthesis':{'pass':716,'fail':0,'skipped':10,'total':726,'files':53,'skipBreakdown':{'goComponents':8,'shutdown':1,'listener':1}},'goComponentsSeparateJob':{'pass':13},'shutdownAndListenerSeparateJob':{'pass':14},'transport':{'pass':8},'services':{'pass':15},'rust':{'defaultPass':1,'graph3Pass':14},'python':{'pass':5},'typecheck':'PASS'},'integratedComponentObservations':{'total':590,'counts':counts,'knownGoMessageBoxFailures':sem[0]['findings']},'publicationSemanticReplay':{'archives':14,'failedAttempts':16,'totalBundles':30},'retainedReevaluation':{'schema':produced['schema'],'plan':produced['plan'],'planSha256':produced['planSha256'],'newNativeSessions':0,'originalMembersUnchanged':True,'nativeOutcome':'FAIL','integrationOutcome':'PASS','rustOutcome':'PASS','repetitions':2,'nativeCountsPerRepetition':{'PASS':180,'FAIL':99,'BLOCKED':1},'integrationCountsPerRepetition':{'PASS':77,'FAIL':0,'BLOCKED':0},'rustCountsPerRepetition':{'PASS':48,'FAIL':0,'BLOCKED':0}},'completeBRC100Conformance':False,'nativeWalletConformanceClosed':False,'cost':{'knownJobWallSeconds':total,'completedCohortJobSecondsBeforeIncrement':10350,'completedCohortJobSecondsAfterIncrement':11795,'historicalSeparateCohortJobSeconds':20670,'historicalCohortIncludedInIncrement':False,'actualCIChargeUSD':None,'storageAndEgressUSD':None,'operatorEffortUSD':None,'developmentAgentUsageUSD':None,'allocatedOwnedCapacityUSD':None,'totalFullCostUSD':None,'newPaidCapacityReservations':0,'unknownCostsAreZero':False,'fullCostReconciled':False,'thirtyTwoFoldImprovementMeasured':False,'excludesActiveNativeRun':43165501159,'workOrder':{'repository':'network-ops','commit':'976eb26ab','source':source}},'scope':['Original API, complete job logs, original artifact ZIPs and per-member byte inventories retained.','Artifact digests match GitHub API metadata. CI semantic receipts are checked for nonempty structured contents; this archive does not rerun artifact semantic verifiers locally.','Foundation success retains six Go Message Box observations; retained native replay still has99 failures per session.','No current candidate native qualification or new native session is asserted by these two CI workflows.']}
(base/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');(base/'artifact-members.json').write_text(json.dumps(inventory,indent=2)+'\n');(base/'semantic-receipts.json').write_text(json.dumps({'component':sem[0],'publication':published[0],'reevaluationProduced':produced,'reevaluationVerified':receipt},indent=2)+'\n')
print(json.dumps({'verified':True,'jobSeconds':total,'artifactCount':len(inventory),'artifactMembers':sum(len(x['members'])for x in inventory.values()),'source':source}))
