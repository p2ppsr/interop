// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import { Beef, Transaction, Utils } from '@bsv/sdk'

type Receipt = { txid: string; beefHex: string; verdict: string }
type Call = { method: string; args: any; result?: any; error?: any; submissionStart: number; submissionEnd: number }

/** The selected native broadcaster retains raw transaction receipts. An import
 * may replay one previously accepted fixture; it cannot create another target,
 * append an ancestry body, or hide receipts outside its exact call window.
 * The parent still verifies the complete mined graph and every final receipt. */
export async function verifyPriorFixtureReplay(call: Call, creation: Call, ledger: readonly Receipt[], tracker: Parameters<Transaction['verify']>[0]) {
  assert.equal(call.method, 'internalizeAction'); assert.equal(call.error, undefined); assert.equal(call.result?.accepted, true)
  assert.equal(creation.method, 'createAction'); assert.equal(creation.error, undefined)
  const bytes = creation.result?.tx
  assert.ok(Array.isArray(bytes) && bytes.length > 0)
  for (let i = 0; i < bytes.length; i++) assert.ok(Object.hasOwn(bytes, i) && Number.isInteger(bytes[i]) && bytes[i] >= 0 && bytes[i] <= 255)
  assert.deepEqual(call.args.tx, bytes, 'Import must use the exact declared fixture AtomicBEEF')
  const reader = new Utils.Reader(bytes), graph = Beef.fromReader(reader)
  assert.ok(reader.eof(), 'Unparsed fixture AtomicBEEF suffix')
  const tx = Transaction.fromAtomicBEEF(bytes), txid = tx.id('hex')
  assert.equal(graph.atomicTxid, txid); assert.equal(creation.result.txid, txid)
  assert.ok(await tx.verify(tracker), 'Fixture replay requires independently verified mined ancestry')
  for (const row of [creation, call]) assert.ok(Number.isSafeInteger(row.submissionStart) && row.submissionStart >= 0 && Number.isSafeInteger(row.submissionEnd) && row.submissionEnd >= row.submissionStart && row.submissionEnd <= ledger.length)
  assert.ok(creation.submissionEnd <= call.submissionStart, 'Fixture must be accepted before import')
  const raw = tx.toHex(), accepted = ledger.slice(creation.submissionStart, creation.submissionEnd).filter(row => row.txid === txid && row.beefHex === raw && row.verdict === 'ACCEPTED_BY_NETWORK')
  assert.equal(accepted.length, 1, 'Exact fixture needs one accepted raw receipt in its creation window')
  const replay = ledger.slice(call.submissionStart, call.submissionEnd)
  assert.ok(replay.length <= 1, 'Import may replay the exact fixture at most once')
  for (const receipt of replay) {
    assert.equal(receipt.verdict, 'ACCEPTED_BY_NETWORK'); assert.equal(receipt.txid, txid)
    assert.equal(receipt.beefHex, raw, 'Replay must be byte-identical raw fixture; no added target, ancestry or suffix')
  }
  return { verified: true as const, txid, replayReceipts: replay.length }
}
