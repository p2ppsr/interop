import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {selectNativeWalletProfile} from './native-wallet-profiles.mjs'
import {nativeRustBinding} from './native-rust-compatibility.mjs'
import {readCommittedBlob} from './read-committed-blob.mjs'
const root=path.resolve(import.meta.dirname,'..'),sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const flags={'integrated-native-conformance-pr368-coverage-4':'--conformance-pr368-coverage-4','integrated-native-conformance-pr368-coverage-3':'--conformance-pr368-coverage-3','integrated-native-conformance-pr368-coverage-2':'--conformance-pr368-coverage-2','integrated-native-conformance-pr368-coverage-1':'--conformance-pr368-coverage-1','all-go-native':undefined,'integrated-native':'--integrated','integrated-native-trusted':'--integrated-trusted','integrated-native-conformance':'--conformance','integrated-native-conformance-coverage':'--conformance-coverage','integrated-native-conformance-closure':'--conformance-closure','integrated-native-conformance-closure-rust-v3':'--conformance-closure-rust-v3','integrated-native-conformance-5.1.1':'--conformance-5.1.1','integrated-native-conformance-5.1.1-observer-2':'--conformance-5.1.1-observer-2','integrated-native-conformance-pr368-7e39006':'--conformance-pr368-7e39006','integrated-native-conformance-pr368-cb3c2f2-observer-3':'--conformance-pr368-cb3c2f2-observer-3'}
/** Builtin-only source check before dependency installation or paid builds. */
export async function checkNativeWalletSelector(variant,{source=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),read=name=>fs.readFileSync(path.join(root,name)),readCommitted=(revision,name)=>readCommittedBlob(root,revision,name)}={}) {
  assert.ok(Object.hasOwn(flags,variant),'Unknown native execution variant')
  const selected=selectNativeWalletProfile(flags[variant]),bytes=read(selected.planPath),plan=JSON.parse(bytes)
  if(selected.coverageRevision) assert.equal(plan.admissionState, 'FROZEN', 'Expanded candidate source is not frozen')
  assert.equal(sha(readCommitted(source,selected.planPath)),sha(bytes),'Plan is not committed at selected execution source')
  for(const [name,digest] of Object.entries(plan.conformanceInputs??{})) {
    assert.equal(sha(read(name)),digest,`Current conformance input differs: ${name}`)
    assert.equal(sha(readCommitted(source,name)),digest,`Conformance input differs at execution: ${name}`)
  }
  if(plan.walletCandidate) {
    assert.equal(plan.claim,'ENGINEERING_OBSERVATION_ONLY');assert.equal(plan.walletCandidate.officialRelease,false)
    const bytes=read(plan.walletCandidate.manifest),manifest=JSON.parse(bytes)
    assert.equal(sha(bytes),plan.walletCandidate.manifestSha256)
    assert.equal(manifest.officialRelease,false);assert.equal(manifest.claim,'ENGINEERING_OBSERVATION_ONLY');assert.deepEqual(manifest.wallet,plan.wallet)
    for(const [name,digest] of Object.entries(manifest.files)) {
      assert.ok(!path.isAbsolute(name)&&!name.split('/').includes('..'),'Unsafe candidate manifest path')
      assert.equal(sha(read(path.posix.join(path.posix.dirname(plan.walletCandidate.manifest),name))),digest,`Retained candidate input differs: ${name}`)
    }
  }
  const graphPolicy=()=> {
    const manifest='components/rust/graph-oracle-3.0.0.json',bytes=read(manifest),graph=JSON.parse(bytes)
    for(const [name,digest] of Object.entries(graph.sources)) assert.equal(sha(read(name)),digest,`Rust graph input differs: ${name}`)
    return {corpus:'tpnil-rust-corpus@3',graphOracle:{id:graph.schema,manifest,manifestSha256:sha(bytes),operation:graph.operation,cargoFeature:graph.cargoFeature}}
  }
  const rust=selected.rustV3?await nativeRustBinding(plan,sha(bytes),source,{read,readCommitted,graphPolicy}):undefined
  return {verifiedSource:true,source,variant,plan:selected.planPath,planSha256:sha(bytes),wallet:plan.wallet,...(rust?{rust}:{}),claim:'SOURCE_PREFLIGHT_ONLY_NOT_NATIVE_QUALIFICATION'}
}
if(process.argv[1]&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {console.log(JSON.stringify(await checkNativeWalletSelector(process.argv[2])))}
  catch(error) {console.error(`${error.message}\nFrozen legacy selectors require their recorded source ref; official observer1 uses6b174e0b903225923999a44fb1de7d67cc4e2959. Official observer2 and the original7e39006 candidate use585211c193d0288effeb466bda38fe6ef23ac94d. The candidate observer3 has a separate frozen plan.`);process.exitCode=1}
}
