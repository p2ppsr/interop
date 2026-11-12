"""Materialize once, only after explicit terminal validation completion receipt exists."""
from pathlib import Path
import gzip,hashlib,json,subprocess
root=Path.cwd();work=root/'out/native-closure-20261111/coverage2-scaffolding'
here=root/'journals/native-closure-validation/2026-11-12-observer-recovery'
def sha(b):return hashlib.sha256(b).hexdigest()
def read(p):return json.loads(p.read_text())
complete=read(work/'completion.json');assert complete['completed'] is True
for c in complete['checks']:
 b=(root/c['sourcePath']).read_bytes();assert c['exitCode']==0 and c['bytes']==len(b) and c['sha256']==sha(b)
 assert c['expected'] and all(t in b.decode() for t in c['expected'])
assert not here.exists(),'Archive already materialized; preserve it before any separate correction'
here.mkdir(parents=True)
files=[]
def store(name,raw,compressed=True):
 dest=here/name;assert not dest.exists();dest.parent.mkdir(parents=True,exist_ok=True)
 b=gzip.compress(raw,compresslevel=9,mtime=0) if compressed else raw;dest.write_bytes(b)
 files.append({'path':name,'bytes':len(b),'sha256':sha(b),'rawBytes':len(raw),'rawSha256':sha(raw),'encoding':'gzip' if compressed else 'identity'})
def copy(name,p):store(name,p.read_bytes())
freeze=read(work/'freeze-2.json');assert freeze['inputs']==164
planname=freeze['plan']['path'];plan=read(root/planname)
assert plan['conformanceInputs']==freeze['sourceInputs']
names=set(plan['conformanceInputs'])|{freeze[x]['path'] for x in ['plan','rust','reevaluation']}
names.update(read(root/freeze['reevaluation']['path'])['evaluatorSources'])
for name,digest in read(work/'final-change-inventory.json').items():
 assert sha((root/name).read_bytes())==digest,name
 names.add(name)
sourcefiles={}
for p in sorted(names):
 b=(root/p).read_bytes();sourcefiles[p]=sha(b);store('source/'+p+'.gz',b)
for p in sorted(work.rglob('*')):
 if p.is_file() and '__pycache__' not in p.parts and p.name not in ['completion.json']:
  copy('scaffolding/'+p.relative_to(work).as_posix()+'.gz',p)
copy('completion.json.gz',work/'completion.json')
diagdir=root/'out/native-review-43195585984/independent-diagnosis';diag=read(diagdir/'review.json')
copy('diagnosis/review.json.gz',diagdir/'review.json')
for row in diag['files']:
 b=(diagdir/row['path']).read_bytes();assert len(b)==row['bytes'] and sha(b)==row['sha256'];store('diagnosis/'+row['path']+'.gz',b)
independent=root/'out/native-closure-20261111/coverage2-independent-review'
for p in sorted(independent.rglob('*')):
 if p.is_file() and '__pycache__' not in p.parts:copy('independent/'+p.relative_to(independent).as_posix()+'.gz',p)
recovery=root/'out/native-closure-20261111/observer-recovery'
for p in sorted(recovery.iterdir()):
 if p.is_file() and p.suffix in ['.log','.json','.py','.mjs','.ts','.txt','.diff']:
  assert p.stat().st_size<20*1024*1024,'Review oversized recovery file explicitly: '+str(p)
  copy('recovery/'+p.name+'.gz',p)
logBindings={}
for c in complete['checks']:
 p=root/c['sourcePath']
 if p.parent==recovery:target='recovery/'+p.name+'.gz'
 elif p.parent==work:target='scaffolding/'+p.name+'.gz'
 elif p.parent==diagdir:target='diagnosis/'+p.name+'.gz'
 else:target='validation/'+p.name+'.gz';copy(target,p)
 logBindings[c['sourcePath']]=target
