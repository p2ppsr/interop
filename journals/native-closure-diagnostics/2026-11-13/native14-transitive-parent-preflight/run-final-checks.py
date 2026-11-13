from pathlib import Path
import subprocess,json,hashlib,datetime
root=Path.cwd();d=Path('out/source12-intake');node='/Users/tyeverett/.nvm/versions/node/v24.22.1/bin';import os
env={**os.environ,'PATH':node+':'+os.environ['PATH']}
checks=[('typecheck-final2',['npm','run','typecheck','--prefix','synthesis']),('transaction-parent-final',['npm','test','--prefix','synthesis','--','--run','test/native-coverage-transactions-oracle3.test.ts','test/native-coverage-transactions.test.ts']),('synthesis-final',['npm','test','--prefix','synthesis'])]
rows=[]
for name,cmd in checks:
 start=datetime.datetime.now(datetime.timezone.utc).isoformat();p=subprocess.run(cmd,stdout=(d/(name+'.log')).open('w'),stderr=subprocess.STDOUT,env=env);rows.append({'name':name,'command':cmd,'exitCode':p.returncode,'startedAt':start,'endedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()});(d/'final-checks.json').write_text(json.dumps(rows,indent=2)+'\n')
 if p.returncode:raise SystemExit(p.returncode)
