from pathlib import Path
import json,hashlib,shutil,tempfile,subprocess,gzip
repo=Path(__file__).resolve().parents[2];source=repo/'journals/integrated-native-attempts/2026-11-12/43216478235';out=Path(__file__).resolve().parent;sha=lambda b:hashlib.sha256(b).hexdigest()
assert sha((source/'attempt.json').read_bytes())=='9f2f3103b9397048b46a0413dead3c2f5c2eb17ae7b42c1a9ce94c0b28080fea'
checks=[]
with tempfile.TemporaryDirectory(prefix='tpnil-native6-archive-review-')as td:
 d=Path(td)/'archive';shutil.copytree(source,d)
 def run(name,expected):
  p=subprocess.run(['python3',str(d/'verify.py')],capture_output=True,text=True);checks.append({'name':name,'exitCode':p.returncode,'stdout':p.stdout,'stderr':p.stderr,'expected':expected});assert(p.returncode==0)==expected,name
 run('original archive',True)
 def mutate(name,rel,fn):
  p=d/rel;old=p.read_bytes();manifest=(d/'attempt.json').read_bytes();isgz=p.suffix=='.gz';v=json.loads(gzip.decompress(old)if isgz else old);fn(v);b=(json.dumps(v,indent=2)+'\n').encode();p.write_bytes(gzip.compress(b,mtime=0)if isgz else b)
  if rel!='attempt.json':
   m=json.loads(manifest)
   for row in m['files']:
    if row['name']==rel:row.update(size=p.stat().st_size,sha256=sha(p.read_bytes()))
   (d/'attempt.json').write_text(json.dumps(m,indent=2)+'\n')
  run(name,False);p.write_bytes(old);(d/'attempt.json').write_bytes(manifest)
 mutate('qualification promotion','attempt.json',lambda d:d.update(qualifiedEnvironment=True))
 mutate('wrong source','attempt.json',lambda d:d.update(source='0'*40))
 mutate('wrong failure scope','attempt.json',lambda d:d.update(claim='OBSERVER_EXECUTION_ERROR'))
 mutate('original member omitted','attempt.json',lambda d:d['files'].pop())
 mutate('failed wallet assertions erased','diagnosis.json',lambda d:d.update(full535Raw={'PASS':535,'FAIL':0,'BLOCKED':0}))
 mutate('cleanup success promoted to parent admission','diagnosis.json',lambda d:d.update(parentAdmission=True))
 mutate('cost unknown set zero','cost.json',lambda d:d.update(actualCIChargeUSD=0))
 mutate('native time removed','cost.json',lambda d:d.update(actualNativeJobSeconds=0))
 mutate('frozen review files dropped','review/independent-review.json.gz',lambda d:d.update(files=[]))
 p=d/'native-integrated.zip';b=p.read_bytes();p.write_bytes(b[:-1]);run('truncated original zip',False);p.write_bytes(b)
 run('restored archive',True)
receipt={'schema':'tpnil-native6-archive-independent-review@1','claim':'ARCHIVE_INTEGRITY_AND_SCOPE_REVIEW_ONLY','archive':'journals/integrated-native-attempts/2026-11-12/43216478235','manifestSha256':sha((source/'attempt.json').read_bytes()),'nativeQualification':False,'newNativeSessions':0,'checks':checks,'allPassed':True,'scriptSha256':sha(Path(__file__).read_bytes())}
(out/'archive-independent-review.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'allPassed':True,'controls':len(checks),'negativeControls':sum(not c['expected']for c in checks),'receiptSha256':sha((out/'archive-independent-review.json').read_bytes())}))
