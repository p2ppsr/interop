from pathlib import Path
import json,gzip,hashlib,tempfile,subprocess,sys
root=Path(sys.argv[1]).resolve()if len(sys.argv)>1 else Path(__file__).resolve().parent
m=json.loads((root/'manifest.json').read_text());assert m['schema']=='tpnil-native-ci-archive-manifest@2' and m['claim']=='CI_EXECUTION_AND_RETAINED_EVIDENCE_REVIEW_ONLY' and m['source']=='7bd1480037ddc064f5a8cb2f567f6e58285c5999'
with tempfile.TemporaryDirectory(prefix='tpnil-ci-7bd-')as tmp:
 d=Path(tmp);seen=set();originals=set()
 for e in m['files']:
  p=e['path'];assert p not in seen;seen.add(p);assert not Path(p).is_absolute()and'..'not in Path(p).parts
  b=(root/p).read_bytes();assert len(b)==e['bytes']and hashlib.sha256(b).hexdigest()==e['sha256'];assert e['encoding']in['identity','gzip'];raw=gzip.decompress(b)if e['encoding']=='gzip'else b
  assert len(raw)==e['originalBytes']and hashlib.sha256(raw).hexdigest()==e['originalSha256']
  if not e.get('generated'):
   q=e['originalPath'];assert q not in originals;originals.add(q);assert not Path(q).is_absolute()and'..'not in Path(q).parts;t=d/q;t.parent.mkdir(parents=True,exist_ok=True);t.write_bytes(raw)
 assert {p.relative_to(root).as_posix()for p in root.rglob('*')if p.is_file()}==seen|{'manifest.json'}
 summary=json.loads((d/'summary.json').read_text());result=subprocess.run([sys.executable,str(d/'review.py')],capture_output=True,text=True);assert result.returncode==0,result.stderr
 assert json.loads((d/'summary.json').read_text())==summary,'Summary differs from raw CI evidence'
 receipt=json.loads(result.stdout);assert receipt['verified']is True and receipt['jobSeconds']==1411 and receipt['artifactCount']==5 and receipt['artifactMembers']==483 and receipt['foundation']=='failure'
 assert summary['cost']['totalFullCostUSD']is None and summary['cost']['completedCohortJobSecondsAfterIncrement']==15663 and summary['completeBRC100Conformance']is False and summary['nativeWalletConformanceClosed']is False and summary['currentCandidateNativeSessions']==0
 print(json.dumps({'verified':True,'claim':'CI_EXECUTION_AND_RETAINED_EVIDENCE_REVIEW_ONLY','files':len(seen),'artifactMembers':483,'jobSeconds':1411,'completedCohortJobSeconds':15663,'newNativeSessions':0,'foundation':'failure','nativeConformanceClosed':False}))
