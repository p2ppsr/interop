from pathlib import Path
import concurrent.futures,subprocess,json,datetime,sys
base=Path(__file__).resolve().parent
source='7bd1480037ddc064f5a8cb2f567f6e58285c5999'
now=datetime.datetime.now(datetime.timezone.utc);stamp=now.strftime('%Y%m%dT%H%M%S%fZ')
limits={'offline-core':600,'go-components':1200,'integrated-components':2400,'retained-native-evidence':1200}
def get(run):
 d=base/str(run);d.mkdir(exist_ok=True)
 raw=subprocess.check_output(['gh','api',f'repos/p2ppsr/interop/actions/runs/{run}']);r=json.loads(raw);assert r['head_sha']==source and r['run_attempt']==1 and r['event']=='push'
 (d/f'run-{stamp}.json').write_bytes(raw)
 rawj=subprocess.check_output(['gh','api',f'repos/p2ppsr/interop/actions/runs/{run}/jobs?per_page=100']);j=json.loads(rawj);assert j['total_count']==len(j['jobs'])
 (d/f'jobs-{stamp}.json').write_bytes(rawj)
 if r['status']=='completed':
  for p,data in [(d/'run.json',raw),(d/'jobs.json',rawj)]:
   if not p.exists():p.write_bytes(data)
 jobs=[]
 for v in j['jobs']:
  start=datetime.datetime.fromisoformat(v['started_at'].replace('Z','+00:00')) if v.get('started_at') else None
  end=datetime.datetime.fromisoformat(v['completed_at'].replace('Z','+00:00')) if v.get('completed_at') else now
  elapsed=max(0,int((end-start).total_seconds())) if start else 0
  jobs.append({'id':v['id'],'name':v['name'],'status':v['status'],'conclusion':v['conclusion'],'elapsedSeconds':elapsed,'limitSeconds':limits[v['name']],'overBound':elapsed>limits[v['name']],'currentStep':next((s['name'] for s in v.get('steps',[]) if s['status']=='in_progress'),None),'failedSteps':[s['name'] for s in v.get('steps',[]) if s['conclusion'] not in [None,'success','skipped']]})
 return {'run':run,'name':r['name'],'status':r['status'],'conclusion':r['conclusion'],'jobs':jobs}
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:out=list(pool.map(get,map(int,sys.argv[1:])))
print(json.dumps({'observedAt':now.isoformat(),'runs':out},indent=2))
