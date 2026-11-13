import assert from 'node:assert/strict'
import {nativeCompletionProfile, type NativeCompletionProfile} from '../completion-profile.js'
import {getTransactionCoveragePolicy, transactionCoveragePolicyPathForRevision} from '../coverage-transactions-model.js'
import { createHash } from 'node:crypto'
import { Beef, Transaction, Utils } from '@bsv/sdk'
import { deriveConditionalOutcomes } from '../verify-conformance-conditional.js'
import { deriveTransactionStateOutcomes } from '../verify-transaction-states.js'
import { deriveTransactionCoverageOutcomes } from '../coverage-transactions-verifier.js'
import { deriveCertificateStateOutcomes } from '../verify-certificate-states.js'
import { deriveCertificateCoverageOutcomes } from '../coverage-certificates-verify.js'
import { encodeCoverageObservation, decodeCoverageObservation, coverageObservationEncoding } from '../coverage-observation.js'
import { partialTracePolicy, partialTracePolicySha256, partialTraceSchema, partialTraceOracle, verifyPartialTracePolicy } from './partial-trace-model.js'
const model = partialTracePolicy
const sha=(bytes:any)=>createHash('sha256').update(bytes).digest('hex')
export class MissingInput extends Error {}
const exactOne=(rows:any[],predicate:(v:any)=>boolean,label:string)=>{const hits=rows.filter(predicate);if(!hits.length)throw new MissingInput(`Missing ${label}`);assert.equal(hits.length,1,`Duplicate ${label}`);return hits[0]}
export const call=(report:any,id:string)=>exactOne(report.trace??[],r=>r.id===id,id)
const success=(r:any)=>{assert.equal(r.error,undefined,`${r.id}: contradictory/error response`);assert.ok(r.result&&typeof r.result==='object',`${r.id}: public result missing`);return r.result}
const sorted=(v:any[])=>[...v].sort()
const unique=(v:any[],label:string)=>assert.equal(new Set(v).size,v.length,`Duplicate ${label}`)
const strictAtomic=(bytes:any,txid:string)=>{assert.ok(Array.isArray(bytes)&&bytes.length);for(let i=0;i<bytes.length;i++)assert.ok(Object.hasOwn(bytes,i)&&Number.isInteger(bytes[i])&&bytes[i]>=0&&bytes[i]<=255,'Dense public byte array required');const reader=new Utils.Reader(bytes),graph=Beef.fromReader(reader);assert.ok(reader.eof()&&reader.pos===bytes.length,'Truncated or trailing public BEEF');const tx=Transaction.fromAtomicBEEF(bytes);assert.equal(tx.id('hex'),graph.atomicTxid);assert.equal(tx.id('hex'),txid);return tx}
const serial=(v:any)=>JSON.stringify(encodeCoverageObservation(v))
/** Additional assertions only. Optional customInstructions is compared when present,
 * never made mandatory merely because the wire type permits it. */
