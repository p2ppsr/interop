from pathlib import Path
import json,hashlib
r=Path(__file__).resolve().parent;m=json.loads((r/'manifest.json').read_bytes());assert {str(p.relative_to(r))for p in r.rglob('*')if p.is_file()}==set(m['files'])|{'manifest.json'}
for n,h in m['files'].items():assert hashlib.sha256((r/n).read_bytes()).hexdigest()==h,n
c=json.loads((r/'checks.json').read_bytes());assert c['newNativeSessions']==0 and c['nativeInputsUnchanged']==471 and not c['completeBRC100Conformance']
print(json.dumps({'verified':True,'files':len(m['files']),'newNativeSessions':0,'physicalIntegrityOnly':True}))
