from pathlib import Path
import json,hashlib,gzip,datetime,os
ROOT=Path(__file__).resolve().parents[3]
BASE=ROOT/'out/native-closure-20261111'
DEST=ROOT/'journals/native-closure-validation/2026-11-12-coverage-completion'
PREP=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
receipt_names=[
 'completion-final-integration-review/review-frozen.json','portability-archive-source-recovery/review.json','action-ledger-independent-review/review.json','action-ledger-final-review/final-rpc-review.json','completion-final-integration-review/review-before-metadata-freeze.json','coverage-completion-archive-preparation/frozen-source/review.json','completion-action-fixture-preconsolidation/review.json','transaction-branches-promotion/review.json','coverage-observation-type-followup/review.json','action-ledger-final-review/typed-argument-review.json','partial-trace-promotion/review.json','clause7-byte-review/review.json','clause7-unmarked-review/review.json','completion-funding-roots-review/review.json','completion-parent-reference/review.json','completion-observer-independent-review/review.json',
 'caller-known-inputs-successor/review.json','known-root-independent-review/review.json','transaction-branches-prototype/unknown-source-observer-v1/review.json','transaction-branches-prototype/revision2/review.json',
 'action-ledger-final-review/review.json','action-ledger-final-review/positive-precision-supplement.json','action-ledger-final-review/capacity-plan.json','action-ledger-reference/review.json','action-query-cut-prototype/revision2/review.json','action-inventory-prototype/review.json','action-inventory-prototype/revision2/review.json',
 'certificate-rejections-promotion/review.json','certificate-rejection-prototype/review.json','certificate-snapshot-prototype/review.json','certificate-snapshot-prototype/revision2/review.json','certificate-snapshot-independent-review/review.json',
 'coverage-observation-recovery/review.json','inventory-bounds-successor/review.json','permission-sequence-prototype/review.json','basket-boundary-prototype/review.json','pagination-coverage-prototype/review.json',
]
receipts=[BASE/p for p in receipt_names]+[ROOT/'out/native-review-43216478235/prospective-oracle-review.json',ROOT/'out/native-review-43216478235/successor-mechanics-review.json']
plan=json.loads((BASE/'prospective-validation-archive-plan.json').read_text())
linked=plan['existingImmutableArchivesToLinkWithoutDuplication']
records=[];unresolved=[];pool={};cache={}
def digest(p):
 p=p.resolve();s=p.stat();key=(str(p),s.st_size,s.st_mtime_ns)
 if key not in cache:cache[key]=sha(p.read_bytes())
 return cache[key]
def walkrows(value,location=''):
 if isinstance(value,dict):
  if isinstance(value.get('path'),str) and isinstance(value.get('sha256'),str) and location != '/localBinary':yield location,value
  for k,v in value.items():
   if k=='files' and isinstance(v,dict):
    for n,row in v.items():
     if isinstance(row,dict) and 'sha256'in row:yield location+'/files/'+n,dict(row,path=n)
   elif k in ['source','runtimeInputs'] and isinstance(v,dict):
    for n,d in v.items():
     if isinstance(d,str) and len(d)==64 and '/'in n:yield location+'/'+k+'/'+n,dict(path=n,sha256=d)
   yield from walkrows(v,location+'/'+k)
 elif isinstance(value,list):
  for i,v in enumerate(value):yield from walkrows(v,location+'/'+str(i))
# Build a content index from exact indexed sources and local captured source copies,
# without traversing dependency installations, app artifacts or full frozen trees.
for receipt in receipts:
 assert receipt.is_file(),receipt
 data=json.loads(receipt.read_text())
 rows=list(walkrows(data))
 for loc,row in rows:
  name=row['path'];p=Path(name)
  candidates=[receipt.parent/p,receipt.parent.parent/p,ROOT/p,receipt.parent/'source'/p,receipt.parent/'source-snapshot'/p,receipt.parent/'before'/p,receipt.parent/'captured-source'/row['sha256']]
  for q in candidates:
   if q.is_file() and not q.is_symlink():
    d=digest(q);pool.setdefault(d,q)
  records.append((receipt,loc,row,candidates))
