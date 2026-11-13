from pathlib import Path
import json,hashlib,shutil,subprocess,re,datetime
r=Path.cwd();old='3aac88975fc0f4e911fcf10fea6c8158f7760534';source=subprocess.check_output(['git','rev-parse','HEAD']).decode().strip();assert source!=old;order=Path('/Users/tyeverett/projects/network-ops/artifacts/ops/itcve-native-closure-20261111/attempt-26-go11-order/work-order.json');o=json.loads(order.read_bytes());assert o['source']==source;sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
for n in ['source18-validation','source18-ci','source18-replay','source18-reevaluation-replay']:(r/'out'/n).mkdir(exist_ok=False)
def convert(s):
 s=s.replace(old,source).replace('source17','source18').replace('attempt-25-summary-codec-order','attempt-26-go11-order').replace('plan-pr368-coverage-6-source-7.json','plan-pr368-coverage-6-source-8.json').replace('rust-graph-pr368-coverage-6-source-7.json','rust-graph-pr368-coverage-6-source-8.json').replace('reevaluation-42711700295-rust-3.0.0-source-10.json','reevaluation-42711700295-rust-3.0.0-source-11.json').replace('out/current-task-state-v10.json','out/current-task-state-v11.json')
 return re.sub(r'(?<![A-Za-z0-9])457(?![A-Za-z0-9])','471',s).replace('native19','native20').replace('Native19','Native20')
for n in ['capture-completed.py','capture-native.py','intake-native.py']:(r/'out/source18-ci'/n).write_text(convert((r/'out/source17-ci'/n).read_text()))
for n in ['monitor-prerequisites.py','after-reevaluation.py','after-prerequisites.py','monitor-native.py','after-native.py','watch-native.py','dispatch-native.py']:
 s=convert((r/'out/source17-validation'/n).read_text()).replace('05c4079116f2408f40b4924d4344ca2c8416e3deba2bf3381228aaab18f669ed',sha(order)).replace('82331+sum(totals.values())','87710+sum(totals.values())').replace("('1819','126')","('1831','126')").replace("'synthesisPASS':1819","'synthesisPASS':1831")
 if n=='monitor-prerequisites.py':s=s.replace("else['workflow_dispatch']","else['push']")
 if n=='after-prerequisites.py':s=s.replace("('cancelled'if x['event']=='push'else'success')","('cancelled'if x['name']=='Foundation checks'and x['event']=='push'else'success')")
 if n=='dispatch-native.py':
  s=s.replace("('workflow_dispatch'if reeval else'push'if duplicate else'pull_request')","('push'if reeval or duplicate else'pull_request')")
  needle="ciTestCounts={'corePASS':235";a=s.index(needle);b=s.index('\n',a)
  s=s[:b]+"\nfrom zipfile import ZipFile\nreference=next(x for x in acquisition['files']if x.get('artifactName')=='go11-portability-reference');assert sha((ciHome/reference['path']).read_bytes())==reference['sha256']\nwith ZipFile(ciHome/reference['path'])as z:\n ref=json.loads(z.read('verification.json'));record=json.loads(z.read('portability.json'));assert ref['verified']and ref['result']=='PASS'and ref['mode']=='reference-engineering'and len(ref['assertions'])==9 and all(x['result']=='PASS'for x in ref['assertions']);assert all(record['components'][k]['go']['compatibilityPatch']['schema']=='tpnil-storage-sync-order-go-build@1.0.0'and record['components'][k]['go']['compatibilityPatch']['patchLockSha256']==o['Go11']['patchLockSha256']for k in ['source','replacement'])\nciTestCounts['directGo11ReplacementPASS']=9\n"+s[b:]
 if n=='after-native.py':s=s.replace('2026-11-13T13:37:32.351139+00:00',(datetime.datetime.fromisoformat(o['deadline'])+datetime.timedelta(minutes=20)).isoformat())
 (r/'out/source18-validation'/n).write_text(s)
(r/'out/source18-reevaluation-replay/replay.mjs').write_text(convert((r/'out/source17-reevaluation-replay/replay.mjs').read_text()))
for n in ['prepare.mjs','inventory.py','guarded-replay.mjs','replay-when-authorized.mjs']:
 s=convert((r/'out/source17-replay'/n).read_text())
 if n=='prepare.mjs':
  a=s.index("for(const name of execFileSync('git'");b=s.index('const plan=',a);s=s[:a]+s[b:]
 if n=='inventory.py':
  a=s.index("selection=[");b=s.index(';rows=[]',a);selection=['package.json','.nvmrc','.github','scripts','synthesis','infra','fixtures','components','integrations','itcves','programs','config','src','bin','adapters','schemas','suts','test','docs'];s=s[:a]+'selection='+repr(selection)+s[b:]
 (r/'out/source18-replay'/n).write_text(s)
