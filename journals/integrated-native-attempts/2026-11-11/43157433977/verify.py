from pathlib import Path
import json,hashlib,gzip,zipfile
root=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
m=json.loads((root/'attempt.json').read_text())
assert sorted(p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file() and p.name!='attempt.json')==sorted(r['name'] for r in m['files'])
for r in m['files']:
 b=(root/r['name']).read_bytes();assert len(b)==r['size'] and sha(b)==r['sha256'],r['name']
for r in json.loads((root/'encoding.json').read_text())['receipts']:
 b=(root/r['path']).read_bytes();b=gzip.decompress(b) if r['encoding']=='gzip' else b;assert len(b)==r['originalBytes'] and sha(b)==r['originalSha256']
with zipfile.ZipFile(root/'native-integrated.zip') as z:
 names=[n for n in z.namelist() if not n.endswith('/')];assert len(names)==134
 assert sorted(names)==sorted(p.relative_to(root/'original').as_posix() for p in (root/'original').rglob('*') if p.is_file())
 for n in names:assert z.read(n)==(root/'original'/n).read_bytes(),n
assert not (root/'original/repetition-1/record.json').exists()
assert not (root/'original/repetition-2').exists()
d=json.loads((root/'diagnosis.json').read_text());assert not d['qualifiedEnvironment'];assert d['rawRepetition1']=={'PASS':381,'FAIL':43,'BLOCKED':2};assert d['actualJobSeconds']==1500
print(json.dumps({'verifiedOriginalMembers':134,'verifiedArchiveFiles':len(m['files']),'qualifiedEnvironment':False,'claim':'FAILED_ATTEMPT_ARCHIVE_INTEGRITY_ONLY'}))
