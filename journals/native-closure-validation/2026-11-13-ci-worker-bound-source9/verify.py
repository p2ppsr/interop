from pathlib import Path
import json,hashlib
r=Path(__file__).resolve().parent;m=json.loads((r/'manifest.json').read_bytes());assert {str(p.relative_to(r))for p in r.rglob('*')if p.is_file()}==set(m['files'])|{'manifest.json'}
for n,h in m['files'].items():assert hashlib.sha256((r/n).read_bytes()).hexdigest()==h,n
c=json.loads((r/'checks.json').read_bytes());assert c['nativeSessions']==0 and not c['criteriaChanged']and not c['Go11ArtifactChanged']and c['testTimeoutMilliseconds']==30000 and c['maximumTestWorkers']==2
print(json.dumps({'verified':True,'files':len(m['files']),'nativeSessions':0,'physicalIntegrityOnly':True}))
