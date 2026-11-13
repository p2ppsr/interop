import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
import {verifyNativePermissionCoverage} from '../../synthesis/src/wallet-lab/native/verify-conformance-permission-coverage.ts'
import {evaluatePartialTrace} from '../../synthesis/src/wallet-lab/native/coverage-completion/partial-trace-verifier.ts'
import {Transaction} from '../../synthesis/node_modules/@bsv/sdk/dist/esm/mod.js'
import {verifyNativeShutdownSubmissions} from '../../synthesis/src/wallet-lab/native/verify-shutdown-submissions.ts'
import {deriveTransactionCoveragePaymentRoots,deriveCompletionNativeFundingRoots} from '../../synthesis/src/wallet-lab/native/coverage-completion/funding-roots.ts'
import {hydrateCoverageControlAncestry} from '../../synthesis/src/wallet-lab/native/coverage-control-ancestry.ts'
import {decodeCoverageObservation,coverageObservationEncoding} from '../../synthesis/src/wallet-lab/native/coverage-observation.ts'
import {verifyCoverageExtensionParentBindings,coverageExtensionTransactionPredicate} from '../../synthesis/src/wallet-lab/native/coverage-extension-verifier.ts'
import {bindForeignOwnerFixture,verifyTransactionCoverageParentBindings} from '../../synthesis/src/wallet-lab/native/coverage-transactions-verifier.ts'
import {verifyCoverageModuleFunding} from '../../synthesis/src/wallet-lab/native/verify-coverage-suite.ts'
import {verifyConditionalTransactionBindings} from '../../synthesis/src/wallet-lab/native/verify-conditional-transaction-bindings.ts'
import {verifyNativeTransactionStateBindings} from '../../synthesis/src/wallet-lab/native/verify-transaction-state-bindings.ts'
import {verifyFinalPermissionSubmissionAncestry} from '../../synthesis/src/wallet-lab/native/verify-submission-ancestry.ts'
import {verifyPermissionSequenceParent} from '../../synthesis/src/wallet-lab/native/coverage-completion/permissions-parent.ts'
import {verifyBasketParent} from '../../synthesis/src/wallet-lab/native/coverage-completion/baskets-parent.ts'
import {verifyPaginationParent} from '../../synthesis/src/wallet-lab/native/coverage-completion/pagination-parent.ts'
import {verifyCertificateRejectionParent} from '../../synthesis/src/wallet-lab/native/coverage-completion/certificate-rejections-parent.ts'
import {withNativeProofResources} from '../../synthesis/src/wallet-lab/native/proof-resources.ts'
const sha=(value:Buffer)=>createHash('sha256').update(value).digest('hex'),rows=[]
for(const index of[1,2]) {
 const root=`out/source11-native-intake/original/repetition-${index}/evidence`,read=(name:string)=>fs.readFileSync(path.join(root,name)),permissionBytes=read('conformance/permission-coverage.json'),permission=JSON.parse(permissionBytes.toString())
 const result=await verifyNativePermissionCoverage(permission,read,permission.identity,{profile:'ITCVE-1@4.8.0'})
 const rep=path.dirname(root),json=(name:string)=>JSON.parse(read(name).toString()),storage=new Map<string,Transaction>(json('native-transactions.json').map((v:any)=>[v.txid,Transaction.fromHex(v.rawTxHex)]))
 const shutdown=await verifyNativeShutdownSubmissions(fs.readFileSync(path.join(rep,'shutdown-submissions.json')),{worker:JSON.parse(fs.readFileSync(path.join(rep,'worker.json'),'utf8')),recordBytes:fs.readFileSync(path.join(rep,'record.json')),globalSubmissionsBytes:read('native-submissions.json'),permissionReportBytes:read('conformance/permission-lifecycle.json'),permissionCoverageReportBytes:permissionBytes,counterpartsBytes:read('conformance/service-counterparts.json'),expectedIdentity:permission.identity,readEvidence:read,storageTransactions:storage})
 const fixture=json('mined-funding-source.json').fixture,graph=new Map(storage),ancestor=Transaction.fromAtomicBEEF([...Buffer.from(fixture.atomicBeefHex,'hex')]);graph.set(ancestor.id('hex'),ancestor)
 for(const tx of graph.values())if(tx!==ancestor){tx.merklePath=undefined;for(const input of tx.inputs)input.sourceTransaction=graph.get(input.sourceTXID!)}
 const paymentRoots=[`${json('funding.json').fundingTxid}.0`,...json('conformance/funding-reserves.json').payments.map((v:any)=>v.outpoint)]
 const binding:any={profile:'ITCVE-1@4.8.0',identity:permission.identity,fixture,storageTransactions:storage,resolvedTransactions:graph,declaredNativePayments:paymentRoots,globalSubmissions:json('native-submissions.json'),finalSubmissions:JSON.parse(fs.readFileSync(path.join(rep,'shutdown-submissions.json'),'utf8')).submissions,readEvidence:read}
 const controls=await withNativeProofResources('ITCVE-1@4.8.0',()=>hydrateCoverageControlAncestry(json('conformance/coverage-transactions.json'),binding))
 const transactionFunding=await withNativeProofResources('ITCVE-1@4.8.0',()=>verifyCoverageModuleFunding(json('conformance/coverage-transactions.json').trace,binding))
 const external=decodeCoverageObservation<any>(json('conformance/coverage-extension.json'),coverageObservationEncoding),graphOptions={resolvedTransactions:graph,requireResolvedAncestors:true,trustedMinedRoot:{txid:fixture.txid,rawHex:fixture.rawHex}}
 const extensionParent=await withNativeProofResources('ITCVE-1@4.8.0',()=>verifyCoverageExtensionParentBindings(external,{identity:binding.identity,boundary:json('integrated/boundary.json'),clauses:json('conformance/clauses.json'),trust:json('integrated/identity-trust.json'),storage,submissions:binding.globalSubmissions,finalSubmissions:binding.finalSubmissions,graph:graphOptions,outputSnapshotObservations:json('native-output-snapshot-observations.json'),outputProviderRegistry:json('native-output-provider-registry.json')}))
 const extensionFunding=await withNativeProofResources('ITCVE-1@4.8.0',()=>verifyCoverageModuleFunding(external.trace,{...binding,declaredNativePayments:transactionFunding.declaredNativePayments},{assertions:external.assertions,predicateFor:(call:any)=>coverageExtensionTransactionPredicate(call.id)}))
 const foreignOwnerFixture=bindForeignOwnerFixture(json('conformance/coverage-transactions.json'),external,extensionParent,extensionFunding,binding.globalSubmissions)
 const transactionParent=await withNativeProofResources('ITCVE-1@4.8.0',()=>verifyTransactionCoverageParentBindings(json('conformance/coverage-transactions.json'),{...binding,graph:graphOptions,foreignOwnerFixture}))
 const funding=await withNativeProofResources('ITCVE-1@4.8.0',()=>deriveCompletionNativeFundingRoots(binding))
 const decode=(name:string)=>{const value=json(`conformance/${name}.json`);return Object.hasOwn(value,'exceptionalValues')?decodeCoverageObservation<any>(value,coverageObservationEncoding):value}
 const remainingParents=await withNativeProofResources('ITCVE-1@4.8.0',async()=>{
  const conditional=await verifyConditionalTransactionBindings(json('conformance/conditional.json'),{...binding,declaredNativePayments:paymentRoots})
  const states=await verifyNativeTransactionStateBindings(json('conformance/transaction-states.json'),{...binding,submissions:binding.globalSubmissions,ownershipFromIndependentGraph:true})
  const final=await verifyFinalPermissionSubmissionAncestry({...binding,permissionReport:json('conformance/permission-lifecycle.json'),coverageReport:permission,trustedMinedRoot:fixture})
  const funded={...binding,declaredNativePayments:funding.declaredNativePayments}
  const permissions=await verifyPermissionSequenceParent(decode('permission-sequence'),funded)
  const baskets=await verifyBasketParent(decode('basket-boundaries'),funded)
  const pagination=await verifyPaginationParent(decode('pagination'),{...funded,declaredNativePayments:baskets.funding.declaredNativePayments})
  const certificates=await verifyCertificateRejectionParent(decode('certificate-rejections'),funded)
  return {conditional,states,final,permissions,baskets,pagination,certificates}
 })
 const partial=await withNativeProofResources('ITCVE-1@4.8.0',()=>evaluatePartialTrace(undefined,read,'ITCVE-1@4.8.0'))
 assert.equal(sha(permissionBytes),sha(read('conformance/permission-coverage.json')))
 rows.push({repetition:index,shutdown,controls,transactionParent,transactionFunding,extensionParent,extensionFunding,funding,remainingParents,permission:{verified:result.verified,result:result.result,assertions:result.assertions.length},partial:{counts:partial.counts,failed:partial.rows.filter((row:any)=>row.result==='FAIL'),blocked:partial.rows.filter((row:any)=>row.result==='BLOCKED')},originalBytesUnchanged:true})
}
const report={claim:'PROSPECTIVE_OBSERVER_DIAGNOSIS_ONLY',nativeQualification:false,originalSource:'bbbc164b9042468e3e5895c3a6f42177dcc4b568',run:43346773141,rows}
fs.writeFileSync('out/source12-intake/native14-prospective-diagnosis.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(rows))
