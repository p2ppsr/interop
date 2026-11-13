import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
const root=fs.realpathSync(process.cwd()),home=path.join(root,'out/native-review-43195585984/components-2');fs.mkdirSync(home);const frozen=fs.realpathSync(path.join(root,'out/native-review-43195585984/source')),directory=fs.realpathSync(process.argv[2]),sha=b=>createHash('sha256').update(b).digest('hex'),env={...process.env,TPNIL_REPLAY_GIT_ROOT:root,TPNIL_MESSAGING_PATHS:path.join(root,'out/messaging-native-verifier/paths.json')};
const {requireVerifierReceipt}=await import(pathToFileURL(path.join(frozen,'scripts/frozen-component-replay.mjs')));const report={schema:'tpnil-partial-component-independent-replay@1',claim:'PARTIAL_COMPONENT_REPLAY_NOT_ENVIRONMENT_QUALIFICATION',qualifiedEnvironment:false,source:'c648022b2d9209b7350527bd5553d73e3e82a52c',run:43195585984,children:[],rust:'NOT_EXECUTED_IN_ORIGINAL',result:'NOT_VERIFIED'};
try {
 for(let index=1;index<=2;index++){
  const integrated=fs.realpathSync(path.join(directory,`repetition-${index}/evidence/integrated`)),raw=JSON.parse(fs.readFileSync(path.join(integrated,'result.json'))),temp=path.join(home,`transport-${index}`);fs.mkdirSync(temp)
  const relay=JSON.parse(fs.readFileSync(path.join(integrated,'relay.json'))),paid=JSON.parse(fs.readFileSync(path.join(integrated,'paid-http.json')))
  for(const name of ['relay.json','paid-http.json'])fs.copyFileSync(path.join(integrated,name),path.join(temp,name))
  fs.writeFileSync(path.join(temp,'result.json'),JSON.stringify({schema:'tpnil-component-result@1',assertions:[...relay.assertions,...paid.assertions],evidence:['relay.json','paid-http.json'].map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(temp,name)))})),cleanup:{nativeEnvelopeVerified:true}}))
  const rustInputs=['paid-http.json','messaging.json','synthesis-transactions.json','identity-trust.json'].map(name=>path.join(integrated,name))
  for(const [script,args] of [['verify-transport.mjs',[temp]],['verify-native-messaging.mjs',[integrated]],['verify-native-synthesis.mjs',[integrated,'--integrated',raw.walletIdentity,'--validated-board-v2']],['verify-wallet-boundary.mjs',[integrated,'--integrated']],['verify-native-trust.mjs',[integrated,'--oracle-2']]]){
   const invocation=[path.join(frozen,'scripts',script),...args],r=spawnSync(process.execPath,invocation,{cwd:frozen,env,encoding:'utf8',timeout:300000,maxBuffer:32*1024*1024}),stem=path.join(home,`${index}-${script}`)
   fs.writeFileSync(`${stem}.stdout.log`,r.stdout??'',{flag:'wx'});fs.writeFileSync(`${stem}.stderr.log`,r.stderr??'',{flag:'wx'})
   const step={repetition:index,script,args,exitCode:r.status,stdoutBytes:Buffer.byteLength(r.stdout??''),stderrBytes:Buffer.byteLength(r.stderr??'')};report.children.push(step)
   if(r.status===0)step.receipt=requireVerifierReceipt(r.stdout,{verified:true});else step.failure='FROZEN_CHILD_REJECTED_ORIGINAL_EVIDENCE'
  }
 }
report.result=report.children.every(x=>x.exitCode===0)?'TEN_CHILD_REPLAYS_VERIFIED':'PARTIAL_CHILD_REPLAYS_WITH_ORIGINAL_FAILURES';}catch(error){report.failure={name:error.name,message:error.message};process.exitCode=1}finally{fs.writeFileSync(path.join(home,'review.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({result:report.result,children:report.children.length,failure:report.failure}))}
