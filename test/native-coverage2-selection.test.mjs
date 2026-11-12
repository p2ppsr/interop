import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createHash } from 'node:crypto'
import { checkNativeWalletSelector } from '../scripts/check-native-wallet-selector.mjs'
import { execFileSync } from 'node:child_process'
import { selectNativeWalletProfile, nativeCandidateCoverage2Flag, nativeCandidateCoverage2Variant, nativeCandidateCoverage2PlanPath } from '../scripts/native-wallet-profiles.mjs'
import { nativeRustBinding, selectNativeRustCorpus } from '../scripts/native-rust-compatibility.mjs'
const root = path.resolve(import.meta.dirname, '..'), read = p => JSON.parse(fs.readFileSync(path.join(root,p),'utf8'))
const plan = read(nativeCandidateCoverage2PlanPath), source = fs.readFileSync(path.join(root,'synthesis/src/wallet-lab/native/worker.ts'),'utf8')
const startup = source.slice(source.indexOf("const root = '/work'"),source.indexOf('fs.mkdirSync(output,'))+'\n;({planFile,walletRoot,walletVersion,observerRevision,expanded,plan})'
const env = () => ({TPNIL_NATIVE_WALLET_VERSION:plan.wallet.version,TPNIL_NATIVE_OBSERVER_REVISION:'3',TPNIL_NATIVE_COVERAGE_REVISION:'2',TPNIL_NATIVE_CLOSURE:'1',TPNIL_NATIVE_COVERAGE:'1',TPNIL_NATIVE_CONFORMANCE:'1',TPNIL_NATIVE_INTEGRATED:'1',TPNIL_NATIVE_IDENTITY_TRUST:'1'})
// LAB_SELF_TEST_ONLY: test the real startup branch without filesystem/process effects.
// Synthetic intake identity makes no assertion about a native artifact or result.
const testArtifact = {...plan.wallet,sha256:'a'.repeat(64),size:123}
function execute(e=env(), mutate=p=>p, artifact=testArtifact) {
 return vm.runInNewContext(startup,{process:{env:e},path,yoursPr368Coverage1Artifact:artifact,fs:{readFileSync:file=>{
  assert.equal(file,'/work/'+nativeCandidateCoverage2PlanPath)
  return JSON.stringify(mutate({...plan,admissionState:'FROZEN',wallet:artifact}))
 }}})
}
test('expanded profile has a distinct exact selector and535 assertions',()=>{
 const selected=selectNativeWalletProfile(nativeCandidateCoverage2Flag)
 assert.equal(selected.planPath,nativeCandidateCoverage2PlanPath);assert.equal(selected.walletVersion,plan.wallet.version)
 assert.equal(selected.observerRevision,3);assert.equal(selected.coverageRevision,2)
 assert.equal(nativeCandidateCoverage2Variant,'integrated-native-conformance-pr368-coverage-2')
 assert.equal(plan.itcve,'ITCVE-1@4.4.0');assert.equal(plan.program,'ISI-4@5.4.0');assert.equal(plan.expectedObservations,535)
 assert.deepEqual(Object.values(plan.coverageModules).map(m=>m.assertions),[15,22,61,11])
 assert.equal(Object.values(plan.coverageModules).flatMap(m=>m.assertionIds).length,109)
 const profile=read('itcves/ITCVE-1/4.4.0/profile.json')
 for(const id of ['ISI-4-V005','ISI-4-V008']) assert.equal(new Set(profile.nativeConformance.assertions[id]).size,profile.nativeConformance.assertions[id].length)
 assert.equal(plan.timeoutSecondsPerRepetition,1500);assert.equal(plan.executionBudget.workflowTimeoutMinutes,70)
})
test('real worker startup selects the explicit expanded plan only with all admission flags',()=>{
 const selected=selectNativeWalletProfile(nativeCandidateCoverage2Flag),actual=execute()
 assert.equal(actual.expanded,true);assert.equal(actual.planFile,'/work/'+selected.planPath)
 assert.equal(actual.walletRoot,'/work/out/sut-artifacts/'+selected.walletDirectory)
 for(const key of ['TPNIL_NATIVE_OBSERVER_REVISION','TPNIL_NATIVE_COVERAGE_REVISION','TPNIL_NATIVE_CLOSURE','TPNIL_NATIVE_CONFORMANCE','TPNIL_NATIVE_INTEGRATED','TPNIL_NATIVE_IDENTITY_TRUST']) {
  const changed=env();delete changed[key];assert.throws(()=>execute(changed))
 }
 for(const mutate of [p=>({...p,coverageRevision:1}),p=>({...p,expectedObservations:426}),p=>({...p,permissionFixture:undefined}),p=>({...p,permissionFixture:'later-customer-state'}),p=>({...p,permissionCoverageOracle:'tpnil-native-permission-coverage-oracle@4.0.0'}),p=>({...p,itcve:'ITCVE-1@4.2.0'}),p=>({...p,program:'ISI-4@5.2.0'}),p=>({...p,admissionState:'PENDING_CANDIDATE_INTAKE'})]) assert.throws(()=>execute(env(),mutate))
 assert.throws(()=>execute(env(),p=>p,{...testArtifact,sha256:'PENDING',size:0}))
})
test('expanded Rust observer cannot silently reuse a historical profile or pending artifact',async()=>{
 await assert.rejects(nativeRustBinding({...plan,admissionState:'PENDING_CANDIDATE_INTAKE'},'a'.repeat(64),'b'.repeat(40)),/frozen before admission/)
})
test('executed observer3 plans, profiles, policies and Rust manifest remain byte-identical',()=>{
 for(const file of ['infra/native/conformance/plan-pr368-cb3c2f2-observer-3.json','infra/native/conformance/rust-graph-pr368-cb3c2f2-observer-3.json','itcves/ITCVE-1/4.2.0/profile.json','programs/ISI-4/5.2.0/catalog.json','programs/ISI-4/profiles/native-conformance-5.0.0/permission-coverage-3.0.0.json']) assert.deepEqual(fs.readFileSync(path.join(root,file)),execFileSync('git',['show',`69b1b52f0c3d46cbfac91c78b38eb2e4dffbac99:${file}`],{cwd:root}))
})


