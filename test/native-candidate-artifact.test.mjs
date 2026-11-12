import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {checkNativeWalletSelector} from '../scripts/check-native-wallet-selector.mjs'
import {selectNativeWalletProfile,nativeCandidateFlag,nativeCandidateVariant,nativeCandidatePlanPath,nativeWallet511Observer2Flag,nativeWallet511Observer2Variant,nativeWallet511Observer2PlanPath} from '../scripts/native-wallet-profiles.mjs'
import {nativeRustBinding,selectNativeRustCorpus} from '../scripts/native-rust-compatibility.mjs'
const root=path.resolve(import.meta.dirname,'..'),read=name=>fs.readFileSync(path.join(root,name)),json=name=>JSON.parse(read(name)),sha=b=>createHash('sha256').update(b).digest('hex')
const source='ab'.repeat(20),options={source,read,readCommitted:(_revision,name)=>read(name)}

test('candidate is a distinct explicit engineering artifact while observed version stays unchanged',async()=>{
  const selected=selectNativeWalletProfile(nativeCandidateFlag),plan=json(nativeCandidatePlanPath),manifest=json(plan.walletCandidate.manifest)
  assert.equal(selected.walletVersion,'5.1.1-pr368.7e39006');assert.equal(selected.walletManifestVersion,'5.1.1');assert.equal(selected.walletDirectory,'yours-wallet-pr368-7e39006');assert.equal(selected.candidate,true)
  assert.equal(plan.itcve,'ITCVE-1@4.1.0');assert.equal(plan.program,'ISI-4@5.1.0');assert.equal(plan.claim,'ENGINEERING_OBSERVATION_ONLY');assert.equal(plan.walletCandidate.officialRelease,false)
  assert.equal(manifest.reportedCwiVersion,'yours-wallet-5.1.1');assert.equal(sha(read(manifest.archive)),plan.wallet.sha256);assert.equal(read(manifest.archive).length,13238310)
  assert.equal(plan.id,'YOURS-PR368-7E39006-GO-ITCVE-1-V4.1.0-ENGINEERING')
  const verified=await checkNativeWalletSelector(nativeCandidateVariant,options)
  assert.equal(verified.rust.variant,nativeCandidateVariant);assert.equal(verified.claim,'SOURCE_PREFLIGHT_ONLY_NOT_NATIVE_QUALIFICATION')
})

test('observer2 preserves the official artifact and all392 predicates while explicitly adding34 checks',async()=>{
  const selected=selectNativeWalletProfile(nativeWallet511Observer2Flag),plan=json(nativeWallet511Observer2PlanPath),original=json('infra/native/conformance/plan-5.1.1.json')
  assert.equal(selected.observerRevision,2);assert.equal(selected.walletVersion,'5.1.1');assert.equal(selected.candidate,undefined)
  for(const key of ['wallet','application','itcve','program','shutdownSubmissionPolicy','repetitions','timeoutSecondsPerRepetition','requiredEnvironmentAssertions'])assert.deepEqual(plan[key],original[key],key)
  assert.equal(plan.executionBudget.workflowTimeoutMinutes,50);assert.equal(plan.observerRevision,2)
  assert.equal(plan.clauseOracle,'tpnil-brc100-clause-oracle@6.0.0')
  assert.equal(plan.boundaryProfile,'programs/ISI-4/profiles/brc100-boundary-1.0.0/profile-trusted-native-2.json')
  assert.equal(plan.conditionalOracle,'tpnil-native-conditional-oracle@2.0.0')
  assert.deepEqual(json(plan.conditionalOracleManifest).assertionIds,json('programs/ISI-4/profiles/native-conformance-5.0.0/conditional-oracle-1.0.0.json').assertionIds)
  assert.equal(plan.permissionCoverageOracle,'tpnil-native-permission-coverage-oracle@3.0.0')
  const permissionIds=json(plan.permissionCoverageOracleManifest).assertionSuffixes
  assert.equal(permissionIds.length,29)
  assert.deepEqual(permissionIds.filter(id=>id!=='exact-fee-inclusive-cap'),json('programs/ISI-4/profiles/native-conformance-5.0.0/permission-coverage-1.0.0.json').assertionSuffixes)
  assert.equal(json(plan.transactionStateOracleManifest).assertionIds.length,19)
  assert.equal(json(plan.certificateStateOracleManifest).assertions.length,14)
  assert.equal(plan.expectedObservations,426)
  const current=await checkNativeWalletSelector(nativeWallet511Observer2Variant,options);assert.equal(current.rust.variant,nativeWallet511Observer2Variant)
  for(const file of ['infra/native/conformance/plan-5.1.1.json','infra/native/conformance/rust-graph-5.1.1.json','itcves/ITCVE-1/4.0.0/profile.json','programs/ISI-4/5.0.0/catalog.json'])assert.deepEqual(read(file),execFileSync('git',['show',`6b174e0b903225923999a44fb1de7d67cc4e2959:${file}`],{cwd:root}))
})

