// LAB_SELF_TEST_ONLY. Independent child diagnostics over failed native17 inputs.
// Rust is executed locally after that run; it is never an original CI result.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url'
const root=process.cwd(),source='71d8b58cbbf802377b34cfbcceb056413b2327d1',frozen=path.resolve('out/source15-replay/source'),home=path.resolve('out/source16-preflight/native17-children'),original=path.resolve('out/source15-native-intake/original'),sha=b=>createHash('sha256').update(b).digest('hex');assert.ok(!fs.existsSync(home));fs.mkdirSync(home)
const {requireVerifierReceipt}=await import(pathToFileURL(path.join(frozen,'scripts/frozen-component-replay.mjs')))
const target=path.join(frozen,'components/rust/target');assert.deepEqual(fs.readdirSync(target),[])
const temp=path.join(home,'fresh-tmp');fs.mkdirSync(temp)
const env={...process.env,RUSTUP_TOOLCHAIN:'1.88.0',CARGO_NET_OFFLINE:'true',TPNIL_REPLAY_GIT_ROOT:root,TPNIL_MESSAGING_PATHS:path.join(root,'out/messaging-native-verifier/paths.json'),TMPDIR:temp,TMP:temp,TEMP:temp}
const results={claim:'LAB_SELF_TEST_ONLY',source,originalRun:43384270997,nativeQualification:false,originalRustResults:false,rustExecutedLocallyAfterFailedRun:true,freshRustTargetBefore:true,children:[]}
function run(script,args,label){const invocation=[path.join(frozen,'scripts',script),...args],r=spawnSync(process.execPath,invocation,{cwd:frozen,env,encoding:'utf8',timeout:600000,maxBuffer:64*1024*1024});fs.writeFileSync(path.join(home,label+'.stdout'),r.stdout??'');fs.writeFileSync(path.join(home,label+'.stderr'),r.stderr??'');assert.equal(r.status,0,`${label}: ${r.stderr}`);return r.stdout}
for(const repetition of[1,2]){
 const directory=path.join(original,`repetition-${repetition}/evidence/integrated`),report=JSON.parse(fs.readFileSync(path.join(directory,'result.json'))),transport=path.join(home,`transport-${repetition}`);fs.mkdirSync(transport)
 for(const n of ['relay.json','paid-http.json'])fs.copyFileSync(path.join(directory,n),path.join(transport,n))
 const relay=JSON.parse(fs.readFileSync(path.join(directory,'relay.json'))),paid=JSON.parse(fs.readFileSync(path.join(directory,'paid-http.json')))
 fs.writeFileSync(path.join(transport,'result.json'),JSON.stringify({schema:'tpnil-component-result@1',assertions:[...relay.assertions,...paid.assertions],evidence:['relay.json','paid-http.json'].map(n=>({path:n,sha256:sha(fs.readFileSync(path.join(transport,n)))})),cleanup:{nativeEnvelopeVerified:true}}))
 const rust=path.join(home,`local-only-rust-${repetition}`),inputs=['paid-http.json','messaging.json','synthesis-transactions.json','identity-trust.json'].map(n=>path.join(directory,n))
 run('run-rust.mjs',[rust,...inputs,'--corpus-v3'],`${repetition}-run-rust`)
 const rr=JSON.parse(fs.readFileSync(path.join(rust,'result.json')));assert.equal(rr.assertions.length,48);assert.ok(rr.assertions.every(a=>a.result==='PASS'))
 for(const[script,args]of[['verify-transport.mjs',[transport]],['verify-native-messaging.mjs',[directory]],['verify-native-synthesis.mjs',[directory,'--integrated',report.walletIdentity,'--validated-board-v2']],['verify-wallet-boundary.mjs',[directory,'--integrated']],['verify-native-trust.mjs',[directory,'--oracle-2']],['verify-rust.mjs',[rust,...inputs,'--corpus-v3']]]){
  const out=run(script,args,`${repetition}-${script}`),receipt=requireVerifierReceipt(out,{verified:true});results.children.push({repetition,script,receipt});fs.writeFileSync(path.join(home,'diagnostics.json'),JSON.stringify(results,null,2)+'\n')
 }
 console.log(JSON.stringify({repetition,childVerifiers:6,localRustAssertions:48,nativeQualification:false,originalRustResults:false}))
}
assert.equal(results.children.length,12);fs.writeFileSync(path.join(home,'diagnostics.json'),JSON.stringify(results,null,2)+'\n')
