import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { prepareFrozenComponentReplay, requireVerifierReceipt } from '../../scripts/frozen-component-replay.mjs'
import { extractZipSafely } from '../../scripts/verify-published-integrations.mjs'
import { inventory } from '../../scripts/native-reevaluation.mjs'
const root=fs.realpathSync(process.cwd()),home=fs.realpathSync(import.meta.dirname),source='39fc1d4c4a4272540b76c022cc2a442298194549',frozen=path.join(home,'source'),output=path.join(home,'original'),sha=b=>createHash('sha256').update(b).digest('hex')
const run=Number(process.argv[2]);assert.ok(Number.isSafeInteger(run)&&run>0)
const acquired=path.join(root,'out/source7-ci/acquisition',String(run)),acquisition=JSON.parse(fs.readFileSync(path.join(acquired,'acquisition.json')))
assert.equal(acquisition.source,source);assert.equal(acquisition.conclusion,'success')
const entries=acquisition.files.filter(row=>row.artifactName==='native-integrated-reevaluation');assert.equal(entries.length,1)
const entry=entries[0],archive=fs.readFileSync(path.join(acquired,entry.path));assert.equal(sha(archive),entry.sha256);assert.equal(archive.length,entry.bytes);assert.equal(entry.members.length,220)
assert.ok(!fs.existsSync(output));fs.mkdirSync(output);extractZipSafely(archive,output)
const snapshot=prepareFrozenComponentReplay(root,source,frozen),target=path.join(frozen,'components/rust/target');assert.ok(fs.lstatSync(target).isSymbolicLink());fs.unlinkSync(target);fs.mkdirSync(target)
const temp=path.join(home,'fresh-tmp');fs.mkdirSync(temp)
const before=inventory(output),isolation=JSON.parse(fs.readFileSync('out/source7-replay/cache-isolation.json')),env={...process.env,...isolation.environment,TMPDIR:temp,TMP:temp,TEMP:temp,TPNIL_REPLAY_GIT_ROOT:root,TPNIL_MESSAGING_PATHS:path.join(root,'out/messaging-native-verifier/paths.json')}
const args=['-f',path.join(root,'out/source7-replay/replay-dependency-guard-v3.sb'),process.execPath,path.join(snapshot.root,'scripts/verify-native-reevaluation.mjs'),output]
const startedAt=new Date().toISOString(),r=spawnSync('/usr/bin/sandbox-exec',args,{cwd:snapshot.root,env,encoding:'utf8',timeout:600000,maxBuffer:32*1024*1024})
fs.writeFileSync(path.join(home,'stdout.log'),r.stdout??'',{flag:'wx'});fs.writeFileSync(path.join(home,'stderr.log'),r.stderr??'',{flag:'wx'})
const report={schema:'tpnil-native-reevaluation-frozen-replay@1',source,run,snapshot,startedAt,endedAt:new Date().toISOString(),exitCode:r.status,signal:r.signal,error:r.error?.message,originalMembers:before.length,originalBytesUnchanged:JSON.stringify(before)===JSON.stringify(inventory(output)),freshRustTarget:target,originalArchiveSha256:sha(archive),nativeSessions:0}
if(r.status===0)report.receipt=requireVerifierReceipt(r.stdout,{verified:true,evaluatorSource:source,newNativeSessions:0,nativeOutcome:'FAIL',integrationOutcome:'PASS',rustOutcome:'PASS',repetitions:2})
fs.writeFileSync(path.join(home,'replay.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});assert.equal(r.status,0,String(r.stderr));assert.equal(report.originalBytesUnchanged,true);console.log(JSON.stringify(report))
