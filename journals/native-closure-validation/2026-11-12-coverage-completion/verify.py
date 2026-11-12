from pathlib import Path
import hashlib,json,gzip,sys,subprocess,re
BASE=Path(__file__).resolve().parent
ROOT=BASE.parents[2]
SHA=lambda b:hashlib.sha256(b).hexdigest()
EXPECTED_COMPLETION='54d25417387db9e1422b96a6e32ffb7cb55f124421e212d05f263a6093fc944a'
def regular(p):
 assert p.is_file() and not p.is_symlink(),str(p)
 return p.read_bytes()
def safe(name):
 assert isinstance(name,str) and name and not name.startswith('/') and '..' not in Path(name).parts and '\\'not in name
 return name
completion_bytes=regular(BASE/'completion.json');assert SHA(completion_bytes)==EXPECTED_COMPLETION,'Completion inventory changed'
completion=json.loads(completion_bytes);m=json.loads(regular(BASE/'validation.json'))
projection={k:v for k,v in m.items()if k not in ['completionReceipt','physicalFiles']}
assert projection==completion['manifestProjection'],'Manifest inventory or scope changed'
assert m['state']=='SEALED_LOCAL_ENGINEERING_VALIDATION' and m['nativeQualification'] is False
assert m['completionReceipt']=={'path':'completion.json','bytes':len(completion_bytes),'sha256':EXPECTED_COMPLETION}
physical={}
for row in m['physicalFiles']:
 name=safe(row['path']);assert name not in physical;physical[name]=row
 b=regular(BASE/name);assert len(b)==row['bytes'] and SHA(b)==row['sha256'],name
actual={str(p.relative_to(BASE))for p in BASE.rglob('*')if p.is_file()or p.is_symlink()}
assert actual==set(physical)|{'validation.json'},'Physical archive inventory differs'
assert set(physical)=={x['path']for x in m['objects']}|{'README.md','prepare.py','seal.py','verify.py','completion.json'},'Unexpected physical member set'
for row in completion['supportFiles']:assert physical[row['path']]==row
objects={};decoded={}
for row in m['objects']:
 name=safe(row['path']);assert name==f"objects/{row['decodedSha256']}.gz"and name not in objects
 stored=regular(BASE/name);assert len(stored)==row['bytes']and SHA(stored)==row['sha256'];assert row['encoding']=='gzip'
 raw=gzip.decompress(stored);assert len(raw)==row['decodedBytes']and SHA(raw)==row['decodedSha256'];objects[name]=row
 decoded[name]=raw
members={}
for row in m['members']:
 name=safe(row['logicalPath']);assert name not in members;members[name]=row
 obj=objects[row['object']];assert row['sha256']==obj['decodedSha256']and row['bytes']==obj['decodedBytes']
def get(name):return decoded[members[name]['object']]
for row in m['receiptInventory']:
 r=members[row['memberKey']];assert r['sha256']==row['sha256']and r['bytes']==row['bytes'];json.loads(get(row['memberKey']))
for row in m['linkedImmutableEvidence']+m['additionalLinkedArtifactReferences']:
 b=regular(ROOT/safe(row['path']));assert SHA(b)==row['sha256']and('bytes'not in row or len(b)==row['bytes']),row['path']
expected_history=completion['approvedHistoricalHashOnlyReferences']
assert m['historicalHashOnlyReferences']==expected_history and len(expected_history)==6
assert all(x['replayable']is False and x['rawReceiptRetained']is True for x in expected_history)
assert m['unresolvedHistoricalBytes']==[],'Unresolved indexed bytes'
freeze=json.loads(get(m['freezeMember']));assert freeze['inputs']==391 and len(freeze['sourceInputs'])==391
assert freeze['expectedObservations']==698 and freeze['retainedObservations']==535 and freeze['completionObservations']==163
before=json.loads(get(m['gateMembers']['before']));initial=json.loads(get(m['gateMembers']['afterInitial']));finalBefore=json.loads(get(m['gateMembers']['beforeCoreRecovery']));finalAfter=json.loads(get(m['gateMembers']['afterCoreRecovery']))
rowmap=lambda v:{x['path']:x for x in v['files']}
bm,im,fb,fa=map(rowmap,[before,initial,finalBefore,finalAfter]);assert bm==im and fb==fa and len(bm)==len(fa)==3033
for name,h in freeze['sourceInputs'].items():assert bm[name]['sha256']==h and fa[name]['sha256']==h
for name,row in bm.items():
 if name.startswith('synthesis/'):assert fa[name]==row,'Synthesis input changed after full suite: '+name
results=json.loads(get(m['gateMembers']['results']));assert len(results)==8
assert {r['gate']:r['exitCode']for r in results}=={'core':1,'check':0,'standards':0,'typecheck':0,'synthesis':0,'python':0,'journals':0,'integrations':0}
assert re.search(r'^(?:# |ℹ )pass 187$',get(m['gateMembers']['initialCore']).decode(),re.M) and re.search(r'^(?:# |ℹ )fail 14$',get(m['gateMembers']['initialCore']).decode(),re.M)
assert 'Ran 5 tests' in get(m['gateMembers']['python']).decode()and 'OK'in get(m['gateMembers']['python']).decode()
recovery=json.loads(get(m['gateMembers']['coreRecovery']));assert recovery['exitCode']==0 and recovery['inputsUnchanged']is True and recovery['priorFailureRetained']is True
assert SHA(get(m['gateMembers']['coreCorrected']))==recovery['logSha256']
assert re.search(r'^(?:# |ℹ )pass 204$',get(m['gateMembers']['coreCorrected']).decode(),re.M) and re.search(r'^(?:# |ℹ )fail 0$',get(m['gateMembers']['coreCorrected']).decode(),re.M)
assert '1705 passed' in get(m['gateMembers']['synthesis']).decode()and '90 skipped'in get(m['gateMembers']['synthesis']).decode()
semantic=json.loads(get(m['gateMembers']['semantic']));assert semantic['verifiedPublishedIntegrationArchives']==14 and semantic['verifiedPublishedIntegrationAttempts']==19 and semantic['semantic']is True
assert len(semantic['bundles'])==33
if '--current-source'in sys.argv or '--staged'in sys.argv:
 for row in fa.values():
  b=regular(ROOT/safe(row['path']));assert len(b)==row['bytes']and SHA(b)==row['sha256'],row['path']
if '--staged'in sys.argv:
 index={}
 for line in subprocess.check_output(['git','ls-files','--stage','-z'],cwd=ROOT).split(b'\0'):
  if not line:continue
  header,name=line.split(b'\t',1);mode,oid,stage=header.decode().split();assert stage=='0';index[name.decode()]=oid
 for name in list(fa)+[str((BASE/x).relative_to(ROOT))for x in physical]+[str((BASE/'validation.json').relative_to(ROOT))]:
  b=regular(ROOT/name);oid=hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest();assert index.get(name)==oid,'Staged bytes differ: '+name
stats={'logicalMembers':len(members),'uniqueObjects':len(objects),'rawLogicalBytes':sum(x['bytes']for x in members.values()),'uniqueRawBytes':sum(x['decodedBytes']for x in objects.values()),'storedBytes':sum(x['bytes']for x in objects.values())};assert stats==m['statistics']
print(json.dumps({'verified':True,'nativeQualification':False,'manifestSha256':SHA(regular(BASE/'validation.json')),'statistics':stats,'nativeSourceInputs':391,'completeGateInputs':3033,'corePassed':204,'synthesisPassed':1705,'synthesisSkipped':90,'publishedAcceptedArchives':14,'retainedFailedAttempts':19,'historicalHashOnlySourceReferences':6}))
