import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { prepareFrozenComponentReplay, requireVerifierReceipt } from './frozen-component-replay.mjs'
import { extractZipSafely } from './verify-published-integrations.mjs'
export const originalReevaluationPlanPath = 'infra/native/conformance/reevaluation-42711700295-rust-3.0.0.json'
export const previousReevaluationPlanPath = 'infra/native/conformance/reevaluation-42711700295-rust-3.0.0-source-2.json'
export const previousReevaluationPlanId = 'YOURS-5.1.0-NATIVE-42711700295-RUST-3.0.0-CANONICAL-REEVALUATION-SOURCE-2'
export const previousReevaluationPlanSha256 = '1c61f19354185589e5be2f2304f04778adea4e82866ebf8d160a14eec80c7f66'
export const retainedSource3PlanPath = 'infra/native/conformance/reevaluation-42711700295-rust-3.0.0-source-3.json'
export const retainedSource3PlanId = 'YOURS-5.1.0-NATIVE-42711700295-RUST-3.0.0-CANONICAL-REEVALUATION-SOURCE-3'
export const retainedSource3PlanSha256 = '2308c7f5fdbc717029e4a654f09b5938afb4992298e299ac26ae93ae95f560ea'
export const currentReevaluationPlanPath = 'infra/native/conformance/reevaluation-42711700295-rust-3.0.0-source-4.json'
export const currentReevaluationPlanId = 'YOURS-5.1.0-NATIVE-42711700295-RUST-3.0.0-CANONICAL-REEVALUATION-SOURCE-4'
export const originalReevaluationPlanSha256 = 'f49f2dbb984ce227cebd305bbe31e827908dfd683b304b63488b4bbd9b863aef'
const revisions = {
  2: { id: previousReevaluationPlanId, path: previousReevaluationPlanPath, predecessor: { path: originalReevaluationPlanPath, sha256: originalReevaluationPlanSha256 } },
  3: { id: retainedSource3PlanId, path: retainedSource3PlanPath, predecessor: { path: previousReevaluationPlanPath, sha256: previousReevaluationPlanSha256 } },
  4: { id: currentReevaluationPlanId, path: currentReevaluationPlanPath, predecessor: { path: retainedSource3PlanPath, sha256: retainedSource3PlanSha256 } }
}
export const reevaluationSchema = 'tpnil-native-integrated-reevaluation@1'
export const reevaluationInputNames = ['paid-http.json','messaging.json','synthesis-transactions.json','identity-trust.json']
export const evaluatorSourceNames = ['scripts/reevaluate-native-integrated.mjs','scripts/verify-native-reevaluation.mjs','scripts/native-reevaluation.mjs','scripts/frozen-component-replay.mjs','scripts/verify-published-integrations.mjs']
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const read = file => JSON.parse(fs.readFileSync(file,'utf8'))
const semantic = rows => rows.map(({id,result})=>({id,result})).sort((a,b)=>a.id.localeCompare(b.id))
const counts = rows => Object.fromEntries(['PASS','FAIL','BLOCKED'].map(result=>[result,rows.filter(row=>(row.result??row.outcome)===result).length]))
export function inventory(directory) {
  const rows=[]
  const walk=dir=>{for(const name of fs.readdirSync(dir)){const file=path.join(dir,name),stat=fs.lstatSync(file);assert.ok(!stat.isSymbolicLink(),'Evidence symlinks are forbidden');if(stat.isDirectory())walk(file);else{assert.ok(stat.isFile());const bytes=fs.readFileSync(file);rows.push({path:path.relative(directory,file).split(path.sep).join('/'),size:bytes.length,sha256:sha256(bytes)})}}}
  walk(directory);return rows.sort((a,b)=>a.path.localeCompare(b.path))
}
function relative(name) {assert.equal(typeof name,'string');assert.ok(!path.isAbsolute(name)&&name.split('/').every(part=>part&&part!=='.'&&part!=='..'));return name}
function validateReevaluationLineage(plan,root) {
  const ancestors=[]
  if([previousReevaluationPlanId,currentReevaluationPlanId].includes(plan.id)||plan.sourceBindingRevision!==undefined||plan.predecessor!==undefined) {
    assert.ok(Number.isSafeInteger(plan.sourceBindingRevision),'Unsupported reevaluation source binding revision')
    let current=plan
    for(let revision=plan.sourceBindingRevision;;revision--) {
      const expected=revisions[revision]
      assert.ok(expected,'Unsupported reevaluation source binding revision')
      assert.equal(current.id,expected.id);assert.equal(current.sourceBindingRevision,revision)
      assert.deepEqual(current.predecessor,expected.predecessor)
      const predecessorBytes=fs.readFileSync(path.join(root,expected.predecessor.path))
      assert.equal(sha256(predecessorBytes),expected.predecessor.sha256,'Accepted predecessor plan changed')
      const predecessor=JSON.parse(predecessorBytes)
      for(const key of ['original','rust','expected'])assert.deepEqual(current[key],predecessor[key],`Source revision changed retained evidence acceptance: ${key}`)
      ancestors.push(expected.predecessor)
      if(revision===2)break
      current=predecessor
    }
  }
  return ancestors
}
export function validateReevaluationPlan(plan,root) {
  assert.equal(plan.schema,'tpnil-native-integrated-reevaluation-plan@1');assert.equal(typeof plan.id,'string');assert.ok(plan.id.length>0)
  validateReevaluationLineage(plan,root)
  const o=plan.original;relative(o.archive);assert.match(o.source,/^[a-f0-9]{40}$/);assert.match(o.sha256,/^[a-f0-9]{64}$/);assert.match(o.planSha256,/^[a-f0-9]{64}$/);assert.match(o.qualificationSha256,/^[a-f0-9]{64}$/)
  assert.ok(Number.isSafeInteger(o.workflowRun)&&o.workflowRun>0);assert.ok(Number.isSafeInteger(o.size)&&o.size>0);assert.ok(Number.isSafeInteger(o.members)&&o.members>0)
  assert.equal(o.profile,'ITCVE-1@2.0.0');assert.equal(o.program,'ISI-4@4.0.0')
  assert.deepEqual(plan.expected,{repetitions:2,nativeAssertions:280,integratedAssertions:77,rustAssertions:48})
  assert.equal(plan.rust.corpus,'tpnil-rust-corpus@3');assert.equal(plan.rust.manifest,'components/rust/graph-oracle-3.0.0.json');assert.deepEqual(plan.rust.inputNames,reevaluationInputNames)
  assert.equal(sha256(fs.readFileSync(path.join(root,plan.rust.manifest))),plan.rust.manifestSha256)
  assert.deepEqual(Object.keys(plan.evaluatorSources).sort(),[...evaluatorSourceNames].sort())
  for(const [name,digest] of Object.entries(plan.evaluatorSources))assert.equal(sha256(fs.readFileSync(path.join(root,name))),digest,`Evaluator input differs: ${name}`)
}
export function validateOriginalEvidence(plan,zip,directory) {
  assert.equal(zip.length,plan.original.size);assert.equal(sha256(zip),plan.original.sha256)
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'tpnil-reevaluation-members-'))
  try{extractZipSafely(zip,scratch);const expected=inventory(scratch);assert.equal(expected.length,plan.original.members);assert.deepEqual(inventory(directory),expected,'Original members changed or were supplemented')}finally{fs.rmSync(scratch,{recursive:true,force:true})}
  const lock=read(path.join(directory,'run-lock.json')),base=read(path.join(directory,'qualification.json'))
  assert.equal(lock.source,plan.original.source);assert.equal(lock.planSha256,plan.original.planSha256);assert.equal(sha256(Buffer.from(JSON.stringify(lock.plan,null,2)+'\n')),lock.planSha256)
  assert.equal(lock.plan.itcve,plan.original.profile);assert.equal(lock.plan.program,plan.original.program);assert.equal(lock.plan.repetitions,2)
  assert.equal(sha256(fs.readFileSync(path.join(directory,'qualification.json'))),plan.original.qualificationSha256);assert.equal(base.qualifiedEnvironment,true);assert.equal(base.repetitionMatch,true);assert.equal(base.source,plan.original.source);assert.ok(['PASS','FAIL','BLOCKED'].includes(base.outcome),'Missing native outcome')
  assert.equal(base.itcve,plan.original.profile);assert.equal(base.program,plan.original.program)
  assert.ok(!fs.existsSync(path.join(directory,'integrated-qualification.json')),'This recovery plan must retain the original failed whole-pack boundary')
  return {lock,base}
}
function execute(command,args,root,log,expectedReceipt={verified:true}) {
  const result=spawnSync(command,args,{cwd:root,env:{...process.env,RUSTUP_TOOLCHAIN:'1.88.0',CARGO_NET_OFFLINE:'true'},encoding:'utf8',timeout:300000,maxBuffer:32*1024*1024})
  if(log)fs.writeFileSync(log,result.stdout+'\n'+result.stderr,{flag:'wx'})
  assert.equal(result.status,0,`${args[0]} failed: ${result.stderr}\n${result.stdout}`)
  return requireVerifierReceipt(result.stdout,expectedReceipt)
}
function verifyIntegratedChildren(frozen,directory,index,logDirectory) {
  const base=path.join(directory,`repetition-${index}`),integrated=path.join(base,'evidence/integrated'),get=name=>read(path.join(integrated,name)),record=read(path.join(base,'record.json'))
  const report=get('result.json'),relay=get('relay.json'),paid=get('paid-http.json'),messaging=get('messaging.json'),boundary=get('boundary.json'),trust=get('identity-trust.json')
  const lock=read(path.join(directory,'run-lock.json')),source=name=>read(path.join(frozen,name))
  const required=[...source('components/transport/profile.json').assertions,...['typescript','go-adapted'].flatMap(implementation=>['discovery','native-paid-delivery','restart-ack-replay'].map(id=>`messaging/${implementation}/${id}`)),'NATIVE-SYNTHESIS-UHRP','NATIVE-SYNTHESIS-BOARD','NATIVE-SYNTHESIS-LCH','NATIVE-SYNTHESIS-REVISION',...source(lock.plan.boundaryProfile).assertions.map(id=>`boundary/${id}`),...source('infra/native/integrated/trust-profile.json').assertions]
  assert.equal(report.schema,'tpnil-native-integration@1');assert.equal(report.profile,'ITCVE-1@2.0.0');assert.equal(required.length,77);assert.deepEqual(report.assertions.map(row=>row.id).sort(),required.sort())
  assert.ok(report.assertions.every(row=>['PASS','FAIL','BLOCKED'].includes(row.result)))
  for(const file of fs.readdirSync(integrated)){const bound=record.evidence.find(row=>row.name===`integrated/${file}`);assert.ok(bound);assert.equal(sha256(fs.readFileSync(path.join(integrated,file))),bound.sha256)}
  const identity=relay.trace.find(row=>row.method==='getPublicKey'&&row.status===200)?.body?.result?.publicKey
  assert.match(identity,/^(02|03)[a-f0-9]{64}$/);assert.equal(report.walletIdentity,identity);assert.equal(messaging.nativeIdentity,identity)
  const calls=boundary.trace.filter(row=>row.method==='getPublicKey'&&row.args?.identityKey===true);assert.equal(calls.length,1);assert.equal(calls[0].result?.publicKey,identity);assert.equal(trust.certificate?.subject,identity);assert.equal(boundary.discoveryExpectation,'published')
  const expected=[...relay.assertions,...paid.assertions,...messaging.assertions.map(row=>({id:`messaging/${row.id}`,result:row.verdict})),...get('synthesis.json').assertions.map(row=>({id:row.id,result:row.verdict})),...boundary.assertions.map(row=>({id:`boundary/${row.id}`,result:row.result})),...trust.assertions]
  assert.deepEqual(semantic(report.assertions),semantic(expected))
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'tpnil-reevaluation-transport-'))
  const run=(name,args)=>execute(process.execPath,[path.join(frozen,'scripts',name),...args],frozen,logDirectory?path.join(logDirectory,`repetition-${index}-${name}.log`):undefined)
  try{for(const name of ['relay.json','paid-http.json'])fs.copyFileSync(path.join(integrated,name),path.join(temporary,name));fs.writeFileSync(path.join(temporary,'result.json'),JSON.stringify({schema:'tpnil-component-result@1',assertions:[...relay.assertions,...paid.assertions],evidence:['relay.json','paid-http.json'].map(name=>({path:name,sha256:sha256(fs.readFileSync(path.join(temporary,name)))})),cleanup:{nativeEnvelopeVerified:true}}));run('verify-transport.mjs',[temporary])}finally{fs.rmSync(temporary,{recursive:true,force:true})}
  run('verify-native-messaging.mjs',[integrated]);run('verify-native-synthesis.mjs',[integrated,'--integrated',identity]);run('verify-wallet-boundary.mjs',[integrated,'--integrated']);run('verify-native-trust.mjs',[integrated])
  return {identity,assertions:semantic(report.assertions),counts:counts(report.assertions),recordSha256:sha256(fs.readFileSync(path.join(base,'record.json')))}
}
export function originalRustObservation(directory) {
  return [1,2].map(index=>{const file=path.join(directory,`rust-repetition-${index}/result.json`);if(!fs.existsSync(file))return {index,status:'NOT_EXECUTED'};const report=read(file);assert.equal(report.corpus,'tpnil-rust-corpus@2');return {index,status:'EXECUTED',corpus:report.corpus,sha256:sha256(fs.readFileSync(file)),assertions:report.assertions.length,counts:counts(report.assertions),outcome:report.outcome}})
}
export function validateReevaluationLock(runLock,root) {
  const plan=runLock.plan
  assert.equal(runLock.schema,'tpnil-native-integrated-reevaluation-run-lock@1');assert.equal(runLock.sourceDirty,false);assert.match(runLock.evaluatorSource,/^[a-f0-9]{40}$/)
  assert.equal(runLock.planSha256,sha256(Buffer.from(JSON.stringify(plan,null,2)+'\n')));validateReevaluationPlan(plan,root)
  relative(runLock.planPath)
  if(plan.sourceBindingRevision!==undefined) {
    assert.equal(runLock.planPath,revisions[plan.sourceBindingRevision].path)
    for(const ancestor of validateReevaluationLineage(plan,root)) {
      const predecessor=execFileSync('git',['show',`${runLock.evaluatorSource}:${ancestor.path}`],{cwd:process.env.TPNIL_REPLAY_GIT_ROOT??root,maxBuffer:8*1024*1024})
      assert.equal(sha256(predecessor),ancestor.sha256,'Accepted predecessor differs at evaluator source')
    }
  }
  const frozenPlan=execFileSync('git',['show',`${runLock.evaluatorSource}:${runLock.planPath}`],{cwd:process.env.TPNIL_REPLAY_GIT_ROOT??root,maxBuffer:8*1024*1024})
  assert.equal(sha256(frozenPlan),runLock.planSha256,'Plan differs from its committed evaluator source');assert.deepEqual(JSON.parse(frozenPlan),plan)
  for(const name of evaluatorSourceNames){const frozen=execFileSync('git',['show',`${runLock.evaluatorSource}:${name}`],{cwd:process.env.TPNIL_REPLAY_GIT_ROOT??root,maxBuffer:8*1024*1024});assert.equal(sha256(frozen),plan.evaluatorSources[name])}
  return plan
}
export function evaluateNativeReevaluation({root,output,produce=false}) {
  const runLock=read(path.join(output,'run-lock.json')),plan=validateReevaluationLock(runLock,root)
  const original=path.join(output,'original'),zip=fs.readFileSync(path.join(output,'original-native.zip')),{base}=validateOriginalEvidence(plan,zip,original)
  const originalBefore=inventory(original),scratch=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'tpnil-native-reevaluation-'))),frozen=path.join(scratch,'source'),copy=path.join(scratch,'evidence')
  const logDirectory=produce?path.join(output,'logs'):undefined;if(logDirectory)fs.mkdirSync(logDirectory)
  try {
    prepareFrozenComponentReplay(root,plan.original.source,frozen);fs.cpSync(original,copy,{recursive:true})
    execute(process.execPath,['--import',path.join(frozen,'synthesis/node_modules/tsx/dist/loader.mjs'),path.join(frozen,'synthesis/src/wallet-lab/native/verify.ts'),copy],frozen,logDirectory?path.join(logDirectory,'native-admission.log'):undefined)
    assert.deepEqual(fs.readFileSync(path.join(copy,'qualification.json')),fs.readFileSync(path.join(original,'qualification.json')))
    const repetitions=[]
    // The failed original corpus is itself replayed; its FAIL remains an observation.
    for(const index of [1,2]) if(fs.existsSync(path.join(original,`rust-repetition-${index}/result.json`))) {
      const inputs=reevaluationInputNames.map(name=>path.join(original,`repetition-${index}/evidence/integrated`,name))
      execute(process.execPath,[path.join(frozen,'scripts/verify-rust.mjs'),path.join(original,`rust-repetition-${index}`),...inputs],frozen,logDirectory?path.join(logDirectory,`original-rust-${index}.log`):undefined,{verified:true,assertions:48,parentInputsBound:4,independentReplay:true,outcome:read(path.join(original,`rust-repetition-${index}/result.json`)).outcome})
    }
    for(const index of [1,2]) {
      const integration=verifyIntegratedChildren(frozen,original,index,logDirectory),inputs=reevaluationInputNames.map(name=>path.join(original,`repetition-${index}/evidence/integrated`,name)),rustDirectory=path.join(output,`rust-repetition-${index}`)
      if(produce)execute(process.execPath,[path.join(root,'scripts/run-rust.mjs'),rustDirectory,...inputs,'--corpus-v3'],root,path.join(logDirectory,`rust-${index}-run.log`),{schema:'tpnil-component-result@1',corpus:plan.rust.corpus,outcome:'PASS'})
      execute(process.execPath,[path.join(root,'scripts/verify-rust.mjs'),rustDirectory,...inputs,'--corpus-v3'],root,logDirectory?path.join(logDirectory,`rust-${index}-verify.log`):undefined,{verified:true,assertions:48,parentInputsBound:4,independentReplay:true,outcome:'PASS'})
      const rust=read(path.join(rustDirectory,'result.json'));assert.equal(rust.corpus,plan.rust.corpus);assert.equal(rust.outcome,'PASS');assert.equal(rust.assertions.length,48)
      const record=read(path.join(original,`repetition-${index}/record.json`)),native=record.vectors.flatMap(row=>row.assertions);assert.equal(native.length,280)
      repetitions.push({index,...integration,native:{assertions:280,counts:counts(native),vectors:record.vectors.map(({id,outcome})=>({id,outcome}))},rust:{corpus:rust.corpus,assertions:48,counts:counts(rust.assertions),outcome:rust.outcome,resultSha256:sha256(fs.readFileSync(path.join(rustDirectory,'result.json'))),inputs:inputs.map((file,i)=>({name:reevaluationInputNames[i],sha256:sha256(fs.readFileSync(file))}))}})
    }
    assert.notEqual(repetitions[0].identity,repetitions[1].identity);assert.deepEqual(repetitions[0].assertions,repetitions[1].assertions);assert.deepEqual(inventory(original),originalBefore)
    const integrationOutcome=repetitions[0].assertions.every(row=>row.result==='PASS')?'PASS':'FAIL'
    return {schema:reevaluationSchema,claim:'RETAINED_NATIVE_EVIDENCE_REEVALUATION',qualifiedRetainedEvidence:true,plan:plan.id,planSha256:runLock.planSha256,evaluatorSource:runLock.evaluatorSource,original:{workflowRun:plan.original.workflowRun,source:plan.original.source,sha256:plan.original.sha256,size:plan.original.size,members:originalBefore.length,profile:plan.original.profile,program:plan.original.program,planSha256:plan.original.planSha256,qualificationSha256:plan.original.qualificationSha256,rust:originalRustObservation(original)},newNativeSessions:0,originalMembersUnchanged:true,nativeOutcome:base.outcome,integrationOutcome,rustOutcome:'PASS',outcome:base.outcome==='FAIL'||integrationOutcome==='FAIL'?'FAIL':base.outcome,completeBRC100Conformance:false,repetitions}
  } finally {fs.rmSync(scratch,{recursive:true,force:true})}
}