export function verifyActionMetadata(report:any,queryId:string){
 const query=call(report,queryId);assert.equal(query.method,'listActions');const response=success(query)
 const population=Array.from({length:11},(_,i)=>call(report,`population-${i}`))
 const expected=new Map(population.map(row=>{const value=success(row),tx=strictAtomic(value.tx,value.txid);return [value.txid,{row,tx}]}))
 unique(response.actions.map((a:any)=>a.txid),'metadata action IDs');assert.deepEqual(sorted(response.actions.map((a:any)=>a.txid)),sorted([...expected.keys()]))
 for(const action of response.actions){
  const {row,tx}=expected.get(action.txid)!
  if(query.args.includeInputs){
   assert.ok(Array.isArray(action.inputs));assert.equal(action.inputs.length,tx.inputs.length)
   const outpoints=tx.inputs.map((i:any)=>`${i.sourceTXID??i.sourceTransaction?.id('hex')}.${i.sourceOutputIndex}`)
   assert.deepEqual(sorted(action.inputs.map((i:any)=>i.sourceOutpoint)),sorted(outpoints))
   for(const input of action.inputs){const n=outpoints.indexOf(input.sourceOutpoint);assert.ok(n>=0);const source=tx.inputs[n];assert.ok(source);assert.equal(input.sequenceNumber,source.sequence,'Per-flag input sequence differs')}
  }else assert.equal(action.inputs,undefined,'Inactive inputs leaked')
  if(query.args.includeOutputs){
   assert.ok(Array.isArray(action.outputs));assert.equal(action.outputs.length,tx.outputs.length);assert.deepEqual(sorted(action.outputs.map((o:any)=>o.outputIndex)),sorted(tx.outputs.map((_o:any,i:number)=>i)))
   for(const wanted of row.args.outputs){
    const matches=tx.outputs.map((o:any,i:number)=>({o,i})).filter(({o})=>o.satoshis===wanted.satoshis&&o.lockingScript.toHex()===wanted.lockingScript)
    assert.equal(matches.length,1,'Fixture requested output must be unambiguous')
    const match=matches[0];assert.ok(match);const found=exactOne(action.outputs,(o:any)=>o.outputIndex===match.i,'requested output metadata')
    assert.equal(found.basket,wanted.basket,'Returned basket differs from exact creation intent')
    assert.deepEqual(sorted(found.tags),sorted(wanted.tags),'Returned tags differ');unique(found.tags,'output tags')
    assert.equal(found.outputDescription,wanted.outputDescription,'Returned output description differs')
    if(found.customInstructions!==undefined)assert.equal(found.customInstructions,wanted.customInstructions,'Optional instructions differ')
   }
  }else assert.equal(action.outputs,undefined,'Inactive outputs leaked')
 }
 return {comparedActions:11,queryId,optionalInstructions:'COMPARED_IF_PRESENT_NOT_REQUIRED'}
}
/** Exact complete inventory is intentionally not inferred from the final DB. */
export function verifyWholeActionInventory(report:any,witness:any){
 const query=call(report,'actions-empty-labels');const response=success(query)
 if(!witness)throw new MissingInput('No independently complete action inventory at exact query cut; final DB/fixture subset is insufficient')
 assert.equal(witness.schema,'tpnil-prototype-action-inventory@1');assert.equal(witness.claim,'CONSTRUCTED_SELF_TEST_ONLY')
 assert.equal(witness.identity,report.identity);assert.equal(witness.callId,query.id);assert.equal(witness.querySha256,sha(serial(query)))
 assert.equal(witness.complete,true);assert.ok(Array.isArray(witness.actions));unique(witness.actions.map((a:any)=>a.txid),'inventory actions')
 unique(response.actions.map((a:any)=>a.txid),'public empty-label actions')
 assert.deepEqual(sorted(response.actions.map((a:any)=>a.txid)),sorted(witness.actions.map((a:any)=>a.txid)))
 assert.equal(response.totalActions,witness.actions.length)
 return {kind:'CONSTRUCTED_INVENTORY_SELF_TEST',admission:false}
}
const certFields=['type','serialNumber','subject','certifier','revocationOutpoint','signature','fields']
const certTuple=(c:any)=>serial(Object.fromEntries(certFields.map(k=>[k,c[k]])))
export function verifyCertificateRestartJoin(conditional:any,states:any,extension:any,rowId:string){
 const snapshots=['baseline','inventory-before-restart','inventory-after-restart'].map(id=>success(call(extension,id)).certificates)
 for(const values of snapshots){assert.ok(Array.isArray(values));unique(values.map(certTuple),'full certificates')}
 const baseline=snapshots[0].map(certTuple),before=snapshots[1].map(certTuple),after=snapshots[2].map(certTuple);assert.deepEqual(sorted(before),sorted(after),'Exact signed certificate inventory changed across restart')
 assert.ok(baseline.every((c:string)=>after.includes(c)),'A preexisting signed certificate disappeared across restart')
 if(rowId==='certificate.issuance/valid-issuance'){
  const issued=certTuple(success(call(conditional,'issuance-valid')));assert.ok(baseline.includes(issued)&&after.includes(issued),'Exact earlier issued certificate absent across restart')
 }else if(rowId==='certificate.inventory/relinquish-one'){
  const request=call(conditional,'certificate-relinquish').args
  for(const values of snapshots)assert.ok(!values.some((c:any)=>c.type===request.type&&c.certifier===request.certifier&&c.serialNumber===request.serialNumber),'Relinquished tuple reappeared')
 }else {
  const original=success(call(states,'baseline')).certificates.map(certTuple)
  assert.ok(original.every((c:string)=>baseline.includes(c)&&after.includes(c)),'Earlier complete certificate baseline absent')
 }
 if(extension.restart?.kind!=='NATIVE_BROWSER_RESTART')throw new MissingInput('Reference client reopen does not prove native restart')
 return {retainedBaseline:snapshots[0].length,actualNativeRestartStillRequiresParent:true}
}
export function traceEvidence(report:any,id:string){const row=call(report,id);assert.equal(typeof row.method,'string');assert.ok(row.args&&typeof row.args==='object');return{id,traceIndex:report.trace.indexOf(row),actor:row.actor??null,method:row.method,requestSha256:sha(serial({method:row.method,args:row.args,actor:row.actor})),responseSha256:sha(serial({result:row.result,error:row.error})),callSha256:sha(serial(row)),submissionStart:row.submissionStart??null,submissionEnd:row.submissionEnd??null,startedAt:row.startedAt??null,endedAt:row.endedAt??null}}
const derivations:any={conditional:deriveConditionalOutcomes,states:deriveTransactionStateOutcomes,transactions:deriveTransactionCoverageOutcomes,certificateStates:deriveCertificateStateOutcomes,certificates:deriveCertificateCoverageOutcomes}

