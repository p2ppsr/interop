from pathlib import Path
import tempfile,shutil,json,gzip,hashlib,subprocess,sys,re
here=Path(__file__).resolve().parent;root=here.parents[2];archive=Path(sys.argv[1]).resolve()if len(sys.argv)>1 else root/'journals/native-closure-ci/2026-11-12/1f9fe0f';sha=lambda b:hashlib.sha256(b).hexdigest();results=[]
def rewrite(d,name,fn):
 m=json.loads((d/'manifest.json').read_text());e=next(x for x in m['files']if x['originalPath']==name);p=d/e['path'];raw=gzip.decompress(p.read_bytes())if e['encoding']=='gzip'else p.read_bytes();before=raw;raw=fn(raw);assert raw!=before,('Mutation did not change bytes',name);stored=gzip.compress(raw,mtime=0)if e['encoding']=='gzip'else raw;p.write_bytes(stored);e.update(bytes=len(stored),sha256=sha(stored),originalBytes=len(raw),originalSha256=sha(raw));(d/'manifest.json').write_text(json.dumps(m,indent=2)+'\n')
def jsonchange(key,value):
 def fn(b):
  d=json.loads(b);d[key]=value;return(json.dumps(d,indent=2)+'\n').encode()
 return fn
cases=['valid-control','zip-corruption','missing-core-log-rebound-inventory','zero-cost-rebound-summary','false-component-child-receipt','false-required-certificate-count','false-historical-producer-receipt','carried-replay-reattributed-to-new-source','carried-evaluator-source-drift','stored-semantic-receipt-forgery','replacement-review-program']
for case in cases:
 with tempfile.TemporaryDirectory(prefix='tpnil-ci-mutation-')as t:
  d=Path(t)/'archive';shutil.copytree(archive,d)
  if case=='zip-corruption':
   p=next(d.glob('43213879582/artifact-*.zip'));b=bytearray(p.read_bytes());b[len(b)//2]^=1;p.write_bytes(b)
  if case=='missing-core-log-rebound-inventory':
   m=json.loads((d/'manifest.json').read_text());e=next(x for x in m['files']if x['originalPath']=='43213879582/job-131168098216.log');(d/e['path']).unlink();m['files'].remove(e);(d/'manifest.json').write_text(json.dumps(m,indent=2)+'\n')
  if case=='zero-cost-rebound-summary':
   def change(b):
    x=json.loads(b);x['cost']['totalFullCostUSD']=0;return (json.dumps(x,indent=2)+'\n').encode()
   rewrite(d,'summary.json',change)
  if case=='false-component-child-receipt':rewrite(d,'43213879582/job-131168097845.log',lambda b:b.replace(b'"childOraclesVerified": true',b'"childOraclesVerified": false'))
  if case=='false-required-certificate-count':rewrite(d,'43213879582/job-131168097845.log',lambda b:b.replace(b'39 passed',b'0 passed'))
  if case=='false-historical-producer-receipt':rewrite(d,'43213879582/job-131168098216.log',lambda b:b.replace(b'"currentProducerExecuted": false',b'"currentProducerExecuted": true'))
  if case=='carried-replay-reattributed-to-new-source':rewrite(d,'carried-source6/carry.json',jsonchange('resultSource','1f9fe0f9b979e9bbca66e90335f02ba2b80c7d41'))
  if case=='carried-evaluator-source-drift':rewrite(d,'carried-source6/source/scripts/native-reevaluation.mjs',lambda b:b+b'\n// changed source\n')
  if case=='stored-semantic-receipt-forgery':rewrite(d,'semantic-receipts.json',jsonchange('publication',{'semantic':True,'bundles':[]}))
  if case=='replacement-review-program':rewrite(d,'review.py',lambda b:b'print("forged")\n')
  p=subprocess.run([sys.executable,str(d/'verify.py')],capture_output=True,text=True);assert (p.returncode==0)==(case=='valid-control'),(case,p.stdout,p.stderr)
  results.append({'case':case,'exitCode':p.returncode,'expected':'PASS'if case=='valid-control'else'REJECT','stdout':p.stdout,'stderr':p.stderr})
r={'schema':'tpnil-ci-archive-adversarial-review@1','verified':True,'source':'1f9fe0f9b979e9bbca66e90335f02ba2b80c7d41','manifestSha256':sha((archive/'manifest.json').read_bytes()),'controls':results,'nativeSessions':0};p=here/'archive-mutation-review.json';assert not p.exists();p.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'verified':True,'positive':1,'negativeRejected':len(cases)-1,'sha256':sha(p.read_bytes())}))
