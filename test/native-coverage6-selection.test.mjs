import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { execFileSync } from 'node:child_process'
import { selectNativeWalletProfile, nativeCandidateCoverage6Flag, nativeCandidateCoverage6Variant, nativeCandidateCoverage6PlanPath } from '../scripts/native-wallet-profiles.mjs'
import { checkNativeWalletSelector } from '../scripts/check-native-wallet-selector.mjs'
import { nativeRustBinding } from '../scripts/native-rust-compatibility.mjs'

const root = path.resolve(import.meta.dirname, '..')
const read = name => fs.readFileSync(path.join(root, name))
const plan = JSON.parse(read(nativeCandidateCoverage6PlanPath))
const worker = read('synthesis/src/wallet-lab/native/worker.ts').toString()
const startup = worker.slice(worker.indexOf("const root = '/work'"), worker.indexOf('fs.mkdirSync(output,')) + '\n;({planFile,walletRoot,walletVersion,completion,plan})'
const environment = () => ({TPNIL_NATIVE_WALLET_VERSION:'5.1.1-pr368.e360e67',TPNIL_NATIVE_OBSERVER_REVISION:'3',TPNIL_NATIVE_COVERAGE_REVISION:'6',TPNIL_NATIVE_CLOSURE:'1',TPNIL_NATIVE_COVERAGE:'1',TPNIL_NATIVE_CONFORMANCE:'1',TPNIL_NATIVE_INTEGRATED:'1',TPNIL_NATIVE_IDENTITY_TRUST:'1'})
const syntheticArtifact = {id:'yours-wallet-chromium-extension',version:'5.1.1-pr368.e360e67',sha256:'a'.repeat(64),size:123}
function startupFixture({env=environment(),artifact=syntheticArtifact,mutate=p=>p}={}) {
  return vm.runInNewContext(startup,{process:{env},path,yoursPr368Coverage1Artifact:{version:'5.1.1-pr368.4a954ac'},yoursCandidateArtifactsByProfile:artifact?{'ITCVE-1@4.8.0':artifact}:{},fs:{readFileSync:file=>{
    assert.equal(file,'/work/'+nativeCandidateCoverage6PlanPath)
    // Test-only admission fixture. It cannot qualify a candidate or execute a browser.
    return JSON.stringify(mutate({...plan,admissionState:'FROZEN',expectedObservations:698,wallet:artifact}))
  }}})
}
test('completion selector is distinct and current pending inputs cannot start native execution',async()=>{
  const selected=selectNativeWalletProfile(nativeCandidateCoverage6Flag)
  assert.equal(selected.planPath,nativeCandidateCoverage6PlanPath);assert.equal(selected.coverageRevision,6)
  assert.equal(selected.walletVersion,'5.1.1-pr368.e360e67');assert.equal(selected.walletDirectory,'yours-wallet-pr368-e360e67')
  assert.equal(plan.itcve,'ITCVE-1@4.8.0');assert.equal(plan.program,'ISI-4@5.8.0')
  if(plan.admissionState!=='FROZEN') {
    await assert.rejects(checkNativeWalletSelector(nativeCandidateCoverage6Variant),/not frozen/)
    await assert.rejects(nativeRustBinding(plan,'a'.repeat(64),'b'.repeat(40)))
  }
  assert.throws(()=>startupFixture({artifact:null}),/intake is not frozen/)
})
test('worker selects only4.8 with explicit coverage6 and complete identity/observer flags',()=>{
  const actual=startupFixture();assert.equal(actual.completion,true)
  assert.equal(actual.walletRoot,'/work/out/sut-artifacts/yours-wallet-pr368-e360e67')
  for(const key of ['TPNIL_NATIVE_OBSERVER_REVISION','TPNIL_NATIVE_COVERAGE_REVISION','TPNIL_NATIVE_CLOSURE','TPNIL_NATIVE_CONFORMANCE','TPNIL_NATIVE_INTEGRATED','TPNIL_NATIVE_IDENTITY_TRUST']) {
    const env=environment();delete env[key];assert.throws(()=>startupFixture({env}))
  }
  for(const mutate of [p=>({...p,coverageRevision:3}),p=>({...p,itcve:'ITCVE-1@4.4.0'}),p=>({...p,program:'ISI-4@5.4.0'}),p=>({...p,expectedObservations:535}),p=>({...p,expectedObservations:697}),p=>({...p,expectedObservations:699}),p=>({...p,admissionState:'PENDING_SOURCE_FREEZE'}),p=>({...p,permissionFixture:undefined})]) assert.throws(()=>startupFixture({mutate}))
})
test('coverage6 freezes all current inputs and admits its complete source fixture', async () => {
  for (const [name, digest] of Object.entries(plan.conformanceInputs)) assert.equal((await import('node:crypto')).createHash('sha256').update(read(name)).digest('hex'), digest, name)
  const selected = await checkNativeWalletSelector('integrated-native-conformance-pr368-coverage-6', { source: 'a'.repeat(40), read, readCommitted: (_source, name) => read(name) })
  assert.equal(selected.plan, 'infra/native/conformance/plan-pr368-coverage-6-source-6.json')
  assert.equal(selected.wallet.version, '5.1.1-pr368.e360e67')
  assert.equal(selected.rust.corpus, 'tpnil-rust-corpus@3')
  assert.equal(selected.rust.manifest, 'infra/native/conformance/rust-graph-pr368-coverage-6-source-6.json')
})
test('coverage6 cannot substitute an input or a release artifact in its source fixture', async () => {
  const variant = 'integrated-native-conformance-pr368-coverage-6', options = { source: 'a'.repeat(40), read, readCommitted: (_source, name) => read(name) }
  await assert.rejects(checkNativeWalletSelector(variant, { ...options, read: name => name === 'synthesis/src/wallet-lab/services.ts' ? Buffer.from('changed') : read(name) }), /Current conformance input differs/)
  await assert.rejects(checkNativeWalletSelector(variant, { ...options, readCommitted: (_source, name) => name === 'infra/native/conformance/plan-pr368-coverage-6-source-6.json' ? Buffer.from('changed') : read(name) }), /Plan is not committed/)
})

