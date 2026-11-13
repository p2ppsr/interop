"""Verify this retained engineering archive; never generates native verdicts."""
from pathlib import Path
import gzip,hashlib,json,subprocess,sys
here=Path(__file__).resolve().parent
root=here.parents[2]
sha=lambda b:hashlib.sha256(b).hexdigest()
read=lambda p:json.loads(p.read_text())
manifest=read(here/'validation.json')
assert manifest['claim']=='LOCAL_ENGINEERING_PREFLIGHT_ONLY'
assert manifest['nativeSessions']==0 and manifest['completeBRC100Conformance'] is False
expected={}
def safe(name):
 p=Path(name)
 assert not p.is_absolute() and '..' not in p.parts
 return here/p
for row in manifest['files']:
 p=safe(row['path']);assert p.is_file() and not p.is_symlink(),p
 data=p.read_bytes();assert len(data)==row['bytes'] and sha(data)==row['sha256'],p
 assert row['path'] not in expected
 expected[row['path']]=row['sha256']
actual={str(p.relative_to(here)) for p in here.rglob('*') if p.is_file() and '__pycache__' not in p.parts}
assert actual==set(expected)|{'validation.json'},(actual-set(expected)-{'validation.json'},set(expected)-actual)
decoded=0
for name in ['preflight-index.json','source-freeze-index.json','final-log-index.json','final-check-index.json']:
 index=read(here/name)
 for row in index['files']:
  data=safe(row['path']).read_bytes()
  assert sha(data)==row['sha256'] and len(data)==row['bytes'],row['path']
  raw=gzip.decompress(data) if row.get('encoding')=='gzip' else data
  assert sha(raw)==row['rawSha256'] and len(raw)==row['rawBytes'],row['path']
  decoded+=1
source=manifest['sourceRuntimeCommit']
freeze=read(here/'source-freeze-index.json')
assert freeze['sourceHeadAtSnapshot']==source
assert manifest['sourceInputs']==freeze['runtimeInputs']
assert manifest['nativePlan']=={**freeze['plan'],'inputs':len(freeze['runtimeInputs'])}
for name,digest in freeze['runtimeInputs'].items():
 raw=subprocess.check_output(['git','show',source+':'+name],cwd=root)
 assert sha(raw)==digest,name
 archived=gzip.decompress(safe('source/'+name+'.gz').read_bytes())
 assert archived==raw,name
plan=freeze['plan'];assert sha(subprocess.check_output(['git','show',source+':'+plan['path']],cwd=root))==plan['sha256']
preflight=read(here/'preflight-index.json');checked_external=0;rebuildable=[]
assert manifest['sourceBaseCommit']==preflight['sourceBaseCommit']
for name,row in preflight['externalReferences'].items():
 p=Path(name)
 if p.is_absolute():
  rebuildable.append({'path':name,'sha256':row['sha256']})
  if '--with-local-artifacts' not in sys.argv:continue
 else:p=root/p
 assert p.is_file() and p.stat().st_size==row['bytes'] and sha(p.read_bytes())==row['sha256'],name
 checked_external+=1
if '--staged' in sys.argv:
 prefix=here.relative_to(root).as_posix()+'/'
 staged=set(subprocess.check_output(['git','ls-files','--cached','-z','--',str(here.relative_to(root))],cwd=root).decode().split('\0'))-{''}
 assert staged=={prefix+n for n in actual},'Archive bytes are absent from the staged Git inventory'
for name,row in read(here/'linked-evidence.json')['files'].items():
 p=root/name
 assert p.is_file() and p.stat().st_size==row['bytes'] and sha(p.read_bytes())==row['sha256'],name
summary=json.loads(gzip.decompress((here/'evidence/out/native-closure-20261111/coverage1-final-summary.json.gz').read_bytes()))
assert summary['results']==manifest['results']
assert summary['sourceRuntimeCommit']==source
assert summary['nativeSessions']==0
print(json.dumps({'verified':True,'claim':manifest['claim'],'sourceRuntimeCommit':source,'files':len(expected),'decodedIndexEntries':decoded,'sourceInputs':len(freeze['runtimeInputs']),'retainedExternalReferences':checked_external,'rebuildableExecutableReferences':len(rebuildable),'localExecutablesChecked':'--with-local-artifacts' in sys.argv,'stagedInventoryChecked':'--staged' in sys.argv,'nativeSessions':0},indent=2))
