import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { nativeWallet511Variant, nativeWallet511PlanPath } from './native-wallet-profiles.mjs'
const root=path.resolve(import.meta.dirname,'..')
export const nativeRustV3Variant='integrated-native-conformance-closure-rust-v3'
export const nativeRustV3Flag='--conformance-closure-rust-v3'
export const nativeRustOriginalCompatibilityPath='infra/native/conformance/rust-graph-3.0.0.json'
export const nativeRustCompatibilityPath='infra/native/conformance/rust-graph-3.0.0-selector-2.json'
export const nativeWallet511CompatibilityPath='infra/native/conformance/rust-graph-5.1.1.json'
export const nativeRustCompatibilitySources=['scripts/native-rust-compatibility.mjs','scripts/native-wallet-profiles.mjs','scripts/run-native-go-wallet.mjs','scripts/verify-native-integrated.mjs','.github/workflows/isi4-yours-wallet.yml']
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')

/** Each execution source selects a separately bound observer manifest. The
 * original native2 plan and its ten acceptance inputs remain unchanged. */
export async function nativeRustBinding(plan,planSha256,source,{read=file=>fs.readFileSync(path.join(root,file)),readCommitted=(revision,file)=>execFileSync('git',['show',`${revision}:${file}`],{cwd:process.env.TPNIL_REPLAY_GIT_ROOT??root,stdio:['ignore','pipe','pipe']}),graphPolicy=async()=> (await import('./rust-corpus.mjs')).rustCorpusPolicy('tpnil-rust-corpus@3')}={}) {
  assert.match(source,/^[a-f0-9]{40}$/,'The future-native observer must bind a committed execution source')
  const wallet511=plan.itcve==='ITCVE-1@4.0.0'
  const compatibilityPath=wallet511?nativeWallet511CompatibilityPath:nativeRustCompatibilityPath
  const bytes=read(compatibilityPath),manifest=JSON.parse(bytes)
  assert.equal(sha(readCommitted(source,compatibilityPath)),sha(bytes),'Compatibility manifest did not exist unchanged at the recorded native execution source')
  assert.equal(manifest.schema,'tpnil-native-rust-compatibility@3.0.0')
  assert.equal(manifest.variant,wallet511?nativeWallet511Variant:nativeRustV3Variant)
  assert.equal(manifest.sourceBindingRevision,wallet511?1:2)
  if(!wallet511) {
    const prior=read(nativeRustOriginalCompatibilityPath)
    assert.deepEqual(manifest.predecessor,{manifest:nativeRustOriginalCompatibilityPath,sha256:sha(prior)})
    assert.equal(sha(readCommitted(source,nativeRustOriginalCompatibilityPath)),sha(prior))
  }
  assert.equal(manifest.nativePlan.path,wallet511?nativeWallet511PlanPath:'infra/native/conformance/plan-coverage-closure.json')
  assert.equal(manifest.nativePlan.profile,wallet511?'ITCVE-1@4.0.0':'ITCVE-1@2.0.0');assert.equal(manifest.nativePlan.program,wallet511?'ISI-4@5.0.0':'ISI-4@4.0.0')
  const nativeBytes=read(manifest.nativePlan.path),native=JSON.parse(nativeBytes)
  assert.equal(sha(nativeBytes),manifest.nativePlan.sha256);assert.equal(planSha256,manifest.nativePlan.sha256)
  assert.deepEqual(plan,native);assert.equal(plan.itcve,manifest.nativePlan.profile);assert.equal(plan.program,manifest.nativePlan.program)
  assert.equal(sha(readCommitted(source,manifest.nativePlan.path)),manifest.nativePlan.sha256)
  assert.deepEqual(Object.keys(manifest.sources).sort(),[...nativeRustCompatibilitySources].sort())
  for(const file of nativeRustCompatibilitySources) {
    assert.equal(sha(read(file)),manifest.sources[file],`Native observer selection source differs: ${file}`)
    assert.equal(sha(readCommitted(source,file)),manifest.sources[file],`Native observer selection was absent or different at execution: ${file}`)
  }
  const policy=await graphPolicy()
  assert.equal(policy.corpus,'tpnil-rust-corpus@3');assert.equal(manifest.rustCorpus,policy.corpus)
  assert.deepEqual(manifest.graphOracle,policy.graphOracle)
  assert.equal(sha(read(policy.graphOracle.manifest)),policy.graphOracle.manifestSha256)
  assert.equal(sha(readCommitted(source,policy.graphOracle.manifest)),policy.graphOracle.manifestSha256)
  const graphManifest=JSON.parse(read(policy.graphOracle.manifest))
  for(const [file,digest] of Object.entries(graphManifest.sources)) assert.equal(sha(readCommitted(source,file)),digest,`Rust graph source differed at native execution: ${file}`)
  return {variant:manifest.variant,manifest:compatibilityPath,manifestSha256:sha(bytes),nativePlanSha256:planSha256,corpus:policy.corpus,graphOracle:policy.graphOracle}
}

export async function selectNativeRustCorpus(lock,options) {
  if(lock.rustCompatibility===undefined) {
    assert.notEqual(lock.plan?.itcve,'ITCVE-1@4.0.0','Yours5.1.1 requires its Rust3 compatibility binding')
    assert.equal(lock.executionVariant,undefined,'A native Rust3 variant requires its exact compatibility binding')
    return {corpus:'tpnil-rust-corpus@2',cliFlags:[]}
  }
  assert.equal(lock.executionVariant,lock.plan?.itcve==='ITCVE-1@4.0.0'?nativeWallet511Variant:nativeRustV3Variant)
  const binding=await nativeRustBinding(lock.plan,lock.planSha256,lock.source,options)
  assert.deepEqual(lock.rustCompatibility,binding,'Native Rust observer binding differs from the exact compatibility manifest')
  return {corpus:binding.corpus,cliFlags:['--corpus-v3'],binding}
}
