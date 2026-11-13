// SPDX-License-Identifier: Apache-2.0
// LAB_SELF_TEST_ONLY: synthetic binary identity; no native run is qualified.
import fs from 'node:fs'
import path from 'node:path'
import {gunzipSync} from 'node:zlib'
import {createHash} from 'node:crypto'
import {expect,it} from 'vitest'
import {validateSyncOrderArtifact} from '../src/wallet-lab/go-sync-order-build.js'
import {GoServices,selectComponents,validateComponentIdentity,validateSyncOrderGoBuild} from '../src/wallet-lab/go-services.js'
const root=path.resolve(import.meta.dirname,'../..'),sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex')
const lockName='infra/adapters/storage-sync-order/patch.lock.json',lockBytes=fs.readFileSync(path.join(root,lockName)),lock=JSON.parse(lockBytes.toString()),sdk=lock.sdkPatch
const originalParent=JSON.parse(gunzipSync(fs.readFileSync(path.join(import.meta.dirname,'fixtures/native-sync-order/parent-build.json.gz'))).toString())
const binary='ef'.repeat(32),newSource='/fixture/go11/sdk'
function manifest():any {
 const parent=structuredClone(originalParent),hostMod=fs.readFileSync(path.join(root,'synthesis/go/go.mod'),'utf8')+`\nreplace ${lock.module} => ${parent.replacementModule}\n\nreplace ${sdk.module} => ${newSource}\n`,toolboxMod=fs.readFileSync(path.join(root,'infra/adapters/storage-caller-known-inputs/upstream-toolbox.go.mod'),'utf8')+`\nreplace ${sdk.module} => ${newSource}\n`
 return{...parent,schema:'tpnil-storage-sync-order-go-build@1.0.0',patchLockSha256:sha(lockBytes),parentPatchLockSha256:lock.parentSha256,patchSha256:sdk.patchSha256,binarySha256:binary,parentBuild:parent,sdkReplacement:{module:sdk.module,version:sdk.version,sum:sdk.sum,source:newSource,patchSha256:sdk.patchSha256,postimages:{...parent.sdkReplacement.postimages,...Object.fromEntries(Object.entries(sdk.files as Record<string,{after:string}>).map(([n,h])=>[n,h.after]))}},generatedModuleFiles:{hostMod:sha(hostMod),hostSum:parent.generatedModuleFiles.hostSum,toolboxMod:sha(toolboxMod),toolboxSum:parent.generatedModuleFiles.toolboxSum},artifactInputs:Object.fromEntries(['scripts/prepare-storage-sync-order-go.mjs',lockName,'infra/adapters/storage-sync-order/go-sdk-v1.7.3.patch'].map(n=>[n,sha(fs.readFileSync(path.join(root,n)))]))}
}
function build(m:any):any {
 const components=JSON.parse(fs.readFileSync(path.join(root,'synthesis/go/components.lock.json'),'utf8')),dependencies=Object.fromEntries(components.components.map((p:any)=>[p.module,{version:p.version,sum:p.sum}]))
 dependencies[lock.module]={version:lock.version,sum:'',replacementModule:m.replacementModule,replacementVersion:'(devel)'};dependencies[sdk.module]={version:sdk.version,sum:'',replacementModule:m.sdkReplacement.source,replacementVersion:'(devel)'};return{toolchain:components.toolchain,dependencies}
}
it('admits Go11 only with every inherited Go10 input and the exact new SDK source',()=>{
 const m=manifest();expect(validateSyncOrderArtifact(binary,m)).toEqual(originalParent);expect(()=>validateSyncOrderGoBuild(build(m),binary,m)).not.toThrow()
 const components=selectComponents({storage:'go'}),pins=JSON.parse(fs.readFileSync(path.join(root,'synthesis/go/components.lock.json'),'utf8')),go={schema:'tpnil-go-services@1.0.0',components,binarySha256:binary,compatibilityPatch:m,fixtureSubmissionPolicy:'terminal-rejection-v1',dependencies:pins,goModSha256:pins.moduleFiles['go.mod'],goSumSha256:pins.moduleFiles['go.sum']}
 expect(()=>validateComponentIdentity({components,go},'ITCVE-1@4.8.0')).not.toThrow()
 expect(()=>validateComponentIdentity({components,go:{...go,binarySha256:originalParent.binarySha256,compatibilityPatch:originalParent}},'ITCVE-1@4.8.0')).toThrow()
 expect(()=>validateComponentIdentity({components,go:{...go,binarySha256:originalParent.binarySha256,compatibilityPatch:originalParent}},'ITCVE-1@4.5.0')).not.toThrow()
})
it.each(['binary','parent-lock','patch','sdk-source','sdk-version','sdk-postimage','host-module','source-inventory','parent-host','parent-sdk'])('rejects %s drift before admitting the new artifact',kind=>{
 const m=manifest()
 if(kind==='binary')m.binarySha256='00'.repeat(32)
 if(kind==='parent-lock')m.parentPatchLockSha256='00'.repeat(32)
 if(kind==='patch')m.patchSha256='00'.repeat(32)
 if(kind==='sdk-source')m.sdkReplacement.source=m.parentBuild.sdkReplacement.source
 if(kind==='sdk-version')m.sdkReplacement.version='v0.0.0'
 if(kind==='sdk-postimage')m.sdkReplacement.postimages['transaction/beef.go']='00'.repeat(32)
 if(kind==='host-module')m.generatedModuleFiles.hostMod='00'.repeat(32)
 if(kind==='source-inventory')delete m.artifactInputs['scripts/prepare-storage-sync-order-go.mjs']
 if(kind==='parent-host')m.parentBuild.generatedHost['main.go']='00'.repeat(32)
 if(kind==='parent-sdk')m.parentBuild.sdkReplacement.postimages['transaction/beef.go']='00'.repeat(32)
 expect(()=>validateSyncOrderArtifact(binary,m)).toThrow()
})
it('rejects an actual compiled SDK replacement outside the new artifact and incomplete selector pairs',()=>{
 const m=manifest(),b=build(m);b.dependencies[sdk.module].replacementModule='/different/source';expect(()=>validateSyncOrderGoBuild(b,binary,m)).toThrow()
 expect(()=>new GoServices('/unused',selectComponents({storage:'go'}),{storageSyncOrderPatch:true})).toThrow()
})
