from pathlib import Path
import json,hashlib,tempfile,shutil,subprocess,sys
here=Path(__file__).resolve().parent;root=here.parents[2];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();m=json.loads((here/'manifest.json').read_text())
assert m['schema']=='tpnil-observer-recovery-independent-review-archive@1'and m['nativeSessions']==0
names=set()
for row in m['files']:
 p=Path(row['path']);assert not p.is_absolute()and'..'not in p.parts and row['path']not in names;names.add(row['path']);f=here/p;assert not f.is_symlink()and f.stat().st_size==row['bytes']and sha(f)==row['sha256']
assert {p.relative_to(here).as_posix()for p in here.rglob('*')if p.is_file()}==names|{'manifest.json'}
main=root/m['mainArchive'];assert sha(main/'validation.json')==m['mainManifestSha256']=='e56eb5b3b6254bcf7f6d053b950dbd13df493087f81555cbe5b834dabab10748'
r=json.loads((here/'review.json').read_text());assert r['originalManifestSha256']==m['mainManifestSha256']and r['claim']=='ARCHIVE_SELF_TEST_NOT_NATIVE_QUALIFICATION'and r['nativeSessions']==0 and r['status']=='PASS'
assert sha(here/'review.json')=='db74e99ded58f75fa1a99ab6af8e1b587be26e916a2d99ba10a82a8052eab9f1'
expected=['valid','omit-runtime-input','native-plan-downgrade','source6-executed-claim','omit-source6-input','omit-all-completed-checks','omit-all-linked-evidence','replace-historical-json-with-arbitrary-git-file','duplicate-linked-reference','change-linked-reference-digest','unknown-charge-zero','promote-complete-conformance']
assert [x['case']for x in r['results']]==expected
for x in r['results']:assert x['expectationMet']is True and (x['exitCode']==0)==(x['case']=='valid')and x['expected']==('PASS'if x['case']=='valid'else'REJECT')
assert json.loads((here/'control-transcripts.json').read_text())==r['results']
assert json.loads((here/'control-run.log').read_text())=={'status':'PASS','failures':[],'receiptSha256':sha(here/'review.json')}
# Verify the sealed primary inventory and its source/log joins; no native run.
p=subprocess.run([sys.executable,str(main/'verify.py')],capture_output=True,text=True);assert p.returncode==0,p.stderr;primary=json.loads(p.stdout);assert primary['verified']is True and primary['files']==274 and primary['runtimeInputs']==164 and primary['nativeSessions']==0
replayed=False
if '--replay-controls' in sys.argv:
 with tempfile.TemporaryDirectory(prefix='tpnil-observer-review-',dir=root/'out')as t:
  work=Path(t)/'review';work.mkdir();shutil.copyfile(here/'checker.py',work/'checker.py');p=subprocess.run([sys.executable,str(work/'checker.py')],capture_output=True,text=True);assert p.returncode==0,p.stderr
  again=json.loads((work/'validation-mutations-final.json').read_text());assert again['status']=='PASS'and again['originalManifestSha256']==r['originalManifestSha256'];assert [(x['case'],x['exitCode'],x['expected'])for x in again['results']]==[(x['case'],x['exitCode'],x['expected'])for x in r['results']];replayed=True
print(json.dumps({'verified':True,'mainManifestSha256':m['mainManifestSha256'],'positiveControls':1,'negativeControls':11,'originalFailedControlsRetained':True,'nativeSessions':0,'controlsReplayed':replayed}))
