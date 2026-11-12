import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { selectNativeRustCorpus } from './native-rust-compatibility.mjs'
const root=path.resolve(import.meta.dirname,'..'), output=path.resolve(process.argv[2]??'out/native-integrated')
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const read=file=>JSON.parse(fs.readFileSync(path.join(output,file),'utf8'))
const sourceRead=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'))
function execute(script,args=[]) {
  const result=spawnSync(process.execPath,[path.join(root,'scripts',script),...args],{stdio:'inherit',timeout:300_000})
  if(result.status!==0) throw new Error(`${script} did not verify the retained observations`)
}
export function verifyIntegratedWalletIdentity(identity,boundary,trust) {
  const calls=boundary.trace.filter(row=>row.method==='getPublicKey'&&row.args?.identityKey===true)
  assert.equal(calls.length,1,'Expected one boundary wallet identity observation')
  assert.equal(calls[0].result?.publicKey,identity,'Boundary corpus belongs to a different native wallet')
  if(trust) assert.equal(trust.certificate?.subject,identity,'Trust certificate belongs to a different native wallet')
}
if(process.argv[1]&&path.resolve(process.argv[1])===import.meta.filename) {
const admission=spawnSync(process.execPath,['--import',path.join(root,'synthesis/node_modules/tsx/dist/loader.mjs'),path.join(root,'synthesis/src/wallet-lab/native/verify.ts'),output],{stdio:'inherit',timeout:60_000})
assert.equal(admission.status,0,'Native artifact, isolation, trust, funding and cleanup admission failed')
const base=read('qualification.json'),lock=read('run-lock.json')
const rustPolicy=await selectNativeRustCorpus(lock)
assert.equal(base.qualifiedEnvironment,true)
const candidate=['ITCVE-1@4.1.0','ITCVE-1@4.2.0'].includes(base.itcve)
const observer3=lock.executionVariant==='integrated-native-conformance-pr368-cb3c2f2-observer-3'
const observer2=lock.executionVariant==='integrated-native-conformance-5.1.1-observer-2'
const wallet511=candidate||base.itcve==='ITCVE-1@4.0.0'
if(candidate) { assert.equal(base.claim,'ENGINEERING_OBSERVATION_ONLY'); assert.equal(lock.plan.walletCandidate?.officialRelease,false) }
const closure=wallet511||base.itcve==='ITCVE-1@2.0.0'
const coverage=closure||base.itcve==='ITCVE-1@1.5.0'
const conformance=coverage||base.itcve==='ITCVE-1@1.4.0'
assert.equal(base.itcve,observer3?'ITCVE-1@4.2.0':candidate?'ITCVE-1@4.1.0':wallet511?'ITCVE-1@4.0.0':closure?'ITCVE-1@2.0.0':coverage?'ITCVE-1@1.5.0':conformance?'ITCVE-1@1.4.0':'ITCVE-1@1.3.0')
const trustedIdentity=lock.plan.identityTrust==='public-settings-token'
assert.deepEqual(lock.plan,sourceRead(observer3?'infra/native/conformance/plan-pr368-cb3c2f2-observer-3.json':candidate?'infra/native/conformance/plan-pr368-7e39006.json':observer2?'infra/native/conformance/plan-5.1.1-observer-2.json':wallet511?'infra/native/conformance/plan-5.1.1.json':closure?'infra/native/conformance/plan-coverage-closure.json':coverage?'infra/native/conformance/plan-coverage.json':conformance?'infra/native/conformance/plan.json':trustedIdentity?'infra/native/integrated/plan-trusted.json':'infra/native/integrated/plan.json'))
const trustProfile=trustedIdentity?sourceRead('infra/native/integrated/trust-profile.json'):null
const transport=sourceRead('components/transport/profile.json')
const boundaryProfile=sourceRead(lock.plan.boundaryProfile??'programs/ISI-4/profiles/brc100-boundary-1.0.0/profile.json')
const required=[...transport.assertions,
  ...['typescript','go-adapted'].flatMap(implementation=>['discovery','native-paid-delivery','restart-ack-replay'].map(id=>`messaging/${implementation}/${id}`)),
  'NATIVE-SYNTHESIS-UHRP','NATIVE-SYNTHESIS-BOARD','NATIVE-SYNTHESIS-LCH','NATIVE-SYNTHESIS-REVISION',
  ...boundaryProfile.assertions.map(id=>`boundary/${id}`),...(trustProfile?.assertions??[])]
const repetitions=[]
for(let index=1;index<=2;index++) {
  const prefix=`repetition-${index}/evidence/integrated`,directory=path.join(output,prefix)
  const record=read(`repetition-${index}/record.json`),report=read(`${prefix}/result.json`)
  assert.equal(report.schema,'tpnil-native-integration@1');assert.equal(report.profile,observer3?'ITCVE-1@4.2.0':candidate?'ITCVE-1@4.1.0':wallet511?'ITCVE-1@4.0.0':closure?'ITCVE-1@2.0.0':coverage?'ITCVE-1@1.5.0':conformance?'ITCVE-1@1.4.0':'ITCVE-1@1.3.0')
  assert.deepEqual(report.assertions.map(x=>x.id).sort(),[...required].sort())
  assert.ok(report.assertions.every(x=>['PASS','FAIL','BLOCKED'].includes(x.result)))
  for(const file of fs.readdirSync(directory)) {
    const entry=record.evidence.find(x=>x.name===`integrated/${file}`)
    assert.ok(entry,`Missing envelope binding: ${file}`);assert.equal(digest(path.join(directory,file)),entry.sha256)
  }
  const relay=read(`${prefix}/relay.json`),paid=read(`${prefix}/paid-http.json`)
  const identity=relay.trace.find(x=>x.method==='getPublicKey'&&x.status===200)?.body?.result?.publicKey
  assert.match(identity,/^(02|03)[0-9a-f]{64}$/);assert.equal(identity,report.walletIdentity)
  const messaging=read(`${prefix}/messaging.json`);assert.equal(messaging.nativeIdentity,identity)
  const boundary=read(`${prefix}/boundary.json`)
  verifyIntegratedWalletIdentity(identity,boundary,trustedIdentity?read(`${prefix}/identity-trust.json`):undefined)
  assert.equal(boundary.discoveryExpectation,trustedIdentity?'published':'untrusted-excluded')
  const expected=[...relay.assertions,...paid.assertions,
    ...messaging.assertions.map(x=>({id:`messaging/${x.id}`,result:x.verdict})),
    ...read(`${prefix}/synthesis.json`).assertions.map(x=>({id:x.id,result:x.verdict})),
    ...boundary.assertions.map(x=>({id:`boundary/${x.id}`,result:x.result})),...(trustedIdentity?read(`${prefix}/identity-trust.json`).assertions:[])]
  const semantic=items=>items.map(({id,result})=>({id,result})).sort((a,b)=>a.id.localeCompare(b.id))
  assert.deepEqual(semantic(report.assertions),semantic(expected))
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'tpnil-native-transport-verify-'))
  try {
    for(const name of ['relay.json','paid-http.json']) fs.copyFileSync(path.join(directory,name),path.join(temporary,name))
    fs.writeFileSync(path.join(temporary,'result.json'),JSON.stringify({schema:'tpnil-component-result@1',assertions:[...relay.assertions,...paid.assertions],evidence:['relay.json','paid-http.json'].map(name=>({path:name,sha256:digest(path.join(temporary,name))})),cleanup:{nativeEnvelopeVerified:true}}))
    execute('verify-transport.mjs',[temporary])
  } finally {fs.rmSync(temporary,{recursive:true,force:true})}
  execute('verify-native-messaging.mjs',[directory])
  execute('verify-native-synthesis.mjs',[directory,'--integrated',identity])
  execute('verify-wallet-boundary.mjs',[directory,'--integrated'])
  if(trustedIdentity) execute('verify-native-trust.mjs',[directory,...(observer3?['--oracle-2']:[])])
  const rustDirectory=path.join(output,`rust-repetition-${index}`)
  const rustInputs=['paid-http.json','messaging.json','synthesis-transactions.json',...(trustedIdentity?['identity-trust.json']:[])].map(file=>path.join(directory,file))
  if(!fs.existsSync(path.join(rustDirectory,'result.json'))) execute('run-rust.mjs',[rustDirectory,...rustInputs,...rustPolicy.cliFlags])
  execute('verify-rust.mjs',[rustDirectory,...rustInputs,...rustPolicy.cliFlags])
  const rustReport=read(`rust-repetition-${index}/result.json`)
  assert.equal(rustReport.outcome,'PASS')
  repetitions.push({index,identity,assertions:semantic(report.assertions),recordSha256:digest(path.join(output,`repetition-${index}/record.json`)),rustSha256:digest(path.join(rustDirectory,'result.json'))})
}
assert.notEqual(repetitions[0].identity,repetitions[1].identity)
assert.deepEqual(repetitions[0].assertions,repetitions[1].assertions)
const result={schema:conformance?'tpnil-native-integrated-qualification@2':'tpnil-native-integrated-qualification@1',claim:candidate?'ENGINEERING_OBSERVATION_ONLY':'EXPERIMENTAL_CONFORMANCE_RESULT',...(trustedIdentity?{identityTrust:'public-settings-token'}:{}),scope:candidate?`Exact CI-built Yours PR368 ${observer3?'cb3c2f2':'7e39006'} engineering candidate under the same isolated native UI/CWI, Go services,426 predicates and Rust3 oracle; no unchanged production-release qualification or complete BRC100 claim.`:conformance?`Unchanged Yours${lock.plan.wallet.version} native ToDo UI and public CWI, visible consent, controlled rejection/recovery, native Wallet Backup counterpart replacement, integrated component graph and pinned clause predicates. Remaining BRC100 obligations and real SUT failures remain explicit; no complete BRC100 or certification claim.`:trustedIdentity?'Unchanged Yours5.1.0 public CWI: relay/paid HTTP, discovered TS/Go Message Box payments, Board/UHRP/CHIRP/LCH graph, BRC100 method corpus and positive identity discovery after public settings-token authorization, cache expiry and settings restoration. Original ToDo vectors separately retained; no complete BRC100, phone/camera or native Board UI claim.':'Unchanged Yours5.1.0 public CWI: relay/paid HTTP, discovered TS/Go Message Box payments, Board/UHRP/CHIRP/LCH graph and BRC100 method corpus on declared Go compatibility storage. Original ToDo vectors separately retained; no complete BRC100, trusted-positive native discovery, phone/camera or native Board UI claim.',profile:observer3?'ITCVE-1@4.2.0':candidate?'ITCVE-1@4.1.0':wallet511?'ITCVE-1@4.0.0':closure?'ITCVE-1@2.0.0':coverage?'ITCVE-1@1.5.0':conformance?'ITCVE-1@1.4.0':'ITCVE-1@1.3.0',source:lock.source,qualifiedEnvironment:true,repetitionMatch:true,repetitions,outcome:repetitions[0].assertions.every(x=>x.result==='PASS')?'PASS':'FAIL',baselineWalletOutcome:base.outcome}
if(conformance) {
  result.program=base.program
  result.vectors=base.vectors
  result.integrationOutcome=result.outcome
  result.outcome=[base.outcome,result.integrationOutcome].includes('FAIL')?'FAIL':base.outcome==='BLOCKED'?'BLOCKED':result.integrationOutcome
  result.completeBRC100Conformance=false
}
if(rustPolicy.binding) result.rustCompatibility=rustPolicy.binding
const target=path.join(output,'integrated-qualification.json')
if(fs.existsSync(target)) assert.deepEqual(JSON.parse(fs.readFileSync(target)),result)
else fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify(result))
}
