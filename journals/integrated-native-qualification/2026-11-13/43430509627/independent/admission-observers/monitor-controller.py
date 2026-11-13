from pathlib import Path
import subprocess,json,datetime,time,sys
home=Path(__file__).resolve().parent/'native-monitor';home.mkdir(exist_ok=False);run=int(sys.argv[1]);assert run>0;repo='p2ppsr/interop';parse=lambda s:datetime.datetime.fromisoformat(s.replace('Z','+00:00'));order=json.loads(Path('/Users/tyeverett/projects/network-ops/artifacts/ops/itcve-native-closure-20261111/attempt-27-ci-worker-order/work-order.json').read_text());previous=None
def api(endpoint):
 for attempt in range(5):
  result=subprocess.run(['gh','api',endpoint],capture_output=True,timeout=45)
  if result.returncode==0:return json.loads(result.stdout)
  failure=home/f'api-observer-error-{time.time_ns()}.json'
  failure.write_text(json.dumps({'endpoint':endpoint,'exitCode':result.returncode,'stderr':result.stderr.decode(errors='replace'),'workflowRetry':False},indent=2)+'\n')
  if not any(marker in result.stderr for marker in [b'HTTP 502',b'HTTP 503',b'HTTP 504',b'HTTP 429',b'timeout']):raise RuntimeError('Nontransient read-only observer error')
  time.sleep(3)
 raise RuntimeError('Repeated read-only observer failures; existing workflow deadline remains active')
while True:
 now=datetime.datetime.now(datetime.timezone.utc);r=api(f'repos/{repo}/actions/runs/{run}');assert r['head_sha']==order['source']and r['run_attempt']==1
 j=api(f'repos/{repo}/actions/runs/{run}/jobs?per_page=100');(home/'run-current.json').write_text(json.dumps(r,indent=2)+'\n');(home/'jobs-current.json').write_text(json.dumps(j,indent=2)+'\n');targets=[x for x in j['jobs']if x['name']=='all-go-native'];assert len(targets)<=1
 if targets:
  target=targets[0];state=(target['status'],target['conclusion'],tuple(x['name']for x in target['steps']if x['status']=='in_progress'))
  if state!=previous:print(json.dumps({'at':now.isoformat(),'run':run,'job':target['id'],'status':state[0],'conclusion':state[1],'active':state[2]}),flush=True);previous=state
  if r['status']=='completed':
   (home/'completion.json').write_text(json.dumps({'run':run,'job':target['id'],'conclusion':r['conclusion'],'jobSeconds':(parse(target['completed_at'])-parse(target['started_at'])).total_seconds()},indent=2)+'\n');break
 if now>=parse(order['deadline'])or targets and targets[0]['started_at']and(now-parse(targets[0]['started_at'])).total_seconds()>=5400:
  c=subprocess.run(['gh','api','-X','POST',f'repos/{repo}/actions/runs/{run}/cancel'],capture_output=True);(home/'cancel.json').write_text(json.dumps({'at':now.isoformat(),'exitCode':c.returncode,'limitSeconds':5400,'run':run,'deadline':order['deadline']},indent=2)+'\n');print('Canceled native allocation at bounded limit',flush=True)
 time.sleep(25)
