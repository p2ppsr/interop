import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const frozen=fs.realpathSync(process.argv[2]),directory=fs.realpathSync(process.argv[3])
const module=async name=>import(pathToFileURL(path.join(frozen,'synthesis/src/wallet-lab/native',name)))
const {verifyNativeConditionalConformance}=await module('verify-conformance-conditional.ts')
const {verifyNativePermissionCoverage}=await module('verify-conformance-permission-coverage.ts')
const {verifyNativeTransactionStates}=await module('verify-transaction-states.ts')
const {verifyNativeCertificateStates,verifyCertificateStateParentBindings}=await module('verify-certificate-states.ts')
const read=file=>JSON.parse(fs.readFileSync(file)),counts=rows=>Object.fromEntries(['PASS','FAIL','BLOCKED','INCONCLUSIVE'].map(outcome=>[outcome,rows.filter(row=>(row.result??row.outcome)===outcome).length]))
const qualification=read(path.join(directory,'qualification.json')),lock=read(path.join(directory,'run-lock.json')),rows=[]
const audit=read(path.join(import.meta.dirname,'original99-audit.json'));assert.equal(audit.historicalRun,42711700295);assert.equal(audit.findings.length,99);assert.equal(new Set(audit.findings.map(row=>row.id)).size,99);assert.ok(audit.findings.every(row=>row.originalResult==='FAIL'))
assert.equal(qualification.claim,'ENGINEERING_OBSERVATION_ONLY');assert.equal(qualification.itcve,'ITCVE-1@4.1.0');assert.equal(qualification.program,'ISI-4@5.1.0');assert.equal(lock.plan.walletCandidate.officialRelease,false)
assert.ok(['ITCVE-1@4.0.0','ITCVE-1@4.1.0'].includes(qualification.itcve));assert.equal(qualification.qualifiedEnvironment,true);assert.equal(lock.plan.expectedObservations,426)
for(let index=1;index<=2;index++){
 const base=path.join(directory,`repetition-${index}`),evidence=path.join(base,'evidence'),record=read(path.join(base,'record.json')),native=record.vectors.flatMap(vector=>vector.assertions.map(row=>({...row,vector:vector.id})))
 assert.equal(native.length,426);assert.equal(new Set(native.map(row=>`${row.vector}/${row.id}`)).size,426)
 const conditional=read(path.join(evidence,'conformance/conditional.json')),permission=read(path.join(evidence,'conformance/permission-coverage.json')),transactions=read(path.join(evidence,'conformance/transaction-states.json')),certificates=read(path.join(evidence,'conformance/certificate-states.json')),identity=read(path.join(evidence,'integrated/result.json')).walletIdentity
 assert.equal(conditional.oracle,'tpnil-native-conditional-oracle@2.0.0');assert.equal(permission.oracle,'tpnil-native-permission-coverage-oracle@3.0.0')
 const readEvidence=name=>{assert.equal(typeof name,'string');assert.ok(!path.isAbsolute(name)&&!name.split(/[\\/]/).includes('..'));return fs.readFileSync(path.join(evidence,name))}
 const c=await verifyNativeConditionalConformance(conditional),p=await verifyNativePermissionCoverage(permission,readEvidence,identity),t=await verifyNativeTransactionStates(transactions),s=await verifyNativeCertificateStates(certificates)
 assert.equal(c.assertions.length,84);assert.equal(p.assertions.length,29);assert.equal(t.assertions.length,19);assert.equal(s.assertions.length,14)
 for(const[prefix,assertions,strip]of [['conditional/',c.assertions,true],['permission-coverage.',p.assertions,false],['transaction-states/',t.assertions,true],['certificate-states.',s.assertions,false]]){
  assert.deepEqual(native.filter(row=>row.id.startsWith(prefix)).map(row=>({id:strip?row.id.slice(prefix.length):row.id,result:row.outcome})),assertions.map(({id,result})=>({id,result})))
 }
 const certificateParent=verifyCertificateStateParentBindings(certificates,{boundary:read(path.join(evidence,'integrated/boundary.json')),identity,globalRoutes:read(path.join(evidence,'routes.json')),globalSubmissions:read(path.join(evidence,'native-submissions.json'))});assert.equal(certificateParent.verified,true)
 const shutdown=read(path.join(base,'shutdown-submissions.json')),worker=read(path.join(base,'worker.json'))
 assert.equal(shutdown.policy,'tpnil-native-shutdown-submissions@2.0.0');assert.equal(worker.cleanWalletAndServiceShutdown,true)
 const independent=qualification.repetitions[index-1].independent
 assert.equal(independent.conditionalTransactionBindings.verifiedEvidence,true);assert.equal(independent.conditionalTransactionBindings.scope,'createAction/signAction top-level transaction responses')
 assert.equal(independent.submissionAncestryBindings.verified,true)
 const original99=audit.findings.map(finding=>{const matches=native.filter(row=>row.id===finding.id);assert.equal(matches.length,1);return {id:finding.id,originalOutcome:'FAIL',candidateOutcome:matches[0].outcome,group:finding.group,oracleNamespaceCorrection:['namespace.protocol.reserved','namespace.basket.reserved'].includes(finding.id)}});assert.equal(original99.length,99)
 rows.push({index,identity,original99,original99Counts:counts(original99.map(row=>({outcome:row.candidateOutcome}))),original99Scope:'Same historical predicate identities on a distinct engineering candidate; two reserved-namespace corrections are oracle changes and all current criteria are frozen prospectively.',totalPredicates:native.length,native:counts(native),conditional:counts(c.assertions),permission:counts(p.assertions),transactionStates:counts(t.assertions),certificateStates:counts(s.assertions),certificateParent,strictShutdown:{policy:shutdown.policy,providers:shutdown.providers.length,initial:shutdown.initialCount,final:shutdown.submissions.length,errors:shutdown.errors},independent,failures:native.filter(row=>row.outcome!=='PASS').map(({vector,id,outcome,detail})=>({vector,id,outcome,detail}))})
}
assert.notEqual(rows[0].identity,rows[1].identity)
console.log(JSON.stringify({verified:true,scope:'Exact-source independent child replay after native admission',newNativeSessions:0,repetitions:rows},null,2))
