from pathlib import Path
import tempfile,shutil,json,gzip,hashlib,subprocess,sys
here=Path(__file__).resolve().parent;root=here.parents[2];archive=root/'journals/native-closure-validation/2026-11-12-portability-replay-recovery';sha=lambda b:hashlib.sha256(b).hexdigest();rows=[]
def replace(d,name,fn):
 m=json.loads((d/'validation.json').read_text());r=next(v for v in m['files']if v['path']==name);p=d/name;b=p.read_bytes();raw=gzip.decompress(b)if r['encoding']=='gzip'else b;new=fn(raw);assert new!=raw
 stored=gzip.compress(new,mtime=0)if r['encoding']=='gzip'else new;p.write_bytes(stored);r.update(bytes=len(stored),sha256=sha(stored),decodedBytes=len(new),decodedSha256=sha(new));(d/'validation.json').write_text(json.dumps(m)+'\n')
cases=['valid','omitted-native-input','omitted-source6-input','omitted-linked-evidence','rebound-core-count','rebound-semantic-false','missing-member']
for case in cases:
 with tempfile.TemporaryDirectory(prefix='portability-archive-review-')as temporary:
  d=Path(temporary)/'archive';shutil.copytree(archive,d);m=json.loads((d/'validation.json').read_text())
  if case=='omitted-native-input':m['nativeInputs'].pop(next(iter(m['nativeInputs'])))
  if case=='omitted-source6-input':m['source6Inputs'].pop(next(iter(m['source6Inputs'])))
  if case=='omitted-linked-evidence':m['linkedEvidence']=[]
  if case=='missing-member':
   r=m['files'].pop(0);(d/r['path']).unlink()
  (d/'validation.json').write_text(json.dumps(m)+'\n')
  if case=='rebound-core-count':replace(d,'preflight/core-tests-3.log.gz',lambda b:b.replace(b'pass 196',b'pass 195'))
  if case=='rebound-semantic-false':
   def bad(b):
    r=json.loads(b);r['verified']=False;return (json.dumps(r)+'\n').encode()
   replace(d,'preflight/frozen-semantic-2.stdout.log.gz',bad)
  r=subprocess.run([sys.executable,str(d/'verify.py')],capture_output=True,text=True);assert(r.returncode==0)==(case=='valid'),(case,r.stdout,r.stderr)
  rows.append({'case':case,'expected':'PASS'if case=='valid'else'REJECT','exitCode':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
p=here/'archive-review.json';assert not p.exists();p.write_text(json.dumps({'schema':'tpnil-portability-recovery-archive-independent-review@1','verified':True,'manifestSha256':sha((archive/'validation.json').read_bytes()),'positive':1,'negativeRejected':6,'controls':rows,'nativeSessions':0},indent=2)+'\n');print(json.dumps({'verified':True,'positive':1,'negativeRejected':6,'receiptSha256':sha(p.read_bytes())}))
