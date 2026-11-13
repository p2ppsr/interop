from pathlib import Path
import collections,datetime,gzip,hashlib,json,re,subprocess,sys,tempfile,zipfile
EXPECTED_INVENTORY='eaa642f820dd780f814019c82762a5809304798f6fbfb0c0ea5f3386f777e1d1'
EXPECTED_COST='9e144c22bde2cc24a9c47531d319b8d8a0228a0144b9f929c6dd65b9cbfb5eac'
EXPECTED_README='c5a3fcdcad29b536a07d7e1a822fd56eda37220f1e0f049a7e32fa37a9e266f7'
SOURCE='69386efcea077e4bbe5b6e07f71fc6fe3b1f87f7'
sha=lambda b:hashlib.sha256(b).hexdigest()
root=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parent
m=json.loads((root/'manifest.json').read_bytes());assert m['schema']=='tpnil-native-ci-archive-manifest@3' and m['source']==SOURCE and m['claim']=='CI_EXECUTION_AND_RETAINED_EVIDENCE_REVIEW_ONLY'
assert set(m)=={'schema','source','claim','files'}
assert sha((root/'README.md').read_bytes())==EXPECTED_README
rows=m['files'];assert len({x['path']for x in rows})==len(rows)
original=[x for x in rows if not x.get('generated')];assert sha(json.dumps(original,sort_keys=True,separators=(',',':')).encode())==EXPECTED_INVENTORY,'Exact raw evidence inventory changed'
with tempfile.TemporaryDirectory(prefix='tpnil-ci-69386ef-') as tmp:
 d=Path(tmp);seen=set()
 for row in rows:
  p=row['path'];assert not Path(p).is_absolute() and '..' not in Path(p).parts;seen.add(p);f=root/p;assert f.is_file() and not f.is_symlink();b=f.read_bytes();assert len(b)==row['bytes'] and sha(b)==row['sha256'];assert row['encoding'] in ['identity','gzip'];raw=gzip.decompress(b)if row['encoding']=='gzip'else b;assert len(raw)==row['originalBytes'] and sha(raw)==row['originalSha256']
  if not row.get('generated'):
   q=row['originalPath'];assert not Path(q).is_absolute() and '..'not in Path(q).parts;t=d/q;assert not t.exists();t.parent.mkdir(parents=True,exist_ok=True);t.write_bytes(raw)
 assert {p.relative_to(root).as_posix()for p in root.rglob('*')if p.is_file()or p.is_symlink()}==seen|{'manifest.json'},'Physical archive inventory changed'
 cost=json.loads((d/'cost-summary.json').read_bytes());assert sha((d/'cost-summary.json').read_bytes())==EXPECTED_COST
 check=subprocess.run([sys.executable,str(d/'build-cost-summary.py')],capture_output=True,text=True);assert check.returncode==0,check.stderr;assert json.loads(check.stdout)['verified'] is True
 assert cost['source']==SOURCE and cost['nativeQualification']is False and cost['currentCandidateNativeSessionsInTheseWorkflows']==0 and all(v is None for v in cost['monetaryCosts'].values())
 artifactCount=0;memberCount=0;source7=None;matrix=None
 for run in [43249807860,43249807970]:
  folder=d/str(run);acq=json.loads((folder/'acquisition.json').read_bytes());apis={}
  for row in acq['apis']:
   b=(folder/row['path']).read_bytes();assert sha(b)==row['sha256']and len(b)==row['bytes'];apis[row['path']]=json.loads(b)
  byid={a['id']:a for a in apis['artifacts-api.json']['artifacts']};assert len(byid)==apis['artifacts-api.json']['total_count'];seenArtifacts=set()
  for row in acq['files']:
   f=folder/row['path'];b=f.read_bytes();assert sha(b)==row['sha256']and len(b)==row['bytes']
   if not row.get('artifactId'):continue
   a=byid[row['artifactId']];seenArtifacts.add(a['id']);assert a['name']==row['artifactName']and a['digest']=='sha256:'+sha(b)and a['size_in_bytes']==len(b);artifactCount+=1
   with zipfile.ZipFile(f) as z:
    actual=[];paths=set()
    for item in z.infolist():
     assert item.filename not in paths;paths.add(item.filename);p=Path(item.filename);assert not p.is_absolute()and'..'not in p.parts and(item.external_attr>>16)&0o170000!=0o120000
     if item.is_dir():continue
     raw=z.read(item);actual.append({'path':item.filename,'bytes':len(raw),'sha256':sha(raw),'crc32':item.CRC})
    assert actual==row['members'];memberCount+=len(actual)
    if a['name']=='integrated-lab':matrix=json.loads(z.read('result.json'))
    if a['name']=='native-integrated-reevaluation':
     source7=json.loads(z.read('reevaluation.json'));assert source7['evaluatorSource']==SOURCE and source7['newNativeSessions']==0 and source7['originalMembersUnchanged']is True and source7['completeBRC100Conformance']is False
     assert source7['planSha256']=='692c8a749eff3b32eed33db8de8c4442b975c72021c2de8bbc2ee7dbfd2724b8'
     logs=[p for p in z.namelist()if p.startswith('logs/')and not p.endswith('/')];assert len(logs)==16
     for p in logs:
      txt=z.read(p).decode();values=[]
      for start in re.finditer(r'^\{',txt,re.M):
       try:r,n=json.JSONDecoder().raw_decode(txt[start.start():])
       except ValueError:continue
       if not txt[start.start()+n:].strip():values.append(r)
      assert len(values)==1,p;r=values[0]
      if p.endswith('-run.log'):assert r['schema']=='tpnil-component-result@1'
      else:assert r['verified']is True,p
      if p in ['logs/original-rust-1.log','logs/rust-1-verify.log','logs/rust-2-verify.log']:assert r['assertions']==48 and r['parentInputsBound']==4 and r['independentReplay']is True and r['outcome']==('FAIL'if p=='logs/original-rust-1.log'else'PASS')
     for rep in source7['repetitions']:assert rep['native']['counts']=={'PASS':180,'FAIL':99,'BLOCKED':1}and rep['counts']=={'PASS':77,'FAIL':0,'BLOCKED':0}and rep['rust']['counts']=={'PASS':48,'FAIL':0,'BLOCKED':0}
  assert seenArtifacts==set(byid)
 assert source7 is not None and matrix is not None
 counts=dict(collections.Counter(a['result']for lane in matrix['lanes']for r in lane['runs']for a in r['assertions']));assert counts=={'PASS':584,'FAIL':6}
 def clean(text):return re.sub(r'^\S+Z ','',re.sub(r'\x1b\[[0-9;]*m','',text),flags=re.M)
 core=clean((d/'43249807860/job-131292196465.log').read_text());integrated=clean((d/'43249807860/job-131292196581.log').read_text())
 for text in ['ℹ tests 204','ℹ pass 203','ℹ fail 0','ℹ skipped 1','1675 passed','120 skipped (1795)','88 passed | 5 skipped (93)','Ran 5 tests']:assert text in core,text
 for text in ['42 passed (42)','14 passed (14)','ℹ tests 8','ℹ pass 8','ℹ tests 15','ℹ pass 15','test result: ok. 1 passed','test result: ok. 14 passed']:assert text in integrated,text
 objects=[]
 for start in re.finditer(r'^\{',integrated,re.M):
  try:r,n=json.JSONDecoder().raw_decode(integrated[start.start():])
  except ValueError:continue
  if isinstance(r,dict):objects.append(r)
 sem=[v for v in objects if v.get('childOraclesVerified')is True];assert len(sem)==1 and sem[0]['source']==SOURCE and len(sem[0]['findings'])==6
 published=[v for v in objects if 'verifiedPublishedIntegrationArchives'in v];assert len(published)==1 and published[0]['verifiedPublishedIntegrationArchives']==14 and published[0]['verifiedPublishedIntegrationAttempts']==19 and published[0]['semantic']is True and len(published[0]['bundles'])==33
 desc=[v for v in objects if v.get('verified')is True and v.get('directions')==4];assert len(desc)==1 and desc[0]['result']=='PASS'
 print(json.dumps({'verified':True,'claim':m['claim'],'source':SOURCE,'files':len(rows),'artifacts':artifactCount,'artifactMembers':memberCount,'ciJobSeconds':cost['knownJobWallSeconds'],'completedCohortJobSeconds':cost['completedCohortJobSecondsAfterIncrement'],'newNativeSessions':0,'nativeQualification':False,'source7ChildReceipts':16}))
