import os
os.environ['PATH']='/Users/tyeverett/.nvm/versions/node/v24.22.1/bin:'+os.environ['PATH']
from pathlib import Path
import subprocess,json,hashlib,datetime,time,re
r=Path.cwd();ops=Path('/Users/tyeverett/projects/network-ops');order=ops/'artifacts/ops/itcve-native-closure-20261111/attempt-27-ci-worker-order/work-order.json';sha=lambda b:hashlib.sha256(b).hexdigest();raw=order.read_bytes();assert sha(raw)=='b4aa69b07a9dbc5c5f5601fd011768b8880cba7cf4e7ebca5a9bae19dd79396a';o=json.loads(raw);source=o['source'];out=r/'out/source19-validation/native-dispatch';assert not out.exists();parse=lambda s:datetime.datetime.fromisoformat(s.replace('Z','+00:00'))
def cmd(*args,cwd=r):return subprocess.check_output(args,cwd=cwd)
assert cmd('git','rev-parse','HEAD').decode().strip()==source and not cmd('git','status','--porcelain').strip()
assert cmd('git','ls-remote','origin','refs/heads/'+o['sourceBranch']).decode().split()[0]==source
assert cmd('git','rev-parse','HEAD',cwd=ops)==cmd('git','rev-parse','origin/master',cwd=ops)
assert cmd('git','show','origin/master:'+order.relative_to(ops).as_posix(),cwd=ops)==raw
for n,h in o['committedInputs'].items():assert sha((r/n).read_bytes())==h and sha(cmd('git','show',source+':'+n))==h,n
selector=cmd('node','scripts/check-native-wallet-selector.mjs',o['executionVariant']);s=json.loads(selector);assert s['verifiedSource']and s['source']==source and s['planSha256']==o['planSha256']
history=json.loads((r/'out/source19-preflight/history-commit.json').read_bytes());assert history['source']==source and history['commitTree']==o['sourceTree']and history['commitEqualsVerifiedIndex']and all(x==[]for x in history['journalDMT'].values());assert sha((r/'out/source19-preflight/history-index.log').read_bytes())==history['indexGuardSha256']
prRaw=cmd('gh','api','repos/p2ppsr/interop/pulls/26');pr=json.loads(prRaw);assert pr['draft']is True and pr['head']['sha']==source and pr['base']['sha']==o['draftPR']['baseSource']
mergeRaw=cmd('gh','api','repos/p2ppsr/interop/git/commits/'+pr['merge_commit_sha']);merge=json.loads(mergeRaw);assert {p['sha']for p in merge['parents']}=={source,o['draftPR']['baseSource']};assert merge['tree']['sha']==o['sourceTree']==cmd('git','rev-parse','HEAD^{tree}').decode().strip()
runs=cmd('gh','api','repos/p2ppsr/interop/actions/runs?head_sha='+source+'&per_page=100');rr=json.loads(runs);assert rr['total_count']==len(rr['workflow_runs'])==3
jobsRaw={};totals={};exceptions=[];ids={}
for ci in rr['workflow_runs']:
 assert ci['head_sha']==source and ci['status']=='completed'and ci['run_attempt']==1
 duplicate=ci['name']=='Foundation checks'and ci['event']=='push';reeval=ci['name']=='Retained native evidence reevaluation'
 key='reevaluationPASS'if reeval else'duplicatePushCanceled'if duplicate else'PRFoundation';assert key not in ids;ids[key]=ci['id']
 assert ci['name']==('Retained native evidence reevaluation'if reeval else'Foundation checks')and ci['event']==('workflow_dispatch'if reeval else'push'if duplicate else'pull_request')and ci['conclusion']==('cancelled'if duplicate else'success')
 jobs=cmd('gh','api',f"repos/p2ppsr/interop/actions/runs/{ci['id']}/jobs?per_page=100");jj=json.loads(jobs);jobsRaw[ci['id']]=jobs;limits={'retained-native-evidence':300}if reeval else o['workflowLimits']['Foundation checks']['jobs'];assert jj['total_count']==len(jj['jobs'])==len(limits);seconds=0
 for j in jj['jobs']:
  if j['status']!='completed':
   assert duplicate and j['conclusion']=='cancelled'and j['completed_at']and all(step['status']=='completed'for step in j['steps'])
   assert any(step['name']=='Complete job'and step['conclusion']=='success'for step in j['steps'])
   log=cmd('gh','api',f"repos/p2ppsr/interop/actions/jobs/{j['id']}/logs");assert b'Cleaning up orphan processes'in log
   evidence=r/'out/source19-validation/cancelled-job-status-preflight';evidence.mkdir(exist_ok=True);(evidence/f"job-{j['id']}.log").write_bytes(log)
   exceptions.append({'run':ci['id'],'job':j['id'],'originalStatus':j['status'],'conclusion':j['conclusion'],'completedAt':j['completed_at'],'allStepsCompleted':True,'completeJobSuccess':True,'cleanupLogSha256':sha(log)})
  if not duplicate:assert j['conclusion']=='success'and all(x['conclusion']in['success','skipped']for x in j['steps'])
  if j['conclusion']=='skipped':n=0
  else:assert j['started_at']and j['completed_at'];n=(parse(j['completed_at'])-parse(j['started_at'])).total_seconds()
  assert n<=limits[j['name']];seconds+=n
 assert seconds<=(300 if duplicate or reeval else 4800);totals[ci['id']]=seconds
