from pathlib import Path
import json,hashlib,zipfile,datetime
r=Path(__file__).resolve().parent;m=json.loads((r/'manifest.json').read_bytes());h=lambda b:hashlib.sha256(b).hexdigest()
assert {p.name for p in r.iterdir()if p.is_file()}==set(m['files'])|{'manifest.json'}
for n,d in m['files'].items():assert h((r/n).read_bytes())==d,n
run=json.loads((r/'run-api.json').read_bytes());assert run['head_sha']==m['source']and run['conclusion']=='success'and run['run_attempt']==1
j=json.loads((r/'jobs-api.json').read_bytes());t=lambda s:datetime.datetime.fromisoformat(s.replace('Z','+00:00'));assert all(x['status']=='completed'and x['conclusion']=='success'for x in j['jobs'])
assert sum((t(x['completed_at'])-t(x['started_at'])).total_seconds()for x in j['jobs'])==1562
artifacts=json.loads((r/'artifacts-api.json').read_bytes())['artifacts'];members=0
for a in artifacts:
 p=r/f"artifact-{a['id']}.zip";assert 'sha256:'+h(p.read_bytes())==a['digest']and p.stat().st_size==a['size_in_bytes']
 with zipfile.ZipFile(p)as z:assert z.testzip()is None;members+=sum(not x.is_dir()for x in z.infolist())
assert len(artifacts)==3 and members==262
print(json.dumps({'verified':True,'source':m['source'],'jobSeconds':1562,'artifacts':3,'members':262,'nativeQualification':False}))
