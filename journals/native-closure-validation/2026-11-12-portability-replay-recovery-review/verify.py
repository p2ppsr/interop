from pathlib import Path
import hashlib,json,subprocess,sys,tempfile,shutil
root=Path(__file__).resolve().parent;sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();m=json.loads((root/'manifest.json').read_text())
assert m['schema']=='tpnil-portability-recovery-independent-review-archive@1' and m['nativeSessions']==0
seen=set()
for row in m['files']:
 name=row['path'];assert name not in seen and not Path(name).is_absolute() and '..'not in Path(name).parts;seen.add(name);p=root/name;assert p.stat().st_size==row['bytes']and sha(p)==row['sha256']
assert {p.relative_to(root).as_posix()for p in root.rglob('*')if p.is_file()}==seen|{'manifest.json'}
original=root.parent/'2026-11-12-portability-replay-recovery';assert sha(original/'validation.json')==m['originalValidationSha256']=='e0a9171eb25d8069658f62c012709047ea78182ca4ffce2dc674117ff05d0638'
r=subprocess.run([sys.executable,str(original/'verify.py')],capture_output=True,text=True);assert r.returncode==0,r.stderr
assert sha(root/'archive-review.json')=='2e1285cc7e40a26efaf0df037fccffb31f82db514cb8596ab31c363047e7184a'
receipt=json.loads((root/'archive-review.json').read_text());assert receipt['verified']is True and receipt['manifestSha256']==m['originalValidationSha256'] and receipt['nativeSessions']==0
cases=['valid','omitted-native-input','omitted-source6-input','omitted-linked-evidence','rebound-core-count','rebound-semantic-false','missing-member'];assert [r['case']for r in receipt['controls']]==cases
for i,r in enumerate(receipt['controls']):assert(r['exitCode']==0)==(i==0)and r['expected']==('PASS'if i==0 else'REJECT')
if '--replay-controls'in sys.argv:
 with tempfile.TemporaryDirectory(prefix='portability-recovery-review-')as temporary:
  base=Path(temporary);runner=base/'out/native-closure-20261111/archive-binding-recovery';runner.mkdir(parents=True);target=base/'journals/native-closure-validation/2026-11-12-portability-replay-recovery';target.parent.mkdir(parents=True);shutil.copytree(original,target);shutil.copyfile(root/'archive-review.py',runner/'archive-review.py')
  r=subprocess.run([sys.executable,str(runner/'archive-review.py')],capture_output=True,text=True);assert r.returncode==0,r.stderr
  again=json.loads((runner/'archive-review.json').read_text());assert [(r['case'],r['exitCode'],r['expected'])for r in again['controls']]==[(r['case'],r['exitCode'],r['expected'])for r in receipt['controls']]
print(json.dumps({'verified':True,'files':len(seen),'positive':1,'negativeRejected':6,'originalArchiveUnchanged':True,'nativeSessions':0,'replayedControls':'--replay-controls'in sys.argv}))