# Individual review folders may retain historical source snapshots whose logical
# names differ from the original. Hash only regular bounded files in those roots.
for receipt in receipts:
 for folder in ['source','source-snapshot','typed-argument-snapshot','typed-argument-source','positive-precision-source','before','captured-source','source-before','source-after','review-files/source']:
  d=receipt.parent/folder
  if d.exists():
   for q in d.rglob('*'):
    if q.is_file() and not q.is_symlink() and q.stat().st_size<8*1024*1024:pool.setdefault(digest(q),q)
# Also resolve historical oracle source snapshots through adjacent proof reviews.
for d in [BASE/'action-ledger-final-review',PREP/'historical-sources',BASE/'clause7-unmarked-review',ROOT/'out/native-review-43216478235/prospective-source-snapshot']:
 if d.exists():
  for q in d.rglob('*'):
   if q.is_file() and not q.is_symlink() and q.stat().st_size<4*1024*1024:pool.setdefault(digest(q),q)
DEST.mkdir(parents=True,exist_ok=True);(DEST/'objects').mkdir(exist_ok=True)
objects={};members=[];logical=set()
def add(name,p,expected=None):
 assert not name.startswith('/') and '..'not in Path(name).parts
 assert name not in logical,name;logical.add(name)
 raw=p.read_bytes();h=sha(raw)
 if expected:
  assert h==expected['sha256'],(name,h,expected['sha256'])
  if 'bytes'in expected:assert len(raw)==expected['bytes'],name
 object_path=f'objects/{h}.gz';target=DEST/object_path
 if not target.exists():target.write_bytes(gzip.compress(raw,compresslevel=9,mtime=0))
 stored=target.read_bytes();assert gzip.decompress(stored)==raw
 objects[h]={'path':object_path,'bytes':len(stored),'sha256':sha(stored),'decodedBytes':len(raw),'decodedSha256':h,'encoding':'gzip'}
 members.append({'logicalPath':name,'originalPath':str(p.relative_to(ROOT)) if p.is_relative_to(ROOT) else str(p),'bytes':len(raw),'sha256':h,'object':object_path})
receipt_index=[]
for receipt in receipts:
 name=str(receipt.relative_to(ROOT));raw=receipt.read_bytes();h=sha(raw)
 add('receipts/'+name,receipt)
 receipt_index.append({'path':name,'sha256':h,'bytes':len(raw),'memberKey':'receipts/'+name})
external=[]
for receipt,location,row,candidates in records:
 if row['path'].startswith(('journals/','fixtures/artifacts/')):
  p=ROOT/row['path'];assert p.is_file() and digest(p)==row['sha256'];external.append({'receipt':str(receipt.relative_to(ROOT)),'jsonPointer':location,**row,'resolution':'EXISTING_IMMUTABLE_REPOSITORY_ARTIFACT_NOT_DUPLICATED'});continue
 match=pool.get(row['sha256'])
 if match is None:
  unresolved.append({'receipt':str(receipt.relative_to(ROOT)),'jsonPointer':location,'member':row,'reason':'Exact indexed bytes not located; receipt retained, no substitution.'});continue
 name='indexed/'+str(receipt.relative_to(ROOT))+'/'+location.strip('/').replace('//','/')
 # Nested duplicated index references are distinct logical aliases by pointer.
 add(name,match,row)
extras=[PREP/'failed-seal-v1-receipt.json',*[PREP/'failed-seal-v1'/x for x in ['validation.json','completion.json','verify.py','prepare.py','seal.py','README.md']],BASE/'attempt7-work-order-proposal.json',BASE/'completion-inventory-action-tests-5.log',BASE/'action-ledger-positive-precision-tests.log']
for pattern in ['completion-wiring-*.log','permission-completion-parent-tests.log','completion-root-parent-tests.log','completion-inventory-*.log','completion-suite-typecheck.log','coverage3-python-packaging.log','coverage3-typecheck-intermediate.log','coverage3-typecheck-integrated-hooks.log','coverage3-synthesis-full-1.log','coverage3-synthesis-full-2.log']:
 extras.extend(BASE.glob(pattern))
