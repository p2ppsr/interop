from pathlib import Path
import datetime,gzip,hashlib,json,sys,zipfile,io
root=Path(sys.argv[1]).resolve()if len(sys.argv)>1 else Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
m=json.loads((root/'attempt.json').read_bytes());assert m['schema']=='tpnil-integration-attempt@1'and m['source']=='69386efcea077e4bbe5b6e07f71fc6fe3b1f87f7'and m['workflowRun']==43253674251 and m['claim']=='OBSERVER_STARTUP_ERROR'and m['walletExecuted']is False and m['newNativeSessions']==0 and m['artifactId']is None and m['nativeQualification']is False and m['completeBRC100Conformance']is False
assert set(m)=={'schema','source','workflowRun','artifactId','claim','failureClassification','walletExecuted','newNativeSessions','workflowConclusion','nativeQualification','completeBRC100Conformance','candidateOnly','officialRelease','files'}
expected=json.loads((root/'encoding.json').read_bytes());assert sha((root/'encoding.json').read_bytes())=='526c81aef922ec5d2569ee3900390a86944eba166e10b124240c0846d5c22df8';raws={}
assert len({x['name']for x in m['files']})==len(m['files'])
for x in m['files']:
 p=Path(x['name']);assert not p.is_absolute()and'..'not in p.parts;f=root/p;assert f.is_file()and not f.is_symlink();b=f.read_bytes();assert len(b)==x['size']and sha(b)==x['sha256']
assert {p.relative_to(root).as_posix()for p in root.rglob('*')if p.is_file()or p.is_symlink()}=={x['name']for x in m['files']}|{'attempt.json'}
for x in expected['files']:
 b=(root/x['path']).read_bytes();assert sha(b)==x['storedSha256']and len(b)==x['storedBytes'];r=gzip.decompress(b)if x['encoding']=='gzip'else b;assert len(r)==x['originalBytes']and sha(r)==x['originalSha256'];raws[x['originalPath']]=r
r=json.loads(raws['initial-terminal/run.json']);assert r['head_sha']==m['source']and r['status']=='completed'and r['conclusion']=='failure'and r['run_attempt']==1 and r['event']=='workflow_dispatch'
a=json.loads(raws['initial-terminal/artifacts.json']);assert a=={'total_count':0,'artifacts':[]}
j=json.loads(raws['initial-terminal/jobs.json']);assert j['total_count']==2;executed=[x for x in j['jobs']if x['conclusion']!='skipped'];assert len(executed)==1;job=executed[0];assert job['id']==131306045107 and job['name']=='all-go-native'and job['conclusion']=='failure';ts=lambda x:datetime.datetime.fromisoformat(x.replace('Z','+00:00'));assert(ts(job['completed_at'])-ts(job['started_at'])).total_seconds()==22
steps={s['name']:s['conclusion']for s in job['steps']};assert steps['Check committed native selector before builds']=='failure'and steps['Retain every attempt and qualification receipt']=='failure'
for name in ['Prepare and verify immutable artifacts and Go host','Build the frozen native browser closure','Install the pinned integrated service closure','Build the prospective conformance image','Execute two clean isolated native repetitions and verify results','Execute and independently verify the integrated native wallet graph']:assert steps[name]=='skipped'
log=raws['initial-terminal/job-131306045107.log'].decode();assert 'spawnSync git ENOBUFS'in log and 'TPNIL_NATIVE_PROFILE: integrated-native-conformance-pr368-coverage-3'in log and'No files were found with the provided path: out/native-go-wallet'in log
acq=json.loads(raws['acquisition.json']);assert acq['artifactCount']==0 and acq['actualJobSeconds']==22 and acq['cohortBeforeNative']==26946 and acq['cohortAfterNative']==26968 and acq['orderActualJobSeconds']==1848 and acq['walletExecuted']is False and acq['observations']is None and all(v is None for v in acq['monetaryCosts'].values())
with zipfile.ZipFile(io.BytesIO(raws['initial-terminal/all-job-logs.zip']))as z:
 members=json.loads(raws['initial-terminal/all-job-logs-members.json']);assert len(members)==9 and z.testzip()is None
 for e in members:b=z.read(e['path']);assert len(b)==e['bytes']and sha(b)==e['sha256']
source=json.loads(raws['source-and-dispatch/source-inventory.json']);assert source['source']==m['source']
for e in source['files']:b=raws['source-and-dispatch/'+e['path']];assert len(b)==e['bytes']and sha(b)==e['sha256']
print(json.dumps({'verified':True,'source':m['source'],'run':m['workflowRun'],'claim':m['claim'],'jobSeconds':22,'cohortJobSeconds':26968,'artifactCount':0,'nativeSessions':0,'observedPredicates':0,'nativeQualification':False,'files':len(m['files'])}))
