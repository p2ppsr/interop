from pathlib import Path
import subprocess,json,datetime,time,sys
base=Path(__file__).resolve().parent;source='1f9fe0f9b979e9bbca66e90335f02ba2b80c7d41';run=43216478235
snapshots=base/'monitor';snapshots.mkdir(exist_ok=True)
deadline=datetime.datetime.fromisoformat('2026-11-12T13:59:12.290722+00:00')
def api(endpoint):
 p=subprocess.run(['gh','api',endpoint],capture_output=True,timeout=25)
 if p.returncode:
  raise RuntimeError('GitHub read failed: '+p.stderr.decode(errors='replace'))
 return p.stdout
while True:
 now=datetime.datetime.now(datetime.timezone.utc);stamp=now.strftime('%Y%m%dT%H%M%S%fZ')
 if now>deadline:print(json.dumps({'ALARM':'ABSOLUTE_DEADLINE','observedAt':now.isoformat()}),flush=True);break
 try:
  raw=api(f'repos/p2ppsr/interop/actions/runs/{run}');r=json.loads(raw);assert r['head_sha']==source and r['event']=='workflow_dispatch' and r['run_attempt']==1
  rawj=api(f'repos/p2ppsr/interop/actions/runs/{run}/jobs?per_page=100');j=json.loads(rawj);assert j['total_count']==len(j['jobs']) and len(j['jobs'])<=1
  rawe=api(f'repos/p2ppsr/interop/actions/runs?head_sha={source}&per_page=100');e=json.loads(rawe);assert e['total_count']==len(e['workflow_runs'])==2 and {x['id']for x in e['workflow_runs']}=={43213879582,run} and all(x['run_attempt']==1 for x in e['workflow_runs'])
  for name,data in [('run',raw),('jobs',rawj),('source-enumeration',rawe)]:
   (snapshots/f'{name}-{stamp}.json').write_bytes(data)
  jobs=[]
  for v in j['jobs']:
   start=datetime.datetime.fromisoformat(v['started_at'].replace('Z','+00:00'))if v.get('started_at')else None;end=datetime.datetime.fromisoformat(v['completed_at'].replace('Z','+00:00'))if v.get('completed_at')else now
   elapsed=max(0,int((end-start).total_seconds()))if start else 0
   jobs.append({'id':v['id'],'name':v['name'],'status':v['status'],'conclusion':v['conclusion'],'jobSeconds':elapsed,'step':next((x['name']for x in v.get('steps',[])if x['status']=='in_progress'),None),'failedSteps':[x['name']for x in v.get('steps',[])if x['conclusion']not in[None,'success','skipped']]})
  risk=any(x['jobSeconds']>4200 for x in jobs)
  record={'observedAt':now.isoformat(),'run':run,'status':r['status'],'conclusion':r['conclusion'],'budgetRisk':risk,'jobs':jobs};(snapshots/f'poll-{stamp}.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record),flush=True)
  if r['status']=='completed' or risk:break
 except (RuntimeError,subprocess.SubprocessError) as error:
  record={'observedAt':now.isoformat(),'readError':str(error),'controlAction':None};(snapshots/f'read-error-{stamp}.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record),flush=True)
 except AssertionError as error:
  print(json.dumps({'ALARM':'UNEXPECTED_WORKFLOW_OR_SOURCE','message':str(error)}),flush=True);raise
 time.sleep(55)
