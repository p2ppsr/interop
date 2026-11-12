// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { verifyCoverageModuleFunding } from '../verify-coverage-suite.js'
import { observedSubmissionTransactions } from '../verify-transaction-state-bindings.js'
import { nativeCompletionProviders } from './providers.js'
import type { BasketParentBinding } from './baskets-parent.js'
import { evaluatePagination, strictAtomic } from './pagination-verifier.js'
import { bounds, type Report } from './pagination-model.js'
import { coverageObservationEncoding, decodeCoverageObservation } from '../coverage-observation.js'

export function paginationAssertions(checked: Awaited<ReturnType<typeof evaluatePagination>>) {
  return checked.outcomes.map(row => ({ id: `completion.pagination.${row.id}`, result: row.localChecks === 'SATISFIED' ? 'PASS' : row.result,
    detail: row.localChecks === 'SATISFIED'
      ? 'Scoped signed-certificate and paging checks match the declared count-before-pagination and per-method stable-order lab interpretation; native parent admission is required.' : row.detail }))
}

export async function verifyPaginationParent(report: Report & { assertions: unknown }, binding: BasketParentBinding) {
  assert.ok(['ITCVE-1@4.5.0', 'ITCVE-1@4.6.0'].includes(binding.profile)); assert.equal(report.mode, 'NATIVE_OBSERVATION'); assert.equal(report.identity, binding.identity)
  const read = binding.readEvidence, json = (name: string) => JSON.parse(read(name).toString())
  assert.deepEqual(json('native-output-provider-registry.json'), nativeCompletionProviders(read))
  const anchorName = 'conformance/basket-boundaries.json', anchorBytes = read(anchorName), basket = JSON.parse(anchorBytes.toString())
  assert.equal(report.anchor.source, anchorName)
  assert.equal(report.anchor.sha256, createHash('sha256').update(anchorBytes).digest('hex'))
  assert.equal(basket.identity, binding.identity)
  const source = basket.trace.filter((row: any) => row.id === 'fixture-external'); assert.equal(source.length, 1)
  assert.equal(source[0].actor, 'funder'); assert.equal(source[0].error, undefined)
  const sourceTx = strictAtomic(source[0].result.tx, source[0].result.txid)
  assert.equal(report.anchor.outpoint, `${sourceTx.id('hex')}.15`); assert.equal(report.anchor.rawTxHex, sourceTx.toHex())
  assert.equal(sourceTx.outputs[15]?.satoshis, 2); assert.equal(sourceTx.outputs[15]?.lockingScript.toHex(), '51')
  assert.equal(binding.storageTransactions.get(sourceTx.id('hex'))?.toHex(), sourceTx.toHex())
  assert.equal(binding.resolvedTransactions.get(sourceTx.id('hex'))?.toHex(), sourceTx.toHex())
  assert.ok(report.submissionStart >= basket.submissionEnd)
  assert.ok(Number.isSafeInteger(report.submissionStart) && Number.isSafeInteger(report.submissionEnd) && report.submissionEnd >= report.submissionStart && report.submissionEnd <= binding.globalSubmissions.length)
  assert.deepEqual(report.submissions, binding.globalSubmissions.slice(report.submissionStart, report.submissionEnd))
  assert.deepEqual(binding.finalSubmissions.slice(0, binding.globalSubmissions.length), binding.globalSubmissions)
  let callEnd = report.submissionStart
  for (const call of report.trace) {
    assert.ok(Number.isSafeInteger(call.submissionStart) && call.submissionStart >= callEnd)
    assert.ok(Number.isSafeInteger(call.submissionEnd) && call.submissionEnd >= call.submissionStart && call.submissionEnd <= report.submissionEnd)
    if (!['createAction', 'signAction'].includes(call.method)) assert.equal(call.submissionStart, call.submissionEnd, 'Non-broadcast pagination call emitted a submission')
    callEnd = call.submissionEnd
  }
  const checked = await evaluatePagination(report)
  assert.equal(checked.outcomes[0].localChecks, 'SATISFIED', 'Pagination prerequisite failed')
  const funding = await verifyCoverageModuleFunding(report.trace, binding)
  const transactions = new Map(report.trace.filter(row => ['createAction', 'signAction'].includes(row.method) && row.result?.tx)
    .map(row => [row.result.txid as string, strictAtomic(row.result.tx, row.result.txid)]))
  assert.ok(transactions.size <= bounds.uniqueSignedTransactions)
  let actualFees = 0
  for (const tx of transactions.values()) {
    const fee = tx.inputs.reduce((sum, input) => sum + input.sourceTransaction!.outputs[input.sourceOutputIndex]!.satoshis!, 0) - tx.outputs.reduce((sum, output) => sum + output.satoshis!, 0)
    assert.ok(Number.isSafeInteger(fee) && fee >= 0); actualFees += fee
  }
  assert.ok(actualFees <= bounds.maximumActualFees)
  for (const submission of binding.finalSubmissions) for (const entry of observedSubmissionTransactions(submission, {
    resolvedTransactions: binding.resolvedTransactions, requireResolvedAncestors: true,
    trustedMinedRoot: { txid: binding.fixture.txid, rawHex: binding.fixture.rawHex }
  })) for (const input of entry.transaction.inputs) assert.notEqual(`${input.sourceTXID ?? input.sourceTransaction?.id('hex')}.${input.sourceOutputIndex}`, report.anchor.outpoint, 'Pagination revocation anchor was spent')
  const environment = decodeCoverageObservation<any>(json('conformance/pagination-environment.json'), coverageObservationEncoding)
  assert.equal(environment.schema, 'tpnil-native-pagination-environment@1.0.0')
  assert.deepEqual(environment.errors, []); assert.equal(environment.overlayClosed, true)
  const assertions = paginationAssertions(checked); assert.deepEqual(report.assertions, assertions)
  return { verified: true as const, assertions, funding, signedTransactions: transactions.size, actualFees,
    certificates: 11, queryCalls: 27, browserRestarts: 0, completeBRC100Conformance: false as const }
}