source='c648022b2d9209b7350527bd5553d73e3e82a52c'
oldpaths=subprocess.check_output(['git','ls-tree','-r','--name-only',source,'infra/native/conformance','itcves/ITCVE-1','programs/ISI-4'],cwd=root,text=True).splitlines()
historical={p:sha(subprocess.check_output(['git','show',source+':'+p],cwd=root)) for p in oldpaths if p.endswith('.json')}
links=['journals/integrated-native-attempts/2026-11-12/43195585984/attempt.json','journals/integrated-native-attempts/2026-11-12/43195585984/diagnosis.json','journals/integrated-native-attempts/2026-11-12/43195585984/review/prepare.stderr.log','journals/integrated-native-attempts/2026-11-12/43195585984/native-integrated.zip','journals/integrated-native-attempts/2026-11-12/43195585984/original/run-lock.json','journals/native-closure-validation/2026-11-12-native5-review/manifest.json','journals/native-closure-ci/2026-11-12/c648022/manifest.json','journals/native-closure-ci/2026-11-12/c648022/summary.json','fixtures/artifacts/yours-wallet-pr368-4a954ac/provenance.json']
linked=[{'path':p,'bytes':len((root/p).read_bytes()),'sha256':sha((root/p).read_bytes())} for p in links]
readme='''# Native observer recovery validation\n\nThis archive records local engineering validation for ITCVE-1 4.4.0 / ISI-4 5.4.0, coverage revision 2. It retains the same exact Yours 4a954ac candidate, final SQLite-retry Go chain, 535 predicate identities and normative policy bytes. It corrects observer-owned identity consent and prompt binding, extension settings-page ownership after browser restart, complete evidence-bundle profile admission, and preservation of primary failures during cleanup.\n\nThe executed coverage1 plan and failed attempt5 remain unchanged. Attempt5 has 91 retained members, one incomplete repetition and no complete535 result, second repetition or Rust result. Its 29 base permission PASS labels are scoped observations. Its 15 extension FAIL labels arose after one observer-denied identity call; later extension cases did not execute. Physical cleanup completed; three missing later evidence bindings masked the original settings-page error. The correction does not fabricate those missing records.\n\nThe source inventory, separate Rust selector and source6 reevaluation plan are byte-bound here. The source6 plan is prepared to replay retained native evidence with no new native session. Actual source6 execution is pending a clean committed source and its required CI run; local lineage checks and historical publication replay do not substitute for that execution. Its historical sources and predecessors remain immutable. Full-suite and focused counts overlap; they must not be added. Earlier failed harness samples are retained, including the synthetic startup fixture symbol error and the initial Chromium/HTML test setup failures. The first source6 freeze is separately retained before correction of the source-archive buffering limit. The final materializer writes an exact Git archive to bounded temporary storage and verifies every expected Git blob; the original c648 ENOBUFS failure remains linked, with separate large-archive and export-attribute mutation controls.\n\nThe first unpublished validation seal accepted two manifest-only omission counterexamples: an empty linked-evidence inventory, and a substituted historical path while retaining its count. Its exact original manifest/verifier/build source and all failed review receipts are retained. This corrected verifier pins all nine external evidence links and derives the exact 94 historical JSON paths from the immutable c648 Git tree. No native qualification, official-release qualification, complete BRC100 conformance or cost improvement is claimed. Monetary charges, operator cost and development-agent cost remain unknown; local engineering validation allocates no new native session. Candidate ZIPs, prior CI evidence and the original failed native ZIP are referenced by digest instead of duplicated. The first publication validation rejected an unpublished review sidecar placed inside the strictly inventoried native-attempt category. Its failed log and original sidecar bytes remain retained; the corrected review lives in a separate validation directory. The original native archive is unchanged.\n\nRun `python3 journals/native-closure-validation/2026-11-12-observer-recovery/verify.py --current-source` to check the full inventory, source/plan equality, frozen historical JSON, linked evidence and terminal validation receipts. Omit `--current-source` when replaying this archive after later source changes.\n'''
store('README.md',readme.encode(),False)
store('verify.py',(work/'verify-archive.py').read_text().replace('__COMPLETION_SHA256__',sha((work/'completion.json').read_bytes())).replace('__LINKED_EVIDENCE_SHA256__',sha(json.dumps(linked,sort_keys=True,separators=(',',':')).encode())).encode(),False)
store('build.py',(work/'build-archive.py').read_bytes(),False)
m={'schema':'tpnil-native-observer-recovery-validation@1','claim':'LOCAL_ENGINEERING_PREFLIGHT_ONLY','nativeSessions':0,'completeBRC100Conformance':False,'actualSource6Execution':'PENDING_CLEAN_COMMITTED_SOURCE_AND_CI','sourceBeforeCorrection':source,'correctionSourceCommit':None,'nativePlan':{'path':planname,'sha256':sha((root/planname).read_bytes()),'predicates':535},'runtimeInputs':plan['conformanceInputs'],'sourceFiles':sourcefiles,'unchangedHistoricalJson':historical,'freezeReceipt':'scaffolding/freeze-2.json.gz','diagnosisReview':'diagnosis/review.json.gz','cleanupReview':'recovery/cost-review-failure-preservation.json.gz','linkedEvidence':linked,'resultsAreAdditive':False,'completedValidation':complete,'logBindings':logBindings,'costs':{'nativeSessions':0,'monetaryCharges':None,'operatorCost':None,'developmentAgentCost':None},'files':sorted(files,key=lambda x:x['path'])}
(here/'validation.json').write_text(json.dumps(m,indent=2)+'\n')
print(json.dumps({'path':str(here.relative_to(root)),'files':len(files),'bytes':sum(x['bytes'] for x in files),'manifestSha256':sha((here/'validation.json').read_bytes())},indent=2))
