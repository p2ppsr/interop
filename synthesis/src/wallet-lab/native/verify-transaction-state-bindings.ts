import assert from 'node:assert/strict'
import { Beef, Transaction, Utils } from '@bsv/sdk'
import type { StateReport } from './conformance-transaction-states-model.js'
import { transactionStateRolePredicate, verifyNativeTransactionStates } from './verify-transaction-states.js'
import { verifyObservedNativeTransactionBindings } from './verify-conditional-transaction-bindings.js'

type Binding = Parameters<typeof verifyObservedNativeTransactionBindings>[2]
type Submission = { txid: string; beefHex: string; verdict: string }

export function verifyTransactionStateSnapshots(report: StateReport, storage: Map<string, Transaction>, submissions: Submission[], identity: string): void {
  assert.equal(report.identity, identity)
  assert.ok(Number.isSafeInteger(report.submissionStart) && report.submissionStart >= 0)
  assert.ok(Number.isSafeInteger(report.submissionEnd) && report.submissionEnd >= report.submissionStart && report.submissionEnd <= submissions.length)
  assert.deepEqual(report.submissions, submissions.slice(report.submissionStart, report.submissionEnd).map((row, offset) => ({ index: report.submissionStart + offset, txid: row.txid, serializedHex: row.beefHex, verdict: row.verdict })), 'Transaction-state submission window differs from the complete native ledger')
  assert.ok(Array.isArray(report.storageTransactions) && report.storageTransactions.length <= 2048)
  const txids = new Set<string>()
  for (const row of report.storageTransactions) {
    assert.deepEqual(Object.keys(row).sort(), ['rawTxHex', 'txid'])
    assert.match(row.txid, /^[0-9a-f]{64}$/)
    assert.equal(typeof row.rawTxHex, 'string')
    assert.ok(storage.has(row.txid), 'Transaction-state storage identity is absent from the final native snapshot')
    assert.ok(!txids.has(row.txid), 'Duplicate transaction-state storage identity'); txids.add(row.txid)
    assert.equal(storage.get(row.txid)?.toHex(), row.rawTxHex, 'Transaction-state raw bytes differ from the final native storage snapshot')
  }
}

export interface SubmissionGraphOptions {
  resolvedTransactions?: ReadonlyMap<string, Transaction>
  requireResolvedAncestors?: boolean
  trustedMinedRoot?: { txid: string; rawHex: string }
}

/** Decode original submission bytes and enumerate the target plus every reachable
 * unmined ancestor. A caller may supply an independently hydrated graph for raw
 * or TxID-only ancestry; every overlapping body must match the original bytes. */
export function observedSubmissionTransactions(entry: Submission, options: SubmissionGraphOptions = {}): Array<{ txid: string; transaction: Transaction; isTarget: boolean }> {
  assert.match(entry.txid, /^[a-f0-9]{64}$/); assert.match(entry.beefHex, /^(?:[a-f0-9]{2})+$/)
  assert.equal(typeof entry.verdict, 'string'); assert.ok(entry.verdict.length > 0)
  const bytes = [...Buffer.from(entry.beefHex, 'hex')]
  let target: Transaction
  try {
    const reader = new Utils.Reader(bytes), graph = Beef.fromReader(reader)
    assert.ok(reader.eof(), 'Unparsed final Atomic BEEF suffix'); assert.match(graph.atomicTxid ?? '', /^[a-f0-9]{64}$/)
    target = Transaction.fromAtomicBEEF(bytes); assert.equal(target.id('hex'), graph.atomicTxid)
  } catch {
    target = Transaction.fromBinary(bytes); assert.equal(target.toHex(), entry.beefHex, 'Unparsed final raw transaction suffix')
  }
  assert.equal(target.id('hex'), entry.txid, 'Final submission identity differs from original bytes')
  const results: Array<{ txid: string; transaction: Transaction; isTarget: boolean }> = []
  const visited = new Map<string, number>(), bodies = new Map<string, string>()
  const walk = (original: Transaction, depth: number, ancestry: Set<string>): void => {
    assert.ok(depth < 32, 'Final submission ancestry exceeds the retained depth bound')
    const txid = original.id('hex'); assert.ok(!ancestry.has(txid), 'Cyclic final submission ancestry')
    const resolved = options.resolvedTransactions?.get(txid)
    if (resolved) assert.equal(resolved.toHex(), original.toHex(), 'Independent final ancestry body differs from original submission')
    if (bodies.has(txid)) assert.equal(bodies.get(txid), original.toHex()); else bodies.set(txid, original.toHex())
    if ((visited.get(txid) ?? -1) >= depth) return
    if (!visited.has(txid)) results.push({ txid, transaction: original, isTarget: txid === entry.txid })
    visited.set(txid, depth)
    // A caller-supplied BUMP cannot establish a safe traversal boundary.
    if (options.trustedMinedRoot && txid === options.trustedMinedRoot.txid) {
      assert.equal(original.toHex(), options.trustedMinedRoot.rawHex, 'Admitted mined root body differs'); return
    }
    const next = new Set([...ancestry, txid])
    for (const [index, input] of original.inputs.entries()) {
      const sourceId = input.sourceTXID ?? input.sourceTransaction?.id('hex')
      assert.match(sourceId ?? '', /^[a-f0-9]{64}$/)
      const serialized = input.sourceTransaction
      const independent = options.resolvedTransactions?.get(sourceId!) ?? resolved?.inputs[index]?.sourceTransaction
      if (serialized) assert.equal(serialized.id('hex'), sourceId)
      if (independent) { assert.equal(independent.id('hex'), sourceId); if (serialized) assert.equal(independent.toHex(), serialized.toHex()) }
      const parent = serialized ?? independent
      if (!parent) { assert.ok(!options.requireResolvedAncestors, 'Final submission has unresolved unmined ancestry'); continue }
      walk(parent, depth + 1, next)
    }
  }
  walk(target, 0, new Set()); return results
}

