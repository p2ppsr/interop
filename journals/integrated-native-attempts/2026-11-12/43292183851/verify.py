from pathlib import Path
import json,hashlib,gzip,zipfile,tempfile,datetime
r=Path(__file__).resolve().parent;m=json.loads((r/'attempt.json').read_bytes());sha=lambda b:hashlib.sha256(b).hexdigest()
files={p.relative_to(r).as_posix()for p in r.rglob('*')if p.is_file()};assert files=={x['name']for x in m['files']}|{'attempt.json'}
for x in m['files']:assert(r/x['name']).stat().st_size==x['size']and sha((r/x['name']).read_bytes())==x['sha256']
read=lambda n:json.loads(gzip.decompress((r/(n+'.gz')).read_bytes()))
api=read('artifacts-api.json');artifact=next(x for x in api['artifacts']if x['id']==13979919106);acq=read('acquisition.json');members=next(x['members']for x in acq['files']if x.get('artifactId')==13979919106)
with tempfile.TemporaryDirectory(prefix='tpnil-native11-original-')as tmp:
 p=Path(tmp)/'original.zip'
 with p.open('xb')as f:
  for n in m['originalArchive']['parts']:f.write((r/n).read_bytes())
 raw=p.read_bytes();assert len(raw)==artifact['size_in_bytes']==108085405 and 'sha256:'+sha(raw)==artifact['digest']==m['originalArchive']['digest']
 transfer=read('transfer-recovery.json');assert sha(raw[:transfer['partialBytes']])==transfer['partialSha256']and transfer['partialIsExactFullPrefix']
 with zipfile.ZipFile(p)as z:
  assert {x.filename for x in z.infolist()if not x.is_dir()}=={x['path']for x in members}
  for row in members:
   b=z.read(row['path']);assert len(b)==row['bytes']and sha(b)==row['sha256']
  for i,expected in [(1,{'PASS':604,'FAIL':81,'BLOCKED':13}),(2,{'PASS':607,'FAIL':78,'BLOCKED':13})]:
   record=json.loads(z.read(f'repetition-{i}/record.json'));rows=[a for v in record['vectors']for a in v['assertions']];assert len(rows)==698
   assert {o:sum(x['outcome']==o for x in rows)for o in expected}==expected
   assert json.loads(z.read(f'host-repetition-{i}-cleanup.json'))['removed']is True
   after=json.loads(z.read(f'host-repetition-{i}-after.json'));assert after['state']['ExitCode']==0 and after['state']['OOMKilled']is False
  assert json.loads(z.read('host-userns.json'))['restoredSuccessfully']is True
  assert all(n not in z.namelist()for n in ['qualification.json','integrated-qualification.json','rust-repetition-1/result.json','rust-repetition-2/result.json'])
jobs=read('jobs-api.json');j=next(x for x in jobs['jobs']if x['name']=='all-go-native');t=lambda s:datetime.datetime.fromisoformat(s.replace('Z','+00:00'));assert(t(j['completed_at'])-t(j['started_at'])).total_seconds()==2609
assert m['nativeQualification']is False and m['completeBRC100Conformance']is False
print(json.dumps({'verified':True,'nativeMembers':len(members),'repetitions':2,'rawAssertionsPerRepetition':698,'nativeQualification':False,'jobSeconds':2609}))
