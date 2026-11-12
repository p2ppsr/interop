import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
const root=fs.realpathSync(process.cwd()),home=path.join(root,'out/native-review-43143722884'),frozen=fs.realpathSync(path.join(home,'source')),original=path.join(home,'attempt-2026-11-12T03-26-40-037Z/original'),target=path.join(home,'host-reproduction')
fs.mkdirSync(target);fs.cpSync(original,path.join(target,'copy'),{recursive:true,errorOnExist:true,force:false});const copy=fs.realpathSync(path.join(target,'copy'))
const args=['--import',path.join(frozen,'synthesis/node_modules/tsx/dist/loader.mjs'),path.join(frozen,'synthesis/src/wallet-lab/native/verify.ts'),copy],r=spawnSync(process.execPath,args,{cwd:frozen,encoding:'utf8',timeout:180000,maxBuffer:32*1024*1024})
for(const kind of ['stdout','stderr'])fs.writeFileSync(path.join(target,`${kind}.log`),r[kind]??'',{flag:'wx'})
assert.equal(r.status,1);assert.ok(r.stderr.length>0);assert.match(r.stderr,/Expected values to be strictly deep-equal/);assert.match(r.stderr,/verifyNativeConditionalConformance/);assert.equal(fs.existsSync(path.join(copy,'qualification.json')),false)
const sha=value=>createHash('sha256').update(value).digest('hex')
const receipt={schema:'tpnil-original-native-host-failure-reproduction@1',source:'6b174e0b903225923999a44fb1de7d67cc4e2959',claim:'EXPECTED_ORIGINAL_OBSERVER_FAILURE_REPRODUCED',qualifiedEnvironment:false,newNativeSessions:0,args,exitCode:r.status,stdoutBytes:Buffer.byteLength(r.stdout),stderrBytes:Buffer.byteLength(r.stderr),stdoutSha256:sha(r.stdout),stderrSha256:sha(r.stderr),qualificationWritten:false}
fs.writeFileSync(path.join(target,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(receipt,null,2))
