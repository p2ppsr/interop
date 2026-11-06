import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
const root=path.resolve(import.meta.dirname,'..'),directory=path.resolve(process.argv[2])
const require=createRequire(path.join(root,'components/transport/package.json'))
const {Transaction}=require('@bsv/sdk')
const read=name=>JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'))
const result=read('result.json'),relay=read('relay.json'),paid=read('paid-http.json')
assert.equal(result.schema,'tpnil-component-result@1');assert.ok(!result.executionError)
const profile=JSON.parse(fs.readFileSync(path.join(root,'components/transport/profile.json'),'utf8'))
assert.deepEqual(result.assertions.map(x=>x.id).sort(),[...profile.assertions].sort())
assert.deepEqual([...relay.assertions,...paid.assertions],result.assertions)
for(const item of result.evidence) assert.equal(createHash('sha256').update(fs.readFileSync(path.join(directory,item.path))).digest('hex'),item.sha256)
assert.ok(Object.values(result.cleanup).every(x=>x===true))
assert.ok(relay.cleanup.httpClosed&&relay.cleanup.websocketRelayDestroyed)
assert.ok(paid.cleanup.httpClosed&&paid.cleanup.replayStoreClosed)
assert.match(relay.controls.origin.error,/allow/i)
assert.ok(relay.controls.tamper.error);assert.notEqual(relay.controls.tamper.original.topic,relay.controls.tamper.alteredTopic)
assert.equal(relay.controls.desktopToken.before,relay.controls.desktopToken.after)
assert.equal(relay.controls.permission.before,relay.controls.permission.after);assert.equal(relay.controls.permission.approvals,1)
assert.ok(relay.controls.reconnect.after>relay.controls.reconnect.before)
const signature=relay.trace.find(x=>x.method==='createSignature')
assert.equal(signature.body.error.code,4001)
const encryption=relay.trace.find(x=>x.method==='encrypt'),decryption=relay.trace.find(x=>x.method==='decrypt')
assert.ok(encryption.body.result.ciphertext.length>256)
assert.deepEqual(decryption.body.result.plaintext,Array.from({length:256},(_,i)=>i))
assert.ok(relay.trace.filter(x=>x.method==='getPublicKey'&&x.status===200).length>=2)
assert.ok(relay.trace.filter(x=>x.method==='getPublicKey'&&x.status!==200).length>=2)
const events=paid.httpEvents
assert.equal(events.length,9)
assert.deepEqual(events.map(x=>x.status===200),[false,false,false,true,false,false,false,true,false])
assert.equal(events[0].status,402);assert.equal(events[1].status,402);assert.equal(events[2].status,402);assert.equal(events[8].status,402)
assert.equal(paid.delivered,2)
const successful=[]
for(const event of events.filter(x=>x.status===200)) {
  const tx=Transaction.fromBEEF([...Buffer.from(event.headers['x-bsv-beef'],'base64')])
  assert.equal(tx.outputs[Number(event.headers['x-bsv-vout'])].satoshis,7)
  assert.ok(paid.recipientActions.actions.some(x=>x.txid===tx.id('hex')))
  successful.push(tx.id('hex'))
}
assert.equal(new Set(successful).size,2)
assert.equal(paid.recipientOutputs.outputs.reduce((n,o)=>n+o.satoshis,0),14)
const fixture=JSON.parse(fs.readFileSync(path.join(root,profile.fundingFixture),'utf8'))
const tracker={currentHeight:async()=>900100,isValidRootForHeight:async(r,h)=>r===fixture.merkleRoot&&h===fixture.fundingHeight}
for(const payment of paid.transactions) {
  const tx=Transaction.fromBEEF([...Buffer.from(payment.beefHex,'hex')])
  assert.equal(tx.id('hex'),payment.txid);assert.equal(tx.toHex(),payment.rawHex)
  assert.equal(await tx.verify(tracker),true)
}
console.log(JSON.stringify({verified:true,assertions:result.assertions.length,paidTransactions:successful}))
