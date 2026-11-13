import os
os.environ['PATH']='/Users/tyeverett/.nvm/versions/node/v24.22.1/bin:'+os.environ['PATH']
from pathlib import Path
import subprocess,json,datetime,time
r=Path.cwd();h=r/'out/source13-validation';o=json.loads(Path('/Users/tyeverett/projects/network-ops/artifacts/ops/itcve-native-closure-20261111/attempt-21-transaction-fixture-order/work-order.json').read_bytes());end=datetime.datetime.fromisoformat(o['latestNativeDispatchAt'])
while not(h/'prerequisites/completion.json').exists()or not(r/'out/source13-reevaluation-replay/gate.json').exists():
 assert datetime.datetime.now(datetime.timezone.utc)<end,'Native dispatch deadline reached; no run may start'
 time.sleep(20)
c=json.loads((h/'prerequisites/completion.json').read_bytes());assert c['source']==o['source']and all(x['conclusion']==('cancelled'if x['event']=='push'else'success')for x in c['runs'])
foundation=[x['run']for x in c['runs']if x['name']=='Foundation checks'];assert len(foundation)==2
with(h/'capture-pr.stdout').open('wb')as out,(h/'capture-pr.stderr').open('wb')as err:subprocess.run(['python3','out/source13-ci/capture-completed.py',*map(str,foundation)],stdout=out,stderr=err,check=True,timeout=900)
with(h/'dispatch-native.stdout').open('wb')as out,(h/'dispatch-native.stderr').open('wb')as err:subprocess.run(['python3','out/source13-validation/dispatch-native.py'],stdout=out,stderr=err,check=True,timeout=180)
subprocess.run(['python3','out/source13-validation/prepare-native-observers.py'],check=True)
run=json.loads((h/'native-run.json').read_bytes())['id'];state=r/'out/current-task-state-v6.json';d=json.loads(state.read_bytes());d.update(nativeDispatched=True,nativeRun=run);state.write_text(json.dumps(d,indent=2)+'\n');print(json.dumps({'native16Dispatched':run,'source':o['source']}),flush=True)
