import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
const root=fs.realpathSync(process.cwd()),frozen=fs.realpathSync(process.argv[2]),directory=fs.realpathSync(process.argv[3])
const mod=async name=>import(pathToFileURL(path.join(frozen,'synthesis/src/wallet-lab/native',name)))
const {Transaction,Beef,PrivateKey,ProtoWallet,P2PKH,PublicKey}=await import(pathToFileURL(path.join(frozen,'synthesis/node_modules/@bsv/sdk/dist/esm/mod.js')))
const {canonicalJson}=await import(pathToFileURL(path.join(frozen,'synthesis/src/determinism.ts')))
const {deriveConditionalOutcomes,verifyNativeConditionalConformance}=await mod('verify-conformance-conditional.ts')
const {verifyConditionalTransactionBindings}=await mod('verify-conditional-transaction-bindings.ts')
const {verifyConformanceReserves,verifyBoundaryFundingRoot,spendsOnlyDeclaredNativePayments}=await mod('verify-conformance-reserves.ts')
const {verifyCoverageNativeTransactions}=await mod('verify-conformance-coverage-transactions.ts')
const {verifyNativeShutdownSubmissions}=await mod('verify-shutdown-submissions.ts')
const {verifyNativeTransactionStateBindings}=await mod('verify-transaction-state-bindings.ts')
const {verifyFinalPermissionSubmissionAncestry}=await mod('verify-submission-ancestry.ts')
const {verifyCertificateStateParentBindings}=await mod('verify-certificate-states.ts')
const {verifyEvidenceBundle}=await import(pathToFileURL(path.join(frozen,'synthesis/src/wallet-lab/evidence.ts')))
const read=file=>JSON.parse(fs.readFileSync(file)),sha=value=>createHash('sha256').update(value).digest('hex'),lock=read(path.join(directory,'run-lock.json'))
const report={schema:'tpnil-native-failed-attempt-scoped-gate-review@1',claim:'DIAGNOSTIC_SCOPED_REVIEW_NOT_ENVIRONMENT_QUALIFICATION',source:lock.source,newNativeSessions:0,qualifiedEnvironment:false,derivedErrorDetailsOnly:false,repetitions:[]}
for(let index=1;index<=2;index++){
 const base=path.join(directory,`repetition-${index}`),ed=path.join(base,'evidence'),eb=name=>fs.readFileSync(path.join(ed,name)),e=name=>JSON.parse(eb(name)),row={index,gates:{}}
 async function gate(name,run){try{const result=await run();row.gates[name]={verified:true,result};return result}catch(error){row.gates[name]={verified:false,error:{name:error.name,message:error.message,stack:error.stack}}}}
 const originalBytes=eb('conformance/conditional.json'),original=e('conformance/conditional.json'),conditional=structuredClone(original)
 const derived=await deriveConditionalOutcomes(original)
 assert.deepEqual(derived.map(({id,result})=>({id,result})),original.assertions.map(({id,result})=>({id,result})))
 const differences=derived.filter((v,i)=>v.detail!==original.assertions[i].detail).map(v=>v.id)
 conditional.assertions=derived
 assert.equal(canonicalJson({...conditional,assertions:null}),canonicalJson({...original,assertions:null}))
 row.originalConditionalSha256=sha(originalBytes);row.conditionalSemanticOutcomesMatch=true;row.derivedDetailPredicateIds=differences
 await gate('conditionalStructureWithRederivedDetails',()=>verifyNativeConditionalConformance(conditional))
 const record=await gate('immutableEvidenceBundle',()=>verifyEvidenceBundle(base))
 const worker=read(path.join(base,'worker.json')),fixture=e('mined-funding-source.json').fixture,identity=e('integrated/result.json').walletIdentity
 const tracker={currentHeight:async()=>fixture.fundingHeight+fixture.maturityDepth,isValidRootForHeight:async(root,height)=>root===fixture.merkleRoot&&height===fixture.fundingHeight}
 const funding=Transaction.fromAtomicBEEF([...eb('funding.atomicbeef')]),reserves=e('conformance/funding-reserves.json'),created=Transaction.fromAtomicBEEF(Beef.fromBinary([...eb('create.beef')]).toBinaryAtomic(record.observations.createTxid))
 const transactions=new Map(),storageTransactions=new Map()
 function add(tx,depth=0){assert.ok(depth<32);const id=tx.id('hex');if(transactions.has(id))return;transactions.set(id,tx);for(const input of tx.inputs)if(input.sourceTransaction)add(input.sourceTransaction,depth+1)}
 add(funding);for(const payment of reserves.payments)add(Transaction.fromAtomicBEEF(payment.beef));add(created)
 for(const item of e('native-transactions.json')){const tx=Transaction.fromHex(item.rawTxHex);assert.equal(tx.id('hex'),item.txid);storageTransactions.set(item.txid,tx);if(!transactions.has(item.txid))transactions.set(item.txid,tx);else assert.equal(transactions.get(item.txid).toHex(),tx.toHex())}
 for(const tx of transactions.values())for(const input of tx.inputs)if(!input.sourceTransaction)input.sourceTransaction=transactions.get(input.sourceTXID)
 const initial=await gate('minedInitialFunding',async()=>{
  const header=Buffer.from(fixture.blockHeaderHex,'hex');assert.equal(header.length,80);assert.equal(Buffer.from(sha(Buffer.from(sha(header),'hex')),'hex').reverse().toString('hex'),fixture.fundingBlockHash);assert.equal(Buffer.from(header.subarray(36,68)).reverse().toString('hex'),fixture.merkleRoot);assert.equal(sha(Buffer.from(canonicalJson(fixture))),lock.plan.fundingFixtureCanonicalSha256)
  const ancestor=Transaction.fromAtomicBEEF([...Buffer.from(fixture.atomicBeefHex,'hex')]);assert.equal(ancestor.id('hex'),fixture.txid);assert.equal(ancestor.toHex(),fixture.rawHex);assert.equal(sha(Buffer.from(fixture.atomicBeefHex,'hex')),fixture.atomicBeefSha256);assert.ok(fixture.maturityDepth>=100);assert.ok(await ancestor.verify(tracker));assert.ok(await funding.verify(tracker));assert.ok(await created.verify(tracker))
  const sender=new ProtoWallet(PrivateKey.fromHex('22'.repeat(32))),key=await sender.getPublicKey({protocolID:[2,'3241645161d8'],keyID:`${Buffer.from('tpnil-wallet-lab').toString('base64')} ${Buffer.from('funding-001').toString('base64')}`,counterparty:identity,forSelf:false});assert.equal(key.publicKey,e('mined-funding-source.json').publicKey);assert.equal(funding.outputs[0].lockingScript.toHex(),new P2PKH().lock(PublicKey.fromString(key.publicKey).toAddress()).toHex());assert.equal(funding.outputs[0].satoshis,10000)
  return {fixture:fixture.txid,initialFunding:funding.id('hex')}
 })
 const reserveResult=await gate('initialReserves',()=>verifyConformanceReserves(reserves,{policy:lock.plan.fundingReserves,identity,initialFundingTxid:funding.id('hex'),scenarioStartedAt:e('conformance/scenario-start.json').startedAt,workerStartedAt:worker.startedAt,submissions:e('native-submissions.json'),firstCustomerTxid:created.id('hex'),transactions,storageTransactions,fixture}))
 const clauses=e('conformance/clauses.json'),metadata=clauses.trace.find(row=>row.id==='setup.metadata'),corpusPayment=await gate('methodCorpusFundingRoot',()=>verifyBoundaryFundingRoot(e('integrated/boundary.json'),{identity,fixture,storageTransactions,submissions:e('native-submissions.json'),metadataTxid:metadata.result.txid}))
 if(initial&&reserveResult&&row.gates.methodCorpusFundingRoot.verified){
  const declaredNativePayments=[funding.id('hex'),...reserveResult.roots].map(id=>`${id}.0`).concat(corpusPayment?[corpusPayment]:[]),binding={storageTransactions,declaredNativePayments,fixture}
  await gate('conditionalReturnedTransactionBindingsWithRederivedDetails',()=>verifyConditionalTransactionBindings(conditional,binding))
  const permission=e('conformance/permission-lifecycle.json'),coverage=e('conformance/permission-coverage.json'),rows=[...permission.transactions,...coverage.transactions.map(r=>({...r,role:`permission-coverage/${r.role}`}))],anchor=clauses.trace.find(r=>r.id==='setup.input.createAction.options.noSendChange.0')
  if(Array.isArray(anchor?.result?.tx)&&typeof anchor.result.txid==='string')rows.push({role:'clause-nosend-anchor',txid:anchor.result.txid,atomicBeef:anchor.result.tx})
  await gate('permissionAndClauseTransactionBindings',async()=>({verified:await verifyCoverageNativeTransactions(rows,binding),rows:rows.length}))
  const shutdown=read(path.join(base,'shutdown-submissions.json'))
  await gate('nativeTransactionStateParent',()=>verifyNativeTransactionStateBindings(e('conformance/transaction-states.json'),{...binding,resolvedTransactions:transactions,submissions:e('native-submissions.json'),finalSubmissions:shutdown.submissions,identity}))
  await gate('fullFinalPermissionAncestry',()=>verifyFinalPermissionSubmissionAncestry({globalSubmissions:e('native-submissions.json'),finalSubmissions:shutdown.submissions,permissionReport:permission,coverageReport:coverage,identity,storageTransactions,resolvedTransactions:transactions,trustedMinedRoot:fixture,readEvidence:eb}))
  await gate('certificateStateParent',()=>verifyCertificateStateParentBindings(e('conformance/certificate-states.json'),{boundary:e('integrated/boundary.json'),identity,globalRoutes:e('routes.json'),globalSubmissions:e('native-submissions.json')}))
  await gate('inputAbsentIndependentGraph',async()=>{
   const call=e('conformance/transaction-states.json').trace.find(x=>x.id==='input-absent-from-beef'),publicTx=Transaction.fromAtomicBEEF(call.result.tx),resolved=transactions.get(publicTx.id('hex'));assert.ok(resolved);assert.equal(publicTx.toHex(),resolved.toHex());assert.equal(resolved.toHex(),storageTransactions.get(publicTx.id('hex')).toHex());
   const leaves=(tx,depth=0)=>{assert.ok(depth<32);return tx.inputs.flatMap(input=>{const outpoint=`${input.sourceTXID??input.sourceTransaction?.id('hex')}.${input.sourceOutputIndex}`;return declaredNativePayments.includes(outpoint)?[{outpoint,declared:true}]:input.sourceTransaction?leaves(input.sourceTransaction,depth+1):[{outpoint,declared:false}]})};
   return {publicTxid:publicTx.id('hex'),sameTargetBodyAndStored:true,declaredNativePayments,publicOwnership:spendsOnlyDeclaredNativePayments(publicTx,declaredNativePayments),resolvedOwnership:spendsOnlyDeclaredNativePayments(resolved,declaredNativePayments),publicLeaves:leaves(publicTx),resolvedLeaves:[...new Map(leaves(resolved).map(x=>[x.outpoint,x])).values()],publicProof:await Beef.fromBinary(call.result.tx).verify(tracker),resolvedCryptographicProof:await resolved.verify(tracker)}
  })
  await gate('strictShutdown',()=>verifyNativeShutdownSubmissions(fs.readFileSync(path.join(base,'shutdown-submissions.json')),{worker,recordBytes:fs.readFileSync(path.join(base,'record.json')),globalSubmissionsBytes:eb('native-submissions.json'),permissionReportBytes:eb('conformance/permission-lifecycle.json'),permissionCoverageReportBytes:eb('conformance/permission-coverage.json'),counterpartsBytes:eb('conformance/service-counterparts.json'),expectedIdentity:identity,readEvidence:eb,storageTransactions}))
 }
 assert.equal(sha(eb('conformance/conditional.json')),row.originalConditionalSha256)
 delete row.gates.immutableEvidenceBundle.result
 report.repetitions.push(row)
}
console.log(JSON.stringify(report,null,2))
