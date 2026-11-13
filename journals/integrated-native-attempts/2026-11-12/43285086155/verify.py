from pathlib import Path
import json,hashlib,gzip,zipfile
r=Path(__file__).resolve().parent;m=json.loads((r/'attempt.json').read_bytes());h=lambda b:hashlib.sha256(b).hexdigest()
assert {p.name for p in r.iterdir()if p.is_file()}=={x['name']for x in m['files']}|{'attempt.json'}
for x in m['files']:assert h((r/x['name']).read_bytes())==x['sha256']and(r/x['name']).stat().st_size==x['size']
j=json.loads(gzip.decompress((r/'jobs-api.json.gz').read_bytes()));a=next(x for x in j['jobs']if x['id']==131416248320);assert a['conclusion']=='failure'
for name in ['Execute two clean isolated native repetitions and verify results','Execute and independently verify the integrated native wallet graph']:assert next(s for s in a['steps']if s['name']==name)['conclusion']=='skipped'
with zipfile.ZipFile(r/'complete-workflow-logs.zip')as z:assert z.testzip()is None;assert any(b'exporting layers 5.9s done'in z.read(n)for n in z.namelist()if 'prospective'in n)
assert m['nativeQualification']is False and m['walletExecuted']is False
print(json.dumps({'verified':True,'jobSeconds':877,'nativeSessions':0,'nativeQualification':False}))
