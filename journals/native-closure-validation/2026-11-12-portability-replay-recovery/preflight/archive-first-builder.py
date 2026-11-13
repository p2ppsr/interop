from pathlib import Path
import hashlib,json,gzip,subprocess,shutil
R=Path.cwd(); O=R/'out/native-closure-20261111/portability-archive-source-correction'; A=R/'journals/native-closure-validation/2026-11-12-portability-replay-recovery'
assert not A.exists(); A.mkdir(parents=True)
def sha(b):return hashlib.sha256(b).hexdigest()
def j(v):return json.dumps(v,indent=2)+'\n'
records=[]
def retain(origin,name):
 b=(R/origin).read_bytes(); target=A/name; encoded=gzip.compress(b,mtime=0) if name.endswith('.gz') else b; target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(encoded);records.append({'path':name,'origin':str(origin),'bytes':len(encoded),'sha256':sha(encoded),'encoding':'gzip' if name.endswith('.gz') else 'identity','decodedBytes':len(b),'decodedSha256':sha(b)})
# Append-only copies: provisional passes and rejected review are separate from final validation.
for f in sorted(O.iterdir()):
 if f.is_file() and f.name!='build-archive.py':retain(f.relative_to(R), 'preflight/'+f.name+('.gz' if f.suffix in ['.log','.diff'] else ''))
for f in sorted((R/'out/native-closure-20261111/archive-binding-recovery').iterdir()):
 if f.is_file():retain(f.relative_to(R),'independent/'+f.name+('.gz' if f.suffix=='.log' else ''))
for p in ['scripts/verify-native-portability-archive.mjs','test/native-portability-archive.test.mjs','scripts/verify-native-nosend-oracle4-archive.mjs']:
 retain(p,'source/'+p)
for p in ['infra/native/conformance/plan-pr368-coverage-2.json','infra/native/conformance/rust-graph-pr368-coverage-2.json','infra/native/conformance/reevaluation-42711700295-rust-3.0.0-source-6.json']:
 retain(p,'frozen/'+p)
retain(O.relative_to(R)/'build-archive.py','build-archive.py')
plan=json.loads((R/'infra/native/conformance/plan-pr368-coverage-2.json').read_text()); reeval=json.loads((R/'infra/native/conformance/reevaluation-42711700295-rust-3.0.0-source-6.json').read_text())
for p,h in {**plan['conformanceInputs'],**reeval['evaluatorSources']}.items():assert sha((R/p).read_bytes())==h
links=[]
for p in ['journals/native-closure-ci/2026-11-12/e47873a/manifest.json','journals/native-closure-validation/2026-11-12-observer-recovery/validation.json','journals/native-portability-reference/2026-11-09/signed-completion-v3/summary.json','journals/native-portability-reference/2026-11-09/signed-completion-v3/evidence.json.gz']:
 b=(R/p).read_bytes();links.append({'path':p,'bytes':len(b),'sha256':sha(b)})
