import path from 'node:path'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { verifyIntegrated } from './integrated-evidence.mjs'
const root=path.resolve(import.meta.dirname,'..'),directory=path.resolve(process.argv[2]??'out/integrated-lab')
const verified=verifyIntegrated(directory)
const result=JSON.parse(fs.readFileSync(path.join(directory,'result.json'),'utf8'))
for(const lane of result.lanes) for(const [index,run] of lane.runs.entries()) {
  const target=path.dirname(path.join(directory,run.result))
  const script=lane.id==='messaging'?'verify-messaging.mjs':lane.id==='overlay-identity'?'verify-overlay-identity.mjs':lane.id==='storage-sync'?'verify-storage-sync.mjs':lane.id==='rust'?'verify-rust.mjs':lane.id.startsWith('boundary-')?'verify-wallet-boundary.mjs':lane.id.startsWith('transport-')?'verify-transport.mjs':null
  if(script) {
    const inputs=lane.id==='rust'?[`transport-typescript-${index+1}/paid-http.json`,`transport-go-${index+1}/paid-http.json`,`overlay-identity-${index+1}/rust-certificate-vectors.json`].map(file=>path.join(directory,file)):[]
    const child=spawnSync(process.execPath,[path.join(root,'scripts',script),target,...inputs],{cwd:root,encoding:'utf8',timeout:300_000,maxBuffer:8*1024*1024})
    if(child.status!==0) throw new Error(`${script}: ${child.stderr}\n${child.stdout}`)
  }
}
console.log(JSON.stringify({...verified,childOraclesVerified:true},null,2))
