import {nativeWallet511PlanPath,nativeWallet511Variant} from '../scripts/native-wallet-profiles.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {nativeRustBinding,selectNativeRustCorpus,nativeRustV3Variant,nativeRustV3Flag,nativeRustCompatibilityPath,nativeRustOriginalCompatibilityPath,nativeWallet511CompatibilityPath,nativeRustCompatibilitySources} from '../scripts/native-rust-compatibility.mjs'
const root=path.resolve(import.meta.dirname,'..'),sha=b=>createHash('sha256').update(b).digest('hex'),read=name=>fs.readFileSync(path.join(root,name))
const planPath='infra/native/conformance/plan-coverage-closure.json',plan=JSON.parse(read(planPath)),planSha256=sha(read(planPath)),source='ab'.repeat(20)
const graphPath='components/rust/graph-oracle-3.0.0.json',graphManifest=JSON.parse(read(graphPath))
const graphOracle={id:graphManifest.schema,manifest:graphPath,manifestSha256:sha(read(graphPath)),operation:graphManifest.operation,cargoFeature:graphManifest.cargoFeature}
const historicalRead=file=>nativeRustCompatibilitySources.includes(file)?execFileSync('git',['show',`6b174e0b903225923999a44fb1de7d67cc4e2959:${file}`],{cwd:root}):read(file)
const options={read:historicalRead,readCommitted:(revision,file)=>{assert.equal(revision,source);return historicalRead(file)},graphPolicy:()=>({corpus:'tpnil-rust-corpus@3',graphOracle})}
async function lock(){return {source,plan,planSha256,executionVariant:nativeRustV3Variant,rustCompatibility:await nativeRustBinding(plan,planSha256,source,options)}}

test('native callers without explicit binding retain corpus2 without loading optional dependencies',async()=>{
  const forbidden=()=>{throw Error('Default caller touched optional Rust3 source')}
  assert.deepEqual(await selectNativeRustCorpus({plan,source},{read:forbidden,readCommitted:forbidden,graphPolicy:forbidden}),{corpus:'tpnil-rust-corpus@2',cliFlags:[]})
  assert.equal(nativeRustV3Flag,'--conformance-closure-rust-v3')
})
test('future native Rust3 requires exact paired variant and digest-addressed binding',async()=>{
  const original=await lock(),observed=await selectNativeRustCorpus(original,options)
  assert.equal(observed.corpus,'tpnil-rust-corpus@3');assert.deepEqual(observed.cliFlags,['--corpus-v3']);assert.deepEqual(observed.binding,original.rustCompatibility)
  for(const mutate of [l=>delete l.rustCompatibility,l=>delete l.executionVariant,l=>l.executionVariant='integrated-native-conformance-closure',l=>l.rustCompatibility.corpus='tpnil-rust-corpus@2',l=>l.rustCompatibility.manifestSha256='00'.repeat(32),l=>l.rustCompatibility.graphOracle.manifestSha256='11'.repeat(32),l=>l.planSha256='22'.repeat(32)]){
    const changed=structuredClone(original);mutate(changed);await assert.rejects(selectNativeRustCorpus(changed,options))
  }
})
test('compatibility metadata is bound to its original Git source, preventing c338 retrofits',async()=>{
  const original=await lock();original.source='c338a93c97ffebeeef318e679ff82b7dbf309dd5'
  await assert.rejects(selectNativeRustCorpus(original,{graphPolicy:options.graphPolicy}),/Committed source path must resolve to exactly one blob/)
})
test('every selector/runner/verifier/workflow input must exist unchanged at execution source',async()=>{
  const original=await lock()
  for(const changed of [nativeRustCompatibilityPath,nativeRustOriginalCompatibilityPath,planPath,graphPath,...nativeRustCompatibilitySources,...Object.keys(graphManifest.sources)]) {
    await assert.rejects(selectNativeRustCorpus(original,{...options,readCommitted:(revision,file)=>file===changed?Buffer.concat([historicalRead(file),Buffer.from(' changed')]):options.readCommitted(revision,file)}))
  }
})
test('compatibility source inventory and Rust/native policy substitutions fail closed',async()=>{
  const original=await lock()
  for(const mutate of [m=>delete m.sources['scripts/run-native-go-wallet.mjs'],m=>m.nativePlan.profile='ITCVE-1@1.5.0',m=>m.rustCorpus='tpnil-rust-corpus@2',m=>m.graphOracle.operation='spends']){
    const manifest=JSON.parse(read(nativeRustCompatibilityPath));mutate(manifest);const bytes=Buffer.from(JSON.stringify(manifest));
    const changedRead=file=>file===nativeRustCompatibilityPath?bytes:historicalRead(file)
    await assert.rejects(selectNativeRustCorpus(original,{...options,read:changedRead,readCommitted:(_revision,file)=>changedRead(file)}))
  }
})
test('future Rust selection leaves the original native2 plan and all ten acceptance inputs byte-identical',()=>{
  const frozen='c338a93c97ffebeeef318e679ff82b7dbf309dd5'
  assert.equal(Object.keys(plan.conformanceInputs).length,10)
  for(const name of [planPath,...Object.keys(plan.conformanceInputs)])assert.deepEqual(read(name),execFileSync('git',['show',`${frozen}:${name}`],{cwd:root}))
})


test('legacy source-binding revision preserves the immutable original compatibility manifest',()=>{
  const bytes=read(nativeRustOriginalCompatibilityPath),manifest=JSON.parse(read(nativeRustCompatibilityPath))
  assert.deepEqual(bytes,execFileSync('git',['show',`9a9e99f1fb5a10fc8b6726aaa6a0d7dc239ec47e:${nativeRustOriginalCompatibilityPath}`],{cwd:root}))
  assert.equal(manifest.sourceBindingRevision,2)
  assert.deepEqual(manifest.predecessor,{manifest:nativeRustOriginalCompatibilityPath,sha256:sha(bytes)})
})

test('new released native profile requires its own Rust3 binding and rejects downgrade or cross-profile substitution',async()=>{
  const plan=JSON.parse(read(nativeWallet511PlanPath)),planSha256=sha(read(nativeWallet511PlanPath))
  const binding=await nativeRustBinding(plan,planSha256,source,options)
  const original={source,plan,planSha256,executionVariant:nativeWallet511Variant,rustCompatibility:binding}
  assert.equal(binding.manifest,nativeWallet511CompatibilityPath)
  assert.equal((await selectNativeRustCorpus(original,options)).corpus,'tpnil-rust-corpus@3')
  for(const mutate of [l=>delete l.rustCompatibility,l=>{delete l.rustCompatibility;delete l.executionVariant},l=>l.executionVariant=nativeRustV3Variant,l=>l.rustCompatibility.manifest=nativeRustCompatibilityPath,l=>l.rustCompatibility.corpus='tpnil-rust-corpus@2',l=>l.plan.wallet.version='5.1.0',l=>l.plan.clauseOracle='tpnil-brc100-clause-oracle@4.0.0',l=>l.plan.program='ISI-4@4.0.0']){
    const changed=structuredClone(original);mutate(changed);await assert.rejects(selectNativeRustCorpus(changed,options))
  }
})
