from pathlib import Path
import json,hashlib,tempfile,shutil,subprocess,sys
root=Path(__file__).resolve().parent;sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();m=json.loads((root/'manifest.json').read_text());assert m['schema']=='tpnil-native-attempt-guard-archive@1'and m['nativeSessions']==0
names=set()
for row in m['files']:
 p=Path(row['path']);assert not p.is_absolute()and'..'not in p.parts and row['path']not in names;names.add(row['path']);f=root/p;assert f.stat().st_size==row['bytes']and sha(f)==row['sha256']
assert {p.relative_to(root).as_posix()for p in root.rglob('*')if p.is_file()}==names|{'manifest.json'}
original=root.parent/'43195585984';assert sha(original/'attempt.json')==m['originalAttemptSha256']=='5f377127638d342ebd72ea708462ace3fdbbc58ed8cb2637b25cbde88052e614';v=subprocess.run([sys.executable,str(original/'verify.py')],capture_output=True,text=True);assert v.returncode==0,v.stderr
receipt=json.loads((root/'archive-guard.json').read_text());assert receipt['verified']is True and receipt['nativeSessions']==0 and len(receipt['controls'])==6
with tempfile.TemporaryDirectory(prefix='tpnil-native5-review-')as t:
 d=Path(t);runner=d/'out/native-review-43195585984';runner.mkdir(parents=True);archive=d/'journals/integrated-native-attempts/2026-11-12/43195585984';archive.parent.mkdir(parents=True);shutil.copytree(original,archive);shutil.copyfile(root/'guard.py',runner/'guard.py');p=subprocess.run([sys.executable,str(runner/'guard.py')],capture_output=True,text=True);assert p.returncode==0,p.stderr;again=json.loads((runner/'archive-guard.json').read_text());assert [(r['case'],r['exitCode'],r['expected'])for r in again['controls']]==[(r['case'],r['exitCode'],r['expected'])for r in receipt['controls']]
print(json.dumps({'verified':True,'originalArchiveUnchanged':True,'positiveControls':1,'adversarialRejections':5,'nativeSessions':0}))
