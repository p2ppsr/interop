// SPDX-License-Identifier: Apache-2.0
import {expect,it} from 'vitest'
import {LockingScript,Transaction,UnlockingScript} from '@bsv/sdk'
import {nativeProofResources,withNativeProofResources} from '../src/wallet-lab/native/proof-resources.js'
import {observedSubmissionTransactions} from '../src/wallet-lab/native/verify-transaction-state-bindings.js'

// LAB_SELF_TEST_ONLY: these synthetic OP_TRUE transactions test bounded graph
// traversal. They do not establish mined funding or native wallet conformance.
function chain(edges:number) {
  const root=new Transaction(),graph=new Map<string,Transaction>()
  root.addOutput({satoshis:1,lockingScript:LockingScript.fromHex('51')});graph.set(root.id('hex'),root)
  let target=root
  for(let i=0;i<edges;i++) {
    const tx=new Transaction();tx.addInput({sourceTransaction:target,sourceOutputIndex:0,unlockingScript:UnlockingScript.fromHex('')})
    tx.addOutput({satoshis:1,lockingScript:LockingScript.fromHex('51')});graph.set(tx.id('hex'),tx);target=tx
  }
  return {root,target,graph,entry:{txid:target.id('hex'),beefHex:target.toHex(),verdict:'ACCEPTED_BY_NETWORK'},
    options:{resolvedTransactions:graph,requireResolvedAncestors:true,trustedMinedRoot:{txid:root.id('hex'),rawHex:root.toHex()}}}
}
it('retains legacy depth32 and explicitly admits the full depth35 graph under4.8',()=>{
  const value=chain(35)
  expect(()=>observedSubmissionTransactions(value.entry,value.options)).toThrow(/depth/)
  expect(withNativeProofResources('ITCVE-1@4.8.0',()=>observedSubmissionTransactions(value.entry,value.options))).toHaveLength(36)
  expect(nativeProofResources().maximumProofDepth).toBe(32)
})
it('retains exact resource boundaries and rejects an absent independent ancestor',()=>{
  for(const[profile,limit]of[['ITCVE-1@4.7.0',32],['ITCVE-1@4.8.0',128]]as const) {
    const before=chain(limit-1),over=chain(limit)
    expect(withNativeProofResources(profile,()=>observedSubmissionTransactions(before.entry,before.options))).toHaveLength(limit)
    expect(()=>withNativeProofResources(profile,()=>observedSubmissionTransactions(over.entry,over.options))).toThrow(/depth/)
  }
  const value=chain(35),broken=new Map([...value.graph].map(([id,tx])=>[id,Transaction.fromHex(tx.toHex())])),parent=value.target.inputs[0]!.sourceTXID??value.target.inputs[0]!.sourceTransaction!.id('hex')
  broken.delete(parent)
  expect(()=>withNativeProofResources('ITCVE-1@4.8.0',()=>observedSubmissionTransactions(value.entry,{...value.options,resolvedTransactions:broken}))).toThrow()
})
it('isolates concurrent scopes and restores admission after a thrown verifier',async()=>{
  const values=await Promise.all([32,128].map((depth,index)=>withNativeProofResources(index?'ITCVE-1@4.8.0':'ITCVE-1@4.7.0',async()=>{
    await Promise.resolve();expect(nativeProofResources().maximumProofDepth).toBe(depth);return depth
  })))
  expect(values).toEqual([32,128])
  expect(()=>withNativeProofResources('ITCVE-1@4.8.0',()=>{throw Error('seeded failure')})).toThrow()
  expect(nativeProofResources().maximumProofDepth).toBe(32)
})
