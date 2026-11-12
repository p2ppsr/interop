from pathlib import Path
import hashlib,json
P=Path(__file__).resolve().parent;R=P.parents[2]
sha=lambda b:hashlib.sha256(b).hexdigest()
m=json.loads((P/'manifest.json').read_bytes());seen=set()
for row in m['files']:
 n=row['path'];assert isinstance(n,str) and n and not n.startswith('/') and '..'not in Path(n).parts and n not in seen;seen.add(n)
 p=P/n;assert p.is_file() and not p.is_symlink();b=p.read_bytes();assert len(b)==row['bytes'] and sha(b)==row['sha256'],n
assert {str(x.relative_to(P))for x in P.rglob('*')if x.is_file()or x.is_symlink()}==seen|{'manifest.json'}
r=json.loads((P/'review.json').read_bytes());assert r['verified']is True and r['archiveSha256']==r['manifestSha256'];assert r['nativeQualification']is False and r['positiveControls']==1 and r['negativeControls']==15
assert len(r['results'])==16 and all(x['passed']for x in r['results'])
for row in r['results']:
 for stream in ['stdout','stderr']:assert sha((P/'controls'/(row['name']+'.'+stream)).read_bytes())==row[stream+'Sha256']
assert sha((R/r['manifest']).read_bytes())==r['manifestSha256']==m['targetManifestSha256']
print(json.dumps({'verified':True,'positiveControls':1,'negativeControls':15,'nativeQualification':False,'targetManifestSha256':r['manifestSha256']}))
