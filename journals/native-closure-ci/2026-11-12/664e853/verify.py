from pathlib import Path
import collections,gzip,hashlib,json,re,subprocess,sys,tempfile,zipfile
SOURCE='664e8539031109174e7233390262d76ca6c81240'
EXPECTED_INVENTORY='d2815e901671aba5dbbbc67286fe30444f30310df844f38c12e181aef72b2731'
EXPECTED_COST='a6f0d6d7a173f6310e843234bbee1981169c8f0cafd5ee048613d608390f37e3'
EXPECTED_README='f7cfe2137789fb1249b5ed292852fde5d76f5d6856d96b56c0bcab0254d15438'
sha=lambda b:hashlib.sha256(b).hexdigest()
root=Path(sys.argv[1]).resolve()if len(sys.argv)>1 else Path(__file__).resolve().parent
m=json.loads((root/'manifest.json').read_bytes());assert set(m)=={'schema','source','claim','files'}and m['schema']=='tpnil-native-ci-archive-manifest@4'and m['source']==SOURCE and m['claim']=='CI_EXECUTION_AND_RETAINED_EVIDENCE_REVIEW_ONLY'
rows=m['files'];assert len({r['path']for r in rows})==len(rows)
generated=[r for r in rows if r.get('generated')];assert len(generated)==2 and {r['path']for r in generated}=={'README.md','verify.py'}
for r in generated:
 assert set(r)=={'path','originalPath','encoding','bytes','sha256','originalBytes','originalSha256','generated'}and r['generated']is True and r['originalPath']==r['path']and r['encoding']=='identity'
