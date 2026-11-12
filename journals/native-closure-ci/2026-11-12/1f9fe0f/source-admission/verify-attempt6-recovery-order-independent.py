from pathlib import Path
import datetime,hashlib,json,re,subprocess
root=Path(__file__).resolve().parents[2];ops=Path('/Users/tyeverett/projects/network-ops');source='1f9fe0f9b979e9bbca66e90335f02ba2b80c7d41';previous='e47873a952c4fbb25bae241aadf41863104ae977'
orderpath=ops/'artifacts/ops/itcve-native-closure-20261111/attempt-6-portability-replay-recovery-order/work-order.json'
sha=lambda b:hashlib.sha256(b).hexdigest();read=lambda p:json.loads(p.read_text());git=lambda *a:subprocess.check_output(['git',*a],cwd=root);blob=lambda f,s=source:git('show',s+':'+f)
o=read(orderpath);assert sha(orderpath.read_bytes())=='4cb6e2179f551835db51aacbedbcf303b493eb9c74b37a8f0f4439a355747656'
assert o['source']==source==git('rev-parse','HEAD').decode().strip() and not git('status','--porcelain').strip()
assert o['status']=='COMMITTED_LOCAL_SOURCE_VALIDATED_BEFORE_PUSH' and o['dispatchAuthorizedByThisOrder']is True and o['attempt']==6 and o['recoveryRevision']==2
assert o['variant']=='integrated-native-conformance-pr368-coverage-2' and o['profile']=='ITCVE-1@4.4.0' and o['program']=='ISI-4@5.4.0'
assert o['claim']=='ENGINEERING_OBSERVATION_ONLY' and o['completeBRC100Conformance']is False and o['walletOfficialRelease']is False
oldpath=orderpath.parent/o['previousOrder']['path'];old=read(oldpath);assert sha(oldpath.read_bytes())==o['previousOrder']['sha256']=='bbe080f5022ed92132624ca85790c9e2830b5307bb710a0fe4b3fc6911d6d819'
assert o['previousOrder']['consumedNativeRuns']==0 and o['previousOrder']['supersedesUnusedNativeAllowance']is True and o['previousOrder']['consumedFoundationRuns']==o['previousOrder']['consumedRetainedReevaluationRuns']==1
plan=json.loads(blob(o['plan']));assert sha(blob(o['plan']))==o['planSha256']==old['planSha256']=='b7b2dcd4ed50df0cd5ce3b9d4c2828b1be3953d6da4a34a3f9cd31fceb57b1cd'
assert plan['admissionState']=='FROZEN' and plan['expectedObservations']==535 and plan['coverageRevision']==2 and len(plan['conformanceInputs'])==164
assert sha(blob(o['rustCompatibility']))==o['rustCompatibilitySha256']==old['rustCompatibilitySha256']=='9135d97c5d0f5387b55adc7ac69dca5e06d6234123bcf153f8400d84f7d7ef3e'
for k in ['wallet','walletCandidate','application','funding','oracleSelection','storagePatchLock','storagePatchLockSha256','executionTimeEnvelope']:assert o[k]==old[k],k
assert len(o['oracleSelection'])==22 and o['oracleSelection']=={k:plan[k]for k in o['oracleSelection']}
ci=o['automaticValidationEnvelope'];carried=ci['retainedReevaluation'];reeval=json.loads(blob(carried['plan']))
assert carried['maximumWorkflowRuns']==0 and carried['carriedRun']==43207730665 and carried['source']==previous and carried['conclusion']=='success' and carried['actualJobSeconds']==116 and carried['freshNativeExecutions']==0 and carried['allEvaluatorSourcesUnchanged']is True
assert sha(blob(carried['plan']))==carried['planSha256']=='2a2401e1e8150ff21e966ca9aeb540ee10e527c47dcd183fc72bb708d0c6959f' and blob(carried['plan'])==blob(carried['plan'],previous)
assert carried['evaluatorSources']==reeval['evaluatorSources'] and len(carried['evaluatorSources'])==5
for f,h in {**plan['conformanceInputs'],**carried['evaluatorSources']}.items():assert sha((root/f).read_bytes())==sha(blob(f))==sha(blob(f,previous))==h,f
expected=set(plan['conformanceInputs'])|set(carried['evaluatorSources'])|{'scripts/verify-native-portability-archive.mjs','test/native-portability-archive.test.mjs'}
assert len(o['committedInputs'])==len(expected)==171 and {r['path']for r in o['committedInputs']}==expected
for r in o['committedInputs']:assert r['committedSource']==source and sha(blob(r['path']))==sha((root/r['path']).read_bytes())==r['sha256']
assert 'sourceInputs'not in o and 'pendingSerialization'not in o
changed=git('diff','--name-only',previous,source).decode().splitlines();assert changed==o['sourceChanges']
code=[p for p in changed if not p.startswith(('journals/','docs/'))];assert code==['scripts/verify-native-portability-archive.mjs','test/native-portability-archive.test.mjs']
wf=blob('.github/workflows/native-evidence-reevaluation.yml').decode();triggers=re.findall(r"^      - '([^']+)'",wf.split('    paths:\n',1)[1].split('permissions:',1)[0],re.M);assert len(triggers)==16 and not set(changed)&set(triggers)
assert blob('.github/workflows/native-evidence-reevaluation.yml')==blob('.github/workflows/native-evidence-reevaluation.yml',previous)
assert ci['maximumSourcePushes']==1 and ci['foundation']['maximumWorkflowRuns']==1 and ci['foundation']['workflow']=='.github/workflows/ci.yml'
assert ci['foundation']['jobs']==old['automaticValidationEnvelope']['foundation']['jobs'];assert sum(j['maximumJobSeconds']for j in ci['foundation']['jobs'])==ci['foundation']['maximumTotalJobSeconds']==4200
wf=blob('.github/workflows/ci.yml').decode()
for j in ci['foundation']['jobs']:assert int(re.search(r'^    timeout-minutes: (\d+)$',wf.split('  '+j['name']+':\n')[1],re.M)[1])==j['timeoutMinutes']
assert ci['maximumAutomaticCIJobSeconds']==4200 and ci['maximumCombinedNewJobSeconds']==8400 and ci['additionalPRorPublicationPushRunsIncluded']is False
assert o['maximumNativeWorkflowRuns']==1 and o['automaticRetries']==0 and o['maximumNativeJobSeconds']==4200 and o['workflowTimeoutMinutes']==70 and o['repetitions']==2 and o['timeoutSecondsPerRepetition']==1500 and o['containerGraceSecondsPerRepetition']==60
expr=re.search(r'^    timeout-minutes: \$\{\{ (.+) \}\}$',blob('.github/workflows/isi4-yours-wallet.yml').decode(),re.M)[1]
js='const inputs={profile:'+json.dumps(o['variant'])+'};const startsWith=(a,b)=>a.startsWith(b);process.stdout.write(String('+expr+'));';assert int(subprocess.check_output(['/Users/tyeverett/.nvm/versions/node/v24.22.1/bin/node','-e',js]))==70
assert o['executionTimeEnvelope']=={'maximumRepetitionExecutionAndGraceSeconds':3120,'setupVerificationUploadReserveSeconds':1080,'totalNativeJobSeconds':4200,'ceilingNotTarget':True}
assert o['publicMainnetBroadcast']is False and o['funding']['extraFundingBeyondFrozenPlan']is False and o['observationsPerRepetition']==535 and o['originalFailureComparisonDenominator']==99
prior=o['priorCI'];assert prior['source']==previous and prior['foundationRun']==43207730680 and prior['foundationConclusion']=='failure' and prior['foundationJobSeconds']==1381 and prior['retainedReevaluationRun']==43207730665 and prior['retainedReevaluationConclusion']=='success' and prior['retainedReevaluationJobSeconds']==116 and prior['totalJobSeconds']==1497 and prior['newNativeSessions']==0
assert prior['jobs']=={'offline-core':209,'go-components':303,'integrated-components':869}
for path,digest in [(prior['archive']+'/manifest.json',prior['manifestSha256']),(prior['archive']+'-review/manifest.json',prior['reviewManifestSha256'])]:assert sha(blob(path))==digest
run=read(root/prior['archive']/'43207730665/run-api.json');jobs=read(root/prior['archive']/'43207730665/jobs-api.json')['jobs'];assert run['id']==43207730665 and run['head_sha']==previous and run['conclusion']=='success' and run['run_attempt']==1 and len(jobs)==1 and jobs[0]['conclusion']=='success'
sem=read(root/prior['archive']/'semantic-receipts.json');assert sem['reevaluationVerified']['verified']is True and sem['reevaluationVerified']['evaluatorSource']==previous and sem['reevaluationVerified']['newNativeSessions']==0
assert sem['reevaluationProduced']['planSha256']==carried['planSha256'] and sem['reevaluationProduced']['originalMembersUnchanged']is True
cost=o['cost'];assert cost['completedNewCohortJobSecondsBeforePush']==21214 and cost['priorFailedCIJobSecondsIncluded']==1497 and cost['historicalCohortJobSeconds']==20670 and cost['unknownCostsAreZero']is False and cost['savingClaim']is False and cost['newPaidCapacity']is False and cost['newMonetaryReservationUSD']==0
for k in ['actualCIChargeUSD','operatorEffortUSD','developmentAgentUsageUSD','allocatedOwnedCapacityUSD','artifactStorageAndTransferUSD','fullMoneyWorstCaseQuoteUSD']:assert cost[k]is None
v=o['validation'];assert v['corePASS']==196 and v['focusedPASSIncluded']==15 and v['pythonPASS']==5 and v['nativeInputsUnchanged']==164 and v['source6InputsUnchanged']==5
assert v['source6ActualExecution']=='CARRIED_SUCCESS_AT_UNCHANGED_EVALUATOR_CLOSURE' and v['source6Run']==43207730665 and v['source6RunSource']==previous and v['source6NewRunsAllowed']==0 and v['source6ResultRelabeled']is False and v['newFoundationRequired']is True
assert sha(blob(v['archive']+'/validation.json'))==v['manifestSha256']=='e0a9171eb25d8069658f62c012709047ea78182ca4ffce2dc674117ff05d0638'
assert sha(blob(v['archive']+'-review/manifest.json'))==v['reviewManifestSha256']=='c811d0d5b53ab1ed21cd8a6ba02b41e6e0fa0194343132b8dbd7284aaa64de0b'
assert len(o['requiredBeforeAdmission'])==8 and 'No new source6 workflow is admitted.'in o['requiredBeforeAdmission'][3] and 'Exactly one Foundation workflow' in o['requiredBeforeAdmission'][5] and 'Full70-minute allowance must fit'in o['requiredBeforeAdmission'][6]
for r in o['files']:
 p=orderpath.parent/r['path'];assert p.stat().st_size==r['bytes'] and sha(p.read_bytes())==r['sha256']
