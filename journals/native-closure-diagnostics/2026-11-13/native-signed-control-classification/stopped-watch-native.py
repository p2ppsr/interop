import os
os.environ['PATH']='/Users/tyeverett/.nvm/versions/node/v24.22.1/bin:'+os.environ['PATH']
from pathlib import Path
import subprocess,json,datetime,time,concurrent.futures
r=Path.cwd();h=r/'out/source13-validation';o=json.loads(Path('/Users/tyeverett/projects/network-ops/artifacts/ops/itcve-native-closure-20261111/attempt-21-transaction-fixture-order/work-order.json').read_bytes());deadline=datetime.datetime.fromisoformat(o['latestNativeDispatchAt'])
while not(h/'native-run.json').exists()or not(h/'after-image-audit.py').exists():
 assert datetime.datetime.now(datetime.timezone.utc)<deadline,'No dispatched run before admission deadline'
 time.sleep(15)
run=json.loads((h/'native-run.json').read_bytes())['id']
subprocess.run(['python3','-m','py_compile',str(h/'after-image-audit.py'),str(h/'after-early-image.py')],check=True)
subprocess.run(['node','--check',str(r/'out/source13-image-early/verify.mjs')],check=True)
commands={'monitor-native':['python3',str(h/'monitor-native.py'),str(run)],'after-early-image':['python3',str(h/'after-early-image.py')],'after-native':['python3',str(h/'after-native.py')],'after-image-audit':['python3',str(h/'after-image-audit.py')]}
def execute(item):
 name,cmd=item;started=datetime.datetime.now(datetime.timezone.utc).isoformat()
 try:
  with(h/(name+'.stdout')).open('wb')as out,(h/(name+'.stderr')).open('wb')as err:p=subprocess.run(cmd,stdout=out,stderr=err,timeout=12500)
  row={'name':name,'command':cmd,'exitCode':p.returncode,'startedAt':started,'endedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'workflowRerun':False}
 except Exception as error:row={'name':name,'command':cmd,'error':str(error),'startedAt':started,'endedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'workflowRerun':False}
 (h/(name+'-terminal.json')).write_text(json.dumps(row,indent=2)+'\n');return row
with concurrent.futures.ThreadPoolExecutor(max_workers=4)as pool:
 for future in concurrent.futures.as_completed([pool.submit(execute,item)for item in commands.items()]):print(json.dumps(future.result()),flush=True)