readme='''# Portability archive replay recovery\n\nThe e47873a Foundation run failed because the historical producer was compared with the prospective4.4 producer. The retained producer is now pinned to its original d059d4e Git blob. Semantic replay executes the complete1520-file historical source tree, including producer imports, under Node24.22.1 and checked synthesis package/lock/installed metadata. No current producer executes.\n\nThe original three engineering samples remain twoFAIL and onePASS with nine assertions. No native session, new qualification, policy change or historical evidence rewrite occurred. All164 native inputs and five source6 evaluator inputs remain unchanged.\n\nFinal local validation:196core tests,15focused regressions (included in196), fivePython tests, catalog/Go checks and the actual historical semantic CLI pass. Independent review passes. Initial10test/provisional semantic passes were rejected by review because producer imports were still mutable; the next draft omitted installed metadata admission. Both drafts and findings remain. The ambientNode26 full-core attempt failed its requiredNode24 guard; pinnedNode24 runs pass. Root's checks after the failedCI step are retained separately.\n\nRun `python3 verify.py` here for standalone integrity/semantic-count checks, or add `--current-source` to compare repository source and linked evidence. Source/CI receipts are engineering validation only. The next native execution remains pending.\n'''
(A/'README.md').write_text(readme)
records.append({'path':'README.md','origin':'generated','bytes':len(readme.encode()),'sha256':sha(readme.encode()),'encoding':'identity','decodedBytes':len(readme.encode()),'decodedSha256':sha(readme.encode())})
manifest={'schema':'tpnil-portability-replay-recovery-validation@1','claim':'ENGINEERING_SOURCE_VALIDATION_ONLY','sourceBase':'e47873a952c4fbb25bae241aadf41863104ae977','nativeSessions':0,'nativeQualification':False,'actualNewNativeExecution':'PENDING','monetaryCost':None,'operatorCost':None,'agentCost':None,'checks':{'core':{'PASS':196,'FAIL':0,'SKIP':0},'focused':{'PASS':15,'includedInCore':True},'python':{'PASS':5},'catalogAndGo':'PASS','historicalSemanticReplay':{'result':'PASS','sourceFiles':1520,'retainedFailures':2,'attempts':3,'assertions':9},'independentReview':'PASS'},'nativeInputs':plan['conformanceInputs'],'source6Inputs':reeval['evaluatorSources'],'linkedEvidence':links,'files':sorted(records,key=lambda r:r['path'])}
(A/'validation.json').write_text(j(manifest))
# The verifier binds required member and link inventories independently of mutable manifest lists.
verifier='''#!/usr/bin/env python3
from pathlib import Path
import json,hashlib,gzip,sys,re
A=Path(__file__).resolve().parent
R=A.parents[3]
def sha(b):return hashlib.sha256(b).hexdigest()
m=json.loads((A/'validation.json').read_text())
assert m['schema']=='tpnil-portability-replay-recovery-validation@1'
assert m['claim']=='ENGINEERING_SOURCE_VALIDATION_ONLY'
assert m['sourceBase']=='e47873a952c4fbb25bae241aadf41863104ae977'
assert m['nativeSessions']==0 and m['nativeQualification'] is False and m['actualNewNativeExecution']=='PENDING'
assert all(m[k] is None for k in ['monetaryCost','operatorCost','agentCost'])
assert m['checks']==CHECKS
assert m['linkedEvidence']==LINKS
assert [x['path'] for x in m['files']]==MEMBERS
assert sorted(str(x.relative_to(A)) for x in A.rglob('*') if x.is_file())==sorted(MEMBERS+['validation.json','verify.py'])
decoded={}
for row in m['files']:
 p=A/row['path'];assert not p.is_symlink();b=p.read_bytes();assert len(b)==row['bytes'] and sha(b)==row['sha256']
 d=gzip.decompress(b) if row['encoding']=='gzip' else b;assert row['encoding'] in ['gzip','identity'];assert len(d)==row['decodedBytes'] and sha(d)==row['decodedSha256'];decoded[row['path']]=d
plan=json.loads(decoded['frozen/infra/native/conformance/plan-pr368-coverage-2.json'])
assert sha(decoded['frozen/infra/native/conformance/plan-pr368-coverage-2.json'])=='b7b2dcd4ed50df0cd5ce3b9d4c2828b1be3953d6da4a34a3f9cd31fceb57b1cd'
assert m['nativeInputs']==plan['conformanceInputs'] and len(m['nativeInputs'])==164
r=json.loads(decoded['frozen/infra/native/conformance/reevaluation-42711700295-rust-3.0.0-source-6.json'])
assert sha(decoded['frozen/infra/native/conformance/reevaluation-42711700295-rust-3.0.0-source-6.json'])=='2a2401e1e8150ff21e966ca9aeb540ee10e527c47dcd183fc72bb708d0c6959f'
assert m['source6Inputs']==r['evaluatorSources'] and len(m['source6Inputs'])==5
assert json.loads(decoded['preflight/runtime-before.json'])==json.loads(decoded['preflight/runtime-after.json'])==m['nativeInputs']
for name,count in [('core-tests-3.log.gz',196),('focused-tests-3.log.gz',15)]:
 text=decoded['preflight/'+name].decode();assert re.search(r'pass '+str(count)+r'\\b',text) and re.search(r'fail 0\\b',text) and re.search(r'skipped 0\\b',text)
assert 'Ran 5 tests' in decoded['preflight/python-tests-3.log.gz'].decode() and '\\nOK' in decoded['preflight/python-tests-3.log.gz'].decode()
receipt=json.loads(decoded['preflight/frozen-semantic-2.stdout.log.gz'])
assert receipt['verified'] is True and receipt['attempts']==3 and receipt['retainedFailures']==2 and receipt['nativeEngineeringAssertions']==9
assert receipt['semanticSourceFiles']==1520 and receipt['semanticSource']=='d059d4e2794a83600610c0bccb82d86b69fe6c7d' and receipt['currentProducerExecuted'] is False and receipt['replayCleanup'] is True
assert receipt['installedPackages']>0 and re.fullmatch('[a-f0-9]{64}',receipt['installedLockSha256'])
review=json.loads(decoded['independent/independent-final-review.json']);assert review['result']=='PASS'
for row in review['files']:assert sha(decoded['source/'+row['path']])==row['sha256']
if '--current-source' in sys.argv:
 for p,h in {**m['nativeInputs'],**m['source6Inputs']}.items():assert sha((R/p).read_bytes())==h,p
 for row in m['files']:
  if row['path'].startswith('source/'):assert (R/row['path'][7:]).read_bytes()==decoded[row['path']],row['path']
 for row in LINKS:
  b=(R/row['path']).read_bytes();assert len(b)==row['bytes'] and sha(b)==row['sha256'],row['path']
print(json.dumps({'verified':True,'files':len(MEMBERS),'nativeInputsUnchanged':164,'source6InputsUnchanged':5,'nativeSessions':0,'corePASS':196,'focusedPASS':15,'pythonPASS':5,'historicalReplay':True,'currentSourceChecked':'--current-source' in sys.argv}))
'''
verifier=verifier.replace('CHECKS',repr(manifest['checks'])).replace('LINKS',repr(links)).replace('MEMBERS',repr([r['path'] for r in manifest['files']]))
(A/'verify.py').write_text(verifier)
print(j({'archive':str(A.relative_to(R)),'files':len(records),'manifestSha256':sha((A/'validation.json').read_bytes())}))
