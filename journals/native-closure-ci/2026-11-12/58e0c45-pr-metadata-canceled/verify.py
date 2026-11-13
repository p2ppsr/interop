from pathlib import Path
import json,hashlib,datetime,zipfile
r=Path(__file__).resolve().parent;m=json.loads((r/'manifest.json').read_bytes());sha=lambda b:hashlib.sha256(b).hexdigest()
assert {p.name for p in r.iterdir()if p.is_file()}==set(m['files'])|{'manifest.json'}
for n,h in m['files'].items():assert sha((r/n).read_bytes())==h,n
run=json.loads((r/'run-api.json').read_bytes());assert run['head_sha']==m['source']and run['conclusion']=='cancelled'
j=json.loads((r/'jobs-api.json').read_bytes())['jobs'];t=lambda s:datetime.datetime.fromisoformat(s.replace('Z','+00:00'));assert sum((t(x['completed_at'])-t(x['started_at'])).total_seconds()for x in j)==1460
a=json.loads((r/'acquisition.json').read_bytes())
for row in a['files']:
 if row.get('artifactId'):
  with zipfile.ZipFile(r/row['path'])as z:
   assert {x.filename for x in z.infolist()if not x.is_dir()}=={x['path']for x in row['members']}
   for x in row['members']:assert len(z.read(x['path']))==x['bytes']and sha(z.read(x['path']))==x['sha256']
assert m['nativeSessions']==0 and m['nativeQualification']is False
print(json.dumps({'verified':True,'run':m['run'],'jobSeconds':1460,'nativeSessions':0}))
