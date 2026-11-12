import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {selectNativeWalletProfile,nativeWallet511Flag,nativeWallet511PlanPath,nativeWallet511Variant} from '../scripts/native-wallet-profiles.mjs'
const root=path.resolve(import.meta.dirname,'..'),read=file=>JSON.parse(fs.readFileSync(path.join(root,file)))

test('new official wallet release requires the explicit selector and complete native admission stack',()=>{
  const selected=selectNativeWalletProfile(nativeWallet511Flag)
  assert.deepEqual(selected,{wallet511:true,rustV3:true,closure:true,coverage:true,conformance:true,trustedIdentity:true,integrated:true,planPath:nativeWallet511PlanPath,walletVersion:'5.1.1'})
  const plan=read(selected.planPath)
  assert.equal(plan.itcve,'ITCVE-1@4.0.0');assert.equal(plan.program,'ISI-4@5.0.0')
  assert.deepEqual(plan.wallet,{id:'yours-wallet-chromium-extension',version:'5.1.1',sha256:'454c8581b8d6ab120c9b2f2f74167f536b08e720bc12e75f3e9437d14a985878',size:13644482})
  assert.equal(plan.clauseOracle,'tpnil-brc100-clause-oracle@5.0.0');assert.equal(plan.publicMainnetBroadcast,false)
  assert.equal(nativeWallet511Variant,'integrated-native-conformance-5.1.1')
})

test('every legacy selector preserves its original artifact, native plan and optional Rust observer',()=>{
  const choices=[
    [undefined,'infra/native/yours-go/plan.json'],
    ['--integrated','infra/native/integrated/plan.json'],
    ['--integrated-trusted','infra/native/integrated/plan-trusted.json'],
    ['--conformance','infra/native/conformance/plan.json'],
    ['--conformance-coverage','infra/native/conformance/plan-coverage.json'],
    ['--conformance-closure','infra/native/conformance/plan-coverage-closure.json'],
    ['--conformance-closure-rust-v3','infra/native/conformance/plan-coverage-closure.json']
  ]
  for(const [flag,planPath] of choices){
    const actual=selectNativeWalletProfile(flag),plan=read(actual.planPath)
    assert.equal(actual.wallet511,false);assert.equal(actual.walletVersion,'5.1.0');assert.equal(actual.planPath,planPath)
    assert.equal(actual.rustV3,flag==='--conformance-closure-rust-v3')
    assert.equal(plan.wallet.version,'5.1.0');assert.equal(plan.wallet.sha256,'d55abda7dc8790ecfdd57ed0f5f4dd4a28187bb4833715f7612b067625eabc52')
  }
})

test('unsupported release selectors fail before artifact preparation or runner operations',()=>{
  for(const flag of ['','--conformance-5.1.2','--conformance-5.1.1-extra','integrated-native-conformance-5.1.1',null]) assert.throws(()=>selectNativeWalletProfile(flag),/Unknown/)
  const preparation=spawnSync('bash',['scripts/prepare-yours-wallet-run.sh','--conformance-5.1.2'],{cwd:root,encoding:'utf8'})
  assert.equal(preparation.status,2);assert.match(preparation.stderr,/Unknown wallet preparation profile/)
  const runner=spawnSync(process.execPath,['scripts/run-native-go-wallet.mjs','unused-image','unused-output','--conformance-5.1.2'],{cwd:root,encoding:'utf8'})
  assert.notEqual(runner.status,0);assert.match(runner.stderr,/Unknown native qualification profile flag/)
})

test('new release preserves existing environment, isolated funding and shutdown requirements',()=>{
  const prior=read('infra/native/conformance/plan-coverage-closure.json'),next=read(nativeWallet511PlanPath)
  for(const key of ['application','components','componentLock','fundingFixture','fundingFixtureCanonicalSha256','repetitions','amount','timeoutSecondsPerRepetition','publicMainnetBroadcast','requiredEnvironmentAssertions','identityTrust','identityTrustProfile','identityTrustProfileSha256','fundingReserves']) assert.deepEqual(next[key],prior[key],key)
  assert.equal(next.compatibilityPatch,'infra/adapters/storage-list-actions/patch.lock.json')
  const patch=read(next.compatibilityPatch)
  assert.equal(patch.parent,prior.compatibilityPatch)
  assert.equal(patch.parentSha256,prior.compatibilityPatchSha256)
  assert.equal(next.compatibilityPatchSha256,createHash('sha256').update(fs.readFileSync(path.join(root,next.compatibilityPatch))).digest('hex'))
})


test('new release uses expanded shutdown policy while retaining the previous policy',()=>{
  assert.equal(read(nativeWallet511PlanPath).shutdownSubmissionPolicy,'tpnil-native-shutdown-submissions@2.0.0')
  assert.equal(read('infra/native/conformance/plan-coverage-closure.json').shutdownSubmissionPolicy,'tpnil-native-shutdown-submissions@1.0.0')
})

test('new release admission binds its exact profile, catalog and all accepted policy bytes',()=>{
  const plan=read(nativeWallet511PlanPath),profile=read('itcves/ITCVE-1/4.0.0/profile.json'),catalog=read('programs/ISI-4/5.0.0/catalog.json')
  assert.equal(`${profile.id}@${profile.version}`,plan.itcve)
  assert.equal(`${catalog.id}@${catalog.version}`,plan.program)
  assert.equal(`${catalog.itcve.id}@${catalog.itcve.version}`,plan.itcve)
  assert.equal(profile.nativeConformance.clauseOracle,plan.clauseOracle)
  assert.equal(profile.completeBRC100Conformance,false)
  for(const [file,digest] of Object.entries(plan.conformanceInputs)) assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),digest,file)
})