/** Recompute dependency predicates from the fixed raw files. Public result
 * digests retain undefined and sparse values through the evidence codec. */
export function partialTraceModulesForProfile(profile?: NativeCompletionProfile) {
 if (!profile) return model.modules
 const revision = nativeCompletionProfile(profile).transactionRevision
 const selected = getTransactionCoveragePolicy(revision)
 return {...model.modules, transactions:{...model.modules.transactions,
  policy:transactionCoveragePolicyPathForRevision(revision), policySha256:selected.policySha256,
  schema:`tpnil-native-coverage-transactions@${revision}.0.0`, oracle:selected.policy.oracle}}
}
export async function evaluatePartialTrace(report: any | undefined, read: (name: string) => Buffer, profile?: NativeCompletionProfile) {
 verifyPartialTracePolicy()
 const gates:any={conditional:['fixture.call-inventory','fixture.population'],states:['fixture.fanout'],certificateStates:['certificate-states.fixture-authentication','certificate-states.fixture-acquisition'],certificates:['coverage-certificates.fixture-authentication'],transactions:[]}
 const evaluations:any={},reports:any={},inputs:any={}
 for(const [name,expected] of Object.entries(partialTraceModulesForProfile(profile)) as any[]) {
  let bytes:Buffer
  try { bytes=read(expected.file) } catch(error) { inputs[name]={file:expected.file,missing:true}; continue }
  inputs[name]={file:expected.file,bytes:bytes.length,sha256:sha(bytes)}
  try {
   const value=decodeCoverageObservation<any>(JSON.parse(bytes.toString()),expected.encoded?coverageObservationEncoding:undefined);reports[name]=value
   assert.equal(value.schema,expected.schema);assert.equal(value.oracle,expected.oracle);assert.equal(value.policySha256,expected.policySha256)
   assert.equal(value.claim,'ENGINEERING_OBSERVATION_ONLY');assert.equal(value.completeBRC100Conformance,false)
   assert.ok(Array.isArray(value.trace));unique(value.trace.map((r:any)=>r.id),'public call IDs')
   const outcomes=await derivations[name](value, read);unique(outcomes.map((r:any)=>r.id),'derived predicate IDs')
   evaluations[name]={outcomes:new Map(outcomes.map((r:any)=>[r.id,r]))}
  }catch(error){evaluations[name]={error:String(error)}}
 }
 const rows:any[]=[]
 for(const row of model.rows) {
  const result:any={id:row.id,result:'BLOCKED',scope:row.scope,remainingWork:row.originalRemainingWork,scopeLimit:row.scopeLimit,wholeRowConformance:null,nativeVerdict:null,dependencies:row.dependencies,details:[]}
  try {
   if(row.needsNewNativeCalls)throw new MissingInput(row.newCallReason)
   if(row.supplement==='whole-action-inventory')throw new MissingInput('Complete action membership interpretation is not established by these scoped traces')
   for(const dep of row.dependencies) {
    if(inputs[dep.module].missing)throw new MissingInput(`Module ${dep.module} absent`)
    const evaluation=evaluations[dep.module];assert.equal(evaluation?.error,undefined,`${dep.module}: ${evaluation?.error}`);assert.ok(evaluation)
    const value=reports[dep.module];for(const id of dep.calls)call(value,id)
    for(const gate of gates[dep.module]){const checked=evaluation.outcomes.get(gate);assert.ok(checked,`Missing fixed fixture gate ${gate}`);if(checked.result==='BLOCKED')throw new MissingInput(`Fixture gate ${gate}: ${checked.detail}`);assert.equal(checked.result,'PASS',`Fixture gate ${gate}: ${checked.detail}`)}
    const outcome=evaluation.outcomes.get(dep.predicate);assert.ok(outcome,`Unknown derived predicate ${dep.predicate}`)
    if(outcome.result==='BLOCKED')throw new MissingInput(`Dependency ${dep.predicate}: ${outcome.detail}`)
    assert.equal(outcome.result,'PASS',`${dep.predicate}: ${outcome.detail}`)
    result.details.push({module:dep.module,predicate:dep.predicate,result:outcome.result,originalMemberSha256:inputs[dep.module].sha256,identity:value.identity,calls:dep.calls.map((id:string)=>traceEvidence(value,id))})
   }
   const names=[...new Set(row.dependencies.map((d:any)=>d.module))] as string[]
   assert.equal(new Set(names.map(n=>reports[n].identity)).size,1,'Same-run wallet identity differs')
   if(row.supplement==='action-metadata'){result.supplement=verifyActionMetadata(reports.conditional,row.dependencies[0].calls[0]);result.supplement.sourceCalls=Array.from({length:11},(_,i)=>traceEvidence(reports.conditional,`population-${i}`))}
   if(row.supplement==='whole-action-inventory')throw new MissingInput('No independently complete action membership interpretation at exact query cut; final storage and fixture subsets cannot qualify this row')
   if(row.supplement==='certificate-restart'){result.supplement=verifyCertificateRestartJoin(reports.conditional,reports.certificateStates,reports.certificates,row.id);result.supplement.cuts=['baseline','inventory-before-restart','inventory-after-restart'].map(id=>traceEvidence(reports.certificates,id))}
   result.result='SCOPED_PASS'
  }catch(error){result.result=error instanceof MissingInput?'BLOCKED':'FAIL';result.reason=String(error)}
  rows.push(result)
 }
 const checked={schema:partialTraceSchema,oracle:partialTraceOracle,profile:'ITCVE-1@4.5.0',...(profile==='ITCVE-1@4.8.0'?{parentProfile:profile}:{}),policySha256:partialTracePolicySha256,claim:'ENGINEERING_OBSERVATION_ONLY',identity:reports.conditional?.identity??null,inputs,rows,counts:Object.fromEntries(['SCOPED_PASS','FAIL','BLOCKED'].map(v=>[v,rows.filter(r=>r.result===v).length])),publicCalls:0,newSignedTransactions:0,completeBRC100Conformance:false,nativeQualification:false,wholeRowQualifications:0,original535ResultsChanged:false,parentAdmissionRequired:true}
 const assertions=partialTraceAssertions(checked)
 if(report!==undefined){for(const key of Object.keys(checked))assert.deepEqual(report[key],(checked as any)[key],`Partial trace ${key} differs from raw replay`);assert.deepEqual(report.assertions,assertions)}
 return {...checked,assertions,modules:reports}
}
export function partialTraceAssertions(checked:{rows:any[]}) {
 return checked.rows.map(row=>({id:`completion.partial-trace.${row.id}`,result:row.result==='SCOPED_PASS'?'PASS':row.result,
  detail:row.result==='SCOPED_PASS'?`Scoped observation only: ${row.scopeLimit}`:row.reason??row.scopeLimit}))
}
