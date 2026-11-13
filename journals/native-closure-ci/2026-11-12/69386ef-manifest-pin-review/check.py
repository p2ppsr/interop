from pathlib import Path
import hashlib,json,shutil,subprocess,tempfile,sys
base=Path(__file__).resolve().parent;root=base.parents[2];archive=root/'journals/native-closure-ci/2026-11-12/69386ef';checker=base/'verify-pinned-ci.py'
with tempfile.TemporaryDirectory(prefix='tpnil-ci-pin-control-')as t:
 d=Path(t)/'archive';shutil.copytree(archive,d);m=json.loads((d/'manifest.json').read_bytes());m['files']=[x for x in m['files']if x['path']!='verify.py'];(d/'manifest.json').write_text(json.dumps(m,indent=2)+'\n');(d/'verify.py').unlink();r=subprocess.run([sys.executable,str(checker),str(d)],capture_output=True);(base/'pinned-negative.stdout').write_bytes(r.stdout);(base/'pinned-negative.stderr').write_bytes(r.stderr);assert r.returncode!=0 and b'externally reviewed receipt'in r.stderr
 r2=subprocess.run([sys.executable,str(checker),str(archive)],capture_output=True);assert r2.returncode==0;(base/'pinned-positive.json').write_bytes(r2.stdout)
 receipt={'schema':'tpnil-ci-external-manifest-pin-control@1','verified':True,'positive':1,'negative':1,'priorWeaknessRetained':'review.json','originalArchiveUnchanged':True,'originalManifestSha256':hashlib.sha256((archive/'manifest.json').read_bytes()).hexdigest(),'nativeQualification':False};(base/'pinned-review.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
