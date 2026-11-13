import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
const root=fs.realpathSync(process.cwd()),home=fs.realpathSync(import.meta.dirname),source='ec3a554d433845e9aa8209d9eb20dde48cba6a2a',frozen=fs.realpathSync(path.join(home,'source')),original=fs.realpathSync(process.argv[2]),work=path.join(home,'replay')
assert.equal(process.env.TPNIL_DEPENDENCY_BYTE_GUARD,'mandatory-sandbox-v1','Use guarded-replay.mjs to enforce dependency byte closure');assert.equal(process.versions.node,'24.22.1');assert.ok(original.startsWith(path.join(root,'out')+path.sep));assert.ok(/^\d+$/.test(process.argv[3]??''));assert.ok(!fs.existsSync(work));fs.cpSync(original,work,{recursive:true});const directory=fs.realpathSync(work)
const {requireVerifierReceipt}=await import(pathToFileURL(path.join(frozen,'scripts/frozen-component-replay.mjs'))),sha=b=>createHash('sha256').update(b).digest('hex')
const inventory=JSON.parse(fs.readFileSync(path.join(home,'source-inventory.json')))
const verifySource=()=>{assert.equal(inventory.source,source);assert.equal(inventory.canonicalRoot,frozen);for(const row of inventory.files){const file=path.join(frozen,row.path);assert.ok(!fs.lstatSync(file).isSymbolicLink());assert.equal(sha(fs.readFileSync(file)),row.sha256)}}
verifySource()
const env={...process.env,RUSTUP_TOOLCHAIN:'1.88.0',CARGO_NET_OFFLINE:'true',TPNIL_REPLAY_GIT_ROOT:root,TPNIL_MESSAGING_PATHS:path.join(root,'out/messaging-native-verifier/paths.json')}
function members(base){return fs.readdirSync(base,{recursive:true}).flatMap(name=>{const file=path.join(base,name),stat=fs.lstatSync(file);assert.ok(!stat.isSymbolicLink());return stat.isFile()?[{path:name,bytes:stat.size,sha256:sha(fs.readFileSync(file))}]:[]}).sort((a,b)=>a.path.localeCompare(b.path))};const before=members(original);fs.writeFileSync(path.join(home,'original-members-before.json'),JSON.stringify(before,null,2)+'\n',{flag:'wx'})
const report={schema:'tpnil-native-frozen-full-replay@1',claim:'INDEPENDENT_FROZEN_SOURCE_REPLAY',source,run:Number(process.argv[3]),node:process.version,startedAt:new Date().toISOString(),originalRoot:original,replayRoot:directory,originalFiles:before.length,parent:{},children:[],result:'NOT_VERIFIED'}
try{
 for(const required of ['qualification.json','integrated-qualification.json','rust-repetition-1/result.json','rust-repetition-2/result.json','repetition-1/record.json','repetition-2/record.json','repetition-1/shutdown-submissions.json','repetition-2/shutdown-submissions.json'])assert.ok(fs.existsSync(path.join(original,required)),`Original artifact lacks ${required}; preserve incomplete attempt and use partial diagnostic, do not fabricate original Rust execution`)
 const originalQualification=JSON.parse(fs.readFileSync(path.join(original,'qualification.json'))),originalIntegrated=JSON.parse(fs.readFileSync(path.join(original,'integrated-qualification.json')));assert.equal(originalQualification.source,source);assert.equal(originalQualification.itcve,'ITCVE-1@4.8.0');assert.equal(originalQualification.qualifiedEnvironment,true);assert.equal(originalQualification.repetitions.length,2);assert.equal(originalQualification.vectors.reduce((n,v)=>n+v.assertions.length,0),698);for(const rep of originalIntegrated.repetitions)assert.equal(rep.assertions.length,77);for(let i=1;i<=2;i++)assert.equal(JSON.parse(fs.readFileSync(path.join(original,`rust-repetition-${i}/result.json`))).assertions.length,48);
 const args=[path.join(frozen,'scripts/verify-native-integrated.mjs'),directory],r=spawnSync(process.execPath,args,{cwd:frozen,env,encoding:'utf8',timeout:1800000,maxBuffer:64*1024*1024})
 fs.writeFileSync(path.join(home,'parent.stdout.log'),r.stdout??'',{flag:'wx'});fs.writeFileSync(path.join(home,'parent.stderr.log'),r.stderr??'',{flag:'wx'})
 report.parent={args,exitCode:r.status,signal:r.signal,error:r.error?.message,stdoutBytes:Buffer.byteLength(r.stdout??''),stderrBytes:Buffer.byteLength(r.stderr??'')}
 assert.equal(r.status,0,'Frozen complete parent replay failed')
 report.parent.receipt=requireVerifierReceipt(r.stdout,{schema:'tpnil-native-integrated-qualification@2',source,qualifiedEnvironment:true,repetitionMatch:true,profile:'ITCVE-1@4.8.0',claim:'ENGINEERING_OBSERVATION_ONLY'})
 assert.deepEqual(report.parent.receipt,originalIntegrated);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory,'qualification.json'))),originalQualification);
 for(let index=1;index<=2;index++){
  const integrated=fs.realpathSync(path.join(directory,`repetition-${index}/evidence/integrated`)),raw=JSON.parse(fs.readFileSync(path.join(integrated,'result.json'))),temp=path.join(home,`transport-${index}`);fs.mkdirSync(temp)
  const relay=JSON.parse(fs.readFileSync(path.join(integrated,'relay.json'))),paid=JSON.parse(fs.readFileSync(path.join(integrated,'paid-http.json')))
  for(const name of ['relay.json','paid-http.json'])fs.copyFileSync(path.join(integrated,name),path.join(temp,name))
  fs.writeFileSync(path.join(temp,'result.json'),JSON.stringify({schema:'tpnil-component-result@1',assertions:[...relay.assertions,...paid.assertions],evidence:['relay.json','paid-http.json'].map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(temp,name)))})),cleanup:{nativeEnvelopeVerified:true}}))
  const rustInputs=['paid-http.json','messaging.json','synthesis-transactions.json','identity-trust.json'].map(name=>path.join(integrated,name))
  for(const [script,args] of [['verify-transport.mjs',[temp]],['verify-native-messaging.mjs',[integrated]],['verify-native-synthesis.mjs',[integrated,'--integrated',raw.walletIdentity,'--validated-board-v2']],['verify-wallet-boundary.mjs',[integrated,'--integrated']],['verify-native-trust.mjs',[integrated,'--oracle-2']],['verify-rust.mjs',[path.join(directory,`rust-repetition-${index}`),...rustInputs,'--corpus-v3']]]){
   const invocation=[path.join(frozen,'scripts',script),...args],r=spawnSync(process.execPath,invocation,{cwd:frozen,env,encoding:'utf8',timeout:300000,maxBuffer:32*1024*1024}),stem=path.join(home,`${index}-${script}`)
   fs.writeFileSync(`${stem}.stdout.log`,r.stdout??'',{flag:'wx'});fs.writeFileSync(`${stem}.stderr.log`,r.stderr??'',{flag:'wx'})
   const step={repetition:index,script,args,invocation,exitCode:r.status,signal:r.signal,error:r.error?.message,stdoutBytes:Buffer.byteLength(r.stdout??''),stderrBytes:Buffer.byteLength(r.stderr??'')};report.children.push(step)
   assert.equal(r.status,0,`${script} failed`);step.receipt=requireVerifierReceipt(r.stdout,{verified:true})
  }
 }
 report.result='VERIFIED_EXACT_SOURCE_AND_ALL_CHILDREN'
}catch(error){report.failure={name:error.name,message:error.message};process.exitCode=1}
finally{
 assert.deepEqual(members(original),before,'Original native member inventory or bytes changed');fs.writeFileSync(path.join(home,'original-members-after.json'),JSON.stringify(members(original),null,2)+'\n',{flag:'wx'})
 verifySource();report.originalBytesUnchanged=true;report.frozenSourceUnchanged=true;report.completedAt=new Date().toISOString()
 fs.writeFileSync(path.join(home,'replay.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({result:report.result,children:report.children.length,failure:report.failure,parentExitCode:report.parent.exitCode}))
}
