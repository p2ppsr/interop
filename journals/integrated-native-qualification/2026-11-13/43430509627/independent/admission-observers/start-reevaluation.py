from pathlib import Path
import subprocess,json,datetime,time
r=Path.cwd();h=r/'out/source19-validation';source='ec3a554d433845e9aa8209d9eb20dde48cba6a2a';receipt=h/'reevaluation-dispatch.json';assert not receipt.exists()
for n in range(90):
 head=subprocess.check_output(['git','ls-remote','origin','refs/heads/codex/native-wallet-closure-20261111']).decode().split()[0]
 if head==source:break
 time.sleep(4)
else:raise RuntimeError('Source push not observed; no workflow dispatched')
runs=json.loads(subprocess.check_output(['gh','api','repos/p2ppsr/interop/actions/runs?head_sha='+source+'&per_page=100']));assert not any(x['name']=='Retained native evidence reevaluation'for x in runs['workflow_runs'])
args=['gh','workflow','run','native-evidence-reevaluation.yml','--repo','p2ppsr/interop','--ref','codex/native-wallet-closure-20261111'];p=subprocess.run(args,capture_output=True);(h/'reevaluation-dispatch.stdout').write_bytes(p.stdout);(h/'reevaluation-dispatch.stderr').write_bytes(p.stderr);d={'source':source,'command':args,'exitCode':p.returncode,'automaticRetries':0,'dispatchedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()};receipt.write_text(json.dumps(d,indent=2)+'\n');assert p.returncode==0;print(json.dumps(d),flush=True)
