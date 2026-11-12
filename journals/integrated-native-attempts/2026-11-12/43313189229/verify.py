from pathlib import Path
import json,gzip,hashlib,datetime
r=Path(__file__).resolve().parent;m=json.loads((r/'attempt.json').read_bytes());sha=lambda b:hashlib.sha256(b).hexdigest()
assert {p.name for p in r.iterdir()if p.is_file()}=={x['name']for x in m['files']}|{'attempt.json'}
for x in m['files']:assert len((r/x['name']).read_bytes())==x['size']and sha((r/x['name']).read_bytes())==x['sha256']
j=json.loads(gzip.decompress((r/'jobs-api.json.gz').read_bytes()));j=next(x for x in j['jobs']if x['name']=='all-go-native')
assert j['conclusion']=='cancelled'
for n in ['Execute two clean isolated native repetitions and verify results','Execute and independently verify the integrated native wallet graph']:assert next(s for s in j['steps']if s['name']==n)['conclusion']=='skipped'
t=lambda s:datetime.datetime.fromisoformat(s.replace('Z','+00:00'));assert(t(j['completed_at'])-t(j['started_at'])).total_seconds()==m['jobSeconds']==654
assert json.loads(gzip.decompress((r/'artifacts-api.json.gz').read_bytes()))['total_count']==0
assert m['walletExecuted']is False and m['nativeQualification']is False
print(json.dumps({'verified':True,'nativeSessions':0,'jobSeconds':654,'conclusion':'cancelled'}))
