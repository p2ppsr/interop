from pathlib import Path
import hashlib,json
P=Path(__file__).resolve().parent;R=P.parents[3];sha=lambda b:hashlib.sha256(b).hexdigest()
EXPECTED_ARCHIVE='0564a90aa8a39510cabcb892cf2ee6019133e049c084d6f95e3a772b0cada27a'
EXPECTED_REVIEW='917382157522f97d5b74800d6282be276eee7ccded84fc67a3e07ed2b75267ab'
m=json.loads((P/'manifest.json').read_bytes());assert m['archiveSha256']==EXPECTED_ARCHIVE;seen=set()
for r in m['files']:
 p=Path(r['path']);assert not p.is_absolute()and'..'not in p.parts and r['path']not in seen;seen.add(r['path']);f=P/p;assert f.is_file()and not f.is_symlink();b=f.read_bytes();assert len(b)==r['bytes']and sha(b)==r['sha256']
assert {p.relative_to(P).as_posix()for p in P.rglob('*')if p.is_file()or p.is_symlink()}==seen|{'manifest.json'}
assert sha((P/'review.json').read_bytes())==EXPECTED_REVIEW
r=json.loads((P/'review.json').read_bytes());assert r['verified']is True and r['nativeQualification']is False and r['nativeInputs']==394 and r['artifactMembers']==262
assert r['archiveOriginalsUnchanged']is True and r['archiveSha256']==EXPECTED_ARCHIVE
assert[(c['id'],c['expectedSuccess'],c['result'])for c in r['controls']]==[('positive',True,'PASS'),('omit-generated-verifier',False,'PASS'),('coherently-rehash-substitute-verifier',False,'PASS')]
assert sha((R/'journals/native-closure-ci/2026-11-12/664e853/manifest.json').read_bytes())==EXPECTED_ARCHIVE
print(json.dumps({'verified':True,'source':r['source'],'archiveSha256':EXPECTED_ARCHIVE,'reviewSha256':EXPECTED_REVIEW,'nativeQualification':False}))
