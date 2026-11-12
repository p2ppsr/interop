import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const frozen=fs.realpathSync(process.argv[2]),directory=fs.realpathSync(process.argv[3])
const {verifyNativeConditionalConformance}=await import(pathToFileURL(path.join(frozen,'synthesis/src/wallet-lab/native/verify-conformance-conditional.ts')))
const {verifyNativePermissionCoverage}=await import(pathToFileURL(path.join(frozen,'synthesis/src/wallet-lab/native/verify-conformance-permission-coverage.ts')))
const read=file=>JSON.parse(fs.readFileSync(file)),counts=rows=>Object.fromEntries(['PASS','FAIL','BLOCKED','INCONCLUSIVE'].map(outcome=>[outcome,rows.filter(row=>(row.result??row.outcome)===outcome).length]))
const profile=read(path.join(frozen,'itcves/ITCVE-1/4.0.0/profile.json')),qualification=read(path.join(directory,'qualification.json')),rows=[]
assert.equal(qualification.itcve,'ITCVE-1@4.0.0');assert.equal(qualification.program,'ISI-4@5.0.0');assert.equal(qualification.qualifiedEnvironment,true)
for(let index=1;index<=2;index++){
 const base=path.join(directory,`repetition-${index}`),evidence=path.join(base,'evidence'),record=read(path.join(base,'record.json')),native=record.vectors.flatMap(vector=>vector.assertions.map(row=>({...row,vector:vector.id})))
 assert.equal(native.length,392);assert.equal(new Set(native.map(row=>`${row.vector}/${row.id}`)).size,392)
 for(const [id,expected]of Object.entries(profile.nativeConformance.assertions)){
  const actual=record.vectors.find(row=>row.id===id).assertions.map(row=>row.id)
  assert.deepEqual(actual,expected)
 }
 const conditional=read(path.join(evidence,'conformance/conditional.json')),permission=read(path.join(evidence,'conformance/permission-coverage.json')),identity=read(path.join(evidence,'integrated/result.json')).walletIdentity
 const readEvidence=name=>{assert.equal(typeof name,'string');assert.ok(!path.isAbsolute(name)&&!name.split(/[\\/]/).includes('..'));return fs.readFileSync(path.join(evidence,name))}
 const c=await verifyNativeConditionalConformance(conditional),p=await verifyNativePermissionCoverage(permission,readEvidence,identity)
 assert.equal(c.assertionCount,84);assert.equal(c.assertions.length,84);assert.equal(p.assertions.length,28)
 assert.deepEqual(native.filter(row=>row.id.startsWith('conditional/')).map(row=>({id:row.id.slice(12),result:row.outcome})),c.assertions.map(({id,result})=>({id,result})))
 assert.deepEqual(native.filter(row=>row.id.startsWith('permission-coverage.')).map(row=>({id:row.id,result:row.outcome})),p.assertions.map(({id,result})=>({id,result})))
 const shutdown=read(path.join(base,'shutdown-submissions.json')),worker=read(path.join(base,'worker.json'))
 assert.equal(shutdown.policy,'tpnil-native-shutdown-submissions@2.0.0');assert.equal(worker.cleanWalletAndServiceShutdown,true)
 const proof=qualification.repetitions[index-1].independent.conditionalTransactionBindings
 assert.equal(proof.verifiedEvidence,true);assert.equal(proof.scope,'createAction/signAction top-level transaction responses')
 if(proof.invalidNativeResponses.length)assert.equal(proof.allReturnedTransactionsProven,false)
 rows.push({index,identity,totalPredicates:native.length,native:counts(native),conditional:counts(c.assertions),permission:counts(p.assertions),strictShutdown:{policy:shutdown.policy,providers:shutdown.providers.length,initial:shutdown.initialCount,final:shutdown.submissions.length,errors:shutdown.errors},conditionalTransactionBindings:proof})
}
assert.notEqual(rows[0].identity,rows[1].identity)
console.log(JSON.stringify({verified:true,scope:'Exact-source independent child replay after native admission',newNativeSessions:0,repetitions:rows},null,2))
