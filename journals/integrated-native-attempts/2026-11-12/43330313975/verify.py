from pathlib import Path
import json,hashlib,gzip,zipfile,io,datetime
r=Path(__file__).resolve().parent;m=json.loads((r/'attempt.json').read_bytes());sha=lambda b:hashlib.sha256(b).hexdigest()
assert {p.name for p in r.iterdir()if p.is_file()}=={x['name']for x in m['files']}|{'attempt.json'}
for x in m['files']:
 b=(r/x['name']).read_bytes();assert len(b)==x['size']and sha(b)==x['sha256'],x['name']
raw=b''.join((r/n).read_bytes()for n in m['originalArchive']['parts']);assert len(raw)==m['originalArchive']['bytes']and'sha256:'+sha(raw)==m['originalArchive']['digest']
members=json.loads((r/'native-members.json').read_bytes());assert len(members)==535
with zipfile.ZipFile(io.BytesIO(raw))as z:
 assert {x.filename for x in z.infolist()if not x.is_dir()}=={x['path']for x in members}
 for x in members:
  b=z.read(x['path']);assert len(b)==x['bytes']and sha(b)==x['sha256']
 for n,expected in [(1,{'PASS':645,'FAIL':40,'BLOCKED':13}),(2,{'PASS':622,'FAIL':40,'BLOCKED':36})]:
  record=json.loads(z.read(f'repetition-{n}/record.json'));rows=[a for v in record['vectors']for a in v['assertions']];assert len(rows)==698 and {k:sum(x['outcome']==k for x in rows)for k in expected}==expected
  assert json.loads(z.read(f'host-repetition-{n}-cleanup.json'))['removed']is True
  state=json.loads(z.read(f'host-repetition-{n}-after.json'))['state'];assert state['ExitCode']==0 and state['OOMKilled']is False
 assert json.loads(z.read('host-userns.json'))['restoredSuccessfully']is True
 assert all(n not in z.namelist()for n in ['qualification.json','integrated-qualification.json','rust-repetition-1/result.json','rust-repetition-2/result.json'])
jobs=json.loads(gzip.decompress((r/'jobs-api.json.gz').read_bytes()))['jobs'];j=next(x for x in jobs if x['name']=='all-go-native');t=lambda s:datetime.datetime.fromisoformat(s.replace('Z','+00:00'));assert(t(j['completed_at'])-t(j['started_at'])).total_seconds()==3170
assert m['nativeQualification']is False and m['completeBRC100Conformance']is False
print(json.dumps({'verified':True,'source':m['source'],'members':535,'repetitions':2,'nativeQualification':False,'jobSeconds':3170}))
