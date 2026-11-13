import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire}from'node:module';import{createHash}from'node:crypto';
const root=fs.realpathSync(process.cwd()),require=createRequire(path.join(root,'synthesis/package.json')),{Beef}=require('@bsv/sdk'),base=path.join(root,'out/native-review-43216478235'),location=JSON.parse(fs.readFileSync(path.join(base,'original-location.json'))),sha=b=>createHash('sha256').update(b).digest('hex'),results=[];
for(const repetition of[1,2]){
 const folder=path.join(location.originalDirectory,`repetition-${repetition}/evidence`),reportBytes=fs.readFileSync(path.join(folder,'conformance/coverage-transactions.json')),report=JSON.parse(reportBytes),globalBytes=fs.readFileSync(path.join(folder,'native-submissions.json')),global=JSON.parse(globalBytes),ledger=[...report.submissionPrefix,...report.submissions];
 const fields=r=>({beefHex:r.beefHex,txid:r.txid,verdict:r.verdict});assert.deepEqual(ledger.map(fields),global.slice(0,ledger.length).map(fields));
 const calls=new Map(report.trace.map((r,i)=>[r.id,{...r,traceIndex:i}])),heldIds=['held-a','held-b','held-child'].map(id=>calls.get(id).result.txid),windows=[];
 for(const name of['held-b','held-child']){
  const call=calls.get(name);assert.equal(call.args.options.noSend,true);const entries=[];
  for(let i=call.submissionStart;i<call.submissionEnd;i++){
   const entry=ledger[i];assert.equal(entry.verdict,'ACCEPTED_BY_NETWORK');const prior=report.trace.find(r=>r.result?.txid===entry.txid);assert.ok(prior);assert.ok(['default-create-omitted','default-sign-omitted','default-create-true','default-sign-true'].includes(prior.id));assert.ok(calls.get(prior.id).traceIndex<call.traceIndex);
   const returned=Beef.fromBinary(prior.result.tx).findTxid(entry.txid)?.tx,wire=Beef.fromBinary([...Buffer.from(entry.beefHex,'hex')]),submitted=wire.findTxid(entry.txid)?.tx;assert.ok(returned&&submitted);assert.equal(returned.id('hex'),entry.txid);assert.equal(submitted.toHex(),returned.toHex());assert.ok(report.storageTransactions.some(r=>r.txid===entry.txid&&r.rawTxHex===submitted.toHex()));assert.ok(wire.txs.every(r=>!heldIds.includes(r.txid)));
   entries.push({index:i,txid:entry.txid,earlierCall:prior.id,earlierCallTraceIndex:calls.get(prior.id).traceIndex,earlierCallWindow:[prior.submissionStart,prior.submissionEnd],rawTxSha256:sha(Buffer.from(submitted.toHex(),'hex')),beefMembers:wire.txs.length,containsAnyHeldTransaction:false});
  }
  windows.push({id:name,traceIndex:call.traceIndex,heldTxid:call.result.txid,window:[call.submissionStart,call.submissionEnd],entries});
 }
 const holds=[];
 for(const[name,releaseName]of[['held-a','held-release'],['held-child','held-release'],['held-b','batch-sign']]){
  const held=calls.get(name),release=calls.get(releaseName);assert.ok(release.args.options.sendWith.includes(held.result.txid));
  for(let i=held.submissionStart;i<release.submissionStart;i++)assert.ok(Beef.fromBinary([...Buffer.from(ledger[i].beefHex,'hex')]).txs.every(t=>t.txid!==held.result.txid));
  const explicit=ledger.slice(release.submissionStart,release.submissionEnd).filter(r=>r.txid===held.result.txid);assert.equal(explicit.length,1);assert.equal(explicit[0].verdict,'ACCEPTED_BY_NETWORK');holds.push({id:name,txid:held.result.txid,release:releaseName,releaseWindow:[release.submissionStart,release.submissionEnd],absentBeforeRelease:true,exactAcceptedTargetInReleaseWindow:true});
 }
 results.push({repetition,originalReportSha256:sha(reportBytes),globalLedgerSha256:sha(globalBytes),reportLedgerMatchesGlobalPrefix:true,originalFailures:report.assertions.filter(x=>x.result==='FAIL'),windows,holds});
}
const receipt={schema:'tpnil-native-nosend-independent-diagnosis@1',claim:'DIAGNOSIS_ONLY_NO_NATIVE_ADMISSION_OR_REINTERPRETATION',source:'1f9fe0f9b979e9bbca66e90335f02ba2b80c7d41',run:43216478235,zipSha256:location.zipSha256,results,conclusion:'Both noSend windows contain only exact earlier delayed default-control transactions; held transaction bodies are absent from these BEEFs and appear only at their named release boundaries. Oracle2 absolute global-length checks conflate unrelated asynchronous delivery with held submission.',signatureAndWholeParentAdmission:'Separate frozen semantic replay remains failed at missing final-ancestry parent binding; this byte-level diagnosis is not admission.'};const p=path.join(base,'nosend-diagnosis.json');assert.ok(!fs.existsSync(p));fs.writeFileSync(p,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({verified:true,repetitions:results.length,originalFailuresPerRepetition:results.map(r=>r.originalFailures.length),receiptSha256:sha(fs.readFileSync(p))}));
