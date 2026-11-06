import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { digest, inventory, projection, verifyIntegrated } from './integrated-evidence.mjs'
const root=path.resolve(import.meta.dirname,'..'), output=path.resolve(process.argv[2]??'out/integrated-lab')
if(fs.existsSync(output)) throw new Error('Choose a new integration evidence directory')
const profilePath='itcves/ITCVE-1/1.3.0/profile.json'
const profile=JSON.parse(fs.readFileSync(path.join(root,profilePath),'utf8'))
const source=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()
const dirty=Boolean(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim())
if(dirty) throw new Error('Commit all integration source before qualification')
const inputs=[profilePath,...profile.componentProfiles,...profile.dependencies]
const files=Object.fromEntries(inputs.map(file=>[file,digest(fs.readFileSync(path.join(root,file)))]))
fs.mkdirSync(output,{recursive:true})
const write=(name,value)=>fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2)+'\n')
write('run-lock.json',{schema:'tpnil-integrated-run-lock@1',source,dirty,profile,files,startedAt:new Date().toISOString(),runtime:{platform:process.platform,architecture:process.arch,node:process.version}})
const lanes=[]
const execute=async(id,args,result)=> {
  console.log(`[integrated-lab] ${id}: starting`)
  const logfile=path.join(output,`${id}.log`), fd=fs.openSync(logfile,'wx')
  const startedAt=new Date().toISOString()
  const child=spawn(process.execPath,args,{cwd:root,stdio:['ignore',fd,fd],detached:true})
  fs.closeSync(fd)
  let timedOut=false, killTimer
  const timer=setTimeout(()=>{timedOut=true;try{process.kill(-child.pid,'SIGTERM')}catch{};killTimer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL')}catch{}},10_000)},600_000)
  const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code)=>resolve(code??1))}).finally(()=>{clearTimeout(timer);clearTimeout(killTimer);if(timedOut){try{process.kill(-child.pid,'SIGKILL')}catch{}}})
  const pathname=path.join(output,result)
  const assertions=fs.existsSync(pathname)?projection(JSON.parse(fs.readFileSync(pathname,'utf8'))):[]
  const receipt={result,exitCode,timedOut,startedAt,completedAt:new Date().toISOString(),assertions}
  console.log(`[integrated-lab] ${id}: exit ${exitCode}; ${assertions.length} observations`)
  if(exitCode!==0||!fs.existsSync(pathname)) throw new Error(`${id} did not complete; inspect ${logfile}`)
  return receipt
}
let executionError
try {
  lanes.push({id:'storage-sync',runs:[await execute('storage-sync',['scripts/run-storage-sync.mjs',path.join(output,'storage-sync')],'storage-sync/result.json')]})
  for(const id of ['overlay-identity','messaging','transport-typescript','transport-go','boundary-typescript','boundary-go']) {
    const runs=[]
    for(let repetition=1;repetition<=2;repetition++) {
      const name=`${id}-${repetition}`, directory=path.join(output,name)
      const args=id==='messaging'?['scripts/run-messaging.mjs','--out',directory]:id.startsWith('boundary-')?['scripts/run-wallet-boundary.mjs',directory,id.slice('boundary-'.length)]:id.startsWith('transport-')?['scripts/run-transport.mjs',directory,id.slice('transport-'.length)]:['scripts/run-overlay-identity.mjs',directory]
      runs.push(await execute(name,args,`${name}/result.json`))
    }
    lanes.push({id,runs})
  }
  const rust=[]
  for(let repetition=1;repetition<=2;repetition++) {
    const name=`rust-${repetition}`
    rust.push(await execute(name,['scripts/run-rust.mjs',path.join(output,name),path.join(output,`transport-typescript-${repetition}/paid-http.json`),path.join(output,`transport-go-${repetition}/paid-http.json`),path.join(output,`overlay-identity-${repetition}/rust-certificate-vectors.json`)],`${name}/result.json`))
  }
  lanes.push({id:'rust',runs:rust})
  for(const file of inputs) if(digest(fs.readFileSync(path.join(root,file)))!==files[file]) throw new Error(`Frozen input changed: ${file}`)
} catch(error) { executionError=error.stack??String(error) }
write('result.json',{schema:'tpnil-integrated-result@1',profile:'ITCVE-1@1.3.0',claim:'INFRASTRUCTURE_QUALIFICATION_ONLY',lanes,executionError,completedAt:new Date().toISOString()})
write('manifest.json',{schema:'tpnil-integrated-manifest@1',files:inventory(output)})
if(executionError) throw new Error(executionError)
const verified=verifyIntegrated(output);write('verification.json',verified);console.log(JSON.stringify(verified))
