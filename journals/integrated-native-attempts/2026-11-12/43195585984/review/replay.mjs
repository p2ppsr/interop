import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
const root=fs.realpathSync(process.cwd()),home=path.join(root,'out/native-review-43195585984'),source='c648022b2d9209b7350527bd5553d73e3e82a52c',frozen=fs.realpathSync(path.join(home,'source')),original=fs.realpathSync(process.argv[2]),work=path.join(home,'replay')
assert.ok(!fs.existsSync(work));fs.cpSync(original,work,{recursive:true});const directory=fs.realpathSync(work)
const {requireVerifierReceipt}=await import(pathToFileURL(path.join(frozen,'scripts/frozen-component-replay.mjs'))),sha=b=>createHash('sha256').update(b).digest('hex')
const inventory=JSON.parse(fs.readFileSync(path.join(home,'source-inventory.json')))
const verifySource=()=>{for(const row of inventory.files)assert.equal(sha(fs.readFileSync(path.join(frozen,row.path))),row.sha256)}
verifySource()
const env={...process.env,TPNIL_REPLAY_GIT_ROOT:root,TPNIL_MESSAGING_PATHS:path.join(root,'out/messaging-native-verifier/paths.json')}
const before=[];for(const name of fs.readdirSync(original,{recursive:true})){const file=path.join(original,name);if(fs.statSync(file).isFile())before.push({path:name,sha256:sha(fs.readFileSync(file))})}
const report={schema:'tpnil-native-frozen-full-replay@1',claim:'INDEPENDENT_FROZEN_SOURCE_REPLAY',source,run:43195585984,node:process.version,startedAt:new Date().toISOString(),originalRoot:original,replayRoot:directory,originalFiles:before.length,parent:{},children:[],result:'NOT_VERIFIED'}
try{
 for(const required of ['qualification.json','integrated-qualification.json','rust-repetition-1/result.json','rust-repetition-2/result.json'])assert.ok(fs.existsSync(path.join(original,required)),`Original artifact lacks ${required}; preserve incomplete attempt and use partial diagnostic, do not fabricate original Rust execution`)
 const args=[path.join(frozen,'scripts/verify-native-integrated.mjs'),directory],r=spawnSync(process.execPath,args,{cwd:frozen,env,encoding:'utf8',timeout:900000,maxBuffer:64*1024*1024})
 fs.writeFileSync(path.join(home,'parent.stdout.log'),r.stdout??'',{flag:'wx'});fs.writeFileSync(path.join(home,'parent.stderr.log'),r.stderr??'',{flag:'wx'})
 report.parent={args,exitCode:r.status,signal:r.signal,error:r.error?.message,stdoutBytes:Buffer.byteLength(r.stdout??''),stderrBytes:Buffer.byteLength(r.stderr??'')}
 assert.equal(r.status,0,'Frozen complete parent replay failed')
 report.parent.receipt=requireVerifierReceipt(r.stdout,{schema:'tpnil-native-integrated-qualification@2',source,qualifiedEnvironment:true,repetitionMatch:true,profile:'ITCVE-1@4.3.0',claim:'ENGINEERING_OBSERVATION_ONLY'})
 for(let index=1;index<=2;index++){
  const integrated=fs.realpathSync(path.join(directory,`repetition-${index}/evidence/integrated`)),raw=JSON.parse(fs.readFileSync(path.join(integrated,'result.json'))),temp=path.join(home,`transport-${index}`);fs.mkdirSync(temp)
  const relay=JSON.parse(fs.readFileSync(path.join(integrated,'relay.json'))),paid=JSON.parse(fs.readFileSync(path.join(integrated,'paid-http.json')))
  for(const name of ['relay.json','paid-http.json'])fs.copyFileSync(path.join(integrated,name),path.join(temp,name))
  fs.writeFileSync(path.join(temp,'result.json'),JSON.stringify({schema:'tpnil-component-result@1',assertions:[...relay.assertions,...paid.assertions],evidence:['relay.json','paid-http.json'].map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(temp,name)))})),cleanup:{nativeEnvelopeVerified:true}}))
  const rustInputs=['paid-http.json','messaging.json','synthesis-transactions.json','identity-trust.json'].map(name=>path.join(integrated,name))
  for(const [script,args] of [['verify-transport.mjs',[temp]],['verify-native-messaging.mjs',[integrated]],['verify-native-synthesis.mjs',[integrated,'--integrated',raw.walletIdentity,'--validated-board-v2']],['verify-wallet-boundary.mjs',[integrated,'--integrated']],['verify-native-trust.mjs',[integrated,'--oracle-2']],['verify-rust.mjs',[path.join(directory,`rust-repetition-${index}`),...rustInputs,'--corpus-v3']]]){
   const invocation=[path.join(frozen,'scripts',script),...args],r=spawnSync(process.execPath,invocation,{cwd:frozen,env,encoding:'utf8',timeout:300000,maxBuffer:32*1024*1024}),stem=path.join(home,`${index}-${script}`)
   fs.writeFileSync(`${stem}.stdout.log`,r.stdout??'',{flag:'wx'});fs.writeFileSync(`${stem}.stderr.log`,r.stderr??'',{flag:'wx'})
   const step={repetition:index,script,args,exitCode:r.status,stdoutBytes:Buffer.byteLength(r.stdout??''),stderrBytes:Buffer.byteLength(r.stderr??'')};report.children.push(step)
   assert.equal(r.status,0,`${script} failed`);step.receipt=requireVerifierReceipt(r.stdout,{verified:true})
  }
 }
 report.result='VERIFIED_EXACT_SOURCE_AND_ALL_CHILDREN'
}catch(error){report.failure={name:error.name,message:error.message};process.exitCode=1}
finally{
 for(const row of before)assert.equal(sha(fs.readFileSync(path.join(original,row.path))),row.sha256,'Original native member changed')
 verifySource();report.originalBytesUnchanged=true;report.frozenSourceUnchanged=true;report.completedAt=new Date().toISOString()
 fs.writeFileSync(path.join(home,'replay.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({result:report.result,children:report.children.length,failure:report.failure,parentExitCode:report.parent.exitCode}))
}
