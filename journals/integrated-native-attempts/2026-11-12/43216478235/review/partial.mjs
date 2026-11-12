import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
const root=fs.realpathSync(process.cwd()),frozen=fs.realpathSync(process.argv[2]),directory=fs.realpathSync(process.argv[3]),count=rows=>Object.fromEntries(['PASS','FAIL','BLOCKED'].map(result=>[result,rows.filter(row=>(row.result??row.outcome)===result).length]))
const read=file=>JSON.parse(fs.readFileSync(file)),original=JSON.parse(execFileSync('unzip',['-p',path.join(root,'journals/integrated-native-attempts/2026-11-09/42711700295/native-integrated.zip'),'repetition-1/evidence/conformance/clauses.json'],{encoding:'utf8',maxBuffer:16*1024*1024})),old99=original.assertions.filter(row=>row.result==='FAIL').map(row=>row.id)
assert.equal(old99.length,99)
const modules={clauses:(await import(pathToFileURL(path.join(frozen,'synthesis/src/wallet-lab/native/verify-conformance-clauses.ts')))).verifyNativeClauseConformance,conditional:(await import(pathToFileURL(path.join(frozen,'synthesis/src/wallet-lab/native/verify-conformance-conditional.ts')))).verifyNativeConditionalConformance,permission:(await import(pathToFileURL(path.join(frozen,'synthesis/src/wallet-lab/native/verify-conformance-permission-coverage.ts')))).verifyNativePermissionCoverage}
modules.transactions=(await import(pathToFileURL(path.join(frozen,'synthesis/src/wallet-lab/native/verify-transaction-states.ts')))).verifyNativeTransactionStates;modules.certificates=(await import(pathToFileURL(path.join(frozen,'synthesis/src/wallet-lab/native/verify-certificate-states.ts')))).verifyNativeCertificateStates
for(const [kind,file,fn] of [['permissionExtension','coverage-permissions-verifier','verifyPermissionExtension'],['transactionCoverage','coverage-transactions-verifier','verifyNativeTransactionCoverage'],['extension','coverage-extension-verifier','verifyNativeCoverageExtension'],['certificateCoverage','coverage-certificates-verify','verifyCertificateCoverage']])modules[kind]=(await import(pathToFileURL(path.join(frozen,`synthesis/src/wallet-lab/native/${file}.ts`))))[fn]
const report={schema:'tpnil-native-partial-module-review@1',claim:'PARTIAL_MODULE_REPLAY_NOT_ENVIRONMENT_QUALIFICATION',newNativeSessions:0,qualifiedEnvironment:false,source:'1f9fe0f9b979e9bbca66e90335f02ba2b80c7d41',repetitions:[]}
for(let index=1;index<=2;index++){
 if(!fs.existsSync(path.join(directory,`repetition-${index}/evidence`))){report.repetitions.push({index,missing:['Entire repetition evidence absent'],modules:{}});continue}
 const base=path.join(directory,`repetition-${index}`),evidence=path.join(base,'evidence'),row={index,modules:{},missing:[]}
 const record=path.join(base,'record.json'),rawSource=fs.existsSync(record)?record:path.join(evidence,'conformance/result.json');if(fs.existsSync(rawSource)){const r=read(rawSource);row.rawVectorSource=path.relative(directory,rawSource);row.rawNativeCounts=count(r.vectors.flatMap(v=>v.assertions));row.rawNativePredicates=r.vectors.reduce((n,v)=>n+v.assertions.length,0)}
 for(const [kind,name] of [['clauses','clauses'],['conditional','conditional'],['permission','permission-coverage'],['transactions','transaction-states'],['certificates','certificate-states'],['permissionExtension','permission-extension'],['transactionCoverage','coverage-transactions'],['extension','coverage-extension'],['certificateCoverage','coverage-certificates']]){
  const file=path.join(evidence,'conformance',`${name}.json`)
  if(!fs.existsSync(file)){row.missing.push(name);continue}
  const r=read(file),result={rawCounts:count(r.assertions),rawPredicates:r.assertions.length,rawFailures:r.assertions.filter(a=>a.result==='FAIL'),replay:'NOT_VERIFIED'}
  if(kind==='clauses'){const verdicts=new Map(r.assertions.map(a=>[a.id,a.result]));result.historical99=Object.fromEntries(['PASS','FAIL','BLOCKED','MISSING'].map(outcome=>[outcome,old99.filter(id=>(verdicts.get(id)??'MISSING')===outcome)]))}
  try{
   if(kind==='clauses')await modules.clauses(r,read(path.join(evidence,'integrated/boundary.json')))
   else if(kind==='permissionExtension')await modules[kind](r,read(path.join(evidence,'conformance/permission-coverage.json')),name=>fs.readFileSync(path.join(evidence,name)),read(path.join(evidence,'integrated/result.json')).walletIdentity)
   else if(kind==='certificateCoverage')await modules[kind](r,name=>fs.readFileSync(path.join(evidence,name)))
   else if(kind!=='permission')await modules[kind](r)
   else await modules.permission(r,name=>{assert.ok(!path.isAbsolute(name)&&!name.split(/[\\/]/).includes('..'));return fs.readFileSync(path.join(evidence,name))},read(path.join(evidence,'integrated/result.json')).walletIdentity,{profile:'ITCVE-1@4.4.0'})
   result.replay='VERIFIED_MODULE_ONLY'
  }catch(error){result.replayError={name:error.name,message:error.message}}
  row.modules[name]=result
 }
 report.repetitions.push(row)
}
console.log(JSON.stringify(report,null,2))
