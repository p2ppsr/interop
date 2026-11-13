from pathlib import Path
import json,hashlib
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
p=Path('infra/native/conformance/plan-pr368-coverage-6-source-6.json');d=json.loads(p.read_bytes());d['conformanceInputs']={n:sha(n)for n in d['conformanceInputs']};p.write_text(json.dumps(d,indent=2)+'\n')
r=Path('infra/native/conformance/rust-graph-pr368-coverage-6-source-6.json');d=json.loads(r.read_bytes());d['nativePlan']['sha256']=sha(p);d['sources']={n:sha(n)for n in d['sources']};r.write_text(json.dumps(d,indent=2)+'\n');print(json.dumps({'inputs':len(json.loads(p.read_bytes())['conformanceInputs']),'planSha256':sha(p),'rustSha256':sha(r)}))
