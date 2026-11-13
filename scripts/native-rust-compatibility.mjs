import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readCommittedBlob } from './read-committed-blob.mjs'
import { nativeCandidateCoverage6Variant, nativeCandidateCoverage6OriginalPlanPath, nativeCandidateCoverage6PlanPath, nativeCandidateCoverage5OriginalPlanPath, nativeCandidateCoverage5Variant, nativeCandidateCoverage5PlanPath, nativeCandidateCoverage4Variant, nativeCandidateCoverage4PlanPath, nativeCandidateCoverage3OriginalPlanPath, nativeCandidateCoverage3Variant, nativeCandidateCoverage3PlanPath, nativeCandidateCoverage2Variant, nativeCandidateCoverage2PlanPath, nativeCandidateCoverage1Variant, nativeCandidateCoverage1PlanPath, nativeWallet511Variant, nativeWallet511PlanPath, nativeCandidateVariant, nativeCandidatePlanPath, nativeWallet511Observer2Variant, nativeWallet511Observer2PlanPath, nativeCandidateObserver3Variant, nativeCandidateObserver3PlanPath } from './native-wallet-profiles.mjs'
const root=path.resolve(import.meta.dirname,'..')
export const nativeRustV3Variant='integrated-native-conformance-closure-rust-v3'
export const nativeRustV3Flag='--conformance-closure-rust-v3'
export const nativeRustOriginalCompatibilityPath='infra/native/conformance/rust-graph-3.0.0.json'
export const nativeRustCompatibilityPath='infra/native/conformance/rust-graph-3.0.0-selector-2.json'
export const nativeWallet511Observer2CompatibilityPath='infra/native/conformance/rust-graph-5.1.1-selector-2.json'
export const nativeCandidateCoverage3OriginalCompatibilityPath='infra/native/conformance/rust-graph-pr368-coverage-3.json'
export const nativeCandidateCoverage6OriginalCompatibilityPath='infra/native/conformance/rust-graph-pr368-coverage-6.json'
export const nativeCandidateCoverage6CompatibilityPath='infra/native/conformance/rust-graph-pr368-coverage-6-source-6.json'
export const nativeCandidateCoverage5OriginalCompatibilityPath='infra/native/conformance/rust-graph-pr368-coverage-5.json'
export const nativeCandidateCoverage5CompatibilityPath='infra/native/conformance/rust-graph-pr368-coverage-5-source-2.json'
export const nativeCandidateCoverage4CompatibilityPath='infra/native/conformance/rust-graph-pr368-coverage-4.json'
export const nativeCandidateCoverage3CompatibilityPath='infra/native/conformance/rust-graph-pr368-coverage-3-source-5.json'
export const nativeCandidateCoverage2CompatibilityPath='infra/native/conformance/rust-graph-pr368-coverage-2.json'
export const nativeCandidateCoverage1CompatibilityPath='infra/native/conformance/rust-graph-pr368-coverage-1.json'
export const nativeCandidateObserver3CompatibilityPath='infra/native/conformance/rust-graph-pr368-cb3c2f2-observer-3.json'
export const nativeCandidateCompatibilityPath='infra/native/conformance/rust-graph-pr368-7e39006.json'
export const nativeWallet511CompatibilityPath='infra/native/conformance/rust-graph-5.1.1.json'
export const nativeRustCompatibilitySources=['scripts/native-rust-compatibility.mjs','scripts/native-wallet-profiles.mjs','scripts/run-native-go-wallet.mjs','scripts/verify-native-integrated.mjs','.github/workflows/isi4-yours-wallet.yml']
export const nativeCurrentCompatibilitySources=[...nativeRustCompatibilitySources,'scripts/check-native-wallet-selector.mjs']
export const nativeCompletionCompatibilitySources=[...nativeCurrentCompatibilitySources,'scripts/read-committed-blob.mjs']
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')

/** Each execution source selects a separately bound observer manifest. The
 * original native2 plan and its ten acceptance inputs remain unchanged. */
