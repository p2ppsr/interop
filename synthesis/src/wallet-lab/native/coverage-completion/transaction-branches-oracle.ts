// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import { Beef, Transaction, Utils } from '@bsv/sdk'
import { bounds, missingNativeParent, rows, type Source } from './transaction-branches-model.js'
export class FixtureBlocked extends Error {}
const equal = (a:any,b:any)=>assert.deepEqual(a,b)
export function strictBeef(bytes:any) {
 assert.ok(Array.isArray(bytes)&&bytes.length>0)
 for(let i=0;i<bytes.length;i++)assert.ok(Object.hasOwn(bytes,i)&&Number.isInteger(bytes[i])&&bytes[i]>=0&&bytes[i]<=255)
 const r=new Utils.Reader(bytes),b=Beef.fromReader(r);assert.equal(r.eof(),true);assert.equal(r.pos,bytes.length,'Truncated BEEF reader overrun');return b
}
/** Check the entire supplied graph before selecting or normalizing its target.
 * SDK graph verification alone ignores unmarked/unreferenced BUMP leaves. */
export async function verifyTransactionBranchProof(bytes: unknown, tracker: { currentHeight(): Promise<number>; isValidRootForHeight(root: string, height: number): Promise<boolean> }, options: {
 knownRoot?: string; independent?: ReadonlyMap<string, Transaction>; unsignedTarget?: string
} = {}) {
 const graph = strictBeef(bytes)
 assert.ok(graph.atomicTxid, 'An exact Atomic BEEF target is required')
 assert.equal(new Set(graph.txs.map(entry => entry.txid)).size, graph.txs.length, 'Duplicate transaction entries')
 for (const bump of graph.bumps) {
  const leaves = bump.path[0]?.filter(leaf => typeof leaf.hash === 'string') ?? []
  assert.ok(leaves.length > 0, 'Supplied BUMP has no hashed bottom leaf')
  for (const leaf of leaves) {
   assert.match(leaf.hash!, /^[0-9a-f]{64}$/)
   assert.ok(await tracker.isValidRootForHeight(bump.computeRoot(leaf.hash!), bump.blockHeight), 'Every supplied BUMP must match the admitted mined chain')
  }
 }
 for (const entry of graph.txs) {
  assert.match(entry.txid, /^[0-9a-f]{64}$/)
  assert.ok(!entry.isTxidOnly || entry.txid === options.knownRoot, 'Undeclared txid-only proof root')
  if (entry.bumpIndex !== undefined) {
   assert.ok(Number.isSafeInteger(entry.bumpIndex) && entry.bumpIndex >= 0 && entry.bumpIndex < graph.bumps.length, 'Invalid explicit BUMP index')
   const bump = graph.bumps[entry.bumpIndex]!
   assert.ok(bump.path[0]?.some(leaf => leaf.hash === entry.txid), 'Explicit BUMP does not contain its transaction')
   assert.ok(await tracker.isValidRootForHeight(bump.computeRoot(entry.txid), bump.blockHeight), 'Explicit BUMP association is false')
  }
  if (entry.tx) {
   assert.equal(entry.tx.id('hex'), entry.txid)
   if (options.independent && entry.txid !== options.unsignedTarget) assert.equal(entry.tx.toHex(), options.independent.get(entry.txid)?.toHex(), 'Public graph body differs from independently retained transaction')
  }
 }
 if (options.knownRoot) {
  assert.ok(options.independent?.has(options.knownRoot), 'Caller-known root needs independent full proof')
  assert.ok(await options.independent!.get(options.knownRoot)!.verify(tracker))
  // Validate all original entries and supplied BUMPs before this narrow change.
  graph.makeTxidOnly(options.knownRoot)
 }
 if (options.unsignedTarget) {
  assert.equal(graph.atomicTxid, options.unsignedTarget)
  assert.ok(options.independent, 'Partial staging requires independent ancestors')
  const target = graph.findTxid(options.unsignedTarget)?.tx; assert.ok(target)
  for (const input of target.inputs) {
   const source = options.independent.get(input.sourceTXID ?? input.sourceTransaction?.id('hex') ?? '')
   assert.ok(source && source.outputs[input.sourceOutputIndex], 'Unsigned target input lacks independently retained source')
   assert.ok(await source.verify(tracker))
  }
 } else assert.ok(await graph.verify(tracker, options.knownRoot !== undefined), 'Supplied graph is not structurally complete')
 for (const entry of graph.txs) {
  if (entry.isTxidOnly || entry.txid === options.unsignedTarget) continue
  const tx = options.knownRoot || options.unsignedTarget ? options.independent?.get(entry.txid) : graph.findAtomicTransaction(entry.txid)
  assert.ok(tx && await tx.verify(tracker), 'Every supplied raw transaction requires valid scripts and mined ancestry')
 }
 return graph
}
export function noSendSignPair(omitted:any,explicit:any) {
 assert.equal(Object.hasOwn(omitted.options??{},'noSend'),false)
 assert.equal(explicit.options?.noSend,false)
 assert.equal(Object.hasOwn(explicit.options??{},'noSendChange'),false)
 assert.equal(Object.hasOwn(omitted.options??{},'noSendChange'),false)
 const normalize=(x:any)=>{const c=structuredClone(x);delete c.reference;if(c.options){delete c.options.noSend;if(!Object.keys(c.options).length)delete c.options};return c}
 equal(normalize(omitted),normalize(explicit));assert.ok(omitted.reference&&explicit.reference&&omitted.reference!==explicit.reference)
}
export function trustedInputOptions(args:any,known:boolean,sourceTxid:string) {
 assert.equal(args.options?.trustSelf,'known')
 if(known)assert.equal(Object.hasOwn(args.options,'knownTxids'),false)
 else equal(args.options.knownTxids,[sourceTxid])
}
export function truncatedInternalize(full:any,truncated:any) {
 for(const args of [full,truncated]){assert.equal(Object.hasOwn(args,'options'),false);assert.equal(Object.hasOwn(args,'trustSelf'),false);assert.equal(Object.hasOwn(args,'knownTxids'),false)}
 strictBeef(full.tx)
 assert.ok(Array.isArray(truncated.tx)&&truncated.tx.length>0&&truncated.tx.length<full.tx.length)
 equal(truncated.tx,full.tx.slice(0,truncated.tx.length))
 const without=(x:any)=>{const c=structuredClone(x);delete c.tx;return c};equal(without(full),without(truncated))
 assert.throws(()=>strictBeef(truncated.tx),'Truncated bytes must actually be malformed')
}
export function returnedChange(result:any,actualManagedChange:string[]) {
 assert.equal(new Set(actualManagedChange).size,actualManagedChange.length)
 if(actualManagedChange.length===0){assert.ok(result.noSendChange===undefined||(Array.isArray(result.noSendChange)&&result.noSendChange.length===0));return}
 assert.ok(Array.isArray(result.noSendChange));equal([...result.noSendChange].sort(),[...actualManagedChange].sort());assert.equal(new Set(result.noSendChange).size,result.noSendChange.length)
}
function sourceMap(sources:Source[]) {
 const m=new Map<string,Source>();let total=0
 for(const s of sources){assert.ok(Number.isSafeInteger(s.satoshis)&&s.satoshis>0);assert.ok(!m.has(s.outpoint));const t=Transaction.fromHex(s.rawTxHex);assert.equal(t.toHex(),s.rawTxHex);const [id,index]=s.outpoint.split('.');assert.equal(t.id('hex'),id);assert.match(index!,/^(0|[1-9][0-9]*)$/);const o=t.outputs[Number(index)];assert.ok(o);assert.equal(o.satoshis,s.satoshis);assert.equal(o.lockingScript.toHex(),s.lockingScript);m.set(s.outpoint,s);total+=s.satoshis}
 assert.ok(Number.isSafeInteger(total)&&total<=bounds.ownedValueCeiling);return{m,total}
}
export function requiredFullSetPayment(sources:Source[],required:string[]) {
 const {m,total}=sourceMap(sources);assert.ok(required.length>=2);assert.equal(new Set(required).size,required.length)
 const min=Math.min(...required.map(id=>{assert.ok(m.has(id));return m.get(id)!.satoshis}))
 if(min<=1)throw new FixtureBlocked('No positive independently bounded fee headroom')
 return {payment:total-min+1,maximumRemainingFeeAndChange:min-1,total}
}
export function proveFullSetConsumption(sources:Source[],required:string[],signed:Transaction,paymentIndex:number,expectedPaymentScript:string) {
 const {m,total}=sourceMap(sources),chosen=requiredFullSetPayment(sources,required)
 const p=signed.outputs[paymentIndex];assert.ok(p);assert.equal(p.lockingScript.toHex(),expectedPaymentScript);assert.equal(p.satoshis,chosen.payment)
 const inputs=signed.inputs.map(i=>`${i.sourceTXID??i.sourceTransaction?.id('hex')}.${i.sourceOutputIndex}`);assert.equal(new Set(inputs).size,inputs.length)
 for(const id of inputs)assert.ok(m.has(id),'Hidden or undeclared funding input')
 for(const id of required){assert.ok(inputs.includes(id));assert.ok(p.satoshis!>total-m.get(id)!.satoshis,'Supplied source was not independently necessary')}
 const inputValue=inputs.reduce((n,id)=>n+m.get(id)!.satoshis,0),outputValue=signed.outputs.reduce((n,o)=>n+(o.satoshis??NaN),0),fee=inputValue-outputValue
 assert.ok(Number.isSafeInteger(fee)&&fee>=0&&fee<=bounds.feeBudget);return{fee,inputValue,outputValue,payment:p.satoshis}
}
export function unsignedToSigned(unsigned:Transaction,signed:Transaction,unsignedPoint:string,signedPoint:string) {
 assert.notEqual(unsigned.id('hex'),signed.id('hex'),'Fixture did not change TXID')
 equal([unsigned.version,unsigned.lockTime],[signed.version,signed.lockTime])
 const ins=(t:Transaction)=>t.inputs.map(i=>[i.sourceTXID??i.sourceTransaction?.id('hex'),i.sourceOutputIndex,i.sequence]);equal(ins(unsigned),ins(signed))
 equal(unsigned.outputs.map(o=>[o.satoshis,o.lockingScript.toHex()]),signed.outputs.map(o=>[o.satoshis,o.lockingScript.toHex()]))
 const [a,index]=unsignedPoint.split('.'),[b,index2]=signedPoint.split('.');assert.equal(a,unsigned.id('hex'));assert.equal(b,signed.id('hex'));assert.equal(index,index2);assert.ok(signed.outputs[Number(index)])
}
export function demandUndisclosedSource(e:any,txid:string) {
 if(!e?.independentlyComplete||!e.wholeNativeBackendCaches||!e.separateOwnedFunder||!e.heldNonPublished||!e.nativeRoutesComplete||!e.fullParentRegistryJoined)throw new FixtureBlocked('Whole-backend/cache/route non-disclosure evidence absent; owner-filtered snapshots are insufficient')
 assert.notEqual(e.nativeProviderIdentity,e.funderProviderIdentity)
 assert.ok(!e.nativeKnownTxids.includes(txid)&&!e.nativeCachedTxids.includes(txid)&&!e.disseminatedTxids.includes(txid))
 // These fields require an independent parent capture; this helper cannot admit
 // their producer or turn them into a native verdict by itself.
}
export async function evaluatePrototype(checks:Partial<Record<typeof rows[number],()=>Promise<void>|void>>) {
 const outcomes=[]
 for(const id of rows){try{if(!checks[id])throw new FixtureBlocked('Public fixture/program not implemented');await checks[id]!();outcomes.push({id,result:'BLOCKED',localChecks:'SATISFIED',detail:missingNativeParent})}catch(e){outcomes.push({id,result:e instanceof FixtureBlocked?'BLOCKED':'FAIL',localChecks:e instanceof FixtureBlocked?'UNAVAILABLE':'REJECTED',detail:e instanceof Error?e.message:String(e)})}}
 return{claim:'ENGINEERING_OBSERVATION_ONLY',acceptedNativeAssertions:0,outcomes}
}
