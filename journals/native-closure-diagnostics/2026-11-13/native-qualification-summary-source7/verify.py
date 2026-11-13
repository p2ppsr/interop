from pathlib import Path
import json,hashlib
r=Path(__file__).resolve().parent;m=json.loads((r/'manifest.json').read_bytes());sha=lambda b:hashlib.sha256(b).hexdigest()
assert {str(p.relative_to(r))for p in r.rglob('*')if p.is_file()}=={x['path']for x in m['files']}|{'manifest.json'}
for x in m['files']:
 b=(r/x['path']).read_bytes();assert len(b)==x['bytes']and sha(b)==x['sha256'],x['path']
assert m['nativeSessions']==0 and not m['nativeQualification']and m['nativeInputs']==457
print(json.dumps({'verified':True,'files':len(m['files']),'claim':'LAB_SELF_TEST_ONLY','nativeQualification':False}))
