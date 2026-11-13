from pathlib import Path
import hashlib,json,subprocess,tempfile,shutil,gzip
R=Path.cwd();A=R/'journals/native-closure-validation/2026-11-12-selector-recovery';O=R/'out/native-closure-20261111/selector-recovery-archive-review';sha=lambda b:hashlib.sha256(b).hexdigest();expected='24f076235eae5646cc227c6761cab182066fd06b8eb3f56b18791f9be7f82893';v=A/'verify.py';m=json.loads((A/'validation.json').read_bytes());assert sha((A/'validation.json').read_bytes())==expected;results=[]
def record(name,cmd,want):
 p=subprocess.run(cmd,capture_output=True,timeout=60);(O/(name+'.stdout')).write_bytes(p.stdout);(O/(name+'.stderr')).write_bytes(p.stderr)
 assert (p.returncode==0)==want and (want or b'AssertionError'in p.stderr),(name,p.stderr.decode());results.append({'name':name,'expected':'ACCEPT'if want else'REJECT','exitCode':p.returncode,'passed':True,'stdoutSha256':sha(p.stdout),'stderrSha256':sha(p.stderr)})
record('positive-current-source',['python3',str(v),'--current-source'],True)
for name in ['omit-generated-verifier','rehashed-generated-verifier','alter-native-input-inventory']:
 with tempfile.TemporaryDirectory(prefix='tpnil-selector-review-')as tmp:
  d=Path(tmp)/'archive';shutil.copytree(A,d);m2=json.loads((d/'validation.json').read_bytes())
  if name=='omit-generated-verifier':m2['generatedFiles']=[x for x in m2['generatedFiles']if x['path']!='verify.py'];(d/'verify.py').unlink()
  elif name=='rehashed-generated-verifier':
   b=(d/'verify.py').read_bytes()+b'\n# substituted archive code\n';(d/'verify.py').write_bytes(b)
   x=next(x for x in m2['generatedFiles']if x['path']=='verify.py');x['bytes']=len(b);x['sha256']=sha(b)
  else:m2['nativeInputs'].pop(next(iter(m2['nativeInputs'])))
  (d/'validation.json').write_text(json.dumps(m2,indent=2)+'\n');assert (d/'validation.json').read_bytes()!=(A/'validation.json').read_bytes()
  record(name,['python3',str(v),'--archive',str(d),'--repository',str(R)],False)
# Independently check source carry and the final plan criteria identities.
source='69386efcea077e4bbe5b6e07f71fc6fe3b1f87f7'
for n,h in m['source7Carry']['closure'].items():assert sha((R/n).read_bytes())==h==sha(subprocess.check_output(['git','show',source+':'+n],cwd=R))
assert len(m['nativeInputs'])==394
for n,h in m['nativeInputs'].items():assert sha((R/n).read_bytes())==h
assert sha((A/'validation.json').read_bytes())==expected
old=R/'out/native-review-43253674251/selector-archive-preparation/failed-seal-v1/validation.json';assert sha(old.read_bytes())=='e10ee054728f526b87b8b271723eea5f0605e9c7c8854a7ec9c6f3220e9af588'
receipt={'schema':'tpnil-selector-recovery-archive-independent-review@1','verified':True,'archiveSha256':expected,'manifestSha256':expected,'runtimeInputs':394,'observations':698,'nativeQualification':False,'originalArchiveUnchanged':True,'failedFirstSealPreservedSha256':sha(old.read_bytes()),'postcommitCLI':'PENDING_POSTCOMMIT_ACTUAL_CLI','positiveControls':1,'negativeControls':3,'controls':results,'source7CarryFiles':len(m['source7Carry']['closure']),'source7CurrentAnd693CommittedIdentical':True,'sourceReview':{'path':'out/native-closure-20261111/selector-buffer-impact-review/final/review.json','sha256':sha((R/'out/native-closure-20261111/selector-buffer-impact-review/final/review.json').read_bytes())},'results':m['results'],'claim':'ARCHIVE_INTEGRITY_AND_FROZEN_SOURCE_REVIEW_ONLY','limits':['Actual committed successor default-CLI execution remains a distinct pre-push gate and is not established by historical mechanical replay or synthetic reader injection.','No native wallet execution, full semantic rerun or Linux image execution is performed by this review.','Integrity assumes the externally trusted executing verifier and recorded Git/hash anchors; replacing both executable verifier and all evidence is outside self-verification.','The original failede10 seal and generated-verifier omission counterexample remain preserved; this corrected seal does not rewrite them.']}
(O/'review.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'verified':True,'reviewSha256':sha((O/'review.json').read_bytes()),'archiveSha256':expected,'positive':1,'negative':3,'runtimeInputs':394}))
