from pathlib import Path
import json,hashlib
P=Path(__file__).resolve().parent;R=P.parents[2];sha=lambda b:hashlib.sha256(b).hexdigest();m=json.loads((P/'manifest.json').read_bytes());seen=set()
for row in m['files']:
 n=row['path'];assert n and not Path(n).is_absolute()and'..'not in Path(n).parts and n not in seen;seen.add(n);p=P/n;assert p.is_file()and not p.is_symlink();b=p.read_bytes();assert len(b)==row['bytes']and sha(b)==row['sha256']
assert {p.relative_to(P).as_posix()for p in P.rglob('*')if p.is_file()or p.is_symlink()}==seen|{'manifest.json'}
r=json.loads((P/'review.json').read_bytes());assert r['verified']is True and r['nativeQualification']is False and r['runtimeInputs']==394 and r['originalArchiveUnchanged']is True and r['postcommitCLI']=='PENDING_POSTCOMMIT_ACTUAL_CLI'
assert r['positiveControls']==1 and r['negativeControls']==3 and len(r['controls'])==4 and all(x['passed']for x in r['controls'])
for row in r['controls']:
 for stream in ['stdout','stderr']:assert sha((P/(row['name']+'.'+stream)).read_bytes())==row[stream+'Sha256']
assert sha((R/'journals/native-closure-validation/2026-11-12-selector-recovery/validation.json').read_bytes())==r['archiveSha256']==r['manifestSha256']==m['archiveSha256']
assert sha((P/'source-review.json').read_bytes())==r['sourceReview']['sha256']
print(json.dumps({'verified':True,'archiveSha256':r['archiveSha256'],'runtimeInputs':394,'nativeQualification':False,'postcommitCLI':r['postcommitCLI']}))
