from pathlib import Path
import json,hashlib,zipfile,io,datetime
r=Path(__file__).resolve().parent;m=json.loads((r/'provenance.json').read_bytes());sha=lambda b:hashlib.sha256(b).hexdigest()
assert {str(p.relative_to(r))for p in r.rglob('*')if p.is_file()}=={x['path']for x in m['files']}|{'provenance.json'}
for x in m['files']:
 b=(r/x['path']).read_bytes();assert len(b)==x['size']and sha(b)==x['sha256'],x['path']
spec=m.get('archiveParts');raw=b''.join((r/n).read_bytes()for n in spec['parts'])if spec else(r/'native-integrated.zip').read_bytes()
if spec:assert len(raw)==spec['size']and sha(raw)==spec['sha256']and all(0<(r/n).stat().st_size<=64*1024*1024 for n in spec['parts'])
assert len(raw)<=512*1024*1024;api=json.loads((r/'artifacts.json').read_bytes());artifact=next(x for x in api['artifacts']if x['id']==m['artifactId']);assert len(raw)==artifact['size_in_bytes']and'sha256:'+sha(raw)==artifact['digest']
members=json.loads((r/'native-members.json').read_bytes())
with zipfile.ZipFile(io.BytesIO(raw))as z:
 assert {x.filename for x in z.infolist()if not x.is_dir()}=={x['path']for x in members}
 for x in members:
  b=z.read(x['path']);assert len(b)==x['bytes']and sha(b)==x['sha256']
 assert z.read('integrated-qualification.json')==(r/'qualification.json').read_bytes()
 assert z.read('qualification.json')==(r/'native-qualification.json').read_bytes()
q=json.loads((r/'qualification.json').read_bytes());assert q['qualifiedEnvironment']and q['repetitionMatch']and q['source']==m['source']and q['profile']=='ITCVE-1@4.8.0'
guard=json.loads((r/'independent/guarded-replay.json').read_bytes());replay=json.loads((r/'independent/replay.json').read_bytes());assert guard['exitCode']==0 and guard['source']==m['source']and replay['result']=='VERIFIED_EXACT_SOURCE_AND_ALL_CHILDREN'and len(replay['children'])==12 and replay['originalBytesUnchanged']and replay['frozenSourceUnchanged']
assert(r/'independent/original-members-before.json').read_bytes()==(r/'independent/original-members-after.json').read_bytes()
jobs=json.loads((r/'jobs.json').read_bytes())['jobs'];j=next(x for x in jobs if x['name']=='all-go-native');t=lambda s:datetime.datetime.fromisoformat(s.replace('Z','+00:00'));seconds=int((t(j['completed_at'])-t(j['started_at'])).total_seconds());cost=json.loads((r/'cost.json').read_bytes());assert seconds==cost['nativeJobSeconds']and cost['order27JobSeconds']==2803+seconds and cost['completedCohortJobSeconds']==92542+seconds
print(json.dumps({'verified':True,'source':m['source'],'members':len(members),'nativeJobSeconds':seconds,'physicalIntegrityOnly':True}))
