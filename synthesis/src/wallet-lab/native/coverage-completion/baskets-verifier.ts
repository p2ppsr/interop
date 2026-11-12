import {verifyPriorFixtureReplay} from '../prior-fixture-replay.js'
// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {Beef,Transaction,Utils} from '@bsv/sdk'
import {validateNativeOutputSnapshot} from '../../native-output-snapshot.js'
import {observedSubmissionTransactions} from '../verify-transaction-state-bindings.js'
import {config,operations,variants,nativeArgs,externalArgs,ordinaryControlArgs,requestFor,queryArgs,policy,policySha256,root,sourceCheck,selectedBasketPolicy} from './baskets-model.js'
export class MissingEvidence extends Error{}
export const canonical=(v:any)=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x)
const one=(rows:any[],test:(x:any)=>boolean,label:string)=>{const a=rows.filter(test);if(!a.length)throw new MissingEvidence(`Missing ${label}`);assert.equal(a.length,1,`Duplicate ${label}`);return a[0]}
export const call=(r:any,id:string)=>one(r.trace??[],x=>x.id===id,id)
const success=(r:any)=>{assert.equal(r.error,undefined,`${r.id} contradicts success`);if(r.result===undefined)throw new MissingEvidence(`No result ${r.id}`);return r.result}
const sorted=(a:any[])=>[...a].sort()
export function atomic(value:any){assert.ok(Array.isArray(value)&&value.length>0);for(let i=0;i<value.length;i++)assert.ok(Object.hasOwn(value,i)&&Number.isInteger(value[i])&&value[i]>=0&&value[i]<=255);const reader=new Utils.Reader(value),b=Beef.fromReader(reader);assert.ok(reader.eof(),'Unparsed AtomicBEEF suffix');const tx=Transaction.fromAtomicBEEF(value);assert.equal(tx.id('hex'),b.atomicTxid);return tx}
export const fixture=JSON.parse(fs.readFileSync(path.join(root,'fixtures/teranode/wab-funding-v1.json'),'utf8'))
export const tracker={currentHeight:async()=>fixture.fundingHeight+fixture.maturityDepth,isValidRootForHeight:async(value:string,height:number)=>value===fixture.merkleRoot&&height===fixture.fundingHeight}
export function validateOwned(value:any,identity:string,registry:any[]){
 assert.ok(registry.length>0,'Owned provider registry must not be empty')
 assert.equal(value?.schema,'tpnil-native-owned-output-snapshots@1.0.0');assert.equal(value.identityKey,identity);assert.deepEqual(value.providers.map((p:any)=>p.id),registry.map(p=>p.id));assert.equal(new Set(registry.map(p=>p.id)).size,registry.length)
 for(const p of value.providers){const reg=one(registry,r=>r.id===p.id,'owned provider');assert.deepEqual(p.componentIdentity,reg.componentIdentity);validateNativeOutputSnapshot(p.snapshot,identity,reg.identityKey)}
 return value.providers.flatMap((p:any)=>p.snapshot.outputs.map((o:any)=>({provider:p.id,...o})))
}
export function snapshotPair(report:any,id:string){
 const before=one(report.snapshots,r=>r.id===id&&r.phase==='before',`${id} before`).observation,after=one(report.snapshots,r=>r.id===id&&r.phase==='after',`${id} after`).observation,row=call(report,id)
 for(const s of [before,after]){if(s.error||!s.snapshots)throw new MissingEvidence(`Independent snapshot unavailable: ${id}`);assert.equal(s.identityKey,report.identity);assert.ok(Number.isSafeInteger(s.sequence));assert.ok(Date.parse(s.startedAt)<=Date.parse(s.endedAt));validateOwned(s.snapshots,report.identity,report.providerRegistry)}
 assert.ok(Date.parse(before.endedAt)<=Date.parse(row.startedAt)&&Date.parse(row.startedAt)<=Date.parse(row.endedAt)&&Date.parse(row.endedAt)<=Date.parse(after.startedAt),'Snapshot/call timing mismatch')
 return {before,after,rowsBefore:validateOwned(before.snapshots,report.identity,report.providerRegistry),rowsAfter:validateOwned(after.snapshots,report.identity,report.providerRegistry)}
}
export function unchanged(pair:any){assert.equal(canonical(pair.before.snapshots),canonical(pair.after.snapshots),'Rejected mutation changed independently observed owned outputs')}
export function namespaceRejection(row:any,op:any){
 assert.equal(row.result,undefined,'Rejected namespace returned success');assert.ok(row.error&&typeof row.error==='object')
 const e=row.error,text=String(e.message??'');assert.ok(text.length>0)
 const reserved=op.variantIndex===14&&e.name===policy.reservedRejection.name&&text===policy.reservedRequestRejections[op.method as keyof typeof policy.reservedRequestRejections]||[12,13].includes(op.variantIndex)&&policy.adminRejections.some(v=>v.basket===op.basket&&e.name===v.name&&text===v.message)
 if(!reserved){assert.ok(/INVALID_PARAMETER|invalid.?parameter/i.test(String(e.name)+' '+String(e.code)),`Unspecified rejection: ${text}`);assert.ok(/basket/i.test(text+' '+String(e.parameter??'')),'Error must identify basket');assert.doesNotMatch(text,/not found|failed to unlink|no output|database|storage|timeout|network|insufficient|permission denied/i)}
 assert.equal(row.submissionEnd,row.submissionStart,'Rejected mutation emitted a submission')
}
export function positiveInsertion(pair:any,outpoint:string,request:any){
 const added=pair.rowsAfter.filter((r:any)=>!pair.rowsBefore.some((b:any)=>b.provider===r.provider&&b.outputId===r.outputId));assert.equal(added.length,1,'Exactly one independently owned output must be inserted')
 const row=added[0],rem=request.outputs[0].insertionRemittance;assert.equal(row.outpoint,outpoint);assert.equal(row.basketName,rem.basket.trim().toLowerCase());assert.equal(row.satoshis,2);assert.equal(row.lockingScript,'51');assert.equal(row.spendable,true);assert.deepEqual(row.tags,sorted(rem.tags));assert.equal(row.customInstructions,rem.customInstructions)
 assert.equal(canonical(pair.rowsAfter.filter((r:any)=>r!==row)),canonical(pair.rowsBefore),'Insertion changed unrelated owned outputs')
 return row
}
export function positiveRelinquish(pair:any,outpoint:string,basket:string){
 const target=one(pair.rowsBefore,r=>r.outpoint===outpoint&&r.basketName===basket,'owned relinquishment source');const after=one(pair.rowsAfter,r=>r.provider===target.provider&&r.outputId===target.outputId,'retained relinquished chain output')
 assert.equal(after.basketName,null,'Relinquishment must remove basket membership');assert.equal(canonical({...after,basketName:target.basketName}),canonical(target),'Relinquishment altered value, proof, tags or spendability');assert.equal(canonical(pair.rowsAfter.filter((r:any)=>r.outputId!==target.outputId||r.provider!==target.provider)),canonical(pair.rowsBefore.filter((r:any)=>r!==target)),'Unrelated output changed')
}
export function membership(report:any,id:string,pairRows:any[],basket:string){const row=call(report,id);assert.equal(row.method,'listOutputs');assert.deepEqual(row.args,queryArgs(basket));const r=success(row),expected=pairRows.filter((o:any)=>o.basketName===basket&&o.spendable);assert.equal(r.totalOutputs,expected.length);assert.equal(r.outputs.length,expected.length);assert.equal(new Set(r.outputs.map((o:any)=>o.outpoint)).size,r.outputs.length);assert.deepEqual(sorted(r.outputs.map((o:any)=>o.outpoint)),sorted(expected.map((o:any)=>o.outpoint)));for(const o of r.outputs){const v=one(expected,x=>x.outpoint===o.outpoint,'public membership');assert.equal(o.satoshis,v.satoshis);assert.equal(o.lockingScript,v.lockingScript);assert.deepEqual(sorted(o.tags),v.tags);assert.equal(o.customInstructions,v.customInstructions)}}
export function namedCalls(){const ids=['wallet-identity','funder-identity','fixture-native','fixture-external','control.internalizeAction','control.membership'];for(const o of operations){if(o.accepted)ids.push(`${o.id}.before-membership`);ids.push(o.id);if(o.accepted)ids.push(`${o.id}.after-membership`)}for(const v of variants.filter(v=>v.accepted))ids.push(`${v.id}.final-membership`);ids.push('reopened-identity');for(const v of variants.filter(v=>v.accepted))ids.push(`${v.id}.reopened-membership`);return ids}
export async function verifyBasketObservations(report:any,revision:1|2=1){
 const selected=selectedBasketPolicy(revision),ledger=[...(report.submissionPrefix??[]),...(report.submissions??[])];
 sourceCheck();assert.equal(report.schema,'tpnil-native-basket-boundaries@1.0.0');assert.equal(report.claim,'ENGINEERING_OBSERVATION_ONLY');assert.equal(report.policySha256,selected.sha256);assert.equal(report.completeBRC100Conformance,false);assert.ok(['NATIVE_OBSERVATION','LAB_SELF_TEST_ONLY'].includes(report.mode))
 assert.equal(new Set(report.trace.map((r:any)=>r.id)).size,report.trace.length);assert.ok(report.trace.length<=config.maximumPublicCalls)
 const results:any[]=[],native=success(call(report,'fixture-native')),external=success(call(report,'fixture-external')),nativeTx=atomic(native.tx),externalTx=atomic(external.tx)
 let fixtureError:any
 try{
  assert.deepEqual(report.trace.map((r:any)=>r.id),namedCalls(),'Fixed public call order/inventory differs');for(const row of report.trace){assert.equal(row.actor,['funder-identity','fixture-external'].includes(row.id)?'funder':'wallet');assert.ok(Number.isSafeInteger(row.submissionStart)&&Number.isSafeInteger(row.submissionEnd)&&row.submissionEnd>=row.submissionStart);assert.ok(Date.parse(row.startedAt)<=Date.parse(row.endedAt));}for(const id of ['wallet-identity','funder-identity','reopened-identity']){assert.equal(call(report,id).method,'getPublicKey');assert.deepEqual(call(report,id).args,{identityKey:true})};assert.deepEqual(report.errors,[]);assert.equal(report.identity,success(call(report,'wallet-identity')).publicKey);assert.equal(report.funderIdentity,success(call(report,'funder-identity')).publicKey);assert.notEqual(report.identity,report.funderIdentity)
  for(const[id,args,tx,v]of[['fixture-native',nativeArgs(),nativeTx,native],['fixture-external',externalArgs(),externalTx,external]]as any[]){const row=call(report,id);assert.equal(row.method,'createAction');assert.deepEqual(row.args,args);assert.equal(tx.id('hex'),v.txid);assert.ok(await tx.verify(tracker),'Invalid full mined fixture proof');for(let i=0;i<args.outputs.length;i++){assert.equal(tx.outputs[i].satoshis,args.outputs[i].satoshis);assert.equal(tx.outputs[i].lockingScript.toHex(),args.outputs[i].lockingScript)}}
  assert.deepEqual(report.providerRegistry,report.finalProviderRegistry);assert.ok(report.providerRegistry.length>0)
  assert.equal(report.snapshots.length,80);assert.deepEqual(report.snapshots.map((s:any)=>`${s.id}:${s.phase}`),['control.internalizeAction',...operations.map(o=>o.id)].flatMap(id=>[`${id}:before`,`${id}:after`]))
  assert.equal(report.snapshotEnd-report.snapshotStart,80);for(let i=0;i<80;i++)assert.equal(report.snapshots[i].observation.sequence,report.snapshotStart+i)
  const control=call(report,'control.internalizeAction');assert.deepEqual(control.args,ordinaryControlArgs(external));assert.equal(control.method,'internalizeAction');assert.equal(success(control).accepted,true);if(revision===2)await verifyPriorFixtureReplay(control,call(report,'fixture-external'),ledger,tracker);else assert.equal(control.submissionStart,control.submissionEnd);const pair=snapshotPair(report,control.id);positiveInsertion(pair,`${external.txid}.15`,control.args);membership(report,'control.membership',pair.rowsAfter,'tpnil bb insertion control')
  for(let i=0;i<24;i++){const row=one(pair.rowsBefore,r=>r.outpoint===`${native.txid}.${i}`,'native owned fixture output'),expected=nativeArgs().outputs[i]!;assert.equal(row.satoshis,expected.satoshis);assert.equal(row.lockingScript,expected.lockingScript);assert.equal(row.spendable,true);assert.equal(row.basketName,expected.basket);assert.deepEqual(row.tags,expected.tags);assert.equal(row.customInstructions,expected.customInstructions)}
 }catch(error){fixtureError=error}
 for(const op of operations){const out:any={id:op.id,planningRow:op.row,result:'BLOCKED',scope:op.variantIndex>=0&&op.variantIndex<6&&[301,399,400].includes(variants[op.variantIndex]!.bytes)?'PROSPECTIVE_300_BYTE_INTERFACE_ONLY_NARRATIVE_400_CONFLICT_REMAINS':'EXACT_NAMED_MUTATION',wholeRowConformance:null,nativeVerdict:null};try{if(fixtureError)throw fixtureError;const row=call(report,op.id);assert.equal(row.actor,'wallet');assert.equal(row.method,op.method);assert.deepEqual(row.args,requestFor(op,native,external));const pair=snapshotPair(report,op.id)
  if(!op.accepted){namespaceRejection(row,op);unchanged(pair)}else{if(revision===2&&op.method==='internalizeAction')await verifyPriorFixtureReplay(row,call(report,'fixture-external'),ledger,tracker);else assert.equal(row.submissionStart,row.submissionEnd);if(op.method==='internalizeAction'){assert.equal(success(row).accepted,true);positiveInsertion(pair,`${external.txid}.${op.externalIndex}`,row.args)}else{assert.deepEqual(success(row),{relinquished:true});positiveRelinquish(pair,`${native.txid}.${op.relinquishIndex}`,op.basket)}membership(report,`${op.id}.before-membership`,pair.rowsBefore,op.basket);membership(report,`${op.id}.after-membership`,pair.rowsAfter,op.basket)}out.result='SCOPED_PASS'
 }catch(error){out.result=error instanceof MissingEvidence?'BLOCKED':'FAIL';out.reason=String(error)}results.push(out)}
 return {claim:'ENGINEERING_OBSERVATION_ONLY',evaluationPolicySha256:selected.sha256,capturedPolicySha256:report.policySha256,completeBRC100Conformance:false,nativeQualification:false,wholeRowsQualified:0,observations:results,counts:Object.fromEntries(['SCOPED_PASS','FAIL','BLOCKED'].map(v=>[v,results.filter(r=>r.result===v).length])),fixtureValid:!fixtureError,fixtureError:fixtureError?String(fixtureError):null,parentRequired:true}
}
