from pathlib import Path
import json,hashlib
P=Path(__file__).resolve().parent;R=P.parents[3];sha=lambda b:hashlib.sha256(b).hexdigest()
m=json.loads((P/'manifest.json').read_bytes());seen=set()
for x in m['files']:
 n=x['path'];assert n and not Path(n).is_absolute()and'..'not in Path(n).parts and n not in seen;seen.add(n);p=P/n;assert p.is_file()and not p.is_symlink();b=p.read_bytes();assert len(b)==x['bytes']and sha(b)==x['sha256'],n
assert {p.relative_to(P).as_posix()for p in P.rglob('*')if p.is_file()or p.is_symlink()}==seen|{'manifest.json'}
r=json.loads((P/'review.json').read_bytes());assert r['verified']is True and r['nativeQualification']is False and r['artifactCount']==5 and r['artifactMembers']==483 and r['nativeInputs']==391
assert sha((R/'journals/native-closure-ci/2026-11-12/69386ef/manifest.json').read_bytes())==r['archiveSha256']==m['archiveSha256']
a=json.loads((P/'author-controls/review.json').read_bytes());assert a['verified']is True and a['positive']==1 and a['negative']==7 and a['archiveManifestSha256']==r['archiveSha256']
print(json.dumps({'verified':True,'archiveSha256':r['archiveSha256'],'source':r['source'],'nativeQualification':False}))
