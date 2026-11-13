import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {createHash} from 'node:crypto'
import { pathToFileURL } from 'node:url'
const root=fs.realpathSync(process.cwd()),frozen=fs.realpathSync(process.argv[2]),directory=fs.realpathSync(process.argv[3]),count=rows=>Object.fromEntries(['PASS','FAIL','BLOCKED'].map(result=>[result,rows.filter(row=>(row.result??row.outcome)===result).length]))
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),inventoryBytes=fs.readFileSync(path.join(import.meta.dirname,'source-inventory.json'));assert.equal(sha(inventoryBytes),'1d8e2dbdd277686173b97e8b7e40141ff8ed8ee00769939402d436f41868cefb');const inventory=JSON.parse(inventoryBytes);assert.equal(inventory.canonicalRoot,frozen);for(const row of inventory.files)assert.equal(sha(fs.readFileSync(path.join(frozen,row.path))),row.sha256)
assert.equal(sha(fs.readFileSync(path.join(root,'journals/integrated-native-attempts/2026-11-09/42711700295/native-integrated.zip'))),'c0645821afeea30cbc1c0c70f4ca10bfbe288ebfa570b719af5a709f145c3826')
const read=file=>JSON.parse(fs.readFileSync(file)),original=JSON.parse(execFileSync('unzip',['-p',path.join(root,'journals/integrated-native-attempts/2026-11-09/42711700295/native-integrated.zip'),'repetition-1/evidence/conformance/clauses.json'],{encoding:'utf8',maxBuffer:16*1024*1024})),old99=original.assertions.filter(row=>row.result==='FAIL').map(row=>row.id)
assert.equal(old99.length,99)
const modules={clauses:(await import(pathToFileURL(path.join(frozen,'synthesis/src/wallet-lab/native/verify-conformance-clauses.ts')))).verifyNativeClauseConformance,conditional:(await import(pathToFileURL(path.join(frozen,'synthesis/src/wallet-lab/native/verify-conformance-conditional.ts')))).verifyNativeConditionalConformance,permission:(await import(pathToFileURL(path.join(frozen,'synthesis/src/wallet-lab/native/verify-conformance-permission-coverage.ts')))).verifyNativePermissionCoverage}
modules.transactions=(await import(pathToFileURL(path.join(frozen,'synthesis/src/wallet-lab/native/verify-transaction-states.ts')))).verifyNativeTransactionStates;modules.certificates=(await import(pathToFileURL(path.join(frozen,'synthesis/src/wallet-lab/native/verify-certificate-states.ts')))).verifyNativeCertificateStates
const report={schema:'tpnil-native-partial-module-review@1',claim:'PARTIAL_MODULE_REPLAY_NOT_ENVIRONMENT_QUALIFICATION',newNativeSessions:0,qualifiedEnvironment:false,candidateOnly:true,officialRelease:false,candidateVersion:'5.1.1-pr368.7e39006',source:'585211c193d0288effeb466bda38fe6ef23ac94d',repetitions:[]}
for(let index=1;index<=2;index++){
 const base=path.join(directory,`repetition-${index}`),evidence=path.join(base,'evidence'),row={index,modules:{},missing:[]}
 const record=path.join(base,'record.json');if(fs.existsSync(record)){const r=read(record);row.rawNativeCounts=count(r.vectors.flatMap(v=>v.assertions));row.rawNativePredicates=r.vectors.reduce((n,v)=>n+v.assertions.length,0)}
 for(const [kind,name] of [['clauses','clauses'],['conditional','conditional'],['permission','permission-coverage'],['transactions','transaction-states'],['certificates','certificate-states']]){
  const file=path.join(evidence,'conformance',`${name}.json`)
  if(!fs.existsSync(file)){row.missing.push(name);continue}
  const r=read(file),result={rawCounts:count(r.assertions),rawPredicates:r.assertions.length,rawFailures:r.assertions.filter(a=>a.result==='FAIL'),replay:'NOT_VERIFIED'}
  if(kind==='clauses'){const verdicts=new Map(r.assertions.map(a=>[a.id,a.result]));result.historical99=Object.fromEntries(['PASS','FAIL','BLOCKED','MISSING'].map(outcome=>[outcome,old99.filter(id=>(verdicts.get(id)??'MISSING')===outcome)]))}
  try{
   if(kind==='clauses')await modules.clauses(r,read(path.join(evidence,'integrated/boundary.json')))
   else if(kind!=='permission')await modules[kind](r)
   else await modules.permission(r,name=>{assert.ok(!path.isAbsolute(name)&&!name.split(/[\\/]/).includes('..'));return fs.readFileSync(path.join(evidence,name))},read(path.join(evidence,'integrated/result.json')).walletIdentity)
   result.replay='VERIFIED_MODULE_ONLY'
  }catch(error){result.replayError={name:error.name,message:error.message}}
  row.modules[name]=result
 }
 report.repetitions.push(row)
}
console.log(JSON.stringify(report,null,2))