assert set(ids)=={'reevaluationPASS','duplicatePushCanceled','PRFoundation'}and sum(totals.values())<=5400
ciHome=r/f"out/source19-ci/acquisition/{ids['PRFoundation']}";acquisition=json.loads((ciHome/'acquisition.json').read_bytes());assert acquisition['source']==source
observedLogs={}
for j in json.loads(jobsRaw[ids['PRFoundation']])['jobs']:
 name=f"job-{j['id']}.log";entry=next(x for x in acquisition['files']if x['path']==name);rawLog=(ciHome/name).read_bytes();assert sha(rawLog)==entry['sha256'];observedLogs[j['name']]=re.sub(r'(?:\x1b|\\u001b)\[[0-?]*[ -/]*[@-~]','',rawLog.decode('utf-8-sig'))
core=re.findall(r'\bpass (\d+)',observedLogs['offline-core']);skips=re.findall(r'\bskipped (\d+)',observedLogs['offline-core']);synthesis=re.findall(r'\bTests\s+(\d+) passed\s+\|\s+(\d+) skipped',observedLogs['offline-core']);go=re.findall(r'\bTests\s+(\d+) passed',observedLogs['go-components']);assert core==['236']and skips==['1']and synthesis==[('1831','126')]and go==['13'],(core,skips,synthesis,go)
assert re.search(r'Ran 5 tests in',observedLogs['offline-core'])
ciTestCounts={'corePASS':236,'coreSKIP':1,'synthesisPASS':1831,'synthesisSKIP':126,'GoPASS':13,'PythonPASS':5,'sourceArtifactLogHashesVerified':True}
from zipfile import ZipFile
reference=next(x for x in acquisition['files']if x.get('artifactName')=='go11-portability-reference');assert sha((ciHome/reference['path']).read_bytes())==reference['sha256']
with ZipFile(ciHome/reference['path'])as z:
 ref=json.loads(z.read('verification.json'));record=json.loads(z.read('portability.json'));assert ref['verified']and ref['result']=='PASS'and ref['mode']=='reference-engineering'and len(ref['assertions'])==9 and all(x['result']=='PASS'for x in ref['assertions']);assert all(record['components'][k]['go']['compatibilityPatch']['schema']=='tpnil-storage-sync-order-go-build@1.0.0'and record['components'][k]['go']['compatibilityPatch']['patchLockSha256']==o['Go11']['patchLockSha256']for k in ['source','replacement'])
ciTestCounts['directGo11ReplacementPASS']=9


replay=json.loads((r/'out/source19-reevaluation-replay/replay.json').read_bytes());gate=json.loads((r/'out/source19-reevaluation-replay/gate.json').read_bytes());assert replay['source']==source and replay['run']==ids['reevaluationPASS']and replay['exitCode']==0 and replay['originalBytesUnchanged']and gate['independentFrozenReplayPASS']and gate['dependencyBytesUnchanged']and gate['nativeSessions']==0
preparation=json.loads((r/'out/source19-replay/controller-preflight.json').read_bytes());assert preparation['source']==source and preparation['nativeInputs']==471 and preparation['allSourceFilesMatchGit']
for d in ['source/components/rust/target','fresh-tmp']:assert not list((r/'out/source19-replay'/d).iterdir())
now=datetime.datetime.now(datetime.timezone.utc);assert now<=parse(o['latestNativeDispatchAt'])and(parse(o['deadline'])-now).total_seconds()>=5400
out.mkdir();(out/'runs-before.json').write_bytes(runs);(out/'selector.json').write_bytes(selector);(out/'pr-before.json').write_bytes(prRaw);(out/'synthetic-commit.json').write_bytes(mergeRaw)
for id,b in jobsRaw.items():(out/f'{id}-jobs-before.json').write_bytes(b)
receipt={'checkedAt':now.isoformat(),'source':source,'orderSha256':sha(raw),'sourceInputs':471,'PR':26,'ciTestCounts':ciTestCounts,**ids,'independentReevaluationReplaySha256':sha((r/'out/source19-reevaluation-replay/replay.json').read_bytes()),'jobSeconds':totals,'prerequisiteJobSeconds':sum(totals.values()),'cancelledDuplicateAPIStatusExceptions':exceptions,'admissionControllerSha256':sha(Path(__file__).read_bytes()),'cohortBeforeNative':89739+sum(totals.values()),'syntheticMerge':merge['sha'],'syntheticTree':merge['tree']['sha'],'treeEqualsNativeSource':True,'deadline':o['deadline'],'nativeMaximumJobSeconds':5400,'nativeRunsBefore':0};(out/'preflight.json').write_text(json.dumps(receipt,indent=2)+'\n')
args=['gh','workflow','run','isi4-yours-wallet.yml','--repo','p2ppsr/interop','--ref',o['sourceBranch'],'-f','profile='+o['executionVariant']];x=subprocess.run(args,capture_output=True);(out/'dispatch.stdout').write_bytes(x.stdout);(out/'dispatch.stderr').write_bytes(x.stderr);receipt.update(dispatchedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),command=args,exitCode=x.returncode);(out/'dispatch.json').write_text(json.dumps(receipt,indent=2)+'\n');assert x.returncode==0;print(json.dumps(receipt),flush=True)
for attempt in range(30):
 allruns=json.loads(cmd('gh','api','repos/p2ppsr/interop/actions/runs?head_sha='+source+'&per_page=100'));native=[x for x in allruns['workflow_runs']if x['event']=='workflow_dispatch'and x['path']=='.github/workflows/isi4-yours-wallet.yml'];assert len(native)<=1
 if native:
  n=native[0];assert n['head_sha']==source and n['run_attempt']==1;(out.parent/'native-run.json').write_text(json.dumps(n,indent=2)+'\n');print(json.dumps({'native20Run':n['id'],'url':n['html_url']}),flush=True);break
 time.sleep(4)
else:raise RuntimeError('Dispatch acknowledged but run not observed; query before any further action, never redispatch automatically')
