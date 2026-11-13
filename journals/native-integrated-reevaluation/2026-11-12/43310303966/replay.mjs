import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { prepareFrozenComponentReplay, requireVerifierReceipt } from '../../scripts/frozen-component-replay.mjs'
import { extractZipSafely } from '../../scripts/verify-published-integrations.mjs'
import { inventory } from '../../scripts/native-reevaluation.mjs'
const root=fs.realpathSync(process.cwd()),home=fs.realpathSync(import.meta.dirname),source='113e235cd382ca0fe492bde833a961ce804df36f',frozen=path.join(home,'source'),output=path.join(home,'original'),sha=b=>createHash('sha256').update(b).digest('hex')
const archive=fs.readFileSync('out/source6-ci/acquisition/43310303966/artifact-13984903719.zip')
assert.equal(sha(archive),'cb1ef9a258307017acf08e141837d66053c19b80f692298ab50307252fb46108')
assert.ok(!fs.existsSync(output));fs.mkdirSync(output);extractZipSafely(archive,output)
const snapshot=prepareFrozenComponentReplay(root,source,frozen),target=path.join(frozen,'components/rust/target');assert.ok(fs.lstatSync(target).isSymbolicLink());fs.unlinkSync(target);fs.mkdirSync(target)
const temp=path.join(home,'fresh-tmp');fs.mkdirSync(temp)
const before=inventory(output),isolation=JSON.parse(fs.readFileSync('out/source6-replay/cache-isolation.json')),env={...process.env,...isolation.environment,TMPDIR:temp,TMP:temp,TEMP:temp,TPNIL_REPLAY_GIT_ROOT:root,TPNIL_MESSAGING_PATHS:path.join(root,'out/messaging-native-verifier/paths.json')}
const args=['-f',path.join(root,'out/source6-replay/replay-dependency-guard-v3.sb'),process.execPath,path.join(snapshot.root,'scripts/verify-native-reevaluation.mjs'),output]
const startedAt=new Date().toISOString(),r=spawnSync('/usr/bin/sandbox-exec',args,{cwd:snapshot.root,env,encoding:'utf8',timeout:600000,maxBuffer:32*1024*1024})
fs.writeFileSync(path.join(home,'stdout.log'),r.stdout??'',{flag:'wx'});fs.writeFileSync(path.join(home,'stderr.log'),r.stderr??'',{flag:'wx'})
const report={schema:'tpnil-native-reevaluation-frozen-replay@1',source,run:43310303966,snapshot,startedAt,endedAt:new Date().toISOString(),exitCode:r.status,signal:r.signal,error:r.error?.message,originalMembers:before.length,originalBytesUnchanged:JSON.stringify(before)===JSON.stringify(inventory(output)),freshRustTarget:target,originalArchiveSha256:sha(archive),nativeSessions:0}
if(r.status===0)report.receipt=requireVerifierReceipt(r.stdout,{verified:true,evaluatorSource:source,newNativeSessions:0,nativeOutcome:'FAIL',integrationOutcome:'PASS',rustOutcome:'PASS',repetitions:2})
fs.writeFileSync(path.join(home,'replay.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});assert.equal(r.status,0,String(r.stderr));assert.equal(report.originalBytesUnchanged,true);console.log(JSON.stringify(report))
