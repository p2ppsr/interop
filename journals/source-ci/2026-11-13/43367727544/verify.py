from pathlib import Path
import json,hashlib,zipfile,datetime
r=Path(__file__).resolve().parent;m=json.loads((r/'manifest.json').read_bytes());h=lambda b:hashlib.sha256(b).hexdigest()
assert {p.name for p in r.iterdir()if p.is_file()}==set(m['files'])|{'manifest.json'}
for n,d in m['files'].items():assert h((r/n).read_bytes())==d,n
run=json.loads((r/'run-api.json').read_bytes());assert run['head_sha']==m['source']and run['conclusion']=='success'and run['run_attempt']==1
j=json.loads((r/'jobs-api.json').read_bytes());t=lambda s:datetime.datetime.fromisoformat(s.replace('Z','+00:00'));assert all(x['status']=='completed'and x['conclusion']=='success'for x in j['jobs'])
s=json.loads((r/'summary.json').read_bytes());assert sum((t(x['completed_at'])-t(x['started_at'])).total_seconds()for x in j['jobs'])==s['jobSeconds']
a=json.loads((r/'acquisition.json').read_bytes());members=0
for row in a['files']+a['apis']:
 b=(r/row['path']).read_bytes();assert len(b)==row['bytes']and h(b)==row['sha256']
 if row.get('artifactId'):
  with zipfile.ZipFile(r/row['path'])as z:
   assert {x.filename for x in z.infolist()if not x.is_dir()}=={x['path']for x in row['members']}
   for x in row['members']:assert len(z.read(x['path']))==x['bytes']and h(z.read(x['path']))==x['sha256']
   members+=len(row['members'])
print(json.dumps({'verified':True,'source':m['source'],'jobSeconds':s['jobSeconds'],'members':members,'nativeQualification':False}))