extras.extend([BASE/'coverage3-scaffolding/freeze2.json',BASE/'coverage3-scaffolding/push-trigger-inventory.json',BASE/'coverage3-scaffolding/worker-vm-harness-correction.log'])
for directory in [BASE/'coverage3-full-gates',BASE/'completion-action-fixture-preconsolidation',BASE/'action-ledger-independent-review',BASE/'clause7-byte-review',BASE/'completion-observer-independent-review']:
 extras.extend(q for q in directory.rglob('*') if q.is_file() and not q.is_symlink())
for p in sorted(set(extras)):
 if p.exists():add('supplemental/'+str(p.relative_to(ROOT)),p)
for row in linked:
 p=ROOT/row['path'];assert p.is_file() and digest(p)==row['sha256'];assert p.stat().st_size==row['bytes']
manifest={'schema':'tpnil-local-validation-content-store-draft@1','state':'DRAFT_UNSEALED_NOT_ADMITTED','claim':'LOCAL_ENGINEERING_VALIDATION_ONLY','nativeQualification':False,'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'receiptInventory':receipt_index,'members':members,'objects':sorted(objects.values(),key=lambda x:x['path']),'linkedImmutableEvidence':linked,'additionalLinkedArtifactReferences':external,'localBinaryPolicy':'Historical local binaries are hash-bound metadata, not indexed receipt members; retain exact source/patch/build/test evidence and existing local binary separately. No claim of a portable archived executable.','unresolvedHistoricalBytes':unresolved,'historicalReferencePolicy':'Hash-only intermediate shared-source reviews are retained as references, not asserted replayable. Final source will be independently copied. Missing indexed evidence remains explicit and must be resolved before sealing.','pending':['Final transaction/codec and action-projection successor receipts','Final source/policy/plan/Rust/source7 freeze','Completed final core/synthesis/typecheck/publication logs','Independent final archive tamper review'],'statistics':{'logicalMembers':len(members),'uniqueObjects':len(objects),'rawLogicalBytes':sum(x['bytes']for x in members),'uniqueRawBytes':sum(x['decodedBytes']for x in objects.values()),'storedBytes':sum(x['bytes']for x in objects.values())},'cost':{'additionalCIOrNativeRuns':0,'completedKnownCohortJobSeconds':25120,'actualMoneyUsd':None,'operatorCostUsd':None,'agentCostUsd':None,'allocatedOwnedCapacityCostUsd':None}}
# Draft updates preserve prior manifest bytes; object names are immutable by raw SHA.
previous=DEST/'draft-manifest.json'
if previous.exists():
 b=previous.read_bytes();old=PREP/'draft-history'/f'{sha(b)}.json';old.parent.mkdir(exist_ok=True);old.write_bytes(b)
previous.write_text(json.dumps(manifest,indent=2)+'\n')
for old in (DEST/'objects').iterdir():
 if old.name not in {Path(x['path']).name for x in objects.values()}:
  assert old.is_file() and not old.is_symlink() and old.suffix=='.gz';old.unlink()
(DEST/'README.md').write_text('# Prospective completion validation — preparation only\n\nThis unsealed content store preserves exact local engineering observations, failures and source versions. It does not qualify a native run. The final source, completed gate logs, successor receipts and independent archive review remain pending. Immutable native6 and candidate CI/intake archives are linked, not rewritten. Gzip objects are addressed by the SHA256 of the decoded original bytes; every receipt-relative alias retains its original digest and byte length.\n')
(PREP/'prepare-result.json').write_text(json.dumps({'state':manifest['state'],'manifest':str(previous.relative_to(ROOT)),'sha256':sha(previous.read_bytes()),'statistics':manifest['statistics'],'unresolved':unresolved},indent=2)+'\n')
print(json.dumps({'sha256':sha(previous.read_bytes()),'statistics':manifest['statistics'],'unresolvedCount':len(unresolved)},indent=2))