assert (root/'verify.py').read_bytes()==Path(__file__).read_bytes(),'Archived verifier differs from trusted executing verifier'
assert sha((root/'README.md').read_bytes())==EXPECTED_README
original=[r for r in rows if not r.get('generated')];assert sha(json.dumps(original,sort_keys=True,separators=(',',':')).encode())==EXPECTED_INVENTORY
with tempfile.TemporaryDirectory(prefix='tpnil-ci664-')as tmp:
 d=Path(tmp);seen=set()
 for r in rows:
  p=Path(r['path']);assert not p.is_absolute()and'..'not in p.parts;seen.add(p.as_posix());f=root/p;assert f.is_file()and not f.is_symlink();b=f.read_bytes();assert len(b)==r['bytes']and sha(b)==r['sha256'];assert r['encoding']in['identity','gzip'];raw=gzip.decompress(b)if r['encoding']=='gzip'else b;assert len(raw)==r['originalBytes']and sha(raw)==r['originalSha256']
  if not r.get('generated'):
   q=Path(r['originalPath']);assert not q.is_absolute()and'..'not in q.parts;t=d/q;assert not t.exists();t.parent.mkdir(parents=True,exist_ok=True);t.write_bytes(raw)
 assert {p.relative_to(root).as_posix()for p in root.rglob('*')if p.is_file()or p.is_symlink()}==seen|{'manifest.json'}
 cost=json.loads((d/'cost-summary.json').read_bytes());assert sha((d/'cost-summary.json').read_bytes())==EXPECTED_COST
 check=subprocess.run([sys.executable,str(d/'build-cost-summary.py')],capture_output=True,text=True);assert check.returncode==0,check.stderr;assert json.loads(check.stdout)['verified']is True
 assert cost['source']==SOURCE and cost['nativeQualification']is False and cost['currentCandidateNativeSessionsInTheseWorkflows']==0 and all(v is None for v in cost['monetaryCosts'].values())
 assert cost['carriedSource7']=={'run':43249807970,'alreadyCountedJobSeconds':135,'newRuns':0,'chargedAgain':False}
 folder=d/'acquisition/43260409136';acq=json.loads((folder/'acquisition.json').read_bytes());assert acq['source']==SOURCE and acq['run']==43260409136
 apis={}
 for r in acq['apis']:
  b=(folder/r['path']).read_bytes();assert sha(b)==r['sha256']and len(b)==r['bytes'];apis[r['path']]=json.loads(b)
 byid={a['id']:a for a in apis['artifacts-api.json']['artifacts']};assert len(byid)==apis['artifacts-api.json']['total_count'];seenArtifacts=set();artifactCount=0;memberCount=0;matrix=None
 jobs=apis['jobs-api.json']['jobs'];expectedLogs={'run-logs.zip'}|{f"job-{j['id']}.log"for j in jobs}|{f'artifact-{a}.zip'for a in byid};assert {r['path']for r in acq['files']}==expectedLogs
 for r in acq['files']:
  f=folder/r['path'];b=f.read_bytes();assert len(b)==r['bytes']and sha(b)==r['sha256']
  if not r.get('artifactId'):continue
  a=byid[r['artifactId']];seenArtifacts.add(a['id']);assert a['name']==r['artifactName']and a['digest']=='sha256:'+sha(b)and a['size_in_bytes']==len(b);artifactCount+=1
  with zipfile.ZipFile(f)as z:
   actual=[];paths=set();expanded=0
   for item in z.infolist():
    assert item.filename not in paths;paths.add(item.filename);p=Path(item.filename);assert not p.is_absolute()and'..'not in p.parts and(item.external_attr>>16)&0o170000!=0o120000;expanded+=item.file_size;assert expanded<=512*1024*1024 and item.file_size<=256*1024*1024 and len(paths)<=100000
    if item.is_dir():continue
    raw=z.read(item);actual.append({'path':item.filename,'bytes':len(raw),'sha256':sha(raw),'crc32':item.CRC})
   assert actual==r['members'];memberCount+=len(actual)
   if a['name']=='integrated-lab':matrix=json.loads(z.read('result.json'))
 assert seenArtifacts==set(byid)and matrix is not None
 counts=dict(collections.Counter(a['result']for lane in matrix['lanes']for run in lane['runs']for a in run['assertions']));assert counts=={'PASS':584,'FAIL':6}
 def clean(s):return re.sub(r'^\S+Z ','',re.sub(r'\x1b\[[0-9;]*m','',s),flags=re.M)
 logs={j['name']:clean((folder/f"job-{j['id']}.log").read_text())for j in jobs};core=logs['offline-core'];integrated=logs['integrated-components']
 for s in ['ℹ tests 214','ℹ pass 213','ℹ fail 0','ℹ skipped 1','1675 passed','120 skipped (1795)','88 passed | 5 skipped (93)','Ran 5 tests']:assert s in core,s
 assert '13 passed (13)'in logs['go-components']
 objects=[]
 for start in re.finditer(r'^\{',integrated,re.M):
  try:r,n=json.JSONDecoder().raw_decode(integrated[start.start():])
  except ValueError:continue
  if isinstance(r,dict):objects.append(r)
 semantic=[x for x in objects if x.get('childOraclesVerified')is True];assert len(semantic)==1 and semantic[0]['source']==SOURCE and len(semantic[0]['findings'])==6
 published=[x for x in objects if 'verifiedPublishedIntegrationArchives'in x];assert len(published)==1 and published[0]['semantic']is True
 descendant=[x for x in objects if x.get('verified')is True and x.get('directions')==4];assert len(descendant)==1 and descendant[0]['result']=='PASS'
 print(json.dumps({'verified':True,'claim':m['claim'],'source':SOURCE,'files':len(rows),'artifacts':artifactCount,'artifactMembers':memberCount,'ciJobSeconds':cost['knownJobWallSeconds'],'completedCohortJobSeconds':cost['completedCohortJobSecondsAfterIncrement'],'newNativeSessions':0,'nativeQualification':False,'source7Reexecuted':False,'componentCounts':counts,'publishedArchives':published[0]['verifiedPublishedIntegrationArchives'],'publishedAttempts':published[0]['verifiedPublishedIntegrationAttempts']}))
