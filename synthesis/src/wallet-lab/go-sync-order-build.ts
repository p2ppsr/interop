// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {canonicalJson} from '../determinism.js'
import {validateBatchBuildInputs,validateCallerKnownSDK} from './go-batch-build.js'
const root=path.resolve(import.meta.dirname,'../../..'),sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex')

/** Go11 preserves the full Go10 host/toolbox artifact and replaces only its
 * checksum-bound SDK serialization layer. Claimed test flags are not admission. */
export function validateSyncOrderArtifact(binarySha256:string,manifest:Record<string,unknown>):Record<string,any>{
 const name='infra/adapters/storage-sync-order/patch.lock.json',bytes=fs.readFileSync(path.join(root,name)),lock=JSON.parse(bytes.toString()),parent=manifest.parentBuild as Record<string,any>
 assert.equal(lock.schema,'tpnil-storage-sync-order-go-patch@1.0.0')
 assert.equal(lock.parent,'infra/adapters/storage-caller-known-inputs/patch.lock.json')
 const parentBytes=fs.readFileSync(path.join(root,lock.parent)),parentLock=JSON.parse(parentBytes.toString());assert.equal(sha(parentBytes),lock.parentSha256)
 for(const key of ['module','version','sum'])assert.equal(lock[key],parentLock[key],'Go11 changes the upstream identity')
 assert.ok(parent&&parent.schema==='tpnil-storage-caller-known-inputs-go-build@1.0.0','Go11 requires the complete immutable Go10 parent')
 assert.equal(parent.patchLockSha256,lock.parentSha256);assert.equal(parent.sdkReplacement?.patchSha256,lock.sdkPatch.parentPatchSha256);assert.equal(lock.sdkPatch.parentPatchSha256,parentLock.sdkPatch.patchSha256)
 validateBatchBuildInputs(parent,false,false,false,false,true);validateCallerKnownSDK(parent)
 assert.equal(manifest.schema,'tpnil-storage-sync-order-go-build@1.0.0');assert.match(binarySha256,/^[0-9a-f]{64}$/);assert.equal(manifest.binarySha256,binarySha256)
 assert.equal(manifest.patchLockSha256,sha(bytes));assert.equal(manifest.parentPatchLockSha256,lock.parentSha256);assert.equal(manifest.patchSha256,lock.sdkPatch.patchSha256)
 assert.equal(sha(fs.readFileSync(path.join(root,'infra/adapters/storage-sync-order',lock.sdkPatch.patch))),lock.sdkPatch.patchSha256)
 for(const n of ['upstream','replacementModule','toolchain','generatedHost','inputs','patchInputs'])assert.equal(canonicalJson(manifest[n]),canonicalJson(parent[n]),`Go11 changed inherited ${n}`)
 const names=['scripts/prepare-storage-sync-order-go.mjs',name,'infra/adapters/storage-sync-order/go-sdk-v1.7.3.patch']
 assert.equal(canonicalJson(manifest.artifactInputs),canonicalJson(Object.fromEntries(names.map(n=>[n,sha(fs.readFileSync(path.join(root,n)))]))),'Go11 artifact source inventory differs')
 const sdk=manifest.sdkReplacement as any,pin=lock.sdkPatch
 assert.ok(sdk&&typeof sdk.source==='string'&&path.isAbsolute(sdk.source)&&!/[\r\n\t ]/.test(sdk.source),'Invalid Go11 SDK source')
 assert.notEqual(sdk.source,parent.sdkReplacement.source);assert.notEqual(sdk.source,parent.replacementModule)
 const postimages={...parent.sdkReplacement.postimages,...Object.fromEntries(Object.entries(pin.files as Record<string,{before:string|null;after:string}>).map(([n,h])=>{if(h.before!==null)assert.equal(h.before,parent.sdkReplacement.postimages[n],'Go11 SDK parent preimage differs');return[n,h.after]}))}
 assert.equal(canonicalJson(sdk),canonicalJson({module:pin.module,version:pin.version,sum:pin.sum,source:sdk.source,patchSha256:pin.patchSha256,postimages}),'Go11 SDK postimages differ')
 assert.equal(pin.module,parentLock.sdkPatch.module);assert.equal(pin.version,parentLock.sdkPatch.version);assert.equal(pin.sum,parentLock.sdkPatch.sum)
 const modules=manifest.generatedModuleFiles as Record<string,unknown>;assert.ok(modules);assert.deepEqual(Object.keys(modules).sort(),['hostMod','hostSum','toolboxMod','toolboxSum'].sort())
 const hostMod=fs.readFileSync(path.join(root,'synthesis/go/go.mod'),'utf8')+`\nreplace ${lock.module} => ${parent.replacementModule}\n\nreplace ${pin.module} => ${sdk.source}\n`
 assert.equal(modules.hostMod,sha(hostMod));assert.equal(modules.hostSum,sha(fs.readFileSync(path.join(root,'synthesis/go/go.sum'))))
 const toolboxMod=fs.readFileSync(path.join(root,'infra/adapters/storage-caller-known-inputs/upstream-toolbox.go.mod'),'utf8')+`\nreplace ${pin.module} => ${sdk.source}\n`
 assert.equal(modules.toolboxMod,sha(toolboxMod));assert.equal(modules.toolboxSum,parent.generatedModuleFiles.toolboxSum)
 return parent
}
