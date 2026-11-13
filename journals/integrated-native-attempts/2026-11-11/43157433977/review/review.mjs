import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync, execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
const runId=43157433977,source='585211c193d0288effeb466bda38fe6ef23ac94d',root=fs.realpathSync(process.cwd()),home=path.join(root,`out/native-review-${runId}`)
const snapshot=JSON.parse(fs.readFileSync(path.join(home,'snapshot.json'))),frozen=fs.realpathSync(snapshot.root)
assert.equal(snapshot.source,source);assert.equal(process.versions.node,'24.22.1')
const {requireVerifierReceipt}=await import(pathToFileURL(path.join(frozen,'scripts/frozen-component-replay.mjs')))
const [zip,runApi,artifactsApi,jobsApi]=process.argv.slice(2).map(file=>fs.realpathSync(file))
assert.ok(zip&&runApi&&artifactsApi&&jobsApi,'Usage: review.mjs ZIP RUN_JSON ARTIFACTS_JSON JOBS_JSON')
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),read=file=>JSON.parse(fs.readFileSync(file)),stamp=new Date().toISOString().replace(/[:.]/g,'-'),attempt=path.join(home,`attempt-${stamp}`)
fs.mkdirSync(attempt)
const steps=[],review={schema:'tpnil-native-511-independent-artifact-review@1',workflowRun:runId,source,newNativeSessions:0,claim:'INDEPENDENT_REPLAY_OF_RETAINED_NATIVE_ATTEMPT',startedAt:new Date().toISOString(),snapshot,steps,result:'NOT_VERIFIED'}
let original,before
function inventory(directory){const rows=[];const walk=base=>{for(const name of fs.readdirSync(base).sort()){const file=path.join(base,name),stat=fs.lstatSync(file);assert.ok(!stat.isSymbolicLink());if(stat.isDirectory())walk(file);else{assert.ok(stat.isFile());const bytes=fs.readFileSync(file);rows.push({path:path.relative(directory,file),bytes:bytes.length,sha256:sha(bytes)})}}};walk(directory);return rows}
function allReceipts(stdout){const values=[];for(const match of stdout.matchAll(/^\{/gm)){let depth=0,quoted=false,escape=false;for(let i=match.index;i<stdout.length;i++){const c=stdout[i];if(quoted){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false;continue}if(c==='"'){quoted=true;continue}if(c==='{')depth++;if(c==='}'&&--depth===0){try{values.push(JSON.parse(stdout.slice(match.index,i+1)))}catch{}break}}}return values}
function execute(name,args,{timeout=600000,expected}={}){
 const startedAt=new Date().toISOString(),result=spawnSync(process.execPath,args,{cwd:frozen,env:{...process.env,RUSTUP_TOOLCHAIN:'1.88.0',CARGO_NET_OFFLINE:'true',TPNIL_REPLAY_GIT_ROOT:root,TPNIL_MESSAGING_PATHS:path.join(root,'out/messaging-native-verifier/paths.json')},encoding:'utf8',timeout,maxBuffer:64*1024*1024})
 for(const stream of ['stdout','stderr'])fs.writeFileSync(path.join(attempt,`${name}.${stream}.log`),result[stream]??'',{flag:'wx'})
 const step={name,args,startedAt,endedAt:new Date().toISOString(),exitCode:result.status,signal:result.signal,stdoutBytes:Buffer.byteLength(result.stdout??''),stderrBytes:Buffer.byteLength(result.stderr??''),stdoutSha256:sha(result.stdout??''),stderrSha256:sha(result.stderr??''),structuredReceiptVerified:false};steps.push(step)
 assert.equal(result.status,0,`${name} failed; retained logs describe the original error`)
 const receipt=requireVerifierReceipt(result.stdout,expected);step.structuredReceiptVerified=true;return{receipt,stdout:result.stdout}
}
try{
 const preparation=read(path.join(root,'out/messaging-native-verifier/verifier-preparation.json'))
 const messagingLock=read(path.join(frozen,'components/messaging/sources.lock.json'))
 assert.deepEqual(preparation.component,messagingLock.components.find(row=>row.id==='typescript-messagebox'))
 for(const [file,digest] of Object.entries(preparation.source.files))assert.equal(sha(fs.readFileSync(path.join(frozen,file))),digest)
 assert.equal(sha(fs.readFileSync(preparation.archive.path)),preparation.component.archiveSha256)
 assert.equal(sha(fs.readFileSync(path.join(preparation.package.path,'package.json'))),preparation.package.jsonSha256)
 assert.equal(sha(fs.readFileSync(path.join(preparation.package.path,'package-lock.json'))),preparation.package.lockSha256)
 const {sourceTreeDigest}=await import(pathToFileURL(path.join(frozen,'components/messaging/identity.mjs')))
 assert.equal(sourceTreeDigest(preparation.package.path),preparation.package.sourceTreeSha256)
 assert.equal(sha(fs.readFileSync(path.join(preparation.package.path,'node_modules/@bsv/sdk/package.json'))),preparation.sdk.packageSha256)
 assert.equal(sha(fs.readFileSync(path.join(preparation.package.path,preparation.sdk.entry))),preparation.sdk.entrySha256)
 fs.writeFileSync(path.join(attempt,'messaging-preparation.json'),JSON.stringify(preparation,null,2)+'\n',{flag:'wx'})
 review.exactMessagingDependencyPreparationVerified=true
 const run=read(runApi),artifacts=read(artifactsApi),jobs=read(jobsApi)
 assert.equal(run.id,runId);assert.equal(run.head_sha,source);assert.equal(run.status,'completed')
 const selected=artifacts.artifacts.filter(row=>row.name==='native-go-yours-wallet-5.1.1');assert.equal(selected.length,1)
 const artifact=selected[0],zipBytes=fs.readFileSync(zip);assert.equal(artifact.expired,false);assert.equal(artifact.digest,`sha256:${sha(zipBytes)}`)
 for(const[file,name]of [[zip,'original-native.zip'],[runApi,'run.json'],[artifactsApi,'artifacts.json'],[jobsApi,'jobs.json']])fs.copyFileSync(file,path.join(attempt,name),fs.constants.COPYFILE_EXCL)
 Object.assign(review,{workflowConclusion:run.conclusion,workflowUrl:run.html_url,artifact:{id:artifact.id,name:artifact.name,sha256:sha(zipBytes),bytes:zipBytes.length,githubDigestVerified:true},jobConclusions:jobs.jobs.map(row=>({id:row.id,name:row.name,conclusion:row.conclusion}))})
 original=path.join(attempt,'original')
 const extraction=spawnSync('python3',[path.join(home,'safe-extract.py'),path.join(attempt,'original-native.zip'),original],{encoding:'utf8',timeout:60000,maxBuffer:32*1024*1024})
 fs.writeFileSync(path.join(attempt,'extraction.stdout.json'),extraction.stdout??'',{flag:'wx'});fs.writeFileSync(path.join(attempt,'extraction.stderr.log'),extraction.stderr??'',{flag:'wx'});assert.equal(extraction.status,0,extraction.stderr)
 const extracted=JSON.parse(extraction.stdout);assert.equal(extracted.verified,true);before=inventory(original);assert.deepEqual(before,extracted.members)
 review.originalMembers=before.length;review.originalInventorySha256=sha(JSON.stringify(before));fs.writeFileSync(path.join(attempt,'original-members.json'),JSON.stringify(before,null,2)+'\n',{flag:'wx'})
 const lock=read(path.join(original,'run-lock.json'));assert.equal(lock.source,source);assert.equal(lock.plan.itcve,'ITCVE-1@4.0.0');assert.equal(lock.plan.program,'ISI-4@5.0.0');assert.equal(lock.plan.wallet.version,'5.1.1');assert.equal(lock.executionVariant,'integrated-native-conformance-5.1.1-observer-2');assert.equal(lock.plan.expectedObservations,426)
 review.planSha256=lock.planSha256
 const required=['qualification.json','integrated-qualification.json',...['1','2'].flatMap(i=>[`repetition-${i}/worker.json`,`repetition-${i}/record.json`,`repetition-${i}/shutdown-submissions.json`,`repetition-${i}/evidence/conformance/conditional.json`,`repetition-${i}/evidence/conformance/permission-coverage.json`,`repetition-${i}/evidence/conformance/transaction-states.json`,`repetition-${i}/evidence/conformance/certificate-states.json`,`rust-repetition-${i}/result.json`])]
 const missing=required.filter(file=>!fs.existsSync(path.join(original,file)));review.missingCompleteAttemptFiles=missing
 assert.equal(missing.length,0,'Incomplete native attempt retained; complete qualification/replay is unavailable')
 const replay=path.join(attempt,'replay');fs.cpSync(original,replay,{recursive:true,errorOnExist:true,force:false});const canonicalReplay=fs.realpathSync(replay)
 const integrated=execute('integrated',[''+path.join(frozen,'scripts/verify-native-integrated.mjs'),canonicalReplay],{expected:{schema:'tpnil-native-integrated-qualification@2',source,profile:'ITCVE-1@4.0.0',program:'ISI-4@5.0.0',qualifiedEnvironment:true,repetitionMatch:true,completeBRC100Conformance:false}})
 const receipts=allReceipts(integrated.stdout);assert.equal(receipts.length,14,'Every native/component verifier must emit its original structured receipt')
 assert.equal(receipts[0].verified,true);assert.equal(receipts[0].qualifiedEnvironment,true);assert.equal(receipts[0].vectors.length,8)
 for(let rep=0;rep<2;rep++){
  const group=receipts.slice(1+rep*6,7+rep*6);assert.ok(group.every(row=>row.verified===true))
  assert.equal(group[1].assertions,6);assert.equal(group[2].outcome,'PASS');assert.ok(Array.isArray(group[3].assertions));assert.equal(group[3].completeBRC100Conformance,false)
  assert.equal(group[5].independentReplay,true);assert.equal(group[5].assertions,48);assert.equal(group[5].parentInputsBound,4);assert.equal(group[5].outcome,'PASS')
 }
 review.all14VerifierReceiptsNonempty=true;review.componentReceiptSummaries=receipts.slice(0,-1).map((row,index)=>({index,verified:row.verified,assertionCount:Array.isArray(row.assertions)?row.assertions.length:row.assertions,independentReplay:row.independentReplay,outcome:row.outcome}))
 const children=execute('children',['--import',path.join(frozen,'synthesis/node_modules/tsx/dist/loader.mjs'),path.join(home,'children.mjs'),frozen,canonicalReplay],{expected:{verified:true,newNativeSessions:0}})
 review.repetitions=children.receipt.repetitions;review.nativeOutcome=read(path.join(replay,'qualification.json')).outcome;review.combinedOutcome=integrated.receipt.outcome;review.integrationOutcome=integrated.receipt.integrationOutcome
 assert.ok(integrated.receipt.repetitions.every(row=>row.assertions.length===77))
 assert.deepEqual(inventory(replay),before,'Independent replay unexpectedly changed retained members')
 review.completeBRC100Conformance=false;review.result='REPLAY_VERIFIED'
}catch(error){review.result='NOT_VERIFIED';review.failure={name:error.name,message:error.message,stack:error.stack};process.exitCode=1}
finally{if(original&&before){assert.deepEqual(inventory(original),before);review.originalMembersUnchanged=true}review.completedAt=new Date().toISOString();fs.writeFileSync(path.join(attempt,'independent-review.json'),JSON.stringify(review,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({attempt,...review},null,2))}
