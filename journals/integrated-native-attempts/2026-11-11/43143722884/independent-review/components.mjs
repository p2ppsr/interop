import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
const root=fs.realpathSync(process.cwd()),home=path.join(root,'out/native-review-43143722884'),frozen=fs.realpathSync(path.join(home,'source')),original=path.join(home,'attempt-2026-11-12T03-26-40-037Z/original'),target=path.join(home,'components')
fs.mkdirSync(target);const {requireVerifierReceipt}=await import(pathToFileURL(path.join(frozen,'scripts/frozen-component-replay.mjs'))),sha=bytes=>createHash('sha256').update(bytes).digest('hex'),read=file=>JSON.parse(fs.readFileSync(file))
const review={schema:'tpnil-native-component-scoped-review@1',claim:'COMPONENT_REPLAY_ONLY_NOT_NATIVE_QUALIFICATION',source:'6b174e0b903225923999a44fb1de7d67cc4e2959',newNativeSessions:0,qualifiedEnvironment:false,rustOriginal:'NOT_EXECUTED',repetitions:[]}
for(let index=1;index<=2;index++){
 const directory=fs.realpathSync(path.join(original,`repetition-${index}/evidence/integrated`)),transport=path.join(target,`transport-${index}`),report=read(path.join(directory,'result.json'));fs.mkdirSync(transport)
 const relay=read(path.join(directory,'relay.json')),paid=read(path.join(directory,'paid-http.json'))
 for(const name of ['relay.json','paid-http.json'])fs.copyFileSync(path.join(directory,name),path.join(transport,name))
 fs.writeFileSync(path.join(transport,'result.json'),JSON.stringify({schema:'tpnil-component-result@1',assertions:[...relay.assertions,...paid.assertions],evidence:['relay.json','paid-http.json'].map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(transport,name)))})),cleanup:{nativeEnvelopeVerified:true}}))
 const steps=[]
 for(const[script,args]of [['verify-transport.mjs',[fs.realpathSync(transport)]],['verify-native-messaging.mjs',[directory]],['verify-native-synthesis.mjs',[directory,'--integrated',report.walletIdentity]],['verify-wallet-boundary.mjs',[directory,'--integrated']],['verify-native-trust.mjs',[directory]]]){
  const invocation=[path.join(frozen,'scripts',script),...args],r=spawnSync(process.execPath,invocation,{cwd:frozen,env:{...process.env,TPNIL_MESSAGING_PATHS:path.join(root,'out/messaging-native-verifier/paths.json')},encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024}),stem=path.join(target,`${index}-${script}`)
  for(const kind of ['stdout','stderr'])fs.writeFileSync(`${stem}.${kind}.log`,r[kind]??'',{flag:'wx'})
  const step={script,args,exitCode:r.status,stdoutBytes:Buffer.byteLength(r.stdout??''),stderrBytes:Buffer.byteLength(r.stderr??''),structuredReceiptVerified:false}
  try{assert.equal(r.status,0);step.receipt=requireVerifierReceipt(r.stdout,{verified:true});step.structuredReceiptVerified=true}catch(error){step.error={name:error.name,message:error.message}}
  steps.push(step)
 }
 review.repetitions.push({index,rawIntegrationPredicates:report.assertions.length,rawIntegrationCounts:Object.fromEntries(['PASS','FAIL','BLOCKED'].map(result=>[result,report.assertions.filter(row=>row.result===result).length])),steps})
}
fs.writeFileSync(path.join(target,'review.json'),JSON.stringify(review,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(review,null,2))
