// LAB_SELF_TEST_ONLY prospective parent diagnostics. No original bytes change,
// missing PNGs are retained as errors, and this never issues qualification.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict'
import {Beef,Transaction} from '@bsv/sdk'
import {decodeCoverageObservation,coverageObservationEncoding as encoding} from '../../synthesis/src/wallet-lab/native/coverage-observation.js'
import {verifyBoundaryFundingRoot} from '../../synthesis/src/wallet-lab/native/verify-conformance-reserves.js'
import {withNativeProofResources} from '../../synthesis/src/wallet-lab/native/proof-resources.js'
import {deriveTransactionCoverageOutcomes,verifyTransactionCoverageParentBindings,bindForeignOwnerFixture,bindLaterNativeOwnedSpend} from '../../synthesis/src/wallet-lab/native/coverage-transactions-verifier.js'
import {deriveCompletionNativeFundingRoots} from '../../synthesis/src/wallet-lab/native/coverage-completion/funding-roots.js'
import {hydrateTransactionCompletionFixture} from '../../synthesis/src/wallet-lab/native/coverage-completion/transaction-known-source.js'
import {hydrateCoverageControlAncestry} from '../../synthesis/src/wallet-lab/native/coverage-control-ancestry.js'
import {verifyCoverageModuleFunding,verifyPermissionPrelude} from '../../synthesis/src/wallet-lab/native/verify-coverage-suite.js'
import {verifyPermissionExtensionParentBindings} from '../../synthesis/src/wallet-lab/native/coverage-permissions-verifier.js'
import {verifyCoverageExtensionParentBindings,coverageExtensionTransactionPredicate} from '../../synthesis/src/wallet-lab/native/coverage-extension-verifier.js'
import {verifyCertificateCoverageParentBindings} from '../../synthesis/src/wallet-lab/native/coverage-certificates-verify.js'
import {verifyCompletionFunding} from '../../synthesis/src/wallet-lab/native/coverage-completion/funding.js'
import {verifyPermissionSequenceParent} from '../../synthesis/src/wallet-lab/native/coverage-completion/permissions-parent.js'
import {verifyBasketParent} from '../../synthesis/src/wallet-lab/native/coverage-completion/baskets-parent.js'
import {verifyPaginationParent} from '../../synthesis/src/wallet-lab/native/coverage-completion/pagination-parent.js'
import {verifyCertificateRejectionParent} from '../../synthesis/src/wallet-lab/native/coverage-completion/certificate-rejections-parent.js'
import {verifyTransactionBranchParent,evaluateTransactionBranches,transactionBranchAssertions} from '../../synthesis/src/wallet-lab/native/coverage-completion/transaction-branches-parent.js'
const results:any[]=[]
for(const repetition of[1,2])await withNativeProofResources('ITCVE-1@4.8.0',async()=>{
 const home=path.resolve(`out/source15-native-intake/original/repetition-${repetition}`),read=(name:string)=>fs.readFileSync(path.join(home,'evidence',name)),json=(name:string)=>JSON.parse(read(name).toString()),report=(name:string)=>decodeCoverageObservation<any>(json(`conformance/${name}.json`),['coverage-extension','coverage-certificates','completion-funding','pagination','certificate-rejections','transaction-branches'].includes(name)?encoding:undefined)
 const rows:any[]=[];const check=async(name:string,fn:()=>any)=>{try{const result=await fn();rows.push({name,result:'PASS',verified:result.verified});return result}catch(e:any){rows.push({name,result:'REJECTED',error:e.message});return undefined}}
 const graph=new Map<string,Transaction>(),storage=new Map<string,Transaction>(),add=(tx:Transaction)=>{const id=tx.id('hex');if(graph.has(id)){assert.equal(graph.get(id)!.toHex(),tx.toHex());return}graph.set(id,tx);for(const i of tx.inputs)if(i.sourceTransaction)add(i.sourceTransaction)}
 const fixture=json('mined-funding-source.json').fixture,funding=Transaction.fromAtomicBEEF([...read('funding.atomicbeef')]),reserves=json('conformance/funding-reserves.json');add(funding);for(const p of reserves.payments)add(Transaction.fromAtomicBEEF(p.beef))
 const rec=JSON.parse(fs.readFileSync(path.join(home,'record.json')).toString());add(Transaction.fromAtomicBEEF(Beef.fromBinary([...read('create.beef')]).toBinaryAtomic(rec.observations.createTxid)))
 for(const s of json('native-transactions.json')){const tx=Transaction.fromHex(s.rawTxHex);storage.set(s.txid,tx);add(tx)}
 for(const tx of graph.values())for(const i of tx.inputs)if(!i.sourceTransaction)i.sourceTransaction=graph.get(i.sourceTXID!)
 const tx=report('coverage-transactions'),ext=report('coverage-extension'),cert=report('coverage-certificates'),identity=json('integrated/result.json').walletIdentity,globalSubmissions=json('native-submissions.json'),finalSubmissions=JSON.parse(fs.readFileSync(path.join(home,'shutdown-submissions.json')).toString()).submissions
 const roots=[`${funding.id('hex')}.0`,...reserves.payments.map((p:any)=>p.outpoint)],clauses=json('conformance/clauses.json')
 const corpusPayment=await verifyBoundaryFundingRoot(json('integrated/boundary.json'),{identity,fixture,storageTransactions:storage,submissions:globalSubmissions,metadataTxid:clauses.metadataTxid});if(corpusPayment)roots.push(corpusPayment)
 const b:any={profile:'ITCVE-1@4.8.0',identity,fixture,storageTransactions:storage,resolvedTransactions:graph,declaredNativePayments:roots,globalSubmissions,finalSubmissions,readEvidence:read}
 assert.deepEqual(tx.assertions,await deriveTransactionCoverageOutcomes(tx))
 await check('control-ancestry',()=>hydrateCoverageControlAncestry(tx,b));
 const paymentRoots=await check('funding-root-admission',()=>deriveCompletionNativeFundingRoots(b));
 await check('isolated-fixture-ancestry',()=>hydrateTransactionCompletionFixture(report('transaction-branches'),{...b,declaredNativePayments:paymentRoots?.declaredNativePayments??roots}));
 await check('prelude',()=>verifyPermissionPrelude(b))
 const proof={resolvedTransactions:graph,requireResolvedAncestors:true,trustedMinedRoot:{txid:fixture.txid,rawHex:fixture.rawHex}}
 await check('permission-extension',()=>verifyPermissionExtensionParentBindings(report('permission-extension'),report('permission-coverage'),{...b,graph:proof}))
 const txfund=await check('transaction-funding',()=>verifyCoverageModuleFunding(tx.trace,b))
 const extbound=await check('extension-parent',()=>verifyCoverageExtensionParentBindings(ext,{identity,boundary:json('integrated/boundary.json'),clauses,trust:json('integrated/identity-trust.json'),storage,submissions:globalSubmissions,finalSubmissions,graph:proof,outputSnapshotObservations:json('native-output-snapshot-observations.json'),outputProviderRegistry:json('native-output-provider-registry.json')}))
 const extfund=await check('extension-funding',()=>verifyCoverageModuleFunding(ext.trace,{...b,declaredNativePayments:txfund?.declaredNativePayments??roots},{assertions:ext.assertions,predicateFor:c=>coverageExtensionTransactionPredicate(c.id)}))
 const foreign=extbound&&extfund?bindForeignOwnerFixture(tx,ext,extbound,extfund,globalSubmissions):undefined
 const lateReport=report('transaction-branches');assert.deepEqual(lateReport.assertions,transactionBranchAssertions(await evaluateTransactionBranches(lateReport)));
 const lateParent=await check('later-owner-parent',()=>verifyTransactionBranchParent(lateReport,{...b,declaredNativePayments:paymentRoots!.declaredNativePayments}));
 const laterNativeOwnedSpend=lateParent?bindLaterNativeOwnedSpend(tx,lateReport,lateParent,paymentRoots,globalSubmissions):undefined
 await check('transaction-parent',()=>verifyTransactionCoverageParentBindings(tx,{...b,graph:proof,foreignOwnerFixture:foreign,laterNativeOwnedSpend}))
 await check('certificate-parent',()=>verifyCertificateCoverageParentBindings(cert,{...b,browserContexts:json('native-browser-contexts.json').contexts,globalRoutes:json('routes.json'),trustedMinedRoot:proof.trustedMinedRoot}))
 const certfund=await check('certificate-funding',()=>verifyCoverageModuleFunding(cert.trace,{...b,declaredNativePayments:extfund?.declaredNativePayments??roots}))
 const cf=await check('completion-funding',()=>verifyCompletionFunding(report('completion-funding'),{...b,declaredNativePayments:certfund?.declaredNativePayments??roots})),funded={...b,declaredNativePayments:cf?.declaredNativePayments??roots}
 await check('permission-sequence',()=>verifyPermissionSequenceParent(report('permission-sequence'),funded))
 const basket=await check('basket-parent',()=>verifyBasketParent(report('basket-boundaries'),funded))
 const pagination=await check('pagination-parent',()=>verifyPaginationParent(report('pagination'),{...funded,declaredNativePayments:basket?.funding.declaredNativePayments??funded.declaredNativePayments}))
 await check('certificate-rejection-parent',()=>verifyCertificateRejectionParent(report('certificate-rejections'),funded))
 const branches=report('transaction-branches');assert.deepEqual(branches.assertions,transactionBranchAssertions(await evaluateTransactionBranches(branches)))
 await check('transaction-branch-parent',()=>verifyTransactionBranchParent(branches,{...funded,declaredNativePayments:pagination?.funding.declaredNativePayments??funded.declaredNativePayments}))
 results.push({repetition,claim:'LAB_SELF_TEST_ONLY',originalBytesModified:false,nativeQualification:false,prospectiveAssertionsRecomputed:[],allOriginalAssertionsUnchanged:true,checks:rows});fs.writeFileSync('out/source16-preflight/parent-diagnostics.json',JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results.at(-1)))
})
