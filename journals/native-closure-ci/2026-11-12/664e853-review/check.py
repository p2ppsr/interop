from pathlib import Path
import collections,gzip,hashlib,io,json,shutil,subprocess,sys,tempfile,zipfile
P=Path(__file__).resolve().parent;R=P.parents[3];A=R/'journals/native-closure-ci/2026-11-12/664e853';EXPECTED='0564a90aa8a39510cabcb892cf2ee6019133e049c084d6f95e3a772b0cada27a';SOURCE='664e8539031109174e7233390262d76ca6c81240'
sha=lambda b:hashlib.sha256(b).hexdigest()
assert sha((A/'manifest.json').read_bytes())==EXPECTED
before={f.relative_to(A).as_posix():sha(f.read_bytes())for f in A.rglob('*')if f.is_file()};m=json.loads((A/'manifest.json').read_bytes());raw={}
assert len(m['files'])==91 and m['source']==SOURCE
for r in m['files']:
 f=A/r['path'];b=f.read_bytes();assert len(b)==r['bytes']and sha(b)==r['sha256'];b=gzip.decompress(b)if r['encoding']=='gzip'else b;assert len(b)==r['originalBytes']and sha(b)==r['originalSha256'];assert r['originalPath']not in raw;raw[r['originalPath']]=b
assert set(before)=={r['path']for r in m['files']}|{'manifest.json'}
acq=json.loads(raw['acquisition/43260409136/acquisition.json']);artifactCount=0;memberCount=0
for f in acq['files']:
 if not f.get('artifactId'):continue
 artifactCount+=1;b=raw['acquisition/43260409136/'+f['path']];assert sha(b)==f['sha256'];actual=[]
 with zipfile.ZipFile(io.BytesIO(b))as z:
  for i in z.infolist():
   if i.is_dir():continue
   data=z.read(i);actual.append({'path':i.filename,'bytes':len(data),'sha256':sha(data),'crc32':i.CRC})
 assert actual==f['members'];memberCount+=len(actual)
assert(artifactCount,memberCount)==(3,262)
reviewBytes=raw['acquisition/43260409136/independent-intake-review.json'];technical=json.loads(reviewBytes);assert technical['result']=='PASS'and technical['source']==SOURCE and technical['newNativeSessions']==0
assert technical['sourceBinding']['committedAndCurrentInputCount']==394
planPath=technical['sourceBinding']['planPath'];planBytes=subprocess.check_output(['git','show',SOURCE+':'+planPath],cwd=R);assert sha(planBytes)==technical['sourceBinding']['planSha256'];plan=json.loads(planBytes);assert len(plan['conformanceInputs'])==394 and plan['expectedObservations']==698
for n,h in plan['conformanceInputs'].items():assert sha(subprocess.check_output(['git','show',SOURCE+':'+n],cwd=R))==h and sha((R/n).read_bytes())==h,n
controls=[]
def run(name,root,expectedSuccess):
 r=subprocess.run([sys.executable,str(A/'verify.py'),str(root)],capture_output=True,cwd=R);(P/(name+'.stdout')).write_bytes(r.stdout);(P/(name+'.stderr')).write_bytes(r.stderr);assert(r.returncode==0)==expectedSuccess,(name,r.stderr.decode())
 controls.append({'id':name,'expectedSuccess':expectedSuccess,'exitCode':r.returncode,'result':'PASS','stdoutSha256':sha(r.stdout),'stderrSha256':sha(r.stderr)})
 if expectedSuccess:return json.loads(r.stdout)
positive=run('positive',A,True);assert positive['verified']is True and positive['newNativeSessions']==0 and positive['componentCounts']=={'PASS':584,'FAIL':6}
with tempfile.TemporaryDirectory(prefix='tpnil-ci664-independent-')as t:
 for name in ['omit-generated-verifier','coherently-rehash-substitute-verifier']:
  c=Path(t)/name;shutil.copytree(A,c);v=json.loads((c/'manifest.json').read_bytes())
  if name=='omit-generated-verifier':
   (c/'verify.py').unlink();v['files']=[r for r in v['files']if r['path']!='verify.py']
  else:
   substitute=b'import json\nprint(json.dumps({"verified":True,"claim":"FORGED_SELF_TEST_ONLY"}))\n';(c/'verify.py').write_bytes(substitute)
   for r in v['files']:
    if r['path']=='verify.py':r.update(bytes=len(substitute),originalBytes=len(substitute),sha256=sha(substitute),originalSha256=sha(substitute))
   (P/'substituted-verify.py.txt').write_bytes(substitute)
  changed=json.dumps(v,indent=2).encode()+b'\n';assert changed!=(A/'manifest.json').read_bytes();(c/'manifest.json').write_bytes(changed);(P/(name+'.manifest.json')).write_bytes(changed);run(name,c,False)
assert before=={f.relative_to(A).as_posix():sha(f.read_bytes())for f in A.rglob('*')if f.is_file()}
result={'schema':'tpnil-ci-final-archive-independent-review@2','verified':True,'archiveSha256':EXPECTED,'source':SOURCE,'archiveFiles':91,'artifactCount':3,'artifactMembers':262,'nativeInputs':394,'expectedNativeObservationSlots':698,'nativeQualification':False,'newNativeSessions':0,'semanticReplayExecuted':False,'source7Reexecuted':False,'technicalReviewSha256':sha(reviewBytes),'technicalReviewResult':technical['result'],'ciJobSeconds':positive['ciJobSeconds'],'knownCohortJobSeconds':positive['completedCohortJobSeconds'],'componentCounts':positive['componentCounts'],'publishedArchives':positive['publishedArchives'],'publishedAttempts':positive['publishedAttempts'],'controls':controls,'archiveOriginalsUnchanged':True,'scope':'Independent stored/decoded inventory and all3 original artifact262member checks,394 committed/current source bindings, retained technical review and exactly two generated-verifier adversarial controls. No native/runtime/CI rerun.','limits':['Trusted executing verifier bytes and the independently supplied archive manifest SHA are external trust anchors; rewriting all code and anchors is outside this check.','Six retained Go Messaging findings remain FAIL; CI SUCCESS does not qualify native execution.','Carried source7 run43249807970 is historical135seconds already counted; no reexecution or double charge.','The separate running native8 result is not part of this archive or this review.']}
(P/'review.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'verified':True,'reviewSha256':sha((P/'review.json').read_bytes()),'archiveSha256':EXPECTED,'controls':len(controls),'nativeInputs':394,'artifactMembers':memberCount}))
