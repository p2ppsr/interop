// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { Beef, Transaction } from '@bsv/sdk'
import { coverageAtomic } from './coverage-transactions-program.js'
import { clauseOracle7Id, noSendChangeInputId, noSendChangeLabel, noSendChangeReadArgs, noSendChangeReadId, noSendChangeSetupArgs, noSendChangeSetupId, noSendChangeSourceArgs, noSendChangeSourceId } from './conformance-nosend-change.js'

const fixture = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../../../fixtures/teranode/wab-funding-v1.json'), 'utf8'))
const tracker = { currentHeight: async () => fixture.fundingHeight + fixture.maturityDepth, isValidRootForHeight: async (root: string, height: number) => root === fixture.merkleRoot && height === fixture.fundingHeight }

/** The SDK's Beef verifier checks marked leaves. The prospective fixture also
 * checks every supplied hashed bottom leaf, including unmarked or unused BUMPs;
 * a supplied false proof cannot disappear through target-closure selection. */
async function verifySuppliedProofs(bytes: number[]) {
  const graph = Beef.fromBinary(bytes)
  assert.ok(await graph.verify(tracker, false), 'BEEF structure and marked proofs must match the admitted mined chain')
  for (const bump of graph.bumps) {
    const leaves = bump.path[0]?.filter(leaf => typeof leaf.hash === 'string') ?? []
    assert.ok(leaves.length > 0, 'Supplied BUMP has no hashed bottom leaf')
    for (const leaf of leaves) {
      assert.match(leaf.hash!, /^[0-9a-f]{64}$/)
      assert.ok(await tracker.isValidRootForHeight(bump.computeRoot(leaf.hash!), bump.blockHeight), 'Every supplied BUMP root must match the admitted mined chain')
    }
  }
}

/** Reconstruct change from independently retained signed bytes and the public
 * action read. Neither the producer's selected outpoints nor the wallet's
 * returned noSendChange determines the expected outpoint. */
export async function verifyNoSendChangeFixture(report: any) {
  const one = (id: string) => { const rows = report.trace.filter((row: any) => row.id === id); assert.equal(rows.length, 1, `Exactly one ${id} required`); return rows[0] }
  const revision = report.oracle === clauseOracle7Id ? 3 : report.oracle === 'tpnil-brc100-clause-oracle@6.0.0' ? 2 : 1
  const setup = one(noSendChangeSetupId), read = one(noSendChangeReadId)
  const source = revision === 3 ? one(noSendChangeSourceId) : undefined
  assert.equal(setup.method, 'createAction'); assert.deepEqual(setup.args, noSendChangeSetupArgs(revision, source?.result))
  assert.equal(read.method, 'listActions'); assert.deepEqual(read.args, noSendChangeReadArgs())
  assert.equal(setup.error, undefined); assert.equal(read.error, undefined)
  assert.ok(report.trace.indexOf(setup) < report.trace.indexOf(read))
  assert.ok(Array.isArray(setup.result?.tx) && setup.result.tx.every((byte: any) => Number.isInteger(byte) && byte >= 0 && byte <= 255))
  const tx = revision === 3 ? coverageAtomic(setup.result.tx) : Transaction.fromAtomicBEEF(setup.result.tx)
  if (revision === 3) await verifySuppliedProofs(setup.result.tx)
  assert.equal(tx.id('hex'), setup.result.txid)
  assert.ok(await tx.verify(tracker), 'noSend setup must retain valid signatures and pinned mined ancestry')
  const ancestors = new Map<string, Transaction>()
  // A mined proof terminates traversal, including the fixture coinbase.
  const pending = [tx]
  while (pending.length) { const value = pending.pop()!, id = value.id('hex'); if (ancestors.has(id)) continue; ancestors.set(id, value); if (!value.merklePath) for (const input of value.inputs) { assert.ok(input.sourceTransaction, 'Full signed ancestry required'); pending.push(input.sourceTransaction) } }
  assert.equal(ancestors.get(fixture.txid)?.toHex(), fixture.rawHex, 'noSend setup must descend from the exact admitted fixture')
  if (source) {
    assert.equal(source.method, 'createAction'); assert.deepEqual(source.args, noSendChangeSourceArgs()); assert.equal(source.error, undefined)
    assert.ok(report.trace.indexOf(source) < report.trace.indexOf(setup), 'Explicit source must precede anchor')
    assert.ok(Array.isArray(source.result?.tx)); for (let i = 0; i < source.result.tx.length; i++) assert.ok(Number.isInteger(source.result.tx[i]) && source.result.tx[i] >= 0 && source.result.tx[i] <= 255)
    const funding = coverageAtomic(source.result.tx)
    await verifySuppliedProofs(source.result.tx)
    assert.equal(funding.id('hex'), source.result.txid); assert.ok(await funding.verify(tracker), 'Explicit source must retain independently verified mined ancestry')
    assert.equal(ancestors.get(funding.id('hex'))?.toHex(), funding.toHex(), 'Anchor must contain the exact public source body')
    assert.equal(funding.outputs[0]?.satoshis, 1000); assert.equal(funding.outputs[0]?.lockingScript.toHex(), '7551')
    for (const output of funding.outputs.slice(1)) assert.match(output.lockingScript.toHex(), /^76a914[0-9a-f]{40}88ac$/, 'Source may add wallet change only')
    assert.equal(tx.inputs.length, 1, 'Fixed explicit surplus must fund the anchor without automatic input selection')
    const input = tx.inputs[0]!; assert.equal(input.sourceTXID ?? input.sourceTransaction?.id('hex'), funding.id('hex')); assert.equal(input.sourceOutputIndex, 0); assert.equal(input.unlockingScript?.toHex(), '51')
    const outputValue = tx.outputs.reduce((sum, output) => sum + output.satoshis!, 0), fee = 1000 - outputValue
    assert.ok(Number.isSafeInteger(fee) && fee > 0 && fee <= 100, 'Bounded anchor fee must preserve the declared surplus')
    assert.ok(tx.outputs.slice(1).reduce((sum, output) => sum + output.satoshis!, 0) >= 899, 'Explicit source must yield substantial real managed change')
  }
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
