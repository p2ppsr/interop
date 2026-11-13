import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { Beef, Transaction, Utils } from '@bsv/sdk'
import type { ConditionalReport } from './conformance-conditional-model.js'
import { verifyNativeConditionalConformance } from './verify-conformance-conditional.js'
import { verifyCoverageNativeTransactions } from './verify-conformance-coverage-transactions.js'
import { spendsOnlyDeclaredNativePayments } from './verify-conformance-reserves.js'

type Binding = Parameters<typeof verifyCoverageNativeTransactions>[1]
export interface ObservedNativeTransactionCall { id: string; method: string; args: any; result?: any }
type InvalidResponse = { role: string; callId: string; predicateId: string; kind: 'MALFORMED_RETURN' | 'INVALID_PROOF' | 'INVALID_SIGNATURE' | 'DUPLICATE_CREATE_RESPONSE'; responseSha256: string; detail: string }
function predicateFor(call: ObservedNativeTransactionCall): string {
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
  return verifyObservedNativeTransactionBindings(report.trace, child.assertions, binding, { rolePrefix: 'conditional', predicateFor })
}

/** Shared strict admission for independently scored native transaction modules.
 * A TXID-only public return may be resolved only from the parent's independent
 * native storage graph, never from a child-supplied transaction or fixture. */
export async function verifyObservedNativeTransactionBindings(
  trace: readonly ObservedNativeTransactionCall[],
  assertions: readonly { id: string; result: string }[],
  binding: Binding,
  options: { rolePrefix: string; predicateFor: (call: ObservedNativeTransactionCall) => string; resolvedTransactions?: Map<string, Transaction>; isTxidOnly?: (call: ObservedNativeTransactionCall) => boolean; ownershipFromIndependentGraph?: boolean }
) {
  assert.match(options.rolePrefix, /^[a-z][a-z0-9-]*$/)
  await verifyCoverageNativeTransactions([], binding)
  const outcomes = new Map(assertions.map(row => [row.id, row.result]))
  const tracker = { currentHeight: async () => binding.fixture.fundingHeight + binding.fixture.maturityDepth,
    isValidRootForHeight: async (root: string, height: number) => root === binding.fixture.merkleRoot && height === binding.fixture.fundingHeight }
  const admitted = new Set<string>(), transactions: Array<{ role: string; txid: string }> = [], invalidNativeResponses: InvalidResponse[] = []
  for (const call of trace) {
    // Extra fields on another method's response do not invoke a transaction contract.
    if (!['createAction', 'signAction'].includes(call.method)) continue
    let result = call.result
    if (!result || typeof result !== 'object' || (!Object.hasOwn(result, 'txid') && !Object.hasOwn(result, 'tx'))) continue
    const predicateId = options.predicateFor(call), role = `${options.rolePrefix}/${call.id}`
    const invalid = (kind: InvalidResponse['kind'], error: unknown) => {
      assert.equal(outcomes.get(predicateId), 'FAIL', `Invalid ${role} lacks its independently recomputed ${predicateId} FAIL`)
      invalidNativeResponses.push({ role, callId: call.id, predicateId, kind,
        responseSha256: createHash('sha256').update(JSON.stringify(call.result)).digest('hex'), detail: error instanceof Error ? error.message : String(error) })
    }
    let unexpectedTxidOnly = false
    if (result.tx === undefined && options.resolvedTransactions && typeof result.txid === 'string' && /^[a-f0-9]{64}$/.test(result.txid)) {
      const resolved = options.resolvedTransactions.get(result.txid)
      assert.ok(resolved, `${role}: returned TXID has no independent native ancestry graph`)
      assert.equal(resolved.id('hex'), result.txid)
      result = { ...result, tx: resolved.toAtomicBEEF() }
      unexpectedTxidOnly = !(options.isTxidOnly?.(call) && call.args?.options?.returnTXIDOnly === true)
    }
    // Decode independently of response metadata. A wrong txid or suffix must
    // never hide a recoverable valid transaction from the provenance checks.
    if (!Array.isArray(result.tx) || result.tx.length === 0) {
      invalid('MALFORMED_RETURN', 'Returned signed transaction lacks Atomic BEEF bytes'); continue
    }
    let validBytes = 0
    while (validBytes < result.tx.length && Object.hasOwn(result.tx, validBytes) && Number.isInteger(result.tx[validBytes]) && result.tx[validBytes] >= 0 && result.tx[validBytes] <= 255) validBytes++
    const prefix = result.tx.slice(0, validBytes)
    let graph: Beef, reader: InstanceType<typeof Utils.Reader>
    try { reader = new Utils.Reader(prefix); graph = Beef.fromReader(reader) }
    catch (error) { invalid('MALFORMED_RETURN', error); continue }
    let tx: Transaction | undefined
    try { tx = Transaction.fromAtomicBEEF(prefix) }
    catch { // Even an incomplete ancestry envelope may contain a real target.
      if (typeof graph.atomicTxid === 'string') tx = graph.findTxid(graph.atomicTxid)?.tx
    }
    assert.ok(tx, `${role}: parsed BEEF target cannot be recovered for independent provenance`)
    const actualTxid = tx.id('hex')
    // These independent provenance checks are not waived by any metadata error
    // or another child's failure. Use the decoded identity, never its label.
    const stored = binding.storageTransactions.get(actualTxid)
    assert.ok(stored, `${role}: independent native storage bytes absent`)
    assert.equal(stored.id('hex'), actualTxid); assert.equal(stored.toHex(), tx.toHex(), `${role}: independent native storage bytes differ`)
    // A malformed public proof must remain a wallet counterexample. The
    // prospective observer can still establish who funded its exact signed
    // body from the parent's independently reconstructed storage graph.
    // Never hydrate the public BEEF itself: that would erase INVALID_PROOF.
    let owned = tx
    if (options.ownershipFromIndependentGraph) {
      const resolved = options.resolvedTransactions?.get(actualTxid)
      assert.ok(resolved, `${role}: returned transaction lacks independent ownership ancestry`)
      assert.equal(resolved.id('hex'), actualTxid)
      assert.equal(resolved.toHex(), tx.toHex(), `${role}: independent ownership body differs`)
      const ownershipGraph = Beef.fromBinary(resolved.toAtomicBEEF())
      const mined = ownershipGraph.findTxid(binding.fixture.txid)
      assert.ok(mined?.tx && mined.bumpIndex !== undefined && mined.tx.toHex() === binding.fixture.rawHex,
        `${role}: independent ownership graph lacks the admitted mined root`)
      assert.ok(await ownershipGraph.verify(tracker), `${role}: independent ownership ancestry is invalid`)
      owned = resolved
    }
    assert.ok(spendsOnlyDeclaredNativePayments(owned, binding.declaredNativePayments), `${role}: transaction spends outside independently declared native payments`)
    if (validBytes !== result.tx.length || !reader.eof() || typeof result.txid !== 'string' || !/^[a-f0-9]{64}$/.test(result.txid) || graph.atomicTxid !== actualTxid || result.txid !== actualTxid) {
      invalid('MALFORMED_RETURN', 'Returned Atomic BEEF has invalid metadata or trailing bytes; its recoverable transaction was independently bound'); continue
    }
    if (unexpectedTxidOnly) { invalid('MALFORMED_RETURN', 'Unexpected TXID-only return was independently bound but omitted requested transaction bytes'); continue }
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
