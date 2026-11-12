from pathlib import Path
import json,gzip,hashlib,datetime
r=Path(__file__).resolve().parent;m=json.loads((r/'attempt.json').read_bytes());h=lambda b:hashlib.sha256(b).hexdigest()
assert m['workflowRun']==43268040660 and m['walletExecuted']is None and m['nativeQualification']is False
assert {p.relative_to(r).as_posix()for p in r.rglob('*')if p.is_file()}=={x['name']for x in m['files']}|{'attempt.json'}
for x in m['files']:
 p=r/x['name'];assert not p.is_symlink()and p.stat().st_size==x['size']and h(p.read_bytes())==x['sha256']
read=lambda n:json.loads(gzip.decompress((r/(n+'.gz')).read_bytes()))
a=read('acquisition/artifacts.json');assert a['total_count']==0
j=read('acquisition/jobs.json');job=next(x for x in j['jobs']if x['id']==131356807686)
t=lambda s:datetime.datetime.fromisoformat(s.replace('Z','+00:00'))
assert job['conclusion']=='failure'and(t(job['completed_at'])-t(job['started_at'])).total_seconds()==3784
assert any('lost communication'in x['message']for x in read('acquisition/annotations.json'))
assert next(s for s in job['steps']if s['name']=='Execute and independently verify the integrated native wallet graph')['status']=='pending'
print(json.dumps({'verified':True,'jobSeconds':3784,'cohort':33214,'walletExecuted':'UNKNOWN','nativeQualification':False,'files':len(m['files'])}))
