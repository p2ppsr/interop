import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {nativeRustBinding, nativeCandidateCoverage3CompatibilityPath, nativeCompletionCompatibilitySources} from '../scripts/native-rust-compatibility.mjs'
import {nativeCandidateCoverage3PlanPath, nativeCandidateCoverage3OriginalPlanPath, selectNativeWalletProfile} from '../scripts/native-wallet-profiles.mjs'

const root=path.resolve(import.meta.dirname,'..'),read=name=>fs.readFileSync(path.join(root,name)),sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const source='69386efcea077e4bbe5b6e07f71fc6fe3b1f87f7'
const plan=JSON.parse(read(nativeCandidateCoverage3PlanPath))
const original=JSON.parse(read(nativeCandidateCoverage3OriginalPlanPath))
const graphManifest='components/rust/graph-oracle-3.0.0.json',graph=JSON.parse(read(graphManifest))
const graphPolicy=()=>({corpus:'tpnil-rust-corpus@3',graphOracle:{id:graph.schema,manifest:graphManifest,manifestSha256:sha(read(graphManifest)),operation:graph.operation,cargoFeature:graph.cargoFeature}})

test('source2 preserves the exact executed plan, Rust manifest, profile, catalog and source7 evaluator',()=>{
  for(const name of [nativeCandidateCoverage3OriginalPlanPath,'infra/native/conformance/rust-graph-pr368-coverage-3.json','infra/native/conformance/reevaluation-42711700295-rust-3.0.0-source-7.json','itcves/ITCVE-1/4.5.0/profile.json','programs/ISI-4/5.5.0/catalog.json']) assert.deepEqual(read(name),execFileSync('git',['show',`${source}:${name}`],{cwd:root,maxBuffer:16*1024*1024}))
  const reevaluation=JSON.parse(read('infra/native/conformance/reevaluation-42711700295-rust-3.0.0-source-7.json'))
  for(const [name,digest] of Object.entries(reevaluation.evaluatorSources)) assert.equal(sha(read(name)),digest)
  assert.equal(plan.itcve,'ITCVE-1@4.5.0');assert.equal(plan.expectedObservations,698)
  assert.equal(plan.sourceBindingRevision,5)
  assert.deepEqual(plan.sourcePredecessor,{path:'infra/native/conformance/plan-pr368-coverage-3-source-4.json',sha256:sha(read('infra/native/conformance/plan-pr368-coverage-3-source-4.json'))})
  assert.equal(Object.keys(plan.conformanceInputs).length,Object.keys(original.conformanceInputs).length+5)
  for(const [name,digest] of Object.entries(plan.conformanceInputs)) assert.equal(sha(read(name)),digest,name)
})

test('host, worker, parent and Docker all select the explicit same-criteria successor closure',()=>{
  assert.equal(selectNativeWalletProfile('--conformance-pr368-coverage-3').planPath,nativeCandidateCoverage3PlanPath)
  assert.ok(nativeCandidateCoverage3PlanPath.endsWith('coverage-3-source-5.json'))
  for(const name of ['synthesis/src/wallet-lab/native/worker.ts','synthesis/src/wallet-lab/native/verify.ts','scripts/verify-native-integrated.mjs']) assert.ok(read(name).toString().includes(nativeCandidateCoverage3PlanPath),name)
  assert.ok(read('infra/native/conformance/Dockerfile').toString().includes('scripts/read-committed-blob.mjs /work/scripts/'))
  const rust=JSON.parse(read(nativeCandidateCoverage3CompatibilityPath))
  assert.equal(rust.sourceBindingRevision,10)
  assert.deepEqual(Object.keys(rust.sources).sort(),[...nativeCompletionCompatibilitySources].sort())
  assert.deepEqual(rust.predecessor,{manifest:'infra/native/conformance/rust-graph-pr368-coverage-3-source-4.json',sha256:sha(read('infra/native/conformance/rust-graph-pr368-coverage-3-source-4.json'))})
})

// Synthetic readCommitted is explicit here: these tests exercise admission
// predicates, and do not claim that uncommitted source is admitted for execution.
test('Rust source-only successor predicates admit the complete fixture and reject criterion changes',async()=>{
  const options={read,readCommitted:(_revision,name)=>read(name),graphPolicy}
  const result=await nativeRustBinding(plan,sha(read(nativeCandidateCoverage3PlanPath)),source,options)
  assert.equal(result.manifest,nativeCandidateCoverage3CompatibilityPath)
  for(const mutate of [p=>p.wallet.version='unbound',p=>p.expectedObservations--,p=>p.maxSecondsPerRepetition++,p=>p.completionModules.baskets.assertions--,p=>delete p.permissionFixture]) {
    const changed=structuredClone(plan);mutate(changed)
    await assert.rejects(nativeRustBinding(changed,sha(read(nativeCandidateCoverage3PlanPath)),source,options),/preserve every native criterion|Expected values to be strictly equal/)
  }
})

