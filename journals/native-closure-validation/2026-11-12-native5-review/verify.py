from pathlib import Path
import json,hashlib,tempfile,shutil,subprocess,sys
root=Path(__file__).resolve().parent;repo=root.parents[2]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
m=json.loads((root/'manifest.json').read_text());assert m['schema']=='tpnil-native-attempt-review-layout-archive@1'and m['nativeSessions']==0
names=set()
for row in m['files']:
 p=Path(row['path']);assert not p.is_absolute()and'..'not in p.parts and row['path']not in names;names.add(row['path']);f=root/p;assert not f.is_symlink()and f.stat().st_size==row['bytes']and sha(f)==row['sha256']
assert {p.relative_to(root).as_posix()for p in root.rglob('*')if p.is_file()}==names|{'manifest.json'}
c=json.loads((root/'correction.json').read_text());assert c['nativeSessions']==0 and c['nativeQualified']is False and c['full535Outcome']is None
assert c['originalReviewBytesPreserved']is True and c['originalNativeArchiveUnchanged']is True
assert c['correctedReviewLocation']=='journals/native-closure-validation/2026-11-12-native5-review'
assert sha(root/'publication-layout-failure.log')==c['failedPublicationLogSha256']
assert '43195585984-review/README.md' in(root/'publication-layout-failure.log').read_text()
assert sha(root/'prior-review/manifest.json')==c['priorReviewManifestSha256']==m['priorReviewManifestSha256']=='c8877fa91004587e961c903d567356687ffe33172f37e93820550e189eaa7b45'
original=repo/c['originalAttempt'];assert sha(original/'attempt.json')==c['originalAttemptSha256']==m['originalAttemptSha256']=='5f377127638d342ebd72ea708462ace3fdbbc58ed8cb2637b25cbde88052e614'
assert len(json.loads((original/'attempt.json').read_text())['files'])==198
assert not(repo/c['priorReviewLocation']).exists(),'Unpublished invalid layout was not retired'
with tempfile.TemporaryDirectory(prefix='tpnil-native5-layout-review-')as t:
 d=Path(t);shutil.copytree(original,d/'43195585984');shutil.copytree(root/'prior-review',d/'43195585984-review')
 p=subprocess.run([sys.executable,str(d/'43195585984-review/verify.py')],capture_output=True,text=True);assert p.returncode==0,p.stderr
 receipt=json.loads(p.stdout);assert receipt=={'verified':True,'originalArchiveUnchanged':True,'positiveControls':1,'adversarialRejections':5,'nativeSessions':0}
print(json.dumps({'verified':True,'priorReviewBytesPreserved':True,'original198FilesUnchanged':True,'positiveControls':1,'adversarialRejections':5,'nativeSessions':0}))
