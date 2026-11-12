from pathlib import Path
import json,hashlib,subprocess
r=Path(__file__).resolve().parent;s=lambda b:hashlib.sha256(b).hexdigest();m=json.loads((r/'manifest.json').read_text())
assert m['claim']=='FAILED_NATIVE_ARCHIVE_REVIEW_ONLY' and m['nativeQualification'] is False
assert sorted(x['path']for x in m['files'])==sorted(p.relative_to(r).as_posix()for p in r.rglob('*')if p.is_file()and p.name!='manifest.json')
for x in m['files']:
 p=r/x['path'];assert not Path(x['path']).is_absolute()and'..'not in Path(x['path']).parts;assert len(p.read_bytes())==x['bytes']and s(p.read_bytes())==x['sha256']
a=r.parents[2]/'journals/integrated-native-attempts/2026-11-12/43216478235';assert s((a/'attempt.json').read_bytes())=='9f2f3103b9397048b46a0413dead3c2f5c2eb17ae7b42c1a9ce94c0b28080fea'
assert s((r/'archive-independent-review.json').read_bytes())=='0a321425355d8335f2c73d07b481b37a9a00b12f5dbcd5e283f872b2b122ba3a'
v=json.loads((r/'archive-independent-review.json').read_text());assert v['allPassed']is True and len(v['checks'])==12 and sum(not c['expected']for c in v['checks'])==10
assert s((r/'review-archive.py').read_bytes())==v['scriptSha256'];subprocess.run(['python3',str(a/'verify.py')],check=True)
print(json.dumps({'verified':True,'controls':12,'negativeControls':10,'nativeQualification':False}))