test('candidate and official binding substitutions, unknown selectors and retained archive corruption fail before builds',async()=>{
  await assert.rejects(checkNativeWalletSelector('integrated-native-conformance-pr368-latest',options),/Unknown/)
  const plan=json(nativeCandidatePlanPath),original=await checkNativeWalletSelector(nativeCandidateVariant,options)
  const graphPolicy=()=>({corpus:'tpnil-rust-corpus@3',graphOracle:original.rust.graphOracle})
  const bindingOptions={read,readCommitted:options.readCommitted,graphPolicy}
  const lock={source,plan,planSha256:sha(read(nativeCandidatePlanPath)),executionVariant:nativeCandidateVariant,rustCompatibility:original.rust}
  for(const mutate of [l=>l.executionVariant=nativeWallet511Observer2Variant,l=>l.plan.wallet.version='5.1.1',l=>l.plan.itcve='ITCVE-1@4.0.0',l=>delete l.rustCompatibility,l=>l.rustCompatibility.manifest='infra/native/conformance/rust-graph-5.1.1.json']) {
    const forged=structuredClone(lock);mutate(forged);await assert.rejects(selectNativeRustCorpus(forged,bindingOptions))
  }
  const manifest=json(plan.walletCandidate.manifest)
  await assert.rejects(checkNativeWalletSelector(nativeCandidateVariant,{...options,read:name=>name===manifest.archive?Buffer.from('wrong candidate'):read(name)}),/Retained candidate input differs/)
  await assert.rejects(checkNativeWalletSelector(nativeCandidateVariant,{...options,readCommitted:(_revision,name)=>name==='scripts/check-native-wallet-selector.mjs'?Buffer.from('changed selector'):read(name)}),/differs|changed/)
})

test('actual candidate ZIP installed-tree verification rejects changed files, missing files and official-release substitution',()=>{
  const harness=String.raw`
import sys,tempfile,pathlib,shutil,zipfile,tarfile,json
root=pathlib.Path(sys.argv[1]);script=(root/'infra/native/yours-go/verify-installed.py').read_text()
with tempfile.TemporaryDirectory(prefix='tpnil-candidate-self-test-') as tmp:
 base=pathlib.Path(tmp);wallet=base/'out/sut-artifacts/yours-wallet-pr368-7e39006';wallet.mkdir(parents=True)
 intake=root/'fixtures/artifacts/yours-wallet-pr368-7e39006'
 shutil.copyfile(intake/'pw-v5.1.1.zip',wallet/'pw-v5.1.1.zip')
 with zipfile.ZipFile(wallet/'pw-v5.1.1.zip') as z:z.extractall(wallet/'unpacked')
 fixture=base/'fixtures/artifacts';fixture.mkdir(parents=True);shutil.copyfile(root/'fixtures/artifacts/todo-ts-236733c-webroot.tgz',fixture/'todo-ts-236733c-webroot.tgz')
 (fixture/'yours-wallet-pr368-7e39006').mkdir();shutil.copyfile(intake/'provenance.json',fixture/'yours-wallet-pr368-7e39006/provenance.json')
 app=base/'out/sut-artifacts/todo-ts-236733c/webroot';app.mkdir(parents=True)
 with tarfile.open(fixture/'todo-ts-236733c-webroot.tgz') as t:t.extractall(app,filter='data')
 sys.argv=['verify-installed.py','--wallet-version','5.1.1-pr368.7e39006']
 code=compile(script.replace("ROOT = Path('/work')",'ROOT = Path('+repr(str(base))+')'),'verify-installed.py','exec')
 def verify():exec(code,{})
 def rejects():
  try:verify()
  except ValueError:return
  raise AssertionError('Modified installed artifact accepted')
 verify()
 file=wallet/'unpacked/build/manifest.json';original=file.read_bytes();file.write_bytes(original+b' ');rejects();file.write_bytes(original)
 file.unlink();rejects();file.write_bytes(original)
 sys.argv=['verify-installed.py','--wallet-version','5.1.1'];official=base/'out/sut-artifacts/yours-wallet-v5.1.1';official.mkdir();shutil.copyfile(wallet/'pw-v5.1.1.zip',official/'pw-v5.1.1.zip');rejects()
 print(json.dumps({'labSelfTestOnly':True,'validCandidateVerified':True,'mutationsRejected':3}))
`
  const output=execFileSync('python3',['-c',harness,root],{encoding:'utf8'})
  assert.deepEqual(JSON.parse(output.trim().split('\n').at(-1)),{labSelfTestOnly:true,validCandidateVerified:true,mutationsRejected:3})
})