for n in ['dependency-byte-closure-v3.json','dependency-guard-tests-v3.json','package-byte-audit.json','messaging-sdk-byte-closure.json','rust-dependency-byte-closure.json','replay-dependency-guard-v3.sb','dependencies.json']:shutil.copyfile(r/'out/source17-replay'/n,r/'out/source18-replay'/n)
(r/'out/source18-replay/cache-isolation.json').write_text(convert((r/'out/source17-replay/cache-isolation.json').read_text()));(r/'out/source18-replay/fresh-tmp').mkdir();p=r/'out/source18-replay/dependency-byte-closure-v3.json';d=json.loads(p.read_bytes());d['cacheIsolationSha256']=sha(r/'out/source18-replay/cache-isolation.json');p.write_text(json.dumps(d,indent=2)+'\n')
locks=['synthesis/package-lock.json','components/transport/package-lock.json','integrations/services/package-lock.json','components/rust/Cargo.lock','synthesis/go/go.sum'];assert all((r/n).read_bytes()==subprocess.check_output(['git','show',old+':'+n])for n in locks)
lineage={'schema':'tpnil-native-source18-preparation-lineage@1','source':source,'priorSource':old,'priorControllerPreflightSha256':sha(r/'out/source17-replay/controller-preflight.json'),'guardUnchanged':sha(r/'out/source18-replay/replay-dependency-guard-v3.sb')==sha(r/'out/source17-replay/replay-dependency-guard-v3.sb'),'dependencyLocksUnchanged':True,'guardTestsCarriedUnchanged':True,'freshNativeRustTargetAndTempRequired':True,'runtimeExecuted':False,'extractorIncludesAllFrozenTestsAndDocs':True};(r/'out/source18-replay/preparation-lineage.json').write_text(json.dumps(lineage,indent=2)+'\n')
(r/'out/source18-ci/runs-config.json').write_text(json.dumps({'source':source,'order':str(order),'orderSha256':sha(order),'deadline':o['deadline'],'native':20,'PR':26,'reevaluationEvent':'push','manualReevaluationDispatchAllowed':False},indent=2)+'\n')
state={'schema':'native-closure-task-state@11','source':source,'sourceTree':o['sourceTree'],'PR':26,'PRState':'DRAFT','order':26,'orderSha256':sha(order),'deadline':o['deadline'],'cohortCompletedBefore':87710,'nativeAttempt':20,'nativeDispatched':False,'nativeInputs':471,'planSha256':o['planSha256'],'rustSha256':o['rustCompatibilitySha256'],'nativeQualification':False,'fullReplayExecuted':False,'previousOrder25Actual':5379,'Go11':o['Go11'],'reevaluationEvent':'push','manualReevaluationDispatchAllowed':False};(r/'out/current-task-state-v11.json').write_text(json.dumps(state,indent=2)+'\n')
(r/'out/source18-validation/read-status.py').write_text(convert((r/'out/source17-validation/read-status.py').read_text()))
# Prepare image observers from exact prior controllers; only artifact identity changes.
script='''from pathlib import Path
import json,datetime
r=Path.cwd();h=r/'out/source18-validation';run=json.loads((h/'native-run.json').read_bytes())['id'];source=SOURCE;o=json.loads(Path(ORDER).read_bytes());end=datetime.datetime.fromisoformat(o['deadline'])
def convert(s):return s.replace('3aac88975fc0f4e911fcf10fea6c8158f7760534',source).replace('source17','source18').replace('43411602601',str(run)).replace('plan-pr368-coverage-6-source-7.json','plan-pr368-coverage-6-source-8.json').replace('457','471')
early=r/'out/source18-image-early';early.mkdir()
for n in ['capture.py','verify.mjs']:(early/n).write_text(convert((r/'out/source17-image-early'/n).read_text()))
s=convert((r/'out/source17-validation/after-early-image.py').read_text()).replace('2026-11-13T13:17:32.351139+00:00',o['deadline']);(h/'after-early-image.py').write_text(s)
s=convert((r/'out/source17-validation/after-image-audit.py').read_text()).replace("old=r/'out/source12-image-audit'","old=r/'out/source17-image-audit'").replace('2026-11-13T13:57:32.351139+00:00',(end+datetime.timedelta(minutes=40)).isoformat()).replace('out/current-task-state-v10.json','out/current-task-state-v11.json')
a=s.index(" s=(old/name).read_text().replace(");b=s.index(";(new/name).write_text(s)",a)
s=s[:a]+" s=(old/name).read_text().replace('3aac88975fc0f4e911fcf10fea6c8158f7760534',source).replace('43411602601',str(run)).replace('131839118081',str(job)).replace('source17','source18').replace('itcve-go-storage-caller-known-inputs','itcve-go-storage-sync-order').replace('tpnil-storage-caller-known-inputs-go-build@1.0.0','tpnil-storage-sync-order-go-build@1.0.0')"+s[b:];(h/'after-image-audit.py').write_text(s)
print(json.dumps({'run':run,'observersPrepared':True,'Go11':True}))
'''.replace('SOURCE',repr(source)).replace('ORDER',repr(str(order)))
(r/'out/source18-validation/prepare-native-observers.py').write_text(script)
print(json.dumps({'source':source,'inputs':471,'orderSha256':sha(order),'guardUnchanged':lineage['guardUnchanged'],'reevaluationEvent':'push'}))
