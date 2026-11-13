from pathlib import Path
import hashlib,json
P=Path(__file__).resolve().parent;R=P.parents[2];sha=lambda b:hashlib.sha256(b).hexdigest()
ARCHIVE='468f3b4e031fe0286324378fd169a34710539a0c104bcbaa0edb33c6035912b5';REVIEW='949b26d6c72b1f15dd864c8828db9080b41099e2b2ce247eb0ad8324c84b10cd'
m=json.loads((P/'manifest.json').read_bytes());assert m['archiveSha256']==ARCHIVE;seen=set()
for x in m['files']:
 p=Path(x['path']);assert not p.is_absolute()and'..'not in p.parts and x['path']not in seen;seen.add(x['path']);f=P/p;assert f.is_file()and not f.is_symlink();b=f.read_bytes();assert len(b)==x['bytes']and sha(b)==x['sha256']
assert {f.relative_to(P).as_posix()for f in P.rglob('*')if f.is_file()or f.is_symlink()}==seen|{'manifest.json'}
assert sha((P/'review.json').read_bytes())==REVIEW;r=json.loads((P/'review.json').read_bytes());assert r['verified']is True and r['archiveSha256']==ARCHIVE and r['artifactCount']==r['newNativeSessions']==r['observedNativePredicates']==0 and r['nativeQualification']is False and r['shutdownOrigin']=='UNKNOWN'
assert all(s['conclusion']=='skipped'and s['executionObserved']is False for s in r['skippedStepsWithSyntheticTimestamps'])
assert sha((R/'journals/integrated-native-attempts/2026-11-12/43262928941/attempt.json').read_bytes())==ARCHIVE
print(json.dumps({'verified':True,'source':r['source'],'archiveSha256':ARCHIVE,'reviewSha256':REVIEW,'nativeQualification':False}))
