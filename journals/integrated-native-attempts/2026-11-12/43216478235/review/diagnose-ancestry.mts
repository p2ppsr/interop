import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {Beef,Transaction,Utils} from './source/synthesis/node_modules/@bsv/sdk/dist/esm/mod.js'
import {observedSubmissionTransactions} from './source/synthesis/src/wallet-lab/native/verify-transaction-state-bindings.ts'
const home=path.dirname(new URL(import.meta.url).pathname),base=path.join(home,'replay'),read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8'))
const report:any={schema:'tpnil-native6-ancestry-diagnosis@1',claim:'READ_ONLY_DIAGNOSTIC_NOT_ADMISSION',source:'1f9fe0f9b979e9bbca66e90335f02ba2b80c7d41',repetitions:[]}
for(let rep=1;rep<=2;rep++){
 const folder=path.join(base,`repetition-${rep}`),e=path.join(folder,'evidence'),fixture=read(path.join(e,'mined-funding-source.json')).fixture,txs=new Map<string,any>(),origins=new Map<string,string[]>(),add=(tx:any,label:string,depth=0)=>{assert.ok(depth<32);const id=tx.id('hex');origins.set(id,[...(origins.get(id)??[]),label]);if(txs.has(id)){assert.equal(txs.get(id).toHex(),tx.toHex());return}txs.set(id,tx);for(const input of tx.inputs)if(input.sourceTransaction)add(input.sourceTransaction,label,depth+1)}
 add(Transaction.fromAtomicBEEF([...fs.readFileSync(path.join(e,'funding.atomicbeef'))]),'funding.atomicbeef')
 for(const p of read(path.join(e,'conformance/funding-reserves.json')).payments)add(Transaction.fromAtomicBEEF(p.beef),'funding-reserves')
 const record=read(path.join(folder,'record.json'));add(Transaction.fromAtomicBEEF(Beef.fromBinary([...fs.readFileSync(path.join(e,'create.beef'))]).toBinaryAtomic(record.observations.createTxid)),'create.beef')
 const storage=read(path.join(e,'native-transactions.json'));for(const r of storage)add(Transaction.fromHex(r.rawTxHex),'native-transactions')
 for(const tx of txs.values())for(const input of tx.inputs)if(!input.sourceTransaction)input.sourceTransaction=txs.get(input.sourceTXID)
 const final=read(path.join(folder,'shutdown-submissions.json')),findings:any[]=[]
 for(const [index,row]of final.submissions.entries()){
  try{observedSubmissionTransactions(row,{resolvedTransactions:txs,requireResolvedAncestors:true,trustedMinedRoot:fixture})}catch(error){
   let target:any;try{target=Transaction.fromAtomicBEEF(Utils.toArray(row.beefHex,'hex'))}catch{target=Transaction.fromHex(row.beefHex)}
   const missing:any[]=[],seen=new Set<string>();function walk(tx:any,chain:string[]=[]){const id=tx.id('hex');if(seen.has(id)||id===fixture.txid)return;seen.add(id);const resolved=txs.get(id);for(const [n,input]of tx.inputs.entries()){const sid=input.sourceTXID??input.sourceTransaction?.id('hex'),parent=input.sourceTransaction??txs.get(sid)??resolved?.inputs[n]?.sourceTransaction;if(parent)walk(parent,[...chain,id]);else missing.push({transaction:id,inputIndex:n,sourceTxid:sid,sourceOutputIndex:input.sourceOutputIndex,chain:[...chain,id],targetInParentMap:txs.has(row.txid),transactionOrigins:origins.get(id)??[]})}}
   walk(target);findings.push({index,txid:row.txid,verdict:row.verdict,provenance:final.provenance[index],error:String(error),missing})
  }
 }
 report.repetitions.push({rep,parentMapTransactions:txs.size,storageTransactions:storage.length,finalSubmissions:final.submissions.length,findings})
}
fs.writeFileSync(path.join(home,'ancestry-diagnosis.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2))
