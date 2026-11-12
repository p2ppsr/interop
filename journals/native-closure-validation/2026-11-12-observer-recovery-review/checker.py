from pathlib import Path
import json,hashlib,subprocess,tempfile,shutil,sys
repo=Path(__file__).resolve().parents[3];archive=repo/'journals/native-closure-validation/2026-11-12-observer-recovery';here=Path(__file__).parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def substitute_history(m):
 m['unchangedHistoricalJson'].pop(next(iter(m['unchangedHistoricalJson'])))
 raw=subprocess.check_output(['git','show','c648022b2d9209b7350527bd5553d73e3e82a52c:.nvmrc'],cwd=repo)
 m['unchangedHistoricalJson']['.nvmrc']=hashlib.sha256(raw).hexdigest()
mutations={
 'valid':lambda m:None,
 'omit-runtime-input':lambda m:m['runtimeInputs'].pop('synthesis/src/wallet-lab/native/failure.ts'),
 'native-plan-downgrade':lambda m:m['nativePlan'].update(predicates=426),
 'source6-executed-claim':lambda m:m.update(actualSource6Execution='PASS'),
 'omit-source6-input':lambda m:m['sourceFiles'].pop('scripts/frozen-component-replay.mjs'),
 'omit-all-completed-checks':lambda m:m['completedValidation'].update(checks=[]),
 'omit-all-linked-evidence':lambda m:m.update(linkedEvidence=[]),
 'replace-historical-json-with-arbitrary-git-file':substitute_history,
 'duplicate-linked-reference':lambda m:m['linkedEvidence'].__setitem__(1,m['linkedEvidence'][0]),
 'change-linked-reference-digest':lambda m:m['linkedEvidence'][0].update(sha256='00'*32),
 'unknown-charge-zero':lambda m:m['costs'].update(monetaryCharges=0),
 'promote-complete-conformance':lambda m:m.update(completeBRC100Conformance=True),
}
code='import importlib.util,sys,json;from pathlib import Path;s=importlib.util.spec_from_file_location("archive",sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(json.dumps(m.verify(Path(sys.argv[2]),Path(sys.argv[3]))))'
results=[]
for case,mutate in mutations.items():
 with tempfile.TemporaryDirectory(prefix='tpnil-coverage2-archive-review-')as t:
  p=Path(t).resolve()/'archive';shutil.copytree(archive,p);f=p/'validation.json';v=json.loads(f.read_text());mutate(v);f.write_text(json.dumps(v,indent=2)+'\n')
  r=subprocess.run([sys.executable,'-c',code,str(p/'verify.py'),str(p),str(repo)],capture_output=True,text=True)
  results.append({'case':case,'exitCode':r.returncode,'expected':'PASS'if case=='valid'else'REJECT','expectationMet':(r.returncode==0)==(case=='valid'),'stdout':r.stdout,'stderr':r.stderr})
review={'schema':'tpnil-coverage2-validation-mutation-review@1','claim':'ARCHIVE_SELF_TEST_NOT_NATIVE_QUALIFICATION','originalManifestSha256':sha(archive/'validation.json'),'nativeSessions':0,'status':'PASS'if all(x['expectationMet']for x in results)else'FINDING','results':results}
(here/'validation-mutations-final.json').write_text(json.dumps(review,indent=2)+'\n');print(json.dumps({'status':review['status'],'failures':[x['case']for x in results if not x['expectationMet']],'receiptSha256':sha(here/'validation-mutations-final.json')}))
