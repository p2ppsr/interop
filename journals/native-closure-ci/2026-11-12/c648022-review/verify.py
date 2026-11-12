from pathlib import Path
import hashlib,json,shutil,subprocess,sys,tempfile
root=Path(sys.argv[1]).resolve()if len(sys.argv)>1 else Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();m=json.loads((root/'manifest.json').read_text());assert m['schema']=='tpnil-native-ci-adversarial-archive@1'and m['nativeSessions']==0
assert m['source']=='c648022b2d9209b7350527bd5553d73e3e82a52c';names=set()
for e in m['files']:
 p=e['path'];assert p not in names and not Path(p).is_absolute()and'..'not in Path(p).parts;names.add(p);assert (root/p).stat().st_size==e['bytes']and sha(root/p)==e['sha256']
assert {p.relative_to(root).as_posix()for p in root.rglob('*')if p.is_file()}==names|{'manifest.json'}
archive=root.parent/'c648022';assert sha(archive/'manifest.json')==m['originalArchiveManifestSha256']=='63903f29432038ebda76c07ceab53af6498c60cf52de9662fb97acf1fa6bbd44'
p=subprocess.run([sys.executable,str(archive/'verify.py')],capture_output=True,text=True);assert p.returncode==0,p.stderr
original=json.loads((root/'archive-mutation-review.json').read_text());assert original['verified']is True and len(original['controls'])==6
assert original['controls'][0]['exitCode']==0 and all(x['exitCode']!=0 for x in original['controls'][1:])
with tempfile.TemporaryDirectory(prefix='tpnil-ci-review-replay-')as t:
 d=Path(t);runner=d/'out/native-closure-20261111/ci-c648022';runner.mkdir(parents=True);target=d/'journals/native-closure-ci/2026-11-12/c648022';target.parent.mkdir(parents=True);shutil.copytree(archive,target)
 shutil.copyfile(root/'mutation-review.py',runner/'mutation-review.py');p=subprocess.run([sys.executable,str(runner/'mutation-review.py')],capture_output=True,text=True);assert p.returncode==0,p.stderr
 result=json.loads((runner/'archive-mutation-review.json').read_text());assert [(x['case'],x['exitCode'],x['expected'])for x in result['controls']]==[(x['case'],x['exitCode'],x['expected'])for x in original['controls']]
print(json.dumps({'verified':True,'files':len(names),'originalArchiveUnchanged':True,'positiveControls':1,'adversarialRejections':5,'nativeSessions':0}))
