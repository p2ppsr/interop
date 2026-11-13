from pathlib import Path
import argparse,gzip,hashlib,json,re,subprocess
parser=argparse.ArgumentParser();parser.add_argument('--repository');parser.add_argument('--current-source',action='store_true');parser.add_argument('--staged',action='store_true');parser.add_argument('--archive');args=parser.parse_args()
root=Path(args.archive).resolve()if args.archive else Path(__file__).resolve().parent
repo=Path(args.repository).resolve()if args.repository else next(p for p in root.parents if(p/'.git').exists())
sha=lambda b:hashlib.sha256(b).hexdigest();m=json.loads((root/'validation.json').read_bytes());projection={k:v for k,v in m.items()if k!='generatedFiles'}
assert sha(json.dumps(projection,sort_keys=True,separators=(',',':')).encode())=='5c5a648c494691e3e13787fb5b7fdfa822356681b5f07c20e8465bbfdf10d12c','Pinned validation inventory/claims differ'
assert m['schema']=='tpnil-selector-recovery-validation@1'and m['nativeQualification']is False and m['committedSourceAdmission']=='PENDING_POSTCOMMIT_ACTUAL_CLI'
assert len(m['generatedFiles'])==2 and {e['path']for e in m['generatedFiles']}=={'README.md','verify.py'},'Generated verifier/document roles omitted or changed'
assert all(set(e)=={'path','bytes','sha256'}for e in m['generatedFiles'])
assert (root/'verify.py').read_bytes()==Path(__file__).read_bytes(),'Archived verifier differs from the trusted executing verifier'
raw={};physical={'validation.json'}
for e in m['files']+m['generatedFiles']:
 p=Path(e['path']);assert not p.is_absolute()and'..'not in p.parts and e['path']not in physical;physical.add(e['path']);f=root/p;assert f.is_file()and not f.is_symlink();b=f.read_bytes();assert len(b)==e['bytes']and sha(b)==e['sha256']
 if e.get('originalPath'):
  assert e['originalPath']not in raw;v=gzip.decompress(b)if e['encoding']=='gzip'else b;assert len(v)==e['originalBytes']and sha(v)==e['originalSha256'];raw[e['originalPath']]=v
assert {p.relative_to(root).as_posix()for p in root.rglob('*')if p.is_file()or p.is_symlink()}==physical
for e in m['linkedEvidence']:
 p=Path(e['path']);assert not p.is_absolute()and'..'not in p.parts;b=(repo/p).read_bytes();assert len(b)==e['bytes']and sha(b)==e['sha256'],e['path']
freeze=json.loads(raw['final/source2-freeze.json']);plan=json.loads(raw['final/source/'+m['nativePlan']['path']]);rust=json.loads(raw['final/source/'+m['rust']['path']]);old=json.loads((repo/m['originalPlan']['path']).read_bytes())
assert sha(raw['final/source/'+m['nativePlan']['path']])==m['nativePlan']['sha256']and sha(raw['final/source/'+m['rust']['path']])==m['rust']['sha256']
assert plan['conformanceInputs']==freeze['sourceInputs']==m['nativeInputs'];assert len(m['nativeInputs'])==394 and freeze['observations']==698
assert {k:v for k,v in plan.items()if k not in ['id','conformanceInputs','sourceBindingRevision','sourcePredecessor']}=={k:v for k,v in old.items()if k not in ['id','conformanceInputs','sourceBindingRevision','sourcePredecessor']},'Acceptance criteria changed'
assert plan['sourceBindingRevision']==2 and freeze['committedSourceAdmission']=='PENDING_POSTCOMMIT_ACTUAL_CLI'
changed=set(freeze['addedInputs']+freeze['changedExistingInputs']);assert len(changed)==11
for p,h in m['nativeInputs'].items():
 if p in changed:assert sha(raw['final/source/'+p])==h
 else:assert old['conformanceInputs'][p]==h
 if args.current_source:assert sha((repo/p).read_bytes())==h,p
 if args.staged:assert sha(subprocess.check_output(['git','show',':'+p],cwd=repo))==h,p
if args.current_source:
 for p,h in m['source7Carry']['closure'].items():assert sha((repo/p).read_bytes())==h,p
for p,h in m['additionalSource'].items():
 assert sha(raw['final/additional-source/'+p])==h
 if args.current_source:assert sha((repo/p).read_bytes())==h,p
 if args.staged:assert sha(subprocess.check_output(['git','show',':'+p],cwd=repo))==h,p
assert sha((root/'README.md').read_bytes())==m['readmeSha256']
for result in m['finalGates']:
 assert result['exitCode']==0;assert result['log'] in raw
 assert result['logSha256']==sha(raw[result['log']])
assert set(r['gate']for r in m['finalGates'])=={'core','check','standards','typecheck','synthesis','python','journals','integrations'}
core=raw[next(r['log']for r in m['finalGates']if r['gate']=='core')].decode();synth=raw[next(r['log']for r in m['finalGates']if r['gate']=='synthesis')].decode();synth=re.sub(r'\x1b\[[0-9;]*m','',synth)
assert 'ℹ fail 0'in core and f"ℹ pass {m['results']['corePass']}"in core
assert f"{m['results']['synthesisPass']} passed"in synth and f"{m['results']['synthesisSkip']} skipped"in synth
before=json.loads(raw[m['gateInventory']['before']]);after=json.loads(raw[m['gateInventory']['after']]);assert before['files']==after['files'],'Final gate source inventory drifted'
byname={e['path']:e['sha256']for e in before['files']}
for p,h in m['nativeInputs'].items():assert byname[p]==h,p
assert 'spawnSync git ENOBUFS'in raw['recovery/reproduce-before.stderr'].decode()
assert 'ℹ pass 27'in raw['recovery/focused-tests-final-image-ignore.log'].decode()
mechanical=json.loads(raw['recovery/replay-693-final-reader.stdout']);assert mechanical['verifiedSource']is True and mechanical['source']==m['originalSource']and mechanical['claim']=='SOURCE_PREFLIGHT_ONLY_NOT_NATIVE_QUALIFICATION'
assert m['results']['newNativeSessions']==0 and m['source7Carry']['run']==43249807970 and m['source7Carry']['newRuns']==0
print(json.dumps({'verified':True,'claim':m['claim'],'files':len(m['files']),'nativeInputs':394,'observations':698,'source7Carried':True,'newNativeSessions':0,'committedSourceAdmission':'PENDING_POSTCOMMIT_ACTUAL_CLI','nativeQualification':False,'results':m['results']}))
