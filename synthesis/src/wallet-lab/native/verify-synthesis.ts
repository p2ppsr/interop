import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Transaction, PrivateKey } from '@bsv/sdk'
import { decodeDeterministicCbor, LCHReader, objectId, toHex, validatePaymentReceipt, verifySignedObject, PublicBRC77Verifier } from '@bsv/lch'
import { boardProtocol, decodeAndVerifyBoardToken, type BoardFixtureVersion } from '../../board.js'
import { decodeAndVerifyUHRPAdvertisement } from '../../uhrp.js'
import { referenceImage } from '../../run.js'
import { sha256Hex } from '../../determinism.js'

export async function verifyNativeSynthesis(directory: string, integrated = false, walletIdentity?: string, fixtureVersion: BoardFixtureVersion = 'legacy-v1') {
  const read = async (name: string) => JSON.parse(await fs.readFile(path.join(directory, integrated ? (name === 'result' ? 'synthesis.json' : `synthesis-${name}.json`) : `${name}.json`), 'utf8'))
  const result = await read('result'), rows = await read('transactions'), lch = await read('lch'), events = await read('events')
  if (fixtureVersion === 'validated-v2') { assert.equal(result.fixtureVersion, fixtureVersion); assert.deepEqual(result.boardProtocol, boardProtocol(fixtureVersion)) }
  else assert.equal(result.fixtureVersion, undefined)
  assert.equal(result.schema, 'tpnil-native-synthesis@0.1.0')
  assert.equal(result.claim, 'ENGINEERING_OBSERVATION_ONLY')
  assert.equal(result.result, 'PASS')
  const criteria = ['NATIVE-SYNTHESIS-UHRP', 'NATIVE-SYNTHESIS-BOARD', 'NATIVE-SYNTHESIS-LCH', 'NATIVE-SYNTHESIS-REVISION']
  assert.deepEqual(result.assertions.map((a: any) => a.id).sort(), [...criteria].sort())
  for (const assertion of result.assertions) assert.equal(assertion.verdict, 'PASS')
  for (const name of ['overlay', 'replica']) assert.equal(result.cleanup.filter((item: any) => item.name === name && item.closed).length, 1)
  const fixture = JSON.parse(await fs.readFile(path.resolve(import.meta.dirname, '../../../../fixtures/teranode/wab-funding-v1.json'), 'utf8'))
  const tracker = { currentHeight: async () => fixture.fundingHeight + fixture.maturityDepth, isValidRootForHeight: async (root: string, height: number) => root === fixture.merkleRoot && height === fixture.fundingHeight }
  const roles = ['uhrp-advertisements', 'board-create', 'lch-payment', 'board-revision']
  assert.deepEqual(rows.map((item: any) => item.role).sort(), [...roles].sort())
  const txs = new Map<string, Transaction>()
  for (const row of rows) {
    const tx = Transaction.fromAtomicBEEF(row.beef)
    assert.equal(tx.id('hex'), row.txid); assert.equal(tx.toHex(), row.raw)
    assert.equal(await tx.verify(tracker), true, `SPV/script verification: ${row.role}`)
    assert.deepEqual(result.transactions.find((item: any) => item.role === row.role), { role: row.role, txid: row.txid })
    txs.set(row.role, tx)
  }
  const image = Uint8Array.from(lch.plaintext)
  assert.deepEqual(image, referenceImage()); assert.equal(sha256Hex(image), lch.plaintextSha256)
  const inspected = await new LCHReader({ read: async () => { throw new Error('Offline verification never fetches content') } }).inspect(Uint8Array.from(lch.lch))
  const header: any = inspected.header
  assert.equal(toHex(await objectId('asset', header.asset)), lch.assetId)
  assert.equal(toHex(header.asset.representation.plaintextDigest), lch.plaintextSha256)
  const verifier = new PublicBRC77Verifier(), issuer = Buffer.from(PrivateKey.fromHex('63'.repeat(32)).toPublicKey().toString(), 'hex')
  const license: any = decodeDeterministicCbor(Uint8Array.from(lch.license))
  await verifySignedObject('license', license, verifier, Uint8Array.from(issuer))
  assert.equal(toHex(await objectId('license', license.body)), lch.licenseId)
  assert.equal(toHex(license.body.assetId), lch.assetId)
  const payment = txs.get('lch-payment')!
  assert.equal(lch.receipts.length, 2); assert.deepEqual(lch.received, [3, 5]); assert.equal(lch.payeeOutputs.length, 2)
  const paidIndices = new Set<number>()
  for (const [index, encoded] of lch.receipts.entries()) {
    const receipt: any = decodeDeterministicCbor(Uint8Array.from(encoded as number[]))
    await validatePaymentReceipt(receipt, verifier)
    const body = receipt.body, expected = [3, 5][index]
    assert.equal(toHex(body.txid), payment.id('hex')); assert.equal(Number(body.satoshis), expected)
    assert.equal(toHex(body.payee), PrivateKey.fromHex(['61', '62'][index]!.repeat(32)).toPublicKey().toString())
    const outputIndex = Number(body.outputIndex); assert(!paidIndices.has(outputIndex)); paidIndices.add(outputIndex)
    const output = payment.outputs[outputIndex]!
    assert.equal(output.satoshis, expected)
    assert.deepEqual(lch.payeeOutputs[index], [{ outpoint: `${payment.id('hex')}.${outputIndex}`, satoshis: expected, lockingScript: output.lockingScript.toHex() }])
  }
  const first = txs.get('board-create')!, revision = txs.get('board-revision')!
  async function board(tx: Transaction) {
    const records = []
    for (const [index, output] of tx.outputs.entries()) try { records.push({ index, record: await decodeAndVerifyBoardToken(output.lockingScript.toHex(), fixtureVersion) }) } catch {}
    assert.equal(records.length, 1); return records[0]!
  }
  const a = await board(first), b = await board(revision)
  assert.equal(toHex(license.body.subject), a.record.author)
  assert.equal(a.record.revision, 1); assert.equal(a.record.previous, null)
  assert.equal(b.record.revision, 2); assert.equal(b.record.previous, `${first.id('hex')}:${a.index}`)
  assert.equal(a.record.key, b.record.key); assert.equal(a.record.author, b.record.author)
  if (walletIdentity) assert.equal(a.record.author, walletIdentity)
  for (const item of [a, b]) { assert.equal(item.record.attachment.assetId, lch.assetId); assert.equal(item.record.attachment.plaintextSha256, lch.plaintextSha256); assert.equal(item.record.attachment.lch, Buffer.from(lch.lch).toString('base64url')) }
  assert(revision.inputs.some(input => input.sourceTXID === first.id('hex') && input.sourceOutputIndex === a.index))
  const replica = events.find((event: any) => event.boardReplicaLookup)?.boardReplicaLookup
  assert.equal(replica.outputs.length, 1)
  assert.equal(Transaction.fromBEEF(replica.outputs[0].beef).id('hex'), revision.id('hex')); assert.equal(replica.outputs[0].outputIndex, b.index)
  const advertisements = txs.get('uhrp-advertisements')!, locations = []
  for (const output of advertisements.outputs) try { locations.push(await decodeAndVerifyUHRPAdvertisement(output.lockingScript.toHex())) } catch {}
  assert.equal(locations.length, 2); assert.equal(new Set(locations.map(item => new URL(item.hostedFileLocation).origin)).size, 2)
  const queried = events.filter((event: any) => event.uhrpLookup).map((event: any) => event.uhrpLookup)
  assert(queried.length > 0)
  for (const query of queried) { assert.equal(query.answer.outputs.length, 2); for (const entry of query.answer.outputs) assert.equal(Transaction.fromBEEF(entry.beef).id('hex'), advertisements.id('hex')) }
  for (const [id, role] of [['NATIVE-SYNTHESIS-UHRP', 'uhrp-advertisements'], ['NATIVE-SYNTHESIS-BOARD', 'board-create'], ['NATIVE-SYNTHESIS-LCH', 'lch-payment'], ['NATIVE-SYNTHESIS-REVISION', 'board-revision']]) assert.equal(result.assertions.find((item: any) => item.id === id).txid, txs.get(role!)!.id('hex'))
  return { verified: true, outcome: 'PASS', transactions: rows.length, receipts: lch.receipts.length, walletIdentity: a.record.author }
}

if (process.argv[1]?.endsWith('verify-synthesis.ts')) console.log(JSON.stringify(await verifyNativeSynthesis(path.resolve(process.argv[2]!), process.argv[3] === '--integrated', process.argv[4], process.argv[5] === '--validated-board-v2' ? 'validated-v2' : 'legacy-v1')))
