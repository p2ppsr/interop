from pathlib import Path
import json,hashlib
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
old=Path('infra/native/conformance/plan-pr368-coverage-6.json');p=old.with_name('plan-pr368-coverage-6-source-2.json');d=json.loads(old.read_bytes());d.update(id=d['id']+'-SOURCE-2',sourceBindingRevision=10,sourcePredecessor={'path':str(old),'sha256':sha(old)});names=set(d['conformanceInputs']);names.add('docs/native-observer-source-correction-2026-11-13.md');d['conformanceInputs']={name:sha(name)for name in sorted(names)};p.write_text(json.dumps(d,indent=2)+'\n')
prior=Path('infra/native/conformance/rust-graph-pr368-coverage-6.json');r=json.loads(prior.read_bytes());r.update(sourceBindingRevision=15,predecessor={'manifest':str(prior),'sha256':sha(prior)});r['nativePlan'].update(path=str(p),sha256=sha(p));r['sources']={name:sha(name)for name in r['sources']};prior.with_name('rust-graph-pr368-coverage-6-source-2.json').write_text(json.dumps(r,indent=2)+'\n')
print(json.dumps({'inputs':len(names),'planSha256':sha(p),'rustSha256':sha(prior.with_name('rust-graph-pr368-coverage-6-source-2.json'))}))
