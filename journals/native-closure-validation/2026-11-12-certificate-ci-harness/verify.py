"""Verify retained local CI-harness evidence without generating native verdicts."""
from pathlib import Path
import gzip, hashlib, json, re, subprocess, sys

def sha(data): return hashlib.sha256(data).hexdigest()
def verify(here, root, current=False, staged=False):
 manifest=json.loads((here/'validation.json').read_text())
 assert manifest['schema']=='tpnil-certificate-ci-harness-validation@1'
 assert manifest['claim']=='LOCAL_ENGINEERING_PREFLIGHT_ONLY'
 assert manifest['nativeSessions']==0 and manifest['completeBRC100Conformance'] is False
 expected={};decoded={}
 for row in manifest['files']:
  name=row['path'];part=Path(name)
  assert not part.is_absolute() and '..' not in part.parts and str(part)==name
  assert name not in expected
  p=here/part;assert p.is_file() and not p.is_symlink()
  assert all(not parent.is_symlink() for parent in p.parents if parent!=here.parent)
  data=p.read_bytes();assert len(data)==row['bytes'] and sha(data)==row['sha256'],name
  raw=gzip.decompress(data) if row.get('encoding')=='gzip' else data
  if row.get('encoding')=='gzip':assert data[4:8]==b'\0\0\0\0'
  assert len(raw)==row['rawBytes'] and sha(raw)==row['rawSha256'],name
  expected[name]=row;decoded[name]=raw
 actual={str(p.relative_to(here)) for p in here.rglob('*') if p.is_file() and '__pycache__' not in p.parts}
 assert actual==set(expected)|{'validation.json'}
 review=json.loads(decoded[manifest['reviewPath']]);assert review['result']=='PASS' and review['nativeSessions']==0
 assert len(review['files'])==manifest['reviewedFiles']==61
 assert set(manifest['reviewBindings'])==set(review['files'])
 for source,target in manifest['reviewBindings'].items():
  raw=decoded[target];row=review['files'][source]
  assert sha(raw)==row['sha256'] and len(raw)==row['bytes'],source
 assert review['changedFiles']==manifest['correctedSourceInputs']
 for source,digest in review['actualDependencyFiles'].items():
  assert sha(decoded['dependency-source/'+source+'.gz'])==digest,source
 for source,digest in manifest['correctedSourceInputs'].items():
  raw=decoded['source/after/'+source+'.gz'];assert sha(raw)==digest
  if current:assert (root/source).read_bytes()==raw,source
 before=manifest['sourceBeforeCorrection'];assert before==review['sourceBeforeCorrection']
 for source,digest in manifest['originalSourceInputs'].items():
  raw=subprocess.check_output(['git','show',before+':'+source],cwd=root)
  assert sha(raw)==digest and raw==decoded['source/before/'+source+'.gz'],source
 for source in manifest['newSourceFiles']:
  assert subprocess.run(['git','cat-file','-e',before+':'+source],cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode!=0
 plan=json.loads(subprocess.check_output(['git','show',before+':'+manifest['nativePlan']['path']],cwd=root))
 assert manifest['nativePlan']=={'path':'infra/native/conformance/plan-pr368-coverage-1.json',**manifest['unchangedPlans']['infra/native/conformance/plan-pr368-coverage-1.json'],'predicates':535}
 assert plan['conformanceInputs']==manifest['runtimeInputs'] and len(manifest['runtimeInputs'])==157
 for source,digest in manifest['runtimeInputs'].items():
  assert sha(subprocess.check_output(['git','show',before+':'+source],cwd=root))==digest,source
 for name,row in manifest['unchangedPlans'].items():
  assert sha(subprocess.check_output(['git','show',before+':'+name],cwd=root))==row['sha256'],name
  assert sha((root/name).read_bytes())==row['sha256'] if current else True
 for name,row in manifest['linkedEvidence'].items():
  data=(root/name).read_bytes();assert sha(data)==row['sha256'] and len(data)==row['bytes'],name
  if row.get('rawSha256'):assert sha(gzip.decompress(data))==row['rawSha256']
 final=decoded[manifest['finalResults']['fullSynthesis']['path']].decode()
 assert '1043 passed | 62 skipped (1105)' in final and '64 passed | 3 skipped (67)' in final
 assert {k:v for k,v in manifest['finalResults']['fullSynthesis'].items() if k!='path'}=={'passed':1043,'skipped':62,'total':1105,'files':67}
 focused=decoded[manifest['finalResults']['focused']['path']].decode()
 assert '42 passed (42)' in focused and {k:v for k,v in manifest['finalResults']['focused'].items() if k!='path'}=={'passed':42,'certificatePassed':39,'diagnosticsPassed':3}
 typecheck=decoded[manifest['finalResults']['typecheckPath']].decode();assert 'tsc --noEmit' in typecheck and not re.search(r'error TS\d+',typecheck)
 assert manifest['finalResults']['totalsAreAdditive'] is False
 for key in ['subprocessFailure','postReferenceAssertionFailure']:
  row=json.loads(decoded[manifest['negativeControlPaths'][key]]);assert row['exitCode']==1
 assert json.loads(decoded[manifest['negativeControlPaths']['subprocessFailure']])['unhandledSourceMapMasking'] is False
 retained=json.loads(decoded[manifest['negativeControlPaths']['postReferenceAssertionFailure']])
 assert retained['sourceBeforeAfterEqual'] and retained['childCleanupFailures']==[]
 primary=json.loads(decoded[manifest['primaryReproductionPath']]);assert primary['exitCode']==1 and primary['timedOut'] is False
 stderr=decoded['evidence/out/native-closure-20261111/ci-source-map-review/dependency-absent-2.stderr.log.gz'].decode()
 assert "Cannot find module 'mongodb-memory-server'" in stderr and "code: 'MODULE_NOT_FOUND'" in stderr
 if staged:
  prefix=here.relative_to(root).as_posix()+'/'
  indexed=set(subprocess.check_output(['git','ls-files','--cached','-z','--',here.relative_to(root).as_posix()],cwd=root).decode().split('\0'))-{''}
  assert indexed=={prefix+n for n in actual},'Archive files missing from Git index'
 return {'verified':True,'claim':manifest['claim'],'files':len(expected),'reviewedFiles':61,'runtimeInputs':157,'fullSynthesisPassed':1043,'fullSynthesisSkipped':62,'separateCertificatePassed':39,'diagnosticsAlreadyIncluded':3,'nativeSessions':0,'currentSourceChecked':current,'stagedInventoryChecked':staged}
if __name__=='__main__':
 here=Path(__file__).resolve().parent
 print(json.dumps(verify(here,here.parents[2],'--current-source' in sys.argv,'--staged' in sys.argv),indent=2))
