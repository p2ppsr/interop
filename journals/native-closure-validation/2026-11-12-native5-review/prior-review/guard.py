from pathlib import Path
import json,gzip,hashlib,tempfile,subprocess,shutil,sys
here=Path(__file__).resolve().parent;repo=here.parents[1];archive=repo/'journals/integrated-native-attempts/2026-11-12/43195585984';sha=lambda b:hashlib.sha256(b).hexdigest();results=[]
def replace(d,name,fn):
 p=d/name
 if p.exists():b=p.read_bytes();new=fn(b);assert new!=b;p.write_bytes(new)
 else:
  p=d/(name+'.gz');b=gzip.decompress(p.read_bytes());new=fn(b);assert new!=b;p.write_bytes(gzip.compress(new,mtime=0))
 rel=p.relative_to(d).as_posix();enc=json.loads((d/'encoding.json').read_text())
 for e in enc['receipts']:
  if e['path']==rel:e.update(originalBytes=len(new),originalSha256=sha(new),storedBytes=p.stat().st_size,storedSha256=sha(p.read_bytes()))
 (d/'encoding.json').write_text(json.dumps(enc,indent=2)+'\n')
 m=json.loads((d/'attempt.json').read_text())
 for e in m['files']:
  q=d/e['name'];e.update(size=q.stat().st_size,sha256=sha(q.read_bytes()))
 (d/'attempt.json').write_text(json.dumps(m,indent=2)+'\n')
def change(key,value):
 def f(b):
  x=json.loads(b);x[key]=value;return(json.dumps(x,indent=2)+'\n').encode()
 return f
for case in ['valid','corrupt-original-zip','full535-promoted','shutdown-bindings-promoted','unknown-money-zero','native-qualification-promoted']:
 with tempfile.TemporaryDirectory(prefix='tpnil-native5-guard-')as t:
  d=Path(t)/'archive';shutil.copytree(archive,d)
  if case=='corrupt-original-zip':p=d/'native-integrated.zip';b=bytearray(p.read_bytes());b[len(b)//2]^=1;p.write_bytes(b)
  if case=='full535-promoted':replace(d,'review/independent-diagnosis/partial-replay.json',change('full535','PASS'))
  if case=='shutdown-bindings-promoted':replace(d,'diagnosis.json',change('shutdownBindingsAdmitted',True))
  if case=='unknown-money-zero':replace(d,'cost.json',change('totalFullCostUSD',0))
  if case=='native-qualification-promoted':
   p=d/'attempt.json';x=json.loads(p.read_text());x['qualifiedEnvironment']=True;p.write_text(json.dumps(x,indent=2)+'\n')
  run=subprocess.run([sys.executable,str(d/'verify.py')],capture_output=True,text=True);assert(run.returncode==0)==(case=='valid'),(case,run.stdout,run.stderr);results.append({'case':case,'exitCode':run.returncode,'expected':'PASS'if case=='valid'else'REJECT','stdout':run.stdout,'stderr':run.stderr})
r={'schema':'tpnil-native-attempt-independent-guard@1','claim':'ARCHIVE_REVIEW_ONLY','nativeSessions':0,'originalAttemptSha256':sha((archive/'attempt.json').read_bytes()),'verified':True,'controls':results};p=here/'archive-guard.json';assert not p.exists();p.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'verified':True,'positive':1,'negative':5,'sha256':sha(p.read_bytes())}))
