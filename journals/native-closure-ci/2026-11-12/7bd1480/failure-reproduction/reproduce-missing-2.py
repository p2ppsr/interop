from pathlib import Path
import subprocess,hashlib,json,time
root=Path.cwd();base=root/'out/native-closure-20261111/ci-source-map-review';snapshot=base/'dependency-absent-2';snapshot.mkdir(exist_ok=False)
source=subprocess.check_output(['git','rev-parse','7bd1480'],cwd=root).decode().strip()
paths=subprocess.check_output(['git','ls-tree','-r','--name-only',source],cwd=root).decode().splitlines()
selected=[p for p in paths if p.startswith(('synthesis/src/','integrations/services/src/','programs/ISI-4/profiles/','infra/adapters/')) or p in ['synthesis/go/components.lock.json','synthesis/package.json','synthesis/package-lock.json','integrations/services/package.json','integrations/services/package-lock.json','fixtures/teranode/wab-funding-v1.json']]
hashes={}
for name in selected:
 b=subprocess.check_output(['git','show',source+':'+name],cwd=root);p=snapshot/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b);hashes[name]=hashlib.sha256(b).hexdigest()
(snapshot/'synthesis/node_modules').symlink_to(root/'synthesis/node_modules',target_is_directory=True)
node='/Users/tyeverett/.nvm/versions/node/v24.22.1/bin/node';out=base/'dependency-absent-2-output';cmd=[node,'--import',str(snapshot/'synthesis/node_modules/tsx/dist/loader.mjs'),str(snapshot/'synthesis/src/wallet-lab/native/coverage-certificates-reference.ts'),str(out)]
start=time.monotonic()
try:
 r=subprocess.run(cmd,cwd=snapshot,capture_output=True,timeout=30);stdout=r.stdout;stderr=r.stderr;status={'exitCode':r.returncode,'timedOut':False}
except subprocess.TimeoutExpired as e:stdout=e.stdout or b'';stderr=e.stderr or b'';status={'exitCode':None,'timedOut':True}
(base/'dependency-absent-2.stdout.log').write_bytes(stdout);(base/'dependency-absent-2.stderr.log').write_bytes(stderr)
receipt={'schema':'tpnil-ci-dependency-absence-reproduction@1','claim':'LOCAL_ENGINEERING_FAILURE_REPRODUCTION_ONLY','nativeSessions':0,'source':source,'sourceInputs':hashes,'node':subprocess.check_output([node,'--version']).decode().strip(),'command':cmd,'elapsedSeconds':round(time.monotonic()-start,3),**status,'installedClosures':['synthesis/node_modules'],'absentClosure':'integrations/services/node_modules','stdoutSha256':hashlib.sha256(stdout).hexdigest(),'stderrSha256':hashlib.sha256(stderr).hexdigest()}
(base/'dependency-absent-2.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({k:v for k,v in receipt.items() if k not in ['sourceInputs','command']},indent=2));print(stderr.decode()[-5000:])