test('recovery selector binds every final source and rejects artifact, profile and observer downgrades', async () => {
 const bytes=name=>fs.readFileSync(path.join(root,name)),sha=value=>createHash('sha256').update(value).digest('hex')
 // LAB_SELF_TEST_ONLY: emulate a commit over the complete frozen source. The
 // real entrypoint also checks these bytes against Git before any native run.
 const revision='ab'.repeat(20),options={source:revision,read:bytes,readCommitted:(_revision,name)=>bytes(name)}
 assert.equal(plan.admissionState,'FROZEN')
 const result=await checkNativeWalletSelector(nativeCandidateCoverage2Variant,options)
 assert.equal(result.variant,nativeCandidateCoverage2Variant);assert.equal(result.wallet.sha256,plan.wallet.sha256)
 assert.equal(result.planSha256,sha(bytes(nativeCandidateCoverage2PlanPath)))
 const lock={source:revision,plan,planSha256:result.planSha256,executionVariant:nativeCandidateCoverage2Variant,rustCompatibility:result.rust}
 const graphPolicy=()=>({corpus:'tpnil-rust-corpus@3',graphOracle:result.rust.graphOracle})
 assert.equal((await selectNativeRustCorpus(lock,{...options,graphPolicy})).corpus,'tpnil-rust-corpus@3')
 for(const mutate of [l=>l.plan.wallet.version='5.1.1',l=>l.plan.itcve='ITCVE-1@4.2.0',l=>l.plan.coverageRevision=undefined,l=>l.plan.observerRevision=2,l=>l.executionVariant='integrated-native-conformance-pr368-cb3c2f2-observer-3',l=>l.rustCompatibility.manifest='infra/native/conformance/rust-graph-pr368-cb3c2f2-observer-3.json']) {const changed=structuredClone(lock);mutate(changed);await assert.rejects(selectNativeRustCorpus(changed,{...options,graphPolicy}))}
 for(const target of ['synthesis/src/wallet-lab/native/permission-prelude.ts',plan.permissionCoverageOracleManifest]) await assert.rejects(checkNativeWalletSelector(nativeCandidateCoverage2Variant,{...options,read:name=>name===target?Buffer.concat([bytes(name),Buffer.from(' ') ]):bytes(name)}),/Current conformance input differs/)
 await assert.rejects(checkNativeWalletSelector(nativeCandidateCoverage2Variant,{...options,readCommitted:(_revision,name)=>name==='scripts/check-native-wallet-selector.mjs'?Buffer.from('substituted selector'):bytes(name)}),/differs/)
 const provenance=read(plan.walletCandidate.manifest)
 await assert.rejects(checkNativeWalletSelector(nativeCandidateCoverage2Variant,{...options,read:name=>name===provenance.archive?Buffer.from('substituted archive'):bytes(name)}),/Retained candidate input differs/)
})

test('coverage2 preserves every executed coverage1 JSON and all535 predicate identities',()=>{
 const revision='c648022b2d9209b7350527bd5553d73e3e82a52c',oldPath='infra/native/conformance/plan-pr368-coverage-1.json',old=read(oldPath)
 const files=new Set([oldPath,'infra/native/conformance/rust-graph-pr368-coverage-1.json',...Object.keys(old.conformanceInputs).filter(name=>name.endsWith('.json'))])
 for(const file of files)assert.deepEqual(fs.readFileSync(path.join(root,file)),execFileSync('git',['show',`${revision}:${file}`],{cwd:root,maxBuffer:32*1024*1024}))
 assert.deepEqual(plan.coverageModules,old.coverageModules);assert.deepEqual(plan.wallet,old.wallet);assert.deepEqual(plan.walletCandidate,old.walletCandidate);assert.equal(plan.compatibilityPatchSha256,old.compatibilityPatchSha256)
 assert.deepEqual(read('itcves/ITCVE-1/4.4.0/profile.json').nativeConformance.assertions,read('itcves/ITCVE-1/4.3.0/profile.json').nativeConformance.assertions)
 for(const name of ['synthesis/src/wallet-lab/native/failure.ts','synthesis/test/native-permission-startup.test.ts','synthesis/test/fixtures/native5-identity-prompt.json'])assert.match(plan.conformanceInputs[name],/^[a-f0-9]{64}$/)
})
