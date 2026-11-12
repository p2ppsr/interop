import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { execFileSync } from 'node:child_process'
import { selectNativeWalletProfile, nativeCandidateCoverage4Flag, nativeCandidateCoverage4Variant, nativeCandidateCoverage4PlanPath } from '../scripts/native-wallet-profiles.mjs'
import { checkNativeWalletSelector } from '../scripts/check-native-wallet-selector.mjs'
import { nativeRustBinding } from '../scripts/native-rust-compatibility.mjs'

const root = path.resolve(import.meta.dirname, '..')
const read = name => fs.readFileSync(path.join(root, name))
const plan = JSON.parse(read(nativeCandidateCoverage4PlanPath))
const worker = read('synthesis/src/wallet-lab/native/worker.ts').toString()
const startup = worker.slice(worker.indexOf("const root = '/work'"), worker.indexOf('fs.mkdirSync(output,')) + '\n;({planFile,walletRoot,walletVersion,completion,plan})'
const environment = () => ({TPNIL_NATIVE_WALLET_VERSION:'5.1.1-pr368.e360e67',TPNIL_NATIVE_OBSERVER_REVISION:'3',TPNIL_NATIVE_COVERAGE_REVISION:'4',TPNIL_NATIVE_CLOSURE:'1',TPNIL_NATIVE_COVERAGE:'1',TPNIL_NATIVE_CONFORMANCE:'1',TPNIL_NATIVE_INTEGRATED:'1',TPNIL_NATIVE_IDENTITY_TRUST:'1'})
const syntheticArtifact = {id:'yours-wallet-chromium-extension',version:'5.1.1-pr368.e360e67',sha256:'a'.repeat(64),size:123}
function startupFixture({env=environment(),artifact=syntheticArtifact,mutate=p=>p}={}) {
  return vm.runInNewContext(startup,{process:{env},path,yoursPr368Coverage1Artifact:{version:'5.1.1-pr368.4a954ac'},yoursCandidateArtifactsByProfile:artifact?{'ITCVE-1@4.6.0':artifact}:{},fs:{readFileSync:file=>{
    assert.equal(file,'/work/'+nativeCandidateCoverage4PlanPath)
    // Test-only admission fixture. It cannot qualify a candidate or execute a browser.
    return JSON.stringify(mutate({...plan,admissionState:'FROZEN',expectedObservations:698,wallet:artifact}))
  }}})
}
test('completion selector is distinct and current pending inputs cannot start native execution',async()=>{
  const selected=selectNativeWalletProfile(nativeCandidateCoverage4Flag)
  assert.equal(selected.planPath,nativeCandidateCoverage4PlanPath);assert.equal(selected.coverageRevision,4)
  assert.equal(selected.walletVersion,'5.1.1-pr368.e360e67');assert.equal(selected.walletDirectory,'yours-wallet-pr368-e360e67')
  assert.equal(plan.itcve,'ITCVE-1@4.6.0');assert.equal(plan.program,'ISI-4@5.6.0')
  if(plan.admissionState!=='FROZEN') {
    await assert.rejects(checkNativeWalletSelector(nativeCandidateCoverage4Variant),/not frozen/)
    await assert.rejects(nativeRustBinding(plan,'a'.repeat(64),'b'.repeat(40)))
  }
  assert.throws(()=>startupFixture({artifact:null}),/intake is not frozen/)
})
test('worker selects only4.6 with explicit coverage4 and complete identity/observer flags',()=>{
  const actual=startupFixture();assert.equal(actual.completion,true)
  assert.equal(actual.walletRoot,'/work/out/sut-artifacts/yours-wallet-pr368-e360e67')
  for(const key of ['TPNIL_NATIVE_OBSERVER_REVISION','TPNIL_NATIVE_COVERAGE_REVISION','TPNIL_NATIVE_CLOSURE','TPNIL_NATIVE_CONFORMANCE','TPNIL_NATIVE_INTEGRATED','TPNIL_NATIVE_IDENTITY_TRUST']) {
    const env=environment();delete env[key];assert.throws(()=>startupFixture({env}))
  }
  for(const mutate of [p=>({...p,coverageRevision:3}),p=>({...p,itcve:'ITCVE-1@4.4.0'}),p=>({...p,program:'ISI-4@5.4.0'}),p=>({...p,expectedObservations:535}),p=>({...p,expectedObservations:697}),p=>({...p,expectedObservations:699}),p=>({...p,admissionState:'PENDING_SOURCE_FREEZE'}),p=>({...p,permissionFixture:undefined})]) assert.throws(()=>startupFixture({mutate}))
})
test('coverage4 keeps every executed coverage2 JSON byte-identical',()=>{
  const historical=JSON.parse(read('infra/native/conformance/plan-pr368-coverage-2.json'))
  const names=new Set(['infra/native/conformance/plan-pr368-coverage-2.json','infra/native/conformance/rust-graph-pr368-coverage-2.json',...Object.keys(historical.conformanceInputs).filter(name=>name.endsWith('.json'))])
  for(const name of names) assert.deepEqual(read(name),execFileSync('git',['show',`1f9fe0f9b979e9bbca66e90335f02ba2b80c7d41:${name}`],{cwd:root,maxBuffer:32*1024*1024}))
})

test('coverage4 freezes all current inputs and admits its complete source fixture', async () => {
  for (const [name, digest] of Object.entries(plan.conformanceInputs)) assert.equal((await import('node:crypto')).createHash('sha256').update(read(name)).digest('hex'), digest, name)
  const selected = await checkNativeWalletSelector('integrated-native-conformance-pr368-coverage-4', { source: 'a'.repeat(40), read, readCommitted: (_source, name) => read(name) })
  assert.equal(selected.plan, 'infra/native/conformance/plan-pr368-coverage-4.json')
  assert.equal(selected.wallet.version, '5.1.1-pr368.e360e67')
  assert.equal(selected.rust.corpus, 'tpnil-rust-corpus@3')
  assert.equal(selected.rust.manifest, 'infra/native/conformance/rust-graph-pr368-coverage-4.json')
})
test('coverage4 cannot substitute an input or a release artifact in its source fixture', async () => {
  const variant = 'integrated-native-conformance-pr368-coverage-4', options = { source: 'a'.repeat(40), read, readCommitted: (_source, name) => read(name) }
  await assert.rejects(checkNativeWalletSelector(variant, { ...options, read: name => name === 'synthesis/src/wallet-lab/services.ts' ? Buffer.from('changed') : read(name) }), /Current conformance input differs/)
  await assert.rejects(checkNativeWalletSelector(variant, { ...options, readCommitted: (_source, name) => name === 'infra/native/conformance/plan-pr368-coverage-4.json' ? Buffer.from('changed') : read(name) }), /Plan is not committed/)
})
