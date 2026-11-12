// SPDX-License-Identifier: Apache-2.0
import {config,operations,variants,nativeArgs,externalArgs,requestFor,queryArgs,ordinaryControlArgs,policySha256,sourceCheck,selectedBasketPolicy} from './baskets-model.js'
import {captureClauseError} from '../conformance-clauses.js'
export async function runNativeBasketBoundaries(context:any){
 sourceCheck();let wallet=context.wallet;const services=context.services,now=()=>new Date().toISOString()
 const ledger=()=>services.submissions.map((r:any)=>({txid:r.txid,beefHex:Buffer.from(r.bytes).toString('hex'),verdict:r.verdict}))
 const report:any={schema:'tpnil-native-basket-boundaries@1.0.0',claim:'ENGINEERING_OBSERVATION_ONLY',policySha256:selectedBasketPolicy(context.policyRevision??1).sha256,completeBRC100Conformance:false,mode:context.mode??'NATIVE_OBSERVATION',identity:'',funderIdentity:'',trace:[],snapshots:[],errors:[],providerRegistry:services.nativeOutputProviderRegistry,submissionStart:ledger().length,submissionEnd:ledger().length,submissionPrefix:ledger(),submissions:[],snapshotStart:services.nativeOutputSnapshotObservations.length,snapshotEnd:services.nativeOutputSnapshotObservations.length,reopen:null}
 context.onProgress?.(report)
 const call=async(id:string,actor:string,method:string,args:any)=>{if(report.trace.length>=config.maximumPublicCalls)throw Error('Public call bound');const row:any={id,actor,method,args:structuredClone(args),startedAt:now(),endedAt:'',submissionStart:services.submissions.length,submissionEnd:services.submissions.length};report.trace.push(row);try{row.result=JSON.parse(JSON.stringify(await(actor==='wallet'?wallet:context.funder)[method](structuredClone(args))))}catch(error){row.error=captureClauseError(error)}row.endedAt=now();row.submissionEnd=services.submissions.length;context.onProgress?.(report);return row}
 const snapshot=async(id:string,phase:string)=>{if(report.snapshots.length>=config.maximumSnapshots)throw Error('Snapshot bound');const n=services.nativeOutputSnapshotObservations.length;try{await services.nativeOutputSnapshots(report.identity)}catch{/* actual observation retains error */}const observation=services.nativeOutputSnapshotObservations[n];if(!observation)throw Error('Snapshot ledger omitted request');report.snapshots.push({id,phase,observation});context.onProgress?.(report)}
 try{
  report.identity=(await call('wallet-identity','wallet','getPublicKey',{identityKey:true})).result?.publicKey
  report.funderIdentity=(await call('funder-identity','funder','getPublicKey',{identityKey:true})).result?.publicKey
  const native=(await call('fixture-native','wallet','createAction',nativeArgs())).result,external=(await call('fixture-external','funder','createAction',externalArgs())).result
  if(!native?.tx||!external?.tx)throw Error('Public signed fixture absent')
  await snapshot('control.internalizeAction','before')
  await call('control.internalizeAction','wallet','internalizeAction',ordinaryControlArgs(external))
  await snapshot('control.internalizeAction','after')
  await call('control.membership','wallet','listOutputs',queryArgs('tpnil bb insertion control'))
  for(const operation of operations){
   if(operation.accepted)await call(`${operation.id}.before-membership`,'wallet','listOutputs',queryArgs(operation.basket))
   await snapshot(operation.id,'before')
   await call(operation.id,'wallet',operation.method,requestFor(operation,native,external))
   await snapshot(operation.id,'after')
   if(operation.accepted)await call(`${operation.id}.after-membership`,'wallet','listOutputs',queryArgs(operation.basket))
  }
  for(const v of variants.filter(v=>v.accepted))await call(`${v.id}.final-membership`,'wallet','listOutputs',queryArgs(v.name))
  if(context.reopen){const startedAt=now();wallet=await context.reopen(wallet);report.reopen={kind:'PUBLIC_CWI_HANDLE_REFRESH',startedAt,endedAt:now(),nativeBrowserRestart:false};await call('reopened-identity','wallet','getPublicKey',{identityKey:true});for(const v of variants.filter(v=>v.accepted))await call(`${v.id}.reopened-membership`,'wallet','listOutputs',queryArgs(v.name))}
 }catch(error){report.errors.push(String(error))}
 report.submissionEnd=services.submissions.length;report.submissions=ledger().slice(report.submissionStart);report.snapshotEnd=services.nativeOutputSnapshotObservations.length;report.finalProviderRegistry=services.nativeOutputProviderRegistry;sourceCheck();return {report,wallet}
}
