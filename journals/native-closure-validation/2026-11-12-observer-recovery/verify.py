"""Verify source-bound observer recovery engineering evidence, never native qualification."""
from pathlib import Path
import gzip,hashlib,json,re,subprocess,sys

COMPLETION_SHA256='4ed3ef8c8d14e7e11af2f6f9012f3b08727d8335f4691a17def8944cec2980d9'
LINKED_EVIDENCE_SHA256='33b3af0e2fe464d002dbe1ca06eccebeb61b366110daff0505b5ea635f7e6b7f'
def sha(b):return hashlib.sha256(b).hexdigest()
def safe(name):
 p=Path(name);assert not p.is_absolute() and '..' not in p.parts and str(p)==name and name
 return p
def verify(here,root,current=False,staged=False):
 m=json.loads((here/'validation.json').read_text())
 assert m['schema']=='tpnil-native-observer-recovery-validation@1'
 assert m['claim']=='LOCAL_ENGINEERING_PREFLIGHT_ONLY' and m['nativeSessions']==0 and m['completeBRC100Conformance'] is False
 assert m['actualSource6Execution']=='PENDING_CLEAN_COMMITTED_SOURCE_AND_CI'
 assert m['sourceBeforeCorrection']=='c648022b2d9209b7350527bd5553d73e3e82a52c'
 decoded={};sources={}
 for row in m['files']:
  name=row['path'];p=here/safe(name);assert name not in decoded and p.is_file() and not p.is_symlink()
  assert all(not q.is_symlink() for q in [p,*p.parents] if q!=here.parent)
  b=p.read_bytes();assert len(b)==row['bytes'] and sha(b)==row['sha256'],name
  if row['encoding']=='gzip':assert b[4:8]==b'\0'*4;raw=gzip.decompress(b)
  else:assert row['encoding']=='identity';raw=b
  assert len(raw)==row['rawBytes'] and sha(raw)==row['rawSha256'],name
  decoded[name]=raw
 assert {p.relative_to(here).as_posix() for p in here.rglob('*') if p.is_file() and '__pycache__' not in p.parts}==set(decoded)|{'validation.json'}
 for name,digest in m['sourceFiles'].items():
  raw=decoded['source/'+name+'.gz'];assert sha(raw)==digest,name;sources[name]=raw
  if current:assert (root/safe(name)).read_bytes()==raw,name
 planname='infra/native/conformance/plan-pr368-coverage-2.json';plan=json.loads(sources[planname])
 assert m['nativePlan']=={'path':planname,'sha256':sha(sources[planname]),'predicates':535}
 assert plan['itcve']=='ITCVE-1@4.4.0' and plan['program']=='ISI-4@5.4.0' and plan['coverageRevision']==2 and plan['admissionState']=='FROZEN'
 assert plan['expectedObservations']==535 and plan['conformanceInputs']==m['runtimeInputs'] and len(m['runtimeInputs'])==164
 for name,digest in m['runtimeInputs'].items():assert sha(sources[name])==digest,name
 frozen=json.loads(decoded[m['freezeReceipt']]);assert frozen['sourceInputs']==m['runtimeInputs'] and frozen['inputs']==164 and frozen['nativeSessions']==0
 assert frozen['plan']=={'path':planname,'sha256':sha(sources[planname])}
 rustname='infra/native/conformance/rust-graph-pr368-coverage-2.json';rust=json.loads(sources[rustname])
 assert frozen['rust']=={'path':rustname,'sha256':sha(sources[rustname])}
 assert rust['nativePlan']=={'path':planname,'profile':'ITCVE-1@4.4.0','program':'ISI-4@5.4.0','sha256':sha(sources[planname])}
 assert rust['variant']=='integrated-native-conformance-pr368-coverage-2' and rust['sourceBindingRevision']==5
 for name,digest in rust['sources'].items():assert sha(sources[name])==digest,name
 reevalname='infra/native/conformance/reevaluation-42711700295-rust-3.0.0-source-6.json';reeval=json.loads(sources[reevalname])
 assert frozen['reevaluation']=={'path':reevalname,'sha256':sha(sources[reevalname])}
 assert reeval['sourceBindingRevision']==6 and reeval['expected']=={'repetitions':2,'nativeAssertions':280,'integratedAssertions':77,'rustAssertions':48}
 assert reeval['predecessor']['path']=='infra/native/conformance/reevaluation-42711700295-rust-3.0.0-source-5.json'
 for name,digest in reeval['evaluatorSources'].items():assert sha(sources[name])==digest,name
 oldname='infra/native/conformance/plan-pr368-coverage-1.json'
 oldbytes=subprocess.check_output(['git','show',m['sourceBeforeCorrection']+':'+oldname],cwd=root);old=json.loads(oldbytes)
 for key in ['wallet','walletCandidate','coverageModules','expectedObservations','compatibilityPatch','compatibilityPatchSha256','permissionFixture','permissionCoverageOracle','permissionCoverageOracleManifest']:assert plan[key]==old[key],key
 assert plan['wallet']['version']=='5.1.1-pr368.4a954ac' and plan['compatibilityPatch']=='infra/adapters/storage-sqlite-retry/patch.lock.json'
 assert sum(x['assertions'] for x in plan['coverageModules'].values())==109
 assert json.loads(sources['itcves/ITCVE-1/4.4.0/profile.json'])['nativeConformance']['assertions']==json.loads(subprocess.check_output(['git','show',m['sourceBeforeCorrection']+':itcves/ITCVE-1/4.3.0/profile.json'],cwd=root))['nativeConformance']['assertions']
 for name,digest in m['unchangedHistoricalJson'].items():
  assert sha(subprocess.check_output(['git','show',m['sourceBeforeCorrection']+':'+name],cwd=root))==digest,name
  if current:assert sha((root/name).read_bytes())==digest,name
 expectedHistorical=set(p for p in subprocess.check_output(['git','ls-tree','-r','--name-only',m['sourceBeforeCorrection'],'infra/native/conformance','itcves/ITCVE-1','programs/ISI-4'],cwd=root,text=True).splitlines() if p.endswith('.json'))
 assert set(m['unchangedHistoricalJson'])==expectedHistorical and len(expectedHistorical)==94
 assert len(m['linkedEvidence'])==9
 assert sha(json.dumps(m['linkedEvidence'],sort_keys=True,separators=(',',':')).encode())==LINKED_EVIDENCE_SHA256
 for row in m['linkedEvidence']:
  b=(root/safe(row['path'])).read_bytes();assert len(b)==row['bytes'] and sha(b)==row['sha256'],row['path']
 diag=json.loads(decoded[m['diagnosisReview']]);assert diag['run']==43195585984 and diag['nativeQualification'] is False and diag['newNativeSessions']==0
 assert len(diag['files'])==25 and diag['localValidation']['correctionTests']['passed']==86
 assert diag['scope']['complete535']=='NOT_AVAILABLE' and diag['scope']['extension']['callsExecuted']==1 and diag['scope']['extension']['scenarioCallsAfterIdentity']==0
 for row in diag['files']:
  raw=decoded['diagnosis/'+row['path']+'.gz'];assert len(raw)==row['bytes'] and sha(raw)==row['sha256'],row['path']
 for row in diag['correctionSource']:assert sha(sources[row['path']])==row['sha256']
 cleanup=json.loads(decoded[m['cleanupReview']]);assert cleanup['blockingFindings']==[] and cleanup['nativeAssertionsAccepted']==0 and cleanup['reviewedTestEvidence']['passed']==25
 for row in cleanup['files']:assert sha(sources[row['path']])==row['sha256'],row['path']
 assert sha(decoded['recovery/shutdown-tests-2.log.gz'])==cleanup['reviewedTestEvidence']['sha256']
 prior=json.loads(decoded['scaffolding/freeze-1.json.gz'])
 assert prior['sourceInputs']==frozen['sourceInputs'] and prior['plan']==frozen['plan'] and prior['rust']==frozen['rust']
 priorSource6=decoded['scaffolding/freeze1-sources/'+reevalname+'.gz'];assert sha(priorSource6)==prior['reevaluation']['sha256']
 for name,digest in json.loads(decoded['scaffolding/freeze1-sources/inventory.json.gz']).items():assert sha(decoded['scaffolding/freeze1-sources/'+name+'.gz'])==digest
 for name,digest in json.loads(priorSource6)['evaluatorSources'].items():assert sha(decoded['scaffolding/freeze1-sources/'+name+'.gz'])==digest
 independent=json.loads(decoded['independent/review.json.gz'])
 assert independent['status']=='PASS' and independent['nativeSessions']==0 and independent['remainingBlockingFindings']==[]
 assert independent['planSha256']==m['nativePlan']['sha256'] and independent['rustCompatibilitySha256']==frozen['rust']['sha256'] and independent['reevaluationSha256']==frozen['reevaluation']['sha256']
 assert len(independent['files'])==14
 prefix='out/native-closure-20261111/coverage2-independent-review/'
 for name,row in independent['files'].items():
  assert name.startswith(prefix);raw=decoded['independent/'+name[len(prefix):]+'.gz'];assert len(raw)==row['size'] and sha(raw)==row['sha256']
 changes=json.loads(decoded['scaffolding/final-change-inventory.json.gz'])
 for name,digest in changes.items():assert sha(sources[name])==digest,name
 assert m['resultsAreAdditive'] is False and m['costs']['nativeSessions']==0
 assert all(m['costs'][key] is None for key in ['monetaryCharges','operatorCost','developmentAgentCost'])
 assert sha(decoded['completion.json.gz'])==COMPLETION_SHA256
 complete=json.loads(decoded['completion.json.gz']);assert complete==m['completedValidation'] and complete['completed'] is True
 for check in complete['checks']:
  assert check['exitCode']==0 and isinstance(check['expected'],list) and check['expected']
  raw=decoded[m['logBindings'][check['sourcePath']]];assert sha(raw)==check['sha256'] and len(raw)==check['bytes']
  text=raw.decode()
  for token in check['expected']:assert token in text,(check['sourcePath'],token)
 assert set(m['logBindings'])=={x['sourcePath'] for x in complete['checks']}
 failed=decoded['scaffolding/selector-tests-1.log.gz'].decode();assert 'pass 19' in failed and 'fail 1' in failed and 'yoursPr368Coverage1Artifact is not defined' in failed
 if staged:
  prefix=here.relative_to(root).as_posix()+'/'
  indexed=set(subprocess.check_output(['git','ls-files','--cached','-z','--',here.relative_to(root).as_posix()],cwd=root).decode().split('\0'))-{''}
  assert indexed=={prefix+n for n in set(decoded)|{'validation.json'}},'Archive Git index differs'
 return {'verified':True,'claim':m['claim'],'files':len(decoded),'sourceFiles':len(sources),'runtimeInputs':164,'historicalJson':94,'nativeSessions':0,'currentSourceChecked':current,'stagedInventoryChecked':staged}
if __name__=='__main__':
 here=Path(__file__).resolve().parent
 print(json.dumps(verify(here,here.parents[2],'--current-source' in sys.argv,'--staged' in sys.argv),indent=2))
