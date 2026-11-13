import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {Beef,Transaction,Utils} from './source/synthesis/node_modules/@bsv/sdk/dist/esm/mod.js'
import {observedSubmissionTransactions} from './source/synthesis/src/wallet-lab/native/verify-transaction-state-bindings.ts'
import {verifyNativeTransactionCoverage} from './source/synthesis/src/wallet-lab/native/coverage-transactions-verifier.ts'
const home=path.dirname(new URL(import.meta.url).pathname),read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8')),sha=(x:any)=>createHash('sha256').update(x).digest('hex')
const out:any={schema:'tpnil-native6-controlled-ancestry-diagnosis@1',claim:'PROSPECTIVE_GRAPH_COMPLETENESS_DIAGNOSTIC_ONLY',source:'1f9fe0f9b979e9bbca66e90335f02ba2b80c7d41',qualifiedEnvironment:false,repetitions:[]}
for(let rep=1;rep<=2;rep++){
 const folder=path.join(home,'replay',`repetition-${rep}`),e=path.join(folder,'evidence'),fixture=read(path.join(e,'mined-funding-source.json')).fixture,txs=new Map<string,any>(),add=(tx:any,depth=0)=>{assert.ok(depth<32);const id=tx.id('hex');if(txs.has(id)){assert.equal(txs.get(id).toHex(),tx.toHex());return}txs.set(id,tx);for(const input of tx.inputs)if(input.sourceTransaction)add(input.sourceTransaction,depth+1)}
 add(Transaction.fromAtomicBEEF([...fs.readFileSync(path.join(e,'funding.atomicbeef'))]));for(const p of read(path.join(e,'conformance/funding-reserves.json')).payments)add(Transaction.fromAtomicBEEF(p.beef))
 const record=read(path.join(folder,'record.json'));add(Transaction.fromAtomicBEEF(Beef.fromBinary([...fs.readFileSync(path.join(e,'create.beef'))]).toBinaryAtomic(record.observations.createTxid)))
 const storage=read(path.join(e,'native-transactions.json')),storageMap=new Map(storage.map((r:any)=>[r.txid,r.rawTxHex]));for(const r of storage)add(Transaction.fromHex(r.rawTxHex));const before=txs.size
 const filename=path.join(e,'conformance/coverage-transactions.json'),coverage=read(filename),checked=await verifyNativeTransactionCoverage(coverage),controls:any[]=[]
 const tracker={currentHeight:async()=>fixture.fundingHeight+fixture.maturityDepth,isValidRootForHeight:async(root:string,height:number)=>root===fixture.merkleRoot&&height===fixture.fundingHeight}
 for(const mode of ['unknown','conflicting','wrong-root']){
  const call=coverage.trace.find((r:any)=>r.id===`proof-${mode}-control`);assert.equal(call.method,'internalizeAction');assert.equal(call.actor,'wallet');assert.equal(call.error,undefined);assert.equal(call.result.accepted,true)
  const reader=new Utils.Reader(call.args.tx),graph=Beef.fromReader(reader);assert.ok(reader.eof()&&reader.pos===call.args.tx.length);const tx=Transaction.fromAtomicBEEF(call.args.tx);assert.equal(graph.atomicTxid,tx.id('hex'));assert.equal(tx.toHex(),storageMap.get(tx.id('hex')))
  assert.equal(graph.findTxid(fixture.txid)?.tx?.toHex(),fixture.rawHex);assert.ok(await graph.verify(tracker,false));assert.ok(await tx.verify(tracker));const parent=tx.inputs[0].sourceTransaction;assert.ok(parent);assert.equal(parent.inputs[0].sourceTXID,coverage.trace.find((r:any)=>r.id==='proof-parent').result.txid)
  controls.push({callId:call.id,txid:tx.id('hex'),bridge:parent.id('hex'),proofParent:parent.inputs[0].sourceTXID,publicBEEFSha256:sha(Buffer.from(call.args.tx)),matchesIndependentStoredTarget:true,allBumpsAndScriptsVerified:true});add(tx)
  // add() retains the already stored target; therefore separately import its
  // proven ancestors after overlap-byte validation, preserving original bodies.
  for(const input of tx.inputs)if(input.sourceTransaction)add(input.sourceTransaction)
 }
 for(const tx of txs.values())for(const input of tx.inputs)if(!input.sourceTransaction)input.sourceTransaction=txs.get(input.sourceTXID)
 const final=read(path.join(folder,'shutdown-submissions.json'));for(const row of final.submissions)observedSubmissionTransactions(row,{resolvedTransactions:txs,requireResolvedAncestors:true,trustedMinedRoot:fixture})
 out.repetitions.push({rep,rawCoverageReportSha256:sha(fs.readFileSync(filename)),coveragePredicates:checked.assertions.length,originalFailuresPreserved:coverage.assertions.filter((r:any)=>r.result==='FAIL').map((r:any)=>r.id),controls,originalParentMapSize:before,augmentedMapSize:txs.size,finalSubmissionCount:final.submissions.length,allFinalAncestryResolvedWithIndependentExactControlProofs:true})
}
fs.writeFileSync(path.join(home,'control-ancestry-diagnosis.json'),JSON.stringify(out,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(out,null,2))