export async function nativeRustBinding(plan,planSha256,source,{read=file=>fs.readFileSync(path.join(root,file)),readCommitted=(revision,file)=>readCommittedBlob(process.env.TPNIL_REPLAY_GIT_ROOT??root,revision,file),graphPolicy=async()=> (await import('./rust-corpus.mjs')).rustCorpusPolicy('tpnil-rust-corpus@3')}={}) {
  assert.match(source,/^[a-f0-9]{40}$/,'The future-native observer must bind a committed execution source')
  const candidate=['ITCVE-1@4.1.0','ITCVE-1@4.2.0','ITCVE-1@4.3.0','ITCVE-1@4.4.0','ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0', 'ITCVE-1@4.8.0'].includes(plan.itcve)
  const enhanced=plan.itcve==='ITCVE-1@4.8.0'
  const replay=plan.itcve==='ITCVE-1@4.7.0'
  const followup=['ITCVE-1@4.6.0','ITCVE-1@4.7.0', 'ITCVE-1@4.8.0'].includes(plan.itcve)
  const completion=['ITCVE-1@4.5.0','ITCVE-1@4.6.0', 'ITCVE-1@4.7.0', 'ITCVE-1@4.8.0'].includes(plan.itcve)
  const recovery=plan.itcve==='ITCVE-1@4.4.0'
  const expanded=completion||recovery||plan.itcve==='ITCVE-1@4.3.0'
  if(expanded) { assert.equal(plan.observerRevision,3);assert.equal(plan.coverageRevision,enhanced?6:replay?5:followup?4:completion?3:recovery?2:1);completion ? assert.equal(plan.expectedObservations,698) : assert.equal(plan.expectedObservations,535);assert.equal(plan.admissionState,'FROZEN','Expanded source must be frozen before admission') }
  if(enhanced) {
    const originalBytes=read(nativeCandidateCoverage6OriginalPlanPath),original=JSON.parse(originalBytes)
    assert.equal(plan.sourceBindingRevision,14,'Transaction failure classification source successor revision differs')
    assert.equal(plan.id,`${original.id}-SOURCE-6`)
    const predecessorPath='infra/native/conformance/plan-pr368-coverage-6-source-5.json',predecessor=read(predecessorPath),source2Path='infra/native/conformance/plan-pr368-coverage-6-source-2.json',source2=read(source2Path)
    assert.deepEqual(plan.sourcePredecessor,{path:predecessorPath,sha256:sha(predecessor)})
    assert.equal(sha(readCommitted(source,predecessorPath)),sha(predecessor))
    const source4Path='infra/native/conformance/plan-pr368-coverage-6-source-4.json',source4=read(source4Path)
    assert.deepEqual(JSON.parse(predecessor).sourcePredecessor,{path:source4Path,sha256:sha(source4)})
    assert.equal(sha(readCommitted(source,source4Path)),sha(source4))
    const source3Path='infra/native/conformance/plan-pr368-coverage-6-source-3.json',source3=read(source3Path)
    assert.deepEqual(JSON.parse(source4).sourcePredecessor,{path:source3Path,sha256:sha(source3)})
    assert.equal(sha(readCommitted(source,source3Path)),sha(source3))
    assert.deepEqual(JSON.parse(source3).sourcePredecessor,{path:source2Path,sha256:sha(source2)})
    assert.equal(sha(readCommitted(source,source2Path)),sha(source2))
    assert.deepEqual(JSON.parse(source2).sourcePredecessor,{path:nativeCandidateCoverage6OriginalPlanPath,sha256:sha(originalBytes)})
    assert.equal(sha(readCommitted(source,nativeCandidateCoverage6OriginalPlanPath)),sha(originalBytes))
    const semantic=value=>Object.fromEntries(Object.entries(value).filter(([key])=>!['id','conformanceInputs','sourceBindingRevision','sourcePredecessor'].includes(key)))
    assert.deepEqual(semantic(plan),semantic(original),'Transitive source correction changed a native criterion')
    const added=["docs/native-portability-score-order-source-correction-2026-11-13.md", "synthesis/test/native-portability-assertion-order.test.ts"].concat(["docs/native-evidence-ownership-source-correction-2026-11-13.md", "synthesis/test/native-observer-receipt-source5.test.ts"].concat(["docs/native-observer-source-correction-2026-11-13.md", "docs/native-transaction-fixture-source-correction-2026-11-13.md", "synthesis/test/fixtures/native-transaction-branches-source3/candidate-fixture.ts.gz", "synthesis/test/fixtures/native-transaction-branches-source3/cleanup.json.gz", "synthesis/test/fixtures/native-transaction-branches-source3/funding.json.gz", "synthesis/test/fixtures/native-transaction-branches-source3/missing-stage-report.json.gz", "synthesis/test/fixtures/native-transaction-branches-source3/missing-stage-verification.json.gz", "synthesis/test/fixtures/native-transaction-branches-source3/native15-no-change-1.json.gz", "synthesis/test/fixtures/native-transaction-branches-source3/native15-no-change-2.json.gz", "synthesis/test/fixtures/native-transaction-branches-source3/provenance.json", "synthesis/test/fixtures/native-transaction-branches-source3/registry.json.gz", "synthesis/test/fixtures/native-transaction-branches-source3/report.json.gz", "synthesis/test/fixtures/native-transaction-branches-source3/run-reference.ts.gz", "synthesis/test/fixtures/native-transaction-branches-source3/source-after.json.gz", "synthesis/test/fixtures/native-transaction-branches-source3/source-before.json.gz", "synthesis/test/fixtures/native-transaction-branches-source3/verification.json.gz", "docs/native-transaction-failure-classification-2026-11-13.md", "synthesis/test/fixtures/native-transaction-failure-classification/provenance.json", "synthesis/test/fixtures/native-transaction-failure-classification/report.json.gz", "synthesis/test/fixtures/native-transaction-failure-classification/verification.json.gz"]))
    assert.deepEqual(Object.keys(plan.conformanceInputs).filter(name=>!added.includes(name)).sort(),Object.keys(original.conformanceInputs).sort(),'Source correction dropped or replaced a frozen input')
    for(const name of added)assert.match(plan.conformanceInputs[name],/^[a-f0-9]{64}$/)
  }
  if(replay) {
    const originalBytes=read(nativeCandidateCoverage5OriginalPlanPath),original=JSON.parse(originalBytes)
    assert.equal(plan.sourceBindingRevision,8,'Metadata source successor revision differs')
    assert.equal(plan.id,`${original.id}-SOURCE-2`)
    assert.deepEqual(plan.sourcePredecessor,{path:nativeCandidateCoverage5OriginalPlanPath,sha256:sha(originalBytes)})
    assert.equal(sha(readCommitted(source,nativeCandidateCoverage5OriginalPlanPath)),sha(originalBytes))
    const semantic=value=>Object.fromEntries(Object.entries(value).filter(([key])=>!['id','conformanceInputs','sourceBindingRevision','sourcePredecessor'].includes(key)))
    assert.deepEqual(semantic(plan),semantic(original),'Metadata source correction changed a native criterion')
    const added=['itcves/ITCVE-1/4.7.0/profile-source-1.json','itcves/ITCVE-1/4.7.0/source-correction-2.json']
    assert.deepEqual(Object.keys(plan.conformanceInputs).filter(name=>!added.includes(name)).sort(),Object.keys(original.conformanceInputs).sort(),'Metadata source correction dropped or replaced a frozen input')
    for(const name of added)assert.match(plan.conformanceInputs[name],/^[a-f0-9]{64}$/)
  }
  if(completion&&!followup) {
    const originalBytes=read(nativeCandidateCoverage3OriginalPlanPath),original=JSON.parse(originalBytes)
    assert.equal(plan.sourceBindingRevision,5,'Completion source successor revision differs')
    assert.equal(plan.id,`${original.id}-SOURCE-5`)
    const predecessorPath='infra/native/conformance/plan-pr368-coverage-3-source-4.json',predecessor=read(predecessorPath)
    assert.deepEqual(plan.sourcePredecessor,{path:predecessorPath,sha256:sha(predecessor)})
    assert.equal(sha(readCommitted(source,predecessorPath)),sha(predecessor))
    assert.equal(sha(readCommitted(source,nativeCandidateCoverage3OriginalPlanPath)),sha(originalBytes),'Original completion plan differs at execution')
    const semantic=value=>Object.fromEntries(Object.entries(value).filter(([key])=>!['id','conformanceInputs','sourceBindingRevision','sourcePredecessor'].includes(key)))
    assert.deepEqual(semantic(plan),semantic(original),'Source-only recovery must preserve every native criterion')
    assert.deepEqual(Object.keys(plan.conformanceInputs).filter(name=>!['scripts/read-committed-blob.mjs','test/committed-blob.test.mjs','test/native-selector-source2.test.mjs','scripts/verify-native-image.mjs','test/native-image.test.mjs'].includes(name)).sort(),Object.keys(original.conformanceInputs).sort(),'Source recovery dropped or replaced a frozen input')
    for(const name of ['scripts/read-committed-blob.mjs','test/committed-blob.test.mjs','test/native-selector-source2.test.mjs','scripts/verify-native-image.mjs','test/native-image.test.mjs']) assert.match(plan.conformanceInputs[name],/^[a-f0-9]{64}$/)
  }
  const observer3=plan.itcve==='ITCVE-1@4.2.0'&&plan.observerRevision===3
  const observer2=!candidate&&plan.itcve==='ITCVE-1@4.0.0'&&plan.observerRevision===2
  const wallet511=candidate||plan.itcve==='ITCVE-1@4.0.0'
  const compatibilityPath=enhanced?nativeCandidateCoverage6CompatibilityPath:replay?nativeCandidateCoverage5CompatibilityPath:followup?nativeCandidateCoverage4CompatibilityPath:completion?nativeCandidateCoverage3CompatibilityPath:recovery?nativeCandidateCoverage2CompatibilityPath:expanded?nativeCandidateCoverage1CompatibilityPath:observer3?nativeCandidateObserver3CompatibilityPath:candidate?nativeCandidateCompatibilityPath:observer2?nativeWallet511Observer2CompatibilityPath:wallet511?nativeWallet511CompatibilityPath:nativeRustCompatibilityPath
  const bytes=read(compatibilityPath),manifest=JSON.parse(bytes)
  assert.equal(sha(readCommitted(source,compatibilityPath)),sha(bytes),'Compatibility manifest did not exist unchanged at the recorded native execution source')
  assert.equal(manifest.schema,'tpnil-native-rust-compatibility@3.0.0')
  assert.equal(manifest.variant,enhanced?nativeCandidateCoverage6Variant:replay?nativeCandidateCoverage5Variant:followup?nativeCandidateCoverage4Variant:completion?nativeCandidateCoverage3Variant:recovery?nativeCandidateCoverage2Variant:expanded?nativeCandidateCoverage1Variant:observer3?nativeCandidateObserver3Variant:candidate?nativeCandidateVariant:observer2?nativeWallet511Observer2Variant:wallet511?nativeWallet511Variant:nativeRustV3Variant)
  assert.equal(manifest.sourceBindingRevision,enhanced?19:replay?13:followup?11:completion?10:recovery?5:expanded?4:observer3?3:observer2?2:wallet511?1:2)
  if(expanded) {
    const previous=enhanced?'infra/native/conformance/rust-graph-pr368-coverage-6-source-5.json':replay?nativeCandidateCoverage5OriginalCompatibilityPath:followup?'infra/native/conformance/rust-graph-pr368-coverage-3-source-5.json':completion?'infra/native/conformance/rust-graph-pr368-coverage-3-source-4.json':recovery?nativeCandidateCoverage1CompatibilityPath:nativeCandidateObserver3CompatibilityPath,prior=read(previous)
    assert.deepEqual(manifest.predecessor,{manifest:previous,sha256:sha(prior)})
    assert.equal(sha(readCommitted(source,previous)),sha(prior))
  }
  if(observer3) {
    const prior=read(nativeCandidateCompatibilityPath)
    assert.deepEqual(manifest.predecessor,{manifest:nativeCandidateCompatibilityPath,sha256:sha(prior)})
    assert.equal(sha(readCommitted(source,nativeCandidateCompatibilityPath)),sha(prior))
  }
  if(observer2) {
    const prior=read(nativeWallet511CompatibilityPath)
    assert.deepEqual(manifest.predecessor,{manifest:nativeWallet511CompatibilityPath,sha256:sha(prior)})
    assert.equal(sha(readCommitted(source,nativeWallet511CompatibilityPath)),sha(prior))
  }
  if(!wallet511) {
    const prior=read(nativeRustOriginalCompatibilityPath)
    assert.deepEqual(manifest.predecessor,{manifest:nativeRustOriginalCompatibilityPath,sha256:sha(prior)})
    assert.equal(sha(readCommitted(source,nativeRustOriginalCompatibilityPath)),sha(prior))
  }
  assert.equal(manifest.nativePlan.path,enhanced?nativeCandidateCoverage6PlanPath:replay?nativeCandidateCoverage5PlanPath:followup?nativeCandidateCoverage4PlanPath:completion?nativeCandidateCoverage3PlanPath:recovery?nativeCandidateCoverage2PlanPath:expanded?nativeCandidateCoverage1PlanPath:observer3?nativeCandidateObserver3PlanPath:candidate?nativeCandidatePlanPath:observer2?nativeWallet511Observer2PlanPath:wallet511?nativeWallet511PlanPath:'infra/native/conformance/plan-coverage-closure.json')
  assert.equal(manifest.nativePlan.profile,enhanced?'ITCVE-1@4.8.0':replay?'ITCVE-1@4.7.0':followup?'ITCVE-1@4.6.0':completion?'ITCVE-1@4.5.0':recovery?'ITCVE-1@4.4.0':expanded?'ITCVE-1@4.3.0':observer3?'ITCVE-1@4.2.0':candidate?'ITCVE-1@4.1.0':wallet511?'ITCVE-1@4.0.0':'ITCVE-1@2.0.0');assert.equal(manifest.nativePlan.program,enhanced?'ISI-4@5.8.0':replay?'ISI-4@5.7.0':followup?'ISI-4@5.6.0':completion?'ISI-4@5.5.0':recovery?'ISI-4@5.4.0':expanded?'ISI-4@5.3.0':observer3?'ISI-4@5.2.0':candidate?'ISI-4@5.1.0':wallet511?'ISI-4@5.0.0':'ISI-4@4.0.0')
  const nativeBytes=read(manifest.nativePlan.path),native=JSON.parse(nativeBytes)
  assert.equal(sha(nativeBytes),manifest.nativePlan.sha256);assert.equal(planSha256,manifest.nativePlan.sha256)
  assert.deepEqual(plan,native);assert.equal(plan.itcve,manifest.nativePlan.profile);assert.equal(plan.program,manifest.nativePlan.program)
  assert.equal(sha(readCommitted(source,manifest.nativePlan.path)),manifest.nativePlan.sha256)
  const sources=completion?nativeCompletionCompatibilitySources:candidate||observer2?nativeCurrentCompatibilitySources:nativeRustCompatibilitySources
  assert.deepEqual(Object.keys(manifest.sources).sort(),[...sources].sort())
  for(const file of sources) {
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
    assert.ok(!['ITCVE-1@4.0.0','ITCVE-1@4.1.0','ITCVE-1@4.2.0','ITCVE-1@4.3.0','ITCVE-1@4.4.0','ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0', 'ITCVE-1@4.8.0'].includes(lock.plan?.itcve),'Yours5.1.1 release or candidate requires its Rust3 compatibility binding')
    assert.equal(lock.executionVariant,undefined,'A native Rust3 variant requires its exact compatibility binding')
    return {corpus:'tpnil-rust-corpus@2',cliFlags:[]}
  }
  assert.equal(lock.executionVariant,lock.plan?.itcve==='ITCVE-1@4.8.0'?nativeCandidateCoverage6Variant:lock.plan?.itcve==='ITCVE-1@4.7.0'?nativeCandidateCoverage5Variant:lock.plan?.itcve==='ITCVE-1@4.6.0'?nativeCandidateCoverage4Variant:lock.plan?.itcve==='ITCVE-1@4.5.0'?nativeCandidateCoverage3Variant:lock.plan?.itcve==='ITCVE-1@4.4.0'?nativeCandidateCoverage2Variant:lock.plan?.itcve==='ITCVE-1@4.3.0'?nativeCandidateCoverage1Variant:lock.plan?.itcve==='ITCVE-1@4.2.0'?nativeCandidateObserver3Variant:lock.plan?.itcve==='ITCVE-1@4.1.0'?nativeCandidateVariant:lock.plan?.itcve==='ITCVE-1@4.0.0'?(lock.plan.observerRevision===2?nativeWallet511Observer2Variant:nativeWallet511Variant):nativeRustV3Variant)
  const binding=await nativeRustBinding(lock.plan,lock.planSha256,lock.source,options)
  assert.deepEqual(lock.rustCompatibility,binding,'Native Rust observer binding differs from the exact compatibility manifest')
  return {corpus:binding.corpus,cliFlags:['--corpus-v3'],binding}
}
