from pathlib import Path
import json,hashlib,gzip,sys
r=Path(__file__).resolve().parent;m=json.loads((r/'validation.json').read_bytes());h=lambda b:hashlib.sha256(b).hexdigest()
assert {p.relative_to(r).as_posix()for p in r.rglob('*')if p.is_file()}==set(m['files'])|{'validation.json'}
for n,d in m['files'].items():assert h((r/n).read_bytes())==d,n
assert m['nativeQualification']is False and m['observations']==698 and len(m['inputs'])==396
if '--current-source'in sys.argv:
 root=Path.cwd()
 for n,d in m['inputs'].items():assert h((root/n).read_bytes())==d,n
for n,d in m['inputs'].items():
 p=r/'source'/(n+'.gz')
 if p.exists():assert h(gzip.decompress(p.read_bytes()))==d,n
print(json.dumps({'verified':True,'inputs':396,'observations':698,'nativeQualification':False}))
