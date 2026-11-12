from pathlib import Path
import subprocess,json,datetime,concurrent.futures,time,sys
base=Path(__file__).resolve().parent;source='e47873a952c4fbb25bae241aadf41863104ae977';deadline=datetime.datetime.fromisoformat('2026-11-12T13:59:12.290722+00:00')
expected={'Foundation checks':'.github/workflows/ci.yml','Retained native evidence reevaluation':'.github/workflows/native-evidence-reevaluation.yml'}
limits={'offline-core':600,'go-components':1200,'integrated-components':2400,'retained-native-evidence':1200}
def api(endpoint):return subprocess.check_output(['gh','api',endpoint],timeout=25)
def save(p,b):
 with p.open('xb')as f:f.write(b)
def get(run,stamp,now):
 d=base/str(run['id']);d.mkdir(exist_ok=True);raw=api(f"repos/p2ppsr/interop/actions/runs/{run['id']}/jobs?per_page=100");save(d/f'jobs-{stamp}.json',raw);jobs=json.loads(raw);assert jobs['total_count']==len(jobs['jobs'])
 save(d/f'run-{stamp}.json',json.dumps(run,separators=(',',':')).encode())
 if run['status']=='completed':
  for p,b in [(d/'run.json',json.dumps(run,separators=(',',':')).encode()),(d/'jobs.json',raw)]:
   if not p.exists():save(p,b)
 rows=[]
 for j in jobs['jobs']:
  assert j['name']in limits,('Unexpected job',j['name'])
  begin=datetime.datetime.fromisoformat(j['started_at'].replace('Z','+00:00'))if j.get('started_at')else None
  end=datetime.datetime.fromisoformat(j['completed_at'].replace('Z','+00:00'))if j.get('completed_at')else now
  seconds=max(0,int((end-begin).total_seconds()))if begin else 0
  failed=[s['name']for s in j.get('steps',[])if s['conclusion']not in[None,'success','skipped']]
  rows.append({'id':j['id'],'name':j['name'],'status':j['status'],'conclusion':j['conclusion'],'elapsedSeconds':seconds,'maximumSeconds':limits[j['name']],'overBound':seconds>limits[j['name']],'currentStep':next((s['name']for s in j.get('steps',[])if s['status']=='in_progress'),None),'failedSteps':failed})
  if j['status']=='completed'and j['conclusion']not in['success','skipped']:
   log=d/f"job-{j['id']}.log"
   if not log.exists():save(log,api(f"repos/p2ppsr/interop/actions/jobs/{j['id']}/logs"))
 return {'run':run['id'],'name':run['name'],'status':run['status'],'conclusion':run['conclusion'],'jobs':rows}
while True:
 now=datetime.datetime.now(datetime.timezone.utc);stamp=now.strftime('%Y%m%dT%H%M%S%fZ')
 if now>=deadline:print(json.dumps({'ALARM':'ABSOLUTE_DEADLINE','time':now.isoformat()}),flush=True);sys.exit(2)
 try:
  raw=api('repos/p2ppsr/interop/actions/runs?head_sha='+source+'&per_page=100');save(base/f'source-runs-{stamp}.json',raw);v=json.loads(raw);runs=v['workflow_runs'];assert v['total_count']==len(runs)
  assert len(runs)<=2,('Unexpected workflow or duplicate',[(r['id'],r['name'])for r in runs])
  names=set()
  for r in runs:
   assert r['head_sha']==source and r['run_attempt']==1 and r['event']=='push';assert r['name']in expected and r['name']not in names;names.add(r['name']);assert r['path']==expected[r['name']],r['path']
  with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:results=list(pool.map(lambda r:get(r,stamp,now),runs))
  summary={'observedAt':now.isoformat(),'source':source,'runs':results};save(base/f'poll-{stamp}.json',(json.dumps(summary,indent=2)+'\n').encode());print(json.dumps(summary),flush=True)
  if any(j['overBound']for r in results for j in r['jobs']):print(json.dumps({'ALARM':'JOB_SECONDS_OVER_BOUND'}),flush=True);sys.exit(2)
  if len(runs)==2 and all(r['status']=='completed'for r in runs):save(base/'source-runs-terminal.json',raw);break
 except AssertionError as e:print(json.dumps({'ALARM':'ADMISSION_MISMATCH','message':str(e)}),flush=True);raise
 except(subprocess.SubprocessError,OSError)as e:
  error={'observedAt':now.isoformat(),'type':type(e).__name__,'message':str(e),'nativeSessions':0};save(base/f'api-error-{stamp}.json',(json.dumps(error,indent=2)+'\n').encode());print(json.dumps({'READ_ERROR':error}),flush=True)
 time.sleep(55)