/** The complete ledger is supplied only after the parent has verified shutdown
 * provider provenance. A child's earlier end index cannot exempt a delayed spend.
 * Failed native predicates remain failures; they never become no-spend proofs. */
export async function verifyTransactionStateFinalSubmissions(report: StateReport, submissions: Submission[], finalSubmissions: Submission[], options: SubmissionGraphOptions = {}) {
  assert.ok(Array.isArray(finalSubmissions) && finalSubmissions.length >= submissions.length, 'Final transaction-state ledger is missing or truncated')
  assert.deepEqual(finalSubmissions.slice(0, submissions.length), submissions, 'Final transaction-state ledger must retain the exact preclose prefix')
  const child = await verifyNativeTransactionStates(report)
  const outcomes = new Map(child.assertions.map(row => [row.id, row.result]))
  const call = (id: string) => report.trace.find(row => row.id === id)
  const protectedClaims: Array<{ predicateId: string; outpoint: string; permittedTxid?: string }> = []
  const unprovenClaims: Array<{ predicateId: string; result: string }> = []
  const rules: Array<{ suffix: string; index: number; rejectedOnly?: string }> = [
    { suffix: 'signing-branches.abort-then-sign-reject', index: 4 },
    { suffix: 'consuming-conflicts.input-absent-from-beef', index: 5, rejectedOnly: 'input-absent-from-beef' },
    { suffix: 'consuming-conflicts.script-and-length-conflict', index: 7, rejectedOnly: 'script-and-length-conflict' },
    { suffix: 'consuming-conflicts.missing-script-and-length', index: 8 },
    { suffix: 'consuming-conflicts.spend-index-not-in-reference', index: 9 },
    { suffix: 'consuming-conflicts.script-length-mismatch', index: 10 },
    { suffix: 'proof-trust.truncated-proof', index: 13 },
    { suffix: 'proof-trust.unknown-without-trust', index: 14 }
  ]
  const passed = (predicateId: string): boolean => {
    const result = outcomes.get(predicateId); assert.ok(result, 'Final state guard lacks its independently evaluated predicate')
    if (result === 'PASS') return true
    unprovenClaims.push({ predicateId, result }); return false
  }
  let fanout: Transaction | undefined
  const source = () => { fanout ??= Transaction.fromAtomicBEEF(call('fanout')?.result?.tx); return fanout }
  for (const rule of rules) {
    const predicateId = `transaction.${rule.suffix}`
    if (!passed(predicateId)) continue
    if (rule.rejectedOnly && call(rule.rejectedOnly)?.error === undefined) continue
    protectedClaims.push({ predicateId, outpoint: `${source().id('hex')}.${rule.index}` })
  }
  const outOfRange = 'transaction.consuming-conflicts.input-index-out-of-range'
  if (passed(outOfRange)) protectedClaims.push({ predicateId: outOfRange, outpoint: `${source().id('hex')}.${source().outputs.length}` })
  const unknown = 'transaction.proof-trust.unknown-without-trust'
  if (outcomes.get(unknown) === 'PASS') protectedClaims.push({ predicateId: unknown, outpoint: call('unknown-without-trust')!.args.inputs[0].outpoint })
  const spent = 'transaction.consuming-conflicts.already-spent-input'
  if (passed(spent)) {
    const permittedTxid = call('direct-default')?.result?.txid; assert.match(permittedTxid, /^[a-f0-9]{64}$/)
    protectedClaims.push({ predicateId: spent, outpoint: `${source().id('hex')}.0`, permittedTxid })
  }
  const checked = finalSubmissions.slice(report.submissionStart)
  for (const entry of checked) for (const observed of observedSubmissionTransactions(entry, options)) {
    const spentInputs = new Set(observed.transaction.inputs.map(input => `${input.sourceTXID ?? input.sourceTransaction?.id('hex')}.${input.sourceOutputIndex}`))
    for (const claim of protectedClaims) if (spentInputs.has(claim.outpoint)) {
      assert.equal(observed.txid, claim.permittedTxid, `A protected transaction-state input was submitted after its PASS claim: ${claim.predicateId} ${claim.outpoint}`)
    }
  }
  return { verified: true as const, checkedSubmissions: checked.length, finalCount: finalSubmissions.length, protectedClaims, unprovenClaims }
}

export async function verifyNativeTransactionStateBindings(report: StateReport, binding: Binding & {
  resolvedTransactions: Map<string, Transaction>; submissions: Submission[]; finalSubmissions: Submission[]; identity: string; ownershipFromIndependentGraph?: boolean
}) {
  verifyTransactionStateSnapshots(report, binding.storageTransactions, binding.submissions, binding.identity)
  const child = await verifyNativeTransactionStates(report)
  const finalSubmissionBinding = await verifyTransactionStateFinalSubmissions(report, binding.submissions, binding.finalSubmissions, { resolvedTransactions: binding.resolvedTransactions, requireResolvedAncestors: true, trustedMinedRoot: binding.fixture })
  const transactions = await verifyObservedNativeTransactionBindings(report.trace, child.assertions, binding, {
    rolePrefix: 'transaction-states', predicateFor: call => transactionStateRolePredicate(call.id),
    resolvedTransactions: binding.resolvedTransactions,
    ownershipFromIndependentGraph: binding.ownershipFromIndependentGraph,
    isTxidOnly: call => ['txid-only-create', 'txid-only-sign'].includes(call.id)
  })
  return { ...transactions, finalSubmissionBinding }
}
