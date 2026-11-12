import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { Beef, Transaction, Utils } from '@bsv/sdk'
import type { ConditionalCall, ConditionalReport } from './conformance-conditional-model.js'
import { verifyNativeConditionalConformance } from './verify-conformance-conditional.js'
import { verifyCoverageNativeTransactions } from './verify-conformance-coverage-transactions.js'
import { spendsOnlyDeclaredNativePayments } from './verify-conformance-reserves.js'

type Binding = Parameters<typeof verifyCoverageNativeTransactions>[1]
type InvalidResponse = { role: string; callId: string; predicateId: string; kind: 'MALFORMED_RETURN' | 'INVALID_PROOF' | 'INVALID_SIGNATURE' | 'DUPLICATE_CREATE_RESPONSE'; responseSha256: string; detail: string }
function predicateFor(call: ConditionalCall): string {
  assert.equal(call.method, call.id === 'signed' ? 'signAction' : 'createAction', 'Transaction-returning conditional method differs from its fixed role')
  if (/^population-(?:[0-9]|10)$/.test(call.id)) return 'fixture.population'
  const basket = /^basket-ascii-(299|300|301|399|400|401)$/.exec(call.id)
  if (basket) return `basket.ascii-${basket[1]}`
  const mapping: Record<string, string> = {
    'conflict-control': 'transaction.conflicting-inputs', 'conflicting-inputs': 'transaction.conflicting-inputs',
    'known-proof-omission': 'transaction.known-proof-omission', signable: 'transaction.signable-and-sign', signed: 'transaction.signable-and-sign',
    'abort-prepare': 'transaction.abort-release', 'batch-held': 'transaction.batch-release', 'batch-release': 'transaction.batch-release'
  }
  assert.ok(mapping[call.id], `Unexpected transaction-returning conditional call: ${call.id}`)
  return mapping[call.id]!
}

/** Prospective-only response admission. Invalid native response bytes remain
 * counterexamples, never transaction proofs. A valid-shaped response must still
 * match independent storage and declared funding, even if another child fails.
 * The historical strict transaction verifier and its callers remain unchanged. */
export async function verifyConditionalTransactionBindings(report: ConditionalReport, binding: Binding) {
  const child = await verifyNativeConditionalConformance(report)
  await verifyCoverageNativeTransactions([], binding)
  const outcomes = new Map(child.assertions.map(row => [row.id, row.result]))
  const tracker = { currentHeight: async () => binding.fixture.fundingHeight + binding.fixture.maturityDepth,
    isValidRootForHeight: async (root: string, height: number) => root === binding.fixture.merkleRoot && height === binding.fixture.fundingHeight }
  const admitted = new Set<string>(), transactions: Array<{ role: string; txid: string }> = [], invalidNativeResponses: InvalidResponse[] = []
  for (const call of report.trace) {
    // Extra fields on another method's response do not invoke a transaction contract.
    if (!['createAction', 'signAction'].includes(call.method)) continue
    const result = call.result
    if (!result || typeof result !== 'object' || (!Object.hasOwn(result, 'txid') && !Object.hasOwn(result, 'tx'))) continue
    const predicateId = predicateFor(call), role = `conditional/${call.id}`
    const invalid = (kind: InvalidResponse['kind'], error: unknown) => {
      assert.equal(outcomes.get(predicateId), 'FAIL', `Invalid ${role} lacks its independently recomputed ${predicateId} FAIL`)
      invalidNativeResponses.push({ role, callId: call.id, predicateId, kind,
        responseSha256: createHash('sha256').update(JSON.stringify(result)).digest('hex'), detail: error instanceof Error ? error.message : String(error) })
    }
    let graph: Beef, tx: Transaction
    try {
      assert.match(result.txid, /^[a-f0-9]{64}$/)
      assert.ok(Array.isArray(result.tx) && result.tx.length > 0, 'Returned signed transaction lacks Atomic BEEF bytes')
      for (let i = 0; i < result.tx.length; i++) assert.ok(Object.hasOwn(result.tx, i) && Number.isInteger(result.tx[i]) && result.tx[i] >= 0 && result.tx[i] <= 255, 'Returned Atomic BEEF is not a dense byte array')
      const reader = new Utils.Reader(result.tx); graph = Beef.fromReader(reader)
      assert.ok(reader.eof(), 'Trailing returned Atomic BEEF bytes'); assert.equal(graph.atomicTxid, result.txid)
      tx = Transaction.fromAtomicBEEF(result.tx); assert.equal(tx.id('hex'), result.txid)
    } catch (error) { invalid('MALFORMED_RETURN', error); continue }
    // These independent provenance checks are not waived by a child failure.
    const stored = binding.storageTransactions.get(result.txid)
    assert.ok(stored, `${role}: independent native storage bytes absent`)
    assert.equal(stored.id('hex'), result.txid); assert.equal(stored.toHex(), tx.toHex(), `${role}: independent native storage bytes differ`)
    assert.ok(spendsOnlyDeclaredNativePayments(tx, binding.declaredNativePayments), `${role}: transaction spends outside independently declared native payments`)
    let proof = false
    try {
      const root = graph.findTxid(binding.fixture.txid)
      proof = !!root?.tx && root.bumpIndex !== undefined && root.tx.toHex() === binding.fixture.rawHex && await graph.verify(tracker)
    } catch { /* A malformed public proof is a counterexample only with its child FAIL. */ }
    if (!proof) { invalid('INVALID_PROOF', 'Returned Atomic BEEF lacks valid admitted mined ancestry'); continue }
    let signed = false
    try { signed = await tx.verify(tracker) } catch { /* Local cryptographic verification has no external service dependency. */ }
    if (!signed) { invalid('INVALID_SIGNATURE', 'Returned transaction fails independent script/signature verification'); continue }
    // Preserve every strict legacy ownership predicate for a proof-bearing row.
    await verifyCoverageNativeTransactions([{ role, txid: result.txid, atomicBeef: result.tx }], binding)
    if (admitted.has(result.txid)) { invalid('DUPLICATE_CREATE_RESPONSE', 'A distinct create/sign call returned an already observed transaction identity'); continue }
    admitted.add(result.txid); transactions.push({ role, txid: result.txid })
  }
  return { verifiedEvidence: true as const, scope: 'createAction/signAction top-level transaction responses' as const, transactions, invalidNativeResponses,
    allReturnedTransactionsProven: invalidNativeResponses.length === 0,
    claim: invalidNativeResponses.length ? 'NATIVE_FAILURES_RETAINED_WITHOUT_TRANSACTION_PROOF' as const : 'INDEPENDENTLY_BOUND_NATIVE_TRANSACTIONS' as const }
}
