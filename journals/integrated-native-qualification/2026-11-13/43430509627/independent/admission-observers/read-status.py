from pathlib import Path
import json,datetime
r=Path.cwd();h=r/'out/source19-validation'
def load(p):
 try:return json.loads(p.read_bytes())
 except(FileNotFoundError,json.JSONDecodeError):return {}
s={'UTC':datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')}
for x in load(h/'prerequisites/runs.json').get('workflow_runs',[]):
 if x['name']=='Foundation checks'and x['event']=='pull_request':s['Foundation']={'run':x['id'],'conclusion':x['conclusion'],'jobs':{j['name']:j['conclusion']or next((a['name']for a in j.get('steps',[])if a['status']=='in_progress'),j['status'])for j in load(h/'prerequisites'/f"{x['id']}-jobs.json").get('jobs',[])}}
 if x['name']=='Retained native evidence reevaluation':s['reevaluation']={'run':x['id'],'conclusion':x['conclusion'],'independentGate':(r/'out/source19-reevaluation-replay/gate.json').exists()}
n=load(h/'native-run.json')
if n:
 s['native']={'run':n['id'],'jobs':[{'name':j['name'],'conclusion':j['conclusion'],'active':[a['name']for a in j.get('steps',[])if a['status']=='in_progress']}for j in load(h/'native-monitor/jobs-current.json').get('jobs',[])]}
 if(h/'native-monitor/completion.json').exists():s['native']['terminal']=load(h/'native-monitor/completion.json')
else:s['native']='NOT_DISPATCHED'
for name,p in [('image',r/'out/source19-image-early/replay.json'),('intake',r/'out/source19-native-intake/intake.json'),('replay',r/'out/source19-replay/replay.json')]:
 if p.exists():
  d=load(p);s[name]={k:d[k]for k in ['verified','finalEntries','result','missingOriginalQualificationOrRust','repetitions']if k in d}
s['observerErrors']=[p.name for p in h.glob('*.stderr')if p.stat().st_size];print(json.dumps(s))
