from pathlib import Path
import gzip,hashlib,json,sys,tempfile,zipfile,io,subprocess
root=Path(sys.argv[1]).resolve()if len(sys.argv)>1 else Path(__file__).resolve().parent;sha=lambda b:hashlib.sha256(b).hexdigest()
m=json.loads((root/'attempt.json').read_bytes());assert set(m)=={'schema','source','workflowRun','artifactId','claim','failureClassification','walletExecuted','newNativeSessions','workflowConclusion','nativeQualification','completeBRC100Conformance','candidateOnly','officialRelease','files'}
assert m['schema']=='tpnil-integration-attempt@1'and m['source']=='664e8539031109174e7233390262d76ca6c81240'and m['workflowRun']==43262928941 and m['claim']=='OBSERVER_STARTUP_ERROR'and m['failureClassification']=='RUNNER_SHUTDOWN_DURING_IMAGE_EXPORT'and m['workflowConclusion']=='failure'
assert m['artifactId']is None and m['walletExecuted']is False and m['newNativeSessions']==0 and m['nativeQualification']is False and m['completeBRC100Conformance']is False and m['candidateOnly']is True and m['officialRelease']is False
assert (root/'verify.py').read_bytes()==Path(__file__).read_bytes();assert sha((root/'README.md').read_bytes())=='d237774893a24ca923ae42a4c47f9cdef85c14f7bcde661b0330a9146421f9f4'
e=json.loads((root/'encoding.json').read_bytes());assert sha((root/'encoding.json').read_bytes())=='92020cc100440052b7cfe837d27c3536259ecbd289a7faaef06b168a467cab25';assert len({x['path']for x in e['files']})==len(e['files'])
assert len({x['name']for x in m['files']})==len(m['files']);assert {x['name']for x in m['files']}=={x['path']for x in e['files']}|{'encoding.json','README.md','verify.py'}
for x in m['files']:
 p=Path(x['name']);assert not p.is_absolute()and'..'not in p.parts;f=root/p;assert f.is_file()and not f.is_symlink();b=f.read_bytes();assert len(b)==x['size']and sha(b)==x['sha256']
assert {p.relative_to(root).as_posix()for p in root.rglob('*')if p.is_file()or p.is_symlink()}=={x['name']for x in m['files']}|{'attempt.json'}
with tempfile.TemporaryDirectory(prefix='native8-originals-')as tmp:
 d=Path(tmp);raws={}
 for x in e['files']:
  b=(root/x['path']).read_bytes();assert len(b)==x['storedBytes']and sha(b)==x['storedSha256'];assert x['encoding']in['identity','gzip'];raw=gzip.decompress(b)if x['encoding']=='gzip'else b;assert len(raw)==x['originalBytes']and sha(raw)==x['originalSha256'];q=Path(x['originalPath']);assert not q.is_absolute()and'..'not in q.parts;assert x['originalPath']not in raws;raws[x['originalPath']]=raw;p=d/q;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(raw)
 acq=json.loads(raws['acquisition/acquisition.json']);assert acq['runId']==43262928941 and acq['source']==m['source']and acq['artifact']is None and acq['artifactCount']==0 and acq['actualJobSeconds']==1052 and acq['result']=='ORIGINAL_BYTES_VERIFIED'
 for x in acq['files']:b=raws['acquisition/'+x['path']];assert len(b)==x['bytes']and sha(b)==x['sha256']
 terminal=json.loads(raws['terminal.json']);assert terminal['actualJobSeconds']==1052 and terminal['cohortBeforeNative']==28378 and terminal['cohortAfterNative']==29430 and terminal['orderActualJobSeconds']==2462 and terminal['artifactCount']==0 and terminal['walletExecuted']is False and terminal['newNativeSessions']==0 and terminal['observations']is None and terminal['shutdownOrigin']=='UNKNOWN'and all(v is None for v in terminal['monetaryCosts'].values())
 check=subprocess.run([sys.executable,str(d/'diagnosis/verify-diagnosis.py')],capture_output=True,text=True);assert check.returncode==0,check.stderr;diag=json.loads(check.stdout);assert diag['verified']is True and diag['nativeSessions']==0 and diag['jobSeconds']==1052 and diag['shutdownOrigin']=='UNKNOWN'
 with zipfile.ZipFile(io.BytesIO(raws['acquisition/all-job-logs.zip']))as z:
  members=json.loads(raws['all-job-logs-members.json']);assert len(members)==12 and z.testzip()is None;assert {v.filename for v in z.infolist()if not v.is_dir()}=={x['path']for x in members}
  for x in members:b=z.read(x['path']);assert len(b)==x['bytes']and sha(b)==x['sha256']
 source=json.loads(raws['source-and-dispatch/source-inventory.json']);assert source['source']==m['source']
 for x in source['files']:b=raws['source-and-dispatch/'+x['path']];assert len(b)==x['bytes']and sha(b)==x['sha256']
 print(json.dumps({'verified':True,'source':m['source'],'run':m['workflowRun'],'claim':m['claim'],'jobSeconds':1052,'cohortJobSeconds':29430,'artifactCount':0,'nativeSessions':0,'observedPredicates':0,'nativeQualification':False,'shutdownOrigin':'UNKNOWN','files':len(m['files'])}))
