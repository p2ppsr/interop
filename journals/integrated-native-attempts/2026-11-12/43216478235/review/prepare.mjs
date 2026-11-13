import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {prepareFrozenComponentReplay} from '../../scripts/frozen-component-replay.mjs'
const root=fs.realpathSync(process.cwd()),home=path.join(root,'out/native-review-43216478235'),source='1f9fe0f9b979e9bbca66e90335f02ba2b80c7d41',sha=b=>createHash('sha256').update(b).digest('hex')
assert.equal(process.versions.node,'24.22.1')
assert.equal(execFileSync('git',['rev-parse',source],{cwd:root}).toString().trim(),source)
const prepared=prepareFrozenComponentReplay(root,source,path.join(home,'source'))
const paths=['package.json','.nvmrc','.github','scripts','synthesis','infra','fixtures','components','integrations','itcves','programs','config','src','bin','adapters','schemas','suts']
const tree=execFileSync('git',['ls-tree','-r','-l','-z',source,'--',...paths],{cwd:root,maxBuffer:32*1024*1024}).toString().split('\0').filter(Boolean),files=[]
for(const row of tree){const match=/^(100(?:644|755)) blob ([a-f0-9]{40}) +([0-9]+)\t([\s\S]+)$/.exec(row);assert.ok(match);const[,mode,gitBlob,size,file]=match,bytes=fs.readFileSync(path.join(prepared.root,file));assert.equal(bytes.length,Number(size));assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),gitBlob);files.push({path:file,mode,bytes:bytes.length,gitBlob,sha256:sha(bytes)})}
assert.equal(files.length,prepared.files)
const planPath='infra/native/conformance/plan-pr368-coverage-2.json',planBytes=fs.readFileSync(path.join(prepared.root,planPath)),plan=JSON.parse(planBytes)
assert.equal(sha(planBytes),'b7b2dcd4ed50df0cd5ce3b9d4c2828b1be3953d6da4a34a3f9cd31fceb57b1cd');assert.equal(plan.itcve,'ITCVE-1@4.4.0');assert.equal(plan.expectedObservations,535);assert.equal(Object.keys(plan.conformanceInputs).length,164)
for(const[p,h]of Object.entries(plan.conformanceInputs))assert.equal(files.find(r=>r.path===p)?.sha256,h,`Native source closure missing ${p}`)
const inventory={schema:'tpnil-native-frozen-source-inventory@2',source,canonicalRoot:prepared.root,files,allBytesMatchGit:true,selection:paths,includesAllNativeInputs:164,scriptSha256:sha(fs.readFileSync(new URL(import.meta.url)))}
const snapshot={...prepared,preparedAt:new Date().toISOString(),node:process.version,exactGitBytes:files.reduce((n,r)=>n+r.bytes,0),nativeInputs:164,profile:plan.itcve,planSha256:sha(planBytes),materializer:'scripts/frozen-component-replay.mjs',materializerSha256:sha(fs.readFileSync(path.join(root,'scripts/frozen-component-replay.mjs'))),claim:'SOURCE_ADMISSION_ONLY_NO_NATIVE_RESULTS'}
fs.writeFileSync(path.join(home,'source-inventory.json'),JSON.stringify(inventory,null,2)+'\n',{flag:'wx'});fs.writeFileSync(path.join(home,'snapshot.json'),JSON.stringify(snapshot,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(snapshot,null,2))
