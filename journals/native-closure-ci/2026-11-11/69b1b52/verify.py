from pathlib import Path
import json,gzip,hashlib,tempfile,subprocess,sys
root=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parent
manifest=json.loads((root/'manifest.json').read_text());assert manifest['schema']=='tpnil-native-ci-archive-manifest@2';assert manifest['claim']=='CI_EXECUTION_AND_RETAINED_EVIDENCE_REVIEW_ONLY'
assert manifest['source']=='69b1b52f0c3d46cbfac91c78b38eb2e4dffbac99'
with tempfile.TemporaryDirectory(prefix='tpnil-ci-69b-') as temporary:
 dest=Path(temporary);seen=set()
 for entry in manifest['files']:
  name=entry['path'];assert name not in seen;seen.add(name);assert not Path(name).is_absolute() and '..'not in Path(name).parts
  data=(root/name).read_bytes();assert len(data)==entry['bytes'];assert hashlib.sha256(data).hexdigest()==entry['sha256'];raw=gzip.decompress(data)if entry['encoding']=='gzip'else data
  assert len(raw)==entry['originalBytes'];assert hashlib.sha256(raw).hexdigest()==entry['originalSha256']
  if not entry.get('generated'):
   target=dest/entry['originalPath'];assert not Path(entry['originalPath']).is_absolute() and '..'not in Path(entry['originalPath']).parts;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
 assert {p.relative_to(root).as_posix()for p in root.rglob('*')if p.is_file()}==seen|{'manifest.json'},'Unexpected archive member'
 original=json.loads((dest/'summary.json').read_text());result=subprocess.run([sys.executable,str(dest/'review.py')],capture_output=True,text=True);assert result.returncode==0,result.stderr
 assert json.loads((dest/'summary.json').read_text())==original,'Summary differs from independently derived raw CI evidence'
 receipt=json.loads(result.stdout);assert receipt['verified']is True and receipt['jobSeconds']==1445 and receipt['artifactCount']==5 and receipt['artifactMembers']==483
 assert original['cost']['totalFullCostUSD']is None and original['completeBRC100Conformance']is False and original['nativeWalletConformanceClosed']is False
 print(json.dumps({'verified':True,'claim':'CI_EXECUTION_AND_RETAINED_EVIDENCE_REVIEW_ONLY','files':len(seen),'artifactMembers':483,'jobSeconds':1445,'completedCohortJobSeconds':11795,'newNativeSessions':0,'nativeConformanceClosed':False}))
