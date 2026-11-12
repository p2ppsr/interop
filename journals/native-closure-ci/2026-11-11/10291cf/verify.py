#!/usr/bin/env python3
"""Check retained bytes and accounting without executing wallet/service code."""
from pathlib import Path
import datetime
import gzip
import hashlib
import io
import json
import stat
import zipfile

here=Path(__file__).resolve().parent
repo=here.parents[3]
sha=lambda b:hashlib.sha256(b).hexdigest()
manifest=json.loads((here/'manifest.json').read_text())
files={}
for row in manifest['files']:
 name=Path(row['path'])
 assert not name.is_absolute() and '..' not in name.parts and row['path'] not in files
 p=here/name
 assert not p.is_symlink() and p.resolve().is_relative_to(here)
 stored=p.read_bytes()
 assert len(stored)==row['storedBytes'] and sha(stored)==row['storedSha256'],name
 assert row['encoding'] in ['gzip','identity']
 if row['encoding']=='gzip':
  assert stored[4:8]==b'\0\0\0\0'
  raw=gzip.decompress(stored)
 else:raw=stored
 assert len(raw)==row['rawBytes'] and sha(raw)==row['rawSha256'],name
 files[row['path']]=raw
extras={'README.md','manifest.json','verify.py','integrity-verification.json'}
assert {str(p.relative_to(here)) for p in here.rglob('*') if p.is_file()}-extras==set(files)
for row in manifest['repositoryReferences']:
 name=Path(row['path']);assert not name.is_absolute() and '..' not in name.parts
 p=repo/name;assert p.resolve().is_relative_to(repo)
 raw=p.read_bytes();assert len(raw)==row['bytes'] and sha(raw)==row['sha256'],name
read=lambda name:json.loads(files[name])
seconds=0;jobs=0
for rid in manifest['includedRuns']:
 run=read(f'{rid}/run.json.gz');jobset=read(f'{rid}/jobs.json.gz');artifacts=read(f'{rid}/artifacts.json.gz')
 assert run['id']==rid and run['status']=='completed'
 assert jobset['total_count']==len(jobset['jobs']) and artifacts['total_count']==len(artifacts['artifacts'])
 for job in jobset['jobs']:
  assert job['status']=='completed'
  elapsed=(datetime.datetime.fromisoformat(job['completed_at'].replace('Z','+00:00'))-datetime.datetime.fromisoformat(job['started_at'].replace('Z','+00:00'))).total_seconds()
  assert elapsed>=0;seconds+=elapsed;jobs+=1
 for artifact in artifacts['artifacts']:
  raw=files[f"{rid}/{artifact['name']}.zip"]
  assert len(raw)==artifact['size_in_bytes'] and 'sha256:'+sha(raw)==artifact['digest']
for name,raw in files.items():
 if not name.endswith('.zip'):continue
 with zipfile.ZipFile(io.BytesIO(raw)) as archive:
  seen=set();assert len(archive.infolist())<=100000
  assert sum(x.file_size for x in archive.infolist())<=512*1024*1024
  for member in archive.infolist():
   path=Path(member.filename)
   assert not path.is_absolute() and '..' not in path.parts and '\\' not in member.filename
   assert member.filename.lower() not in seen and not stat.S_ISLNK(member.external_attr>>16)
   seen.add(member.filename.lower());assert member.file_size<=256*1024*1024
   assert len(archive.read(member))==member.file_size
cost=read('cost.json')
assert cost['knownJobWallSeconds']==seconds==2723 and cost['includedCompletedJobs']==jobs==10
assert cost['unknownCostsAreZero'] is False and cost['actualCIChargeUSD'] is None
for rid,suffix in [(43157163535,'-2'),(43158448284,'')]:
 review=read(f'{rid}/independent-component-replay{suffix}.json.gz')
 assert review['verified'] and len(review['childReceipts'])==16
 assert review['counts']=={'PASS':584,'FAIL':6,'BLOCKED':0}
 for child in review['childReceipts']:
  if child['lane']=='storage-sync':assert child['receipt']['result']=='PASS' and child['receipt']['assertions']==88 and child['receipt']['runs']==8
  else:assert child['receipt']['verified'] is True
 with zipfile.ZipFile(io.BytesIO(files[f'{rid}/integrated-lab.zip'])) as archive:
  result=json.loads(archive.read('result.json'))
  rows=[a for lane in result['lanes'] for run in lane['runs'] for a in run['assertions']]
  assert len(rows)==590 and {v:sum(a['result']==v for a in rows) for v in ['PASS','FAIL','BLOCKED']}==review['counts']
  assert len(archive.infolist())==193
 with zipfile.ZipFile(io.BytesIO(files[f'{rid}/itcve-go-components.zip'])) as archive:
  report=json.loads(archive.read(next(n for n in archive.namelist() if n.endswith('/vitest.json'))))
  assert report['success'] and report['numPassedTests']==report['numTotalTests']==13 and report['numFailedTests']==0
with zipfile.ZipFile(io.BytesIO(files['43157083517/native-integrated-reevaluation.zip'])) as archive:
 assert len(archive.infolist())==220
 result=json.loads(archive.read('reevaluation.json'))
 assert result['newNativeSessions']==0 and result['nativeOutcome']=='FAIL' and result['completeBRC100Conformance'] is False
 original=archive.read('original-native.zip');assert sha(original)==result['original']['sha256']
 with zipfile.ZipFile(io.BytesIO(original)) as nested:
  members=[x for x in nested.infolist() if not x.is_dir()];assert len(members)==186
  for member in members:assert archive.read('original/'+member.filename)==nested.read(member)
 for row in result['repetitions']:
  assert row['native']['counts']=={'PASS':180,'FAIL':99,'BLOCKED':1}
  assert row['counts']=={'PASS':77,'FAIL':0,'BLOCKED':0}
  assert row['rust']['counts']=={'PASS':48,'FAIL':0,'BLOCKED':0}
assert read('43157083517/independent-replay.json.gz')['verified'] is True
print(json.dumps({'verified':True,'files':len(files),'repositoryReferences':len(manifest['repositoryReferences']),'runs':len(manifest['includedRuns']),'jobs':jobs,'jobSeconds':seconds,'nativeQualification':False,'manifestSha256':sha((here/'manifest.json').read_bytes())},indent=2))
