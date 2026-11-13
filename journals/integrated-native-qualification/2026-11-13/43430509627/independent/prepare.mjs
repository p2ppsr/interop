import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
import {prepareFrozenComponentReplay} from '../../scripts/frozen-component-replay.mjs'
import {readCommittedBlob} from '../../scripts/read-committed-blob.mjs'
const root=process.cwd(),source='ec3a554d433845e9aa8209d9eb20dde48cba6a2a',target=path.resolve('out/source19-replay/source'),sha=b=>createHash('sha256').update(b).digest('hex')
const prepared=prepareFrozenComponentReplay(root,source,target)
const plan=JSON.parse(fs.readFileSync(path.join(target,'infra/native/conformance/plan-pr368-coverage-6-source-9.json')))
for(const[n,h]of Object.entries(plan.conformanceInputs))assert.equal(sha(fs.readFileSync(path.join(target,n))),h,n)
// A new target prevents old compiled Rust from satisfying this source replay.
const rust=path.join(target,'components/rust/target');if(fs.existsSync(rust)){assert.ok(fs.lstatSync(rust).isSymbolicLink());fs.unlinkSync(rust)}fs.mkdirSync(rust)
fs.writeFileSync('out/source19-replay/prepared.json',JSON.stringify({source,root:target,prepared,nativeInputs:471,expectedObservations:698,sourceVerified:true,runtimeExecuted:false,freshRustTarget:rust,dependencyByteEvidenceCarriedFrom:'out/native-review-43268040660/review/byte-closure-preflight.json',dependencyLocksUnchanged:true},null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify({source,nativeInputs:471,runtimeExecuted:false,root:target}))