test('source successor preserves original frozen4.8 criteria and exact source1 JSON bytes', () => {
 for(const name of ['infra/native/conformance/plan-pr368-coverage-6-source-4.json','infra/native/conformance/rust-graph-pr368-coverage-6-source-4.json']) assert.deepEqual(read(name),execFileSync('git',['show',`f4bc39f4675acc7d5fea3eebda7ae7b3a7e4aca6:${name}`],{maxBuffer:32*1024*1024}))
 for(const name of ['infra/native/conformance/plan-pr368-coverage-6-source-5.json','infra/native/conformance/rust-graph-pr368-coverage-6-source-5.json']) assert.deepEqual(read(name),execFileSync('git',['show',`71d8b58cbbf802377b34cfbcceb056413b2327d1:${name}`],{maxBuffer:32*1024*1024}))
 const originalPath='infra/native/conformance/plan-pr368-coverage-6.json'
 for(const name of ['infra/native/conformance/plan-pr368-coverage-6-source-3.json','infra/native/conformance/rust-graph-pr368-coverage-6-source-3.json']) assert.deepEqual(read(name),execFileSync('git',['show',`38d06bfe2de7e3c1cfbb26b9848052d301b85905:${name}`],{maxBuffer:32*1024*1024}))
 for(const name of ['infra/native/conformance/plan-pr368-coverage-6-source-2.json','infra/native/conformance/rust-graph-pr368-coverage-6-source-2.json']) assert.deepEqual(read(name),execFileSync('git',['show',`4c872d109e49d2e63b3942cc0ec2f7386832c5a9:${name}`],{maxBuffer:32*1024*1024}))
 const original=JSON.parse(read(originalPath))
 const semantic=value=>Object.fromEntries(Object.entries(value).filter(([key])=>!['id','conformanceInputs','sourceBindingRevision','sourcePredecessor'].includes(key)))
 assert.deepEqual(semantic(plan),semantic(original))
 for(const name of [originalPath,'infra/native/conformance/rust-graph-pr368-coverage-6.json',...Object.keys(original.conformanceInputs).filter(name=>name.startsWith('itcves/')||name.startsWith('programs/'))]) {
  assert.deepEqual(read(name),execFileSync('git',['show',`bbbc164b9042468e3e5895c3a6f42177dcc4b568:${name}`],{maxBuffer:32*1024*1024}),name)
 }
 assert.equal(plan.sourceBindingRevision,14)
})
