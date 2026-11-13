from pathlib import Path
import hashlib,json,shutil,subprocess,sys,tempfile
root=Path(__file__).resolve().parent;sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
m=json.loads((root/'manifest.json').read_text());assert m['schema']=='tpnil-native-ci-adversarial-archive@1' and m['source']=='e47873a952c4fbb25bae241aadf41863104ae977' and m['nativeSessions']==0
seen=set()
for row in m['files']:
 name=row['path'];assert name not in seen and not Path(name).is_absolute() and '..'not in Path(name).parts;seen.add(name);p=root/name;assert p.stat().st_size==row['bytes'] and sha(p)==row['sha256']
assert {p.relative_to(root).as_posix()for p in root.rglob('*')if p.is_file()}==seen|{'manifest.json'}
archive=root.parent/'e47873a';assert sha(archive/'manifest.json')==m['originalArchiveManifestSha256']=='1304e87b20ee409e5080e5c1c47429fbb9308c008495210dc17a29da4d4736cc'
result=subprocess.run([sys.executable,str(archive/'verify.py')],capture_output=True,text=True);assert result.returncode==0,result.stderr
assert sha(root/'archive-mutation-review.json')=='5bd4bced74e80cf2ba392605cca120d3985d8f237c0bbf83ae213b8426e7bea5'
r=json.loads((root/'archive-mutation-review.json').read_text());assert r['verified']is True and r['manifestSha256']==m['originalArchiveManifestSha256'] and r['nativeSessions']==0
expected=['valid-control','zip-corruption','missing-core-log-rebound-inventory','zero-cost-rebound-summary','false-component-child-receipt','false-required-certificate-count','false-retained-replay-receipt','relabel-failed-foundation-as-success']
assert [v['case']for v in r['controls']]==expected
for i,v in enumerate(r['controls']):assert (v['exitCode']==0)==(i==0) and v['expected']==('PASS'if i==0 else'REJECT')
assert 'Mutation did not change bytes' in (root/'archive-mutation-initial-v1.log').read_text()
if '--replay-controls' in sys.argv:
 with tempfile.TemporaryDirectory(prefix='tpnil-e478-review-')as temporary:
  t=Path(temporary);runner=t/'out/native-closure-20261111/ci-e47873a';runner.mkdir(parents=True);target=t/'journals/native-closure-ci/2026-11-12/e47873a';target.parent.mkdir(parents=True);shutil.copytree(archive,target);shutil.copyfile(root/'mutation-review.py',runner/'mutation-review.py')
  replay=subprocess.run([sys.executable,str(runner/'mutation-review.py')],capture_output=True,text=True);assert replay.returncode==0,replay.stderr
  rr=json.loads((runner/'archive-mutation-review.json').read_text());assert [(v['case'],v['exitCode'],v['expected'])for v in rr['controls']]==[(v['case'],v['exitCode'],v['expected'])for v in r['controls']]
print(json.dumps({'verified':True,'files':len(seen),'originalArchiveUnchanged':True,'positiveControls':1,'adversarialRejections':7,'nativeSessions':0,'replayedControls':'--replay-controls'in sys.argv}))