assert len(o['files'])==9 and len(o['rejectedDrafts'])==1
for r in o['economicPolicySources']:assert sha((ops/r['path']).read_bytes())==r['sha256']
now=datetime.datetime.now(datetime.timezone.utc);deadline=datetime.datetime.fromisoformat(o['deadline']);assert o['deadline']==old['deadline']=='2026-11-12T13:59:12.290722+00:00' and datetime.datetime.fromisoformat(o['createdAt'])<=now<deadline
cutoff=deadline-datetime.timedelta(seconds=4200);assert now<cutoff and '70-minute' in o['nativeDispatchCondition'];assert cutoff.isoformat()=='2026-11-12T12:49:12.290722+00:00'
result={'schema':'tpnil-attempt6-recovery-order-independent-review@1','verified':True,'claim':'EXACT_SOURCE_BOUNDED_ORDER_REVIEW_ONLY','source':source,'orderSha256':sha(orderpath.read_bytes()),'nativeInputsUnchanged':164,'evaluatorSourcesUnchanged':5,'committedInputs':171,'changedSourceCode':code,'source6TriggerMatches':[],'carriedReevaluation':{'run':43207730665,'source':previous,'conclusion':'success','jobSeconds':116,'relabelled':False},'maximumFoundationRuns':1,'maximumReevaluationRuns':0,'maximumNativeRuns':1,'maximumFoundationJobSeconds':4200,'maximumNativeJobSeconds':4200,'maximumCombinedNewJobSeconds':8400,'completedCohortBeforePush':21214,'historicalCohortSeparate':20670,'unknownMonetaryActuals':None,'unknownCostsAreZero':False,'oldNativeAllowanceSupersededUnused':True,'deadline':o['deadline'],'latestNativeDispatchWithFull70MinuteBound':cutoff.isoformat(),'nativeSessions':0,'priorDraftRejectedAndPreserved':True}
p=root/'out/native-closure-20261111/attempt6-recovery-order-independent-review.json';assert not p.exists();p.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'verified':True,'receipt':str(p),'sha256':sha(p.read_bytes()),'checkerSha256':sha(Path(__file__).read_bytes())}))
