from pathlib import Path
import subprocess,json,datetime,time,sys
base=Path(__file__).resolve().parent;source='c648022b2d9209b7350527bd5553d73e3e82a52c';run=43195585984
snapshots=base/'monitor';snapshots.mkdir(exist_ok=True)
deadline=datetime.datetime.fromisoformat('2026-11-12T12:33:49.234070+00:00')
while True:
 now=datetime.datetime.now(datetime.timezone.utc);stamp=now.strftime('%Y%m%dT%H%M%S%fZ')
 raw=subprocess.check_output(['gh','api',f'repos/p2ppsr/interop/actions/runs/{run}']);r=json.loads(raw);assert r['head_sha']==source and r['event']=='workflow_dispatch'and r['run_attempt']==1
 rawj=subprocess.check_output(['gh','api',f'repos/p2ppsr/interop/actions/runs/{run}/jobs?per_page=100']);j=json.loads(rawj);assert j['total_count']==len(j['jobs'])
 (snapshots/f'run-{stamp}.json').write_bytes(raw);(snapshots/f'jobs-{stamp}.json').write_bytes(rawj)
 jobs=[]
 for v in j['jobs']:
  start=datetime.datetime.fromisoformat(v['started_at'].replace('Z','+00:00'))if v.get('started_at')else None;end=datetime.datetime.fromisoformat(v['completed_at'].replace('Z','+00:00'))if v.get('completed_at')else now
  elapsed=max(0,int((end-start).total_seconds()))if start else0
  jobs.append({'id':v['id'],'name':v['name'],'status':v['status'],'conclusion':v['conclusion'],'jobSeconds':elapsed,'step':next((s['name']for s in v.get('steps',[])if s['status']=='in_progress'),None),'failedSteps':[s['name']for s in v.get('steps',[])if s['conclusion']not in[None,'success','skipped']]})
 risk=now>deadline or any(x['jobSeconds']>4200 for x in jobs)
 print(json.dumps({'observedAt':now.isoformat(),'run':run,'status':r['status'],'conclusion':r['conclusion'],'budgetRisk':risk,'jobs':jobs}),flush=True)
 if r['status']=='completed' or risk:break
 time.sleep(55)
