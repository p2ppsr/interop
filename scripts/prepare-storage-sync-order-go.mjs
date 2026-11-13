// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
const root=path.resolve(import.meta.dirname,'..'),sha=b=>createHash('sha256').update(b).digest('hex')
const lockName='infra/adapters/storage-sync-order/patch.lock.json',lockBytes=fs.readFileSync(path.join(root,lockName)),lock=JSON.parse(lockBytes)
const parentBytes=fs.readFileSync(path.join(root,lock.parent)),parentLock=JSON.parse(parentBytes)
if(sha(parentBytes)!==lock.parentSha256||lock.parent!=='infra/adapters/storage-caller-known-inputs/patch.lock.json'||lock.sdkPatch.parentPatchSha256!==parentLock.sdkPatch.patchSha256)throw Error('Go11 parent identity differs')
const inputNames=['scripts/prepare-storage-sync-order-go.mjs',lockName,'infra/adapters/storage-sync-order/go-sdk-v1.7.3.patch']
const artifactInputs=Object.fromEntries(inputNames.map(n=>[n,sha(fs.readFileSync(path.join(root,n)))]))
execFileSync(process.execPath,[path.join(root,'scripts/prepare-storage-caller-known-inputs-go.mjs')],{cwd:root,stdio:'inherit'})
const parentBuild=JSON.parse(fs.readFileSync(path.join(root,'out/itcve-go-storage-caller-known-inputs.json')))
if(parentBuild.patchLockSha256!==lock.parentSha256||parentBuild.sdkReplacement.patchSha256!==lock.sdkPatch.parentPatchSha256)throw Error('Go11 compiled parent differs')
const sdkSource=path.join(root,'out/storage-sync-order-sdk-source');fs.rmSync(sdkSource,{recursive:true,force:true});fs.cpSync(parentBuild.sdkReplacement.source,sdkSource,{recursive:true})
for(const[n,h]of Object.entries(lock.sdkPatch.files)){const f=path.join(sdkSource,n);if(h.before===null?fs.existsSync(f):sha(fs.readFileSync(f))!==h.before)throw Error('Go11 SDK preimage differs: '+n)}
const patch=fs.readFileSync(path.join(root,'infra/adapters/storage-sync-order',lock.sdkPatch.patch));if(sha(patch)!==lock.sdkPatch.patchSha256)throw Error('Go11 SDK patch differs')
execFileSync('git',['apply','--no-index','--whitespace=error','-'],{cwd:sdkSource,input:patch,stdio:['pipe','inherit','inherit']})
for(const[n,h]of Object.entries(lock.sdkPatch.files))if(sha(fs.readFileSync(path.join(sdkSource,n)))!==h.after)throw Error('Go11 SDK postimage differs: '+n)
const components=JSON.parse(fs.readFileSync(path.join(root,'synthesis/go/components.lock.json'))),env={...process.env,GOTOOLCHAIN:components.toolchain,TPNIL_NODE:process.execPath,TPNIL_TS_NATIVE_CONTRACT_TEST:path.join(root,'infra/adapters/storage-native-contracts/rpc-contract-test.mjs')}
const go=(args,cwd)=>{try{return execFileSync('go',args,{cwd,env,encoding:'utf8',maxBuffer:128*1024*1024,stdio:['ignore','pipe','inherit']})}catch(e){if(e.stdout)process.stdout.write(e.stdout);throw e}}
const hostMod=path.join(root,'out/storage-sync-order-go.mod'),toolboxMod=path.join(root,'out/storage-sync-order-toolbox.mod')
for(const[old,dst]of[['storage-caller-known-inputs-go.mod',hostMod],['storage-caller-known-inputs-toolbox.mod',toolboxMod]]){fs.copyFileSync(path.join(root,'out',old),dst);fs.copyFileSync(path.join(root,'out',old.replace(/\.mod$/,'.sum')),dst.replace(/\.mod$/,'.sum'));go(['mod','edit',`-modfile=${dst}`,`-replace=${lock.sdkPatch.module}=${sdkSource}`],old.includes('toolbox')?parentBuild.replacementModule:path.join(root,'synthesis/go'))}
process.stdout.write(go(['test','./transaction','-count=1'],sdkSource))
process.stdout.write(go(['test',`-modfile=${hostMod}`,'-mod=readonly','./...'],path.join(root,'synthesis/go')))
process.stdout.write(go(['test',`-modfile=${toolboxMod}`,'-mod=readonly','./pkg/internal/storage/database','./pkg/internal/storage/dbretry','./pkg/services','./pkg/internal/txutils','./pkg/internal/storage/funder','./pkg/internal/storage/repo','./pkg/storage','./pkg/wdk','./pkg/storage/internal/actions','./pkg/internal/validate','./pkg/wallet/internal/mapping','-count=1'],parentBuild.replacementModule))
const binary=path.join(root,'out/itcve-go-storage-sync-order'),host=path.join(root,'out/storage-caller-known-inputs-host'),hostFiles=Object.keys(parentBuild.generatedHost).sort().map(n=>path.join(host,n))
for(const f of hostFiles)if(sha(fs.readFileSync(f))!==parentBuild.generatedHost[path.basename(f)])throw Error('Go11 shared host differs')
go(['build',`-modfile=${hostMod}`,'-mod=readonly','-trimpath','-o',binary,...hostFiles],path.join(root,'synthesis/go'))
const postimages={...parentBuild.sdkReplacement.postimages,...Object.fromEntries(Object.entries(lock.sdkPatch.files).map(([n,h])=>[n,h.after]))}
const manifest={...parentBuild,schema:'tpnil-storage-sync-order-go-build@1.0.0',patchLockSha256:sha(lockBytes),parentPatchLockSha256:lock.parentSha256,patchSha256:lock.sdkPatch.patchSha256,binarySha256:sha(fs.readFileSync(binary)),parentBuild,sdkReplacement:{module:lock.sdkPatch.module,version:lock.sdkPatch.version,sum:lock.sdkPatch.sum,source:sdkSource,patchSha256:lock.sdkPatch.patchSha256,postimages},generatedModuleFiles:{hostMod:sha(fs.readFileSync(hostMod)),hostSum:sha(fs.readFileSync(hostMod.replace(/\.mod$/,'.sum'))),toolboxMod:sha(fs.readFileSync(toolboxMod)),toolboxSum:sha(fs.readFileSync(toolboxMod.replace(/\.mod$/,'.sum')))},artifactInputs,validation:{...parentBuild.validation,deterministicSyncAncestry512:'PASS',parentArtifactPreserved:'PASS',claim:'LAB_SELF_TEST_ONLY'}}
for(const[n,h]of Object.entries(artifactInputs))if(sha(fs.readFileSync(path.join(root,n)))!==h)throw Error('Go11 build input changed')
fs.writeFileSync(binary+'.json',JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest,null,2))
