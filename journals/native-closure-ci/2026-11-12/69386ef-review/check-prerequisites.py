from pathlib import Path
import json,hashlib,zipfile,datetime,subprocess
ROOT=Path.cwd();B=ROOT/'out/native-closure-20261111/ci-69386ef';OUT=ROOT/'out/native-closure-20261111/ci-69386ef-independent'
SOURCE='69386efcea077e4bbe5b6e07f71fc6fe3b1f87f7';SHA=lambda b:hashlib.sha256(b).hexdigest()
NOW=datetime.datetime.now(datetime.timezone.utc);cost=json.loads((B/'cost-summary.json').read_bytes())
assert cost['source']==SOURCE and cost['knownJobWallSeconds']==1826 and cost['completedCohortJobSecondsAfterIncrement']==26946
assert NOW<datetime.datetime.fromisoformat(cost['workOrder']['latestNativeDispatch'])
order=Path('/Users/tyeverett/projects/network-ops')/cost['workOrder']['path'];assert SHA(order.read_bytes())==cost['workOrder']['sha256']
expected={43249807860:'Foundation checks',43249807970:'Retained native evidence reevaluation'};receipts=[];artifactTotal=0;memberTotal=0;seconds=0
for run,name in expected.items():
 d=B/str(run);meta=json.loads((d/'run-api.json').read_bytes());jobs=json.loads((d/'jobs-api.json').read_bytes());a=json.loads((d/'acquisition.json').read_bytes());api=json.loads((d/'artifacts-api.json').read_bytes());byid={x['id']:x for x in api['artifacts']}
 assert meta['id']==run and meta['name']==name and meta['head_sha']==SOURCE and meta['status']=='completed' and meta['conclusion']=='success' and meta['run_attempt']==1 and meta['event']=='push'
 assert a['source']==SOURCE and a['run']==run and a['conclusion']=='success'
 assert jobs['total_count']==len(jobs['jobs'])and len(byid)==api['total_count'];seen=set()
 for j in jobs['jobs']:
  assert j['status']=='completed'and j['conclusion']=='success'
  assert all(s['conclusion']in['success','skipped']for s in j['steps'])
  t=lambda v:datetime.datetime.fromisoformat(v.replace('Z','+00:00'))
  seconds+=(t(j['completed_at'])-t(j['started_at'])).total_seconds()
 for row in a['apis']:
  raw=(d/row['path']).read_bytes();assert len(raw)==row['bytes']and SHA(raw)==row['sha256']
 for row in a['files']:
  raw=(d/row['path']).read_bytes();assert len(raw)==row['bytes']and SHA(raw)==row['sha256']
  if not row.get('artifactId'):continue
  item=byid[row['artifactId']];assert item['name']==row['artifactName']and item['digest']=='sha256:'+SHA(raw)and item['size_in_bytes']==len(raw)and item['expired']is False
  assert item['id']not in seen;seen.add(item['id']);artifactTotal+=1
  with zipfile.ZipFile(d/row['path'])as z:
   actual=[];names=set()
   for info in z.infolist():
    assert info.filename not in names;names.add(info.filename);p=Path(info.filename)
    assert not p.is_absolute()and'..'not in p.parts and'\\'not in info.filename and(info.external_attr>>16)&0o170000!=0o120000
    if info.is_dir():continue
    b=z.read(info);actual.append({'path':info.filename,'bytes':len(b),'sha256':SHA(b),'crc32':info.CRC})
   assert actual==row['members'];memberTotal+=len(actual)
 receipts.append({'run':run,'conclusion':'success','acquisitionSha256':SHA((d/'acquisition.json').read_bytes()),'artifacts':len(seen),'jobs':len(jobs['jobs'])})
 assert seen==set(byid)
assert artifactTotal==5 and memberTotal==483 and seconds==1826
planpath='infra/native/conformance/plan-pr368-coverage-3.json';planbytes=subprocess.check_output(['git','show',SOURCE+':'+planpath]);plan=json.loads(planbytes)
assert len(plan['conformanceInputs'])==391
for name,h in plan['conformanceInputs'].items():assert SHA((ROOT/name).read_bytes())==h
sourceReceipt=B/'independent-review/source-review.json';sr=json.loads(sourceReceipt.read_bytes());assert sr['verified']is True and sr['checkedInputs']==391 and sr['source']==SOURCE and sr['committedCurrentAndPlanMatch']is True
assert {x['path']:x['sha256']for x in sr['inputs']}==plan['conformanceInputs']
local=ROOT/'journals/native-closure-validation/2026-11-12-coverage-completion/validation.json';assert SHA(local.read_bytes())=='d385fc517b93c3db44a63edaa32689726cde0683b0635035a9a5e733e7017a80'
r={'schema':'tpnil-native-ci-dispatch-prerequisite-independent-review@1','verified':True,'checkedAt':NOW.isoformat(),'source':SOURCE,'runs':receipts,'artifacts':artifactTotal,'artifactMembers':memberTotal,'sourceInputs':391,'sourcePlanSha256':SHA(planbytes),'sourceReviewSha256':SHA(sourceReceipt.read_bytes()),'localValidationArchiveSha256':SHA(local.read_bytes()),'bothCIWorkflowsSucceeded':True,'jobSeconds':seconds,'knownCohortJobSeconds':26946,'withinBoundedOrderAtReview':True,'workOrder':cost['workOrder'],'nativeQualification':False,'newNativeSessionsInTheseWorkflows':0,'limitations':['CI success does not mean all component assertions passed; six retained Go messaging failures remain findings.','No fresh native qualification or additional semantic replay is claimed by this integrity review.','Root must recheck latest dispatch deadline immediately before dispatch; final CI publication sidecar may be sealed in parallel.']}
(OUT/'prerequisites.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'verified':True,'receipt':str((OUT/'prerequisites.json').relative_to(ROOT)),'sha256':SHA((OUT/'prerequisites.json').read_bytes()),'artifacts':artifactTotal,'members':memberTotal,'checkedAt':NOW.isoformat()}))
