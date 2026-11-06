import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const root = path.resolve(import.meta.dirname, '..')
const require = createRequire(path.join(root, 'components/transport/package.json'))
const { PrivateKey, PublicKey, Signature, Transaction } = require('@bsv/sdk')
export const corpusSources = ['scripts/rust-corpus.mjs', 'components/rust/vectors.json', 'components/rust/Cargo.toml', 'components/rust/Cargo.lock', 'components/rust/src/main.rs', 'fixtures/teranode/wab-funding-v1.json', 'components/transport/package-lock.json']
/** The same predicates evaluate fresh and replayed observations. Calls must stay
 * ordered and exhaustive; input identities are bound separately by the caller. */
export function evaluateRustCorpus(rust, inputReports) {
const assertions = []
function check(id, fn) {
  try { const detail=fn(); assertions.push({id,result:'PASS',detail:detail??'Expected outcome observed'}) }
  catch(e) { assertions.push({id,result:'FAIL',detail:e.message}) }
}
const vectors=JSON.parse(fs.readFileSync(path.join(root,'components/rust/vectors.json'),'utf8'))
for(const item of vectors.cases) check(item.id,()=> {
  const observed=rust(item.request)
  if(item.expectedError) assert.equal(observed.ok,false)
  else { assert.equal(observed.ok,true); assert.deepEqual(observed.result,item.expected) }
})
const one='00'.repeat(31)+'01', message=Buffer.from('TPNIL cross-language certificate/signature boundary')
const rustSignature=rust({op:'key',privateKey:one,message:message.toString('hex')})
check('secp256k1-generator',()=>assert.equal(rustSignature.result.publicKey,'0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'))
check('rust-signature-typescript-verification',()=>assert.equal(PublicKey.fromString(rustSignature.result.publicKey).verify([...message],Signature.fromDER(rustSignature.result.signature,'hex')),true))
const tsKey=PrivateKey.fromHex('42'.repeat(32)),signature=tsKey.sign([...message]).toDER('hex')
check('typescript-signature-rust-verification',()=>assert.equal(rust({op:'signature',publicKey:tsKey.toPublicKey().toString(),signature,message:message.toString('hex')}).result.valid,true))
check('modified-signature-message-rejected',()=>assert.equal(rust({op:'signature',publicKey:tsKey.toPublicKey().toString(),signature,message:'00'}).result.valid,false))
check('brc42-derived-key',()=>{
  const peer=PrivateKey.fromHex('43'.repeat(32)).toPublicKey(),invoice='2-tpnil-cross-language-1'
  assert.equal(rust({op:'derive',privateKey:tsKey.toHex(),counterparty:peer.toString(),invoice}).result.publicKey,tsKey.deriveChild(peer,invoice).toPublicKey().toString())
})
const funding=JSON.parse(fs.readFileSync(path.join(root,'fixtures/teranode/wab-funding-v1.json'),'utf8'))
check('mined-transaction-serialization',()=>assert.deepEqual(rust({op:'transaction',hex:funding.rawHex}).result,{txid:funding.txid,hex:funding.rawHex,outputs:1}))
check('mined-atomic-beef-and-merkle-root',()=> {
  const result=rust({op:'beef',hex:funding.atomicBeefHex,txid:funding.txid})
  assert.equal(result.ok,true); assert.equal(result.result.valid,true); assert.equal(result.result.atomic,true); assert.equal(result.result.root,funding.merkleRoot)
})
check('strict-beef-trailing-bytes',()=>assert.equal(rust({op:'beef',hex:funding.atomicBeefHex+'00',txid:funding.txid}).ok,false))
for (const report of inputReports) {
  if(['tpnil-rust-certificate-vectors@1', 'tpnil-rust-certificate-vectors@2'].includes(report.schema)) {
    for(const vector of report.cases) check(`certificate-${vector.id}`,()=>{ const observed=rust(vector.request); assert.equal(observed.ok,true); assert.deepEqual(observed.result,vector.expected) })
    continue
  }
  const rows=(Array.isArray(report)?report:report.transactions).map(tx=>({txid:tx.txid,rawHex:tx.rawHex??tx.raw,beefHex:tx.beefHex??Buffer.from(tx.beef).toString('hex')}))
  const payments=[...new Map(rows.map(tx=>[tx.txid,tx])).values()]
  for(const tx of payments) {
    check(`joined-payment-${tx.txid}-serialization`,()=>assert.equal(rust({op:'transaction',hex:tx.rawHex}).result.txid,tx.txid))
    check(`joined-payment-${tx.txid}-scripts-and-value`,()=> {
      const result=rust({op:'spends',hex:tx.beefHex,merkleRoot:funding.merkleRoot,height:funding.fundingHeight}); assert.equal(result.ok,true,JSON.stringify(result)); assert.equal(result.result.valid,true,JSON.stringify(result)); assert.equal(result.result.anchoredGraphValid,true); return result.result
    })
    check(`joined-payment-${tx.txid}-modified-output`,()=> {
      const subject=Transaction.fromBEEF([...Buffer.from(tx.beefHex,'hex')])
      subject.outputs[0].satoshis += 1
      // Rebuild the entire Atomic BEEF subject so the negative case reaches script verification.
      const mutated=subject.toAtomicBEEF()
      const result=rust({op:'spends',hex:Buffer.from(mutated).toString('hex'),merkleRoot:funding.merkleRoot,height:funding.fundingHeight})
      assert.equal(result.ok,true,JSON.stringify(result)); assert.equal(result.result.valid,false)
    })
  }
}
return { assertions, outcome: assertions.every(item => item.result === 'PASS') ? 'PASS' : 'FAIL' }
}
