// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { Transaction } from '@bsv/sdk'
import { noSendChangeInputId, noSendChangeLabel, noSendChangeReadArgs, noSendChangeReadId, noSendChangeSetupArgs, noSendChangeSetupId } from './conformance-nosend-change.js'

const fixture = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../../../fixtures/teranode/wab-funding-v1.json'), 'utf8'))
const tracker = { currentHeight: async () => fixture.fundingHeight + fixture.maturityDepth, isValidRootForHeight: async (root: string, height: number) => root === fixture.merkleRoot && height === fixture.fundingHeight }

/** Reconstruct change from independently retained signed bytes and the public
 * action read. Neither the producer's selected outpoints nor the wallet's
 * returned noSendChange determines the expected outpoint. */
export async function verifyNoSendChangeFixture(report: any) {
  const one = (id: string) => { const rows = report.trace.filter((row: any) => row.id === id); assert.equal(rows.length, 1, `Exactly one ${id} required`); return rows[0] }
  const revision = report.oracle === 'tpnil-brc100-clause-oracle@6.0.0' ? 2 : 1
  const setup = one(noSendChangeSetupId), read = one(noSendChangeReadId)
  assert.equal(setup.method, 'createAction'); assert.deepEqual(setup.args, noSendChangeSetupArgs(revision))
  assert.equal(read.method, 'listActions'); assert.deepEqual(read.args, noSendChangeReadArgs())
  assert.equal(setup.error, undefined); assert.equal(read.error, undefined)
  assert.ok(report.trace.indexOf(setup) < report.trace.indexOf(read))
  assert.ok(Array.isArray(setup.result?.tx) && setup.result.tx.every((byte: any) => Number.isInteger(byte) && byte >= 0 && byte <= 255))
  const tx = Transaction.fromAtomicBEEF(setup.result.tx)
  assert.equal(tx.id('hex'), setup.result.txid)
  assert.ok(await tx.verify(tracker), 'noSend setup must retain valid signatures and pinned mined ancestry')
  const ancestors = new Map<string, Transaction>()
  // A mined proof terminates traversal, including the fixture coinbase.
  const pending = [tx]
  while (pending.length) { const value = pending.pop()!, id = value.id('hex'); if (ancestors.has(id)) continue; ancestors.set(id, value); if (!value.merklePath) for (const input of value.inputs) { assert.ok(input.sourceTransaction, 'Full signed ancestry required'); pending.push(input.sourceTransaction) } }
  assert.equal(ancestors.get(fixture.txid)?.toHex(), fixture.rawHex, 'noSend setup must descend from the exact admitted fixture')
  assert.equal(read.result?.totalActions, 1); assert.equal(read.result?.actions?.length, 1)
  const action = read.result.actions[0]
  assert.equal(action.txid, tx.id('hex')); assert.equal(action.status, 'nosend')
  assert.ok(Array.isArray(action.labels) && action.labels.includes(noSendChangeLabel))
  assert.equal(action.outputs?.length, tx.outputs.length)
  assert.equal(new Set(action.outputs.map((row: any) => row.outputIndex)).size, tx.outputs.length)
  const change: string[] = []
  for (const [index, output] of tx.outputs.entries()) {
    const row = action.outputs.find((value: any) => value.outputIndex === index); assert.ok(row)
    assert.equal(row.satoshis, output.satoshis); assert.equal(row.lockingScript, output.lockingScript.toHex())
    if (index === 0) { assert.equal(output.satoshis, revision === 2 ? 997 : 1); assert.equal(row.lockingScript, '51'); assert.equal(row.basket, 'tpnil nosend anchor') }
    else { assert.equal(row.basket, 'default'); assert.equal(row.spendable, true); assert.ok(output.satoshis! > 0); assert.match(row.lockingScript, /^76a914[0-9a-f]{40}88ac$/); change.push(`${tx.id('hex')}.${index}`) }
  }
  assert.ok(change.length > 0, 'A real wallet-managed change output is required')
  const control = report.trace.find((row: any) => row.id === `control.${noSendChangeInputId}`)
  if (control) assert.ok(report.trace.indexOf(read) < report.trace.indexOf(control))
  return { txid: tx.id('hex'), rawHex: tx.toHex(), outpoints: change, returned: setup.result.noSendChange }
}
