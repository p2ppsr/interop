// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import { OverlayAdminTokenTemplate, ProtoWallet, PushDrop, Transaction, Utils, VerifiableCertificate } from '@bsv/sdk'

/** Prospective fixture2 only: independent public identity token verification.
 * This does not trust publication success, topic admission or a wallet's verdict. */
export async function verifyIdentityPublication(publication: any, certificate: any, identity: string, tracker: any) {
  const tx = Transaction.fromAtomicBEEF(publication.beef)
  assert.equal(tx.id('hex'), publication.txid); assert.equal(tx.toHex(), publication.raw); assert.ok(await tx.verify(tracker))
  const matches = publication.answer.outputs.filter((row: any) => row.outputIndex === 0 && Transaction.fromBEEF(row.beef).id('hex') === publication.txid)
  assert.equal(matches.length, 1); assert.equal(Transaction.fromBEEF(matches[0].beef).toHex(), tx.toHex())
  const script = tx.outputs[0]!.lockingScript, decoded = PushDrop.decode(script), chunks = script.chunks
  assert.equal(tx.outputs[0]!.satoshis, 1); assert.equal(decoded.fields.length, 2); assert.equal(chunks.length, 5)
  const opcode = (bytes: number[]) => bytes.length <= 75 ? bytes.length : bytes.length <= 255 ? 76 : bytes.length <= 65535 ? 77 : 78
  assert.equal(chunks[0]!.op, 33); assert.equal(chunks[1]!.op, 172); assert.equal(chunks[2]!.op, opcode(decoded.fields[0]!)); assert.equal(chunks[3]!.op, opcode(decoded.fields[1]!)); assert.equal(chunks[4]!.op, 109)
  const value = JSON.parse(Utils.toUTF8(decoded.fields[0]!)), anyone = new ProtoWallet('anyone')
  assert.equal(value.subject, identity)
  for (const key of ['type', 'serialNumber', 'subject', 'certifier', 'revocationOutpoint', 'fields', 'signature']) assert.deepEqual(value[key], certificate[key])
  const publicKey = (await anyone.getPublicKey({ protocolID: [1, 'identity'], keyID: '1', counterparty: identity })).publicKey
  assert.equal(decoded.lockingPublicKey.toString(), publicKey, 'Identity publication must lock to the certificate subject-derived key')
  assert.equal((await anyone.verifySignature({ data: decoded.fields[0]!, signature: decoded.fields[1]!, protocolID: [1, 'identity'], keyID: '1', counterparty: identity })).valid, true)
  assert.deepEqual(Object.keys(value.keyring), ['name'])
  const disclosed = VerifiableCertificate.fromCertificate(value, value.keyring)
  assert.equal(await disclosed.verify(), true); assert.deepEqual(await disclosed.decryptFields(anyone), { name: 'TPNIL boundary identity' })
  assert.equal(tx.outputs[1]!.satoshis, 1)
  const advertisement = OverlayAdminTokenTemplate.decode(tx.outputs[1]!.lockingScript)
  assert.deepEqual(advertisement, { protocol: 'SLAP', identityKey: identity, domain: 'https://overlay.itcve.test', topicOrService: 'ls_identity' })
  const slap = PushDrop.decode(tx.outputs[1]!.lockingScript)
  assert.equal(slap.fields.length, 5)
  assert.equal((await anyone.verifySignature({ data: slap.fields.slice(0, -1).flat(), signature: slap.fields.at(-1)!, protocolID: [2, 'service lookup availability'], keyID: '1', counterparty: identity })).valid, true)
  return { verified: true as const, txid: publication.txid }
}