test('source successor cannot drop a historical input, helper, or predecessor binding',async()=>{
  for(const mutate of [p=>delete p.conformanceInputs['synthesis/test/fixtures/native-pagination/report.json.gz'],p=>delete p.conformanceInputs['scripts/read-committed-blob.mjs'],p=>p.sourcePredecessor.sha256='0'.repeat(64),p=>p.sourceBindingRevision=1]) {
    const changed=structuredClone(plan);mutate(changed)
    await assert.rejects(nativeRustBinding(changed,sha(read(nativeCandidateCoverage3PlanPath)),source,{read,readCommitted:(_revision,name)=>read(name),graphPolicy}))
  }
})

function allowedByNativeIgnore(file,text) {
  let included=true
  for(const line of text.split('\n').map(line=>line.trim()).filter(line=>line&&!line.startsWith('#'))) {
    const allow=line.startsWith('!'),pattern=allow?line.slice(1):line
    // This source-owned policy uses only a blanket exclusion, literal paths,
    // and explicitly included recursive subtrees. Reject a new glob grammar.
    assert.ok(pattern==='**'||/^[a-zA-Z0-9_./-]+(?:\/\*\*)?$/.test(pattern))
    if(pattern==='**'||pattern===file||(pattern.endsWith('/**')&&file.startsWith(pattern.slice(0,-2)))) included=allow
  }
  return included
}
function projectedInputs(dockerfiles,inputs,ignores=[]) {
  const projected=new Map()
  for(const [index,text] of dockerfiles.entries()) for(const line of text.split('\n')) {
    if(!line.startsWith('COPY ')||line.includes('--from=')) continue
    const args=line.slice(5).trim().split(/\s+/), destination=args.pop()
    if(!destination.startsWith('/work/')) continue
    for(const source of args) {
      if(source.includes('$')) continue // These only supply separately admitted external binaries/artifacts.
      for(const matched of fs.globSync(source,{cwd:root})) {
        const directory=fs.statSync(path.join(root,matched)).isDirectory(), target=destination.slice(6).replace(/\/$/,'')
        for(const input of inputs) {
          if(directory && input.startsWith(target+'/')) {
            const file=path.posix.join(matched,input.slice(target.length+1))
            if(allowedByNativeIgnore(file,ignores[index]??'')) projected.set(input,file)
          }
          else if(!directory && input===(destination.endsWith('/')?target+'/'+path.posix.basename(matched):target) && allowedByNativeIgnore(matched,ignores[index]??'')) projected.set(input,matched)
        }
      }
    }
  }
  return projected
}
test('all frozen inputs reach their exact worker paths through the complete Docker COPY chain',()=>{
  const names=['infra/native/yours-go/Dockerfile','infra/native/integrated/Dockerfile','infra/native/conformance/Dockerfile'],inputs=Object.keys(plan.conformanceInputs)
  // The checked build context is repository root; the base image has a pinned
  // include-only policy and the two later stages have no ignore files.
  assert.equal(fs.existsSync(path.join(root,'.dockerignore')),false)
  for(const name of names.slice(1)) assert.equal(fs.existsSync(path.join(root,name+'.dockerignore')),false)
  const ignores=[read(names[0]+'.dockerignore').toString(),'','']
  const candidate='out/sut-artifacts/yours-wallet-pr368-3e8a97f/unpacked/build/background.js'
  assert.equal(allowedByNativeIgnore(candidate,ignores[0]),true)
  assert.equal(allowedByNativeIgnore(candidate,ignores[0].split('\n').filter(line=>!line.includes('yours-wallet-pr368-3e8a97f')).join('\n')),false)
  const workflow=read('.github/workflows/isi4-yours-wallet.yml').toString()
  for(const name of names) assert.ok(workflow.split('\n').some(line=>line.includes(`-f ${name} `)&&line.trimEnd().endsWith(' .')))
  const texts=names.map(name=>read(name).toString())
  const missing=files=>{const mapped=projectedInputs(files,inputs,ignores);return inputs.filter(name=>mapped.get(name)!==name)}
  assert.deepEqual(missing(texts),[])
  for(const source of ['synthesis/test','test','programs/ISI-4/profiles/native-coverage-partial-trace-1.0.0/policy.json','scripts/verify-native-image.mjs']) {
    const changed=[...texts];changed[2]=changed[2].split('\n').filter(line=>!line.startsWith(`COPY ${source} `)).join('\n')
    assert.ok(missing(changed).length>0,`Removing ${source} must invalidate the image source closure`)
  }
  const old=names.map(name=>execFileSync('git',['show',`${source}:${name}`],{cwd:root,encoding:'utf8'}))
  const oldInputs=Object.keys(original.conformanceInputs),oldIgnore=execFileSync('git',['show',`${source}:${names[0]}.dockerignore`],{cwd:root,encoding:'utf8'}),mapped=projectedInputs(old,oldInputs,[oldIgnore,'',''])
  assert.equal(oldInputs.filter(name=>mapped.get(name)!==name).length,82,'Retain the independently reproduced693 image-closure defect')
})
