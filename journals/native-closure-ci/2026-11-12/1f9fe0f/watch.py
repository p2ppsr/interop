from pathlib import Path
import subprocess,json,datetime,concurrent.futures,time,sys
base=Path(__file__).resolve().parent;source='1f9fe0f9b979e9bbca66e90335f02ba2b80c7d41';deadline=datetime.datetime.fromisoformat('2026-11-12T13:59:12.290722+00:00')
expected={'Foundation checks':'.github/workflows/ci.yml'}
limits={'offline-core':600,'go-components':1200,'integrated-components':2400}
def api(endpoint):
 import re,hashlib,os
 command=['gh','api',endpoint]
 try:
  result=subprocess.run(command,capture_output=True,timeout=25)
  if result.returncode==0:return result.stdout
  error=subprocess.CalledProcessError(result.returncode,command)
  stderr=result.stderr
 except subprocess.TimeoutExpired as failure:
  error=failure;stderr=failure.stderr or b''
 text=stderr.decode(errors='replace');stamp=str(__import__('time').time_ns())
 if 'sig='in text:
  private=Path('/Users/tyeverett/tmp/network-ops/private-transport-1f9fe0f');private.mkdir(mode=0o700,exist_ok=True);raw=private/(stamp+'.stderr');raw.write_bytes(stderr);os.chmod(raw,0o600)
 redacted=re.sub(r'(https://[^\s"?]+)\?[^\s"]+',r'\1?[DOWNLOAD_QUERY_REDACTED]',text)
 (base/('api-transport-'+stamp+'.json')).write_text(json.dumps({'endpoint':endpoint,'failure':type(error).__name__,'stderr':redacted,'rawStderrSha256':hashlib.sha256(stderr).hexdigest(),'privateOriginalOutsideRepository':'sig='in text,'workflowRetry':False},indent=2)+'\n')
 raise error
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
   if not log.exists():
    try:save(log,api(f"repos/p2ppsr/interop/actions/jobs/{j['id']}/logs"))
    except (subprocess.SubprocessError,OSError) as error:
     save(d/f"job-{j['id']}-log-read-error-{stamp}.json",(json.dumps({'type':type(error).__name__,'message':str(error)})+'\n').encode())
 return {'run':run['id'],'name':run['name'],'status':run['status'],'conclusion':run['conclusion'],'jobs':rows}
while True:
 now=datetime.datetime.now(datetime.timezone.utc);stamp=now.strftime('%Y%m%dT%H%M%S%fZ')
 if now>=deadline:print(json.dumps({'ALARM':'ABSOLUTE_DEADLINE','time':now.isoformat()}),flush=True);sys.exit(2)
 try:
  raw=api('repos/p2ppsr/interop/actions/runs?head_sha='+source+'&per_page=100');save(base/f'source-runs-{stamp}.json',raw);v=json.loads(raw);runs=v['workflow_runs'];assert v['total_count']==len(runs)
  assert len(runs)<=1,('Unexpected workflow or duplicate',[(r['id'],r['name'])for r in runs])
  names=set()
  for r in runs:
   assert r['head_sha']==source and r['run_attempt']==1 and r['event']=='push';assert r['name']in expected and r['name']not in names;names.add(r['name']);assert r['path']==expected[r['name']],r['path']
  with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:results=list(pool.map(lambda r:get(r,stamp,now),runs))
  summary={'observedAt':now.isoformat(),'source':source,'runs':results};save(base/f'poll-{stamp}.json',(json.dumps(summary,indent=2)+'\n').encode());print(json.dumps(summary),flush=True)
  if any(j['overBound']for r in results for j in r['jobs']):print(json.dumps({'ALARM':'JOB_SECONDS_OVER_BOUND'}),flush=True);sys.exit(2)
  if len(runs)==1 and all(r['status']=='completed'for r in runs):save(base/'source-runs-terminal.json',raw);break
 except AssertionError as e:print(json.dumps({'ALARM':'ADMISSION_MISMATCH','message':str(e)}),flush=True);raise
 except(subprocess.SubprocessError,OSError)as e:
  error={'observedAt':now.isoformat(),'type':type(e).__name__,'message':str(e),'nativeSessions':0};save(base/f'api-error-{stamp}.json',(json.dumps(error,indent=2)+'\n').encode());print(json.dumps({'READ_ERROR':error}),flush=True)
 time.sleep(55)
