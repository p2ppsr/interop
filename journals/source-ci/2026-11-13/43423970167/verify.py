from pathlib import Path
import json,hashlib,datetime
r=Path(__file__).resolve().parent;m=json.loads((r/'manifest.json').read_bytes());assert {p.name for p in r.iterdir()if p.is_file()}==set(m['files'])|{'manifest.json'}
for n,h in m['files'].items():assert hashlib.sha256((r/n).read_bytes()).hexdigest()==h,n
jobs=json.loads((r/'jobs-api.json').read_bytes())['jobs'];t=lambda s:datetime.datetime.fromisoformat(s.replace('Z','+00:00'));seconds=sum(int((t(j['completed_at'])-t(j['started_at'])).total_seconds())for j in jobs if j['conclusion']!='skipped');assert seconds==m['jobSeconds'];assert not m['nativeQualification']and m['nativeSessions']==0
print(json.dumps({'verified':True,'run':m['run'],'jobSeconds':seconds,'nativeSessions':0,'physicalIntegrityOnly':True}))
