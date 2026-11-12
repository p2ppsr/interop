// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import { Transaction } from '@bsv/sdk'
import { verifyCoverageModuleFunding } from '../verify-coverage-suite.js'
import { observedSubmissionTransactions } from '../verify-transaction-state-bindings.js'
import { config, operations, variants } from './baskets-model.js'
import { atomic, call, membership, snapshotPair, validateOwned, verifyBasketObservations } from './baskets-verifier.js'
import { nativeCompletionProviders } from './providers.js'

export function basketAssertions(checked: Awaited<ReturnType<typeof verifyBasketObservations>>) {
  return checked.observations.map(row => ({ id: `completion.baskets.${row.id}`,
    result: row.result === 'SCOPED_PASS' ? row.scope === 'EXACT_NAMED_MUTATION' ? 'PASS' : 'BLOCKED' : row.result,
    detail: row.result === 'SCOPED_PASS'
      ? row.scope === 'EXACT_NAMED_MUTATION' ? 'Exact public mutation and complete owned output observations match; native parent admission is required.'
        : 'Observed typed-interface behavior; the normative 300/400-byte basket limit conflict remains unresolved.'
      : row.reason ?? 'Required independent observation is unavailable.' }))
}

export interface BasketParentBinding {
  profile: 'ITCVE-1@4.5.0'
  identity: string
  fixture: any
  storageTransactions: Map<string, Transaction>
  resolvedTransactions: Map<string, Transaction>
  declaredNativePayments: string[]
  globalSubmissions: any[]
  finalSubmissions: any[]
  readEvidence(name: string): Buffer
}

/** The complete native parent has already checked source identity, installation,
 * all provider shutdown ledgers and mined graph. This joins this fixed program
 * to those independent observations and forbids spending protected outputs. */
export async function verifyBasketParent(report: any, binding: BasketParentBinding) {
  assert.equal(binding.profile, 'ITCVE-1@4.5.0')
  assert.equal(report.mode, 'NATIVE_OBSERVATION')
  assert.equal(report.identity, binding.identity)
  const checked = await verifyBasketObservations(report)
  assert.equal(checked.fixtureValid, true, checked.fixtureError ?? 'Missing fixtures')
  const read = binding.readEvidence, json = (name: string) => JSON.parse(read(name).toString())
  const registry = nativeCompletionProviders(read)
  assert.deepEqual(json('native-output-provider-registry.json'), registry)
  assert.deepEqual(report.providerRegistry, registry)
  assert.deepEqual(report.finalProviderRegistry, registry)
  const observations = json('native-output-snapshot-observations.json')
  assert.ok(Number.isSafeInteger(report.snapshotStart) && report.snapshotStart >= 0)
  assert.equal(report.snapshotEnd - report.snapshotStart, 80)
  assert.deepEqual(observations.slice(report.snapshotStart, report.snapshotEnd), report.snapshots.map((row: any) => row.observation))
  for (const row of report.snapshots) for (const output of validateOwned(row.observation.snapshots, binding.identity, registry)) {
    if (output.txid !== null) assert.equal(binding.storageTransactions.get(output.txid)?.toHex(), output.rawTx, 'Owned output bytes differ from independently read final storage')
  }
  assert.ok(Number.isSafeInteger(report.submissionStart) && report.submissionStart >= 0)
  assert.ok(Number.isSafeInteger(report.submissionEnd) && report.submissionEnd >= report.submissionStart && report.submissionEnd <= binding.globalSubmissions.length)
  assert.deepEqual(binding.globalSubmissions.slice(0, report.submissionStart), report.submissionPrefix)
  assert.deepEqual(binding.globalSubmissions.slice(report.submissionStart, report.submissionEnd), report.submissions)
  assert.deepEqual(binding.finalSubmissions.slice(0, binding.globalSubmissions.length), binding.globalSubmissions)
  let end = report.submissionStart
  for (const row of report.trace) {
    assert.ok(row.submissionStart >= end && row.submissionEnd <= report.submissionEnd)
    end = row.submissionEnd
    if (!['fixture-native', 'fixture-external'].includes(row.id)) assert.equal(row.submissionStart, row.submissionEnd, 'Non-broadcast basket operation emitted a submission')
  }
  const funding = await verifyCoverageModuleFunding(report.trace, binding)
  const returned = new Map<string, Transaction>()
  for (const row of report.trace) if (row.result?.tx) {
    const tx = atomic(row.result.tx), id = tx.id('hex')
    assert.ok(!returned.has(id), 'Distinct calls returned the same signed transaction')
    returned.set(id, tx)
    assert.ok(binding.globalSubmissions.slice(row.submissionStart, row.submissionEnd).some(submission => submission.txid === id && submission.verdict === 'ACCEPTED_BY_NETWORK'), 'Signed fixture has no accepted submission in its exact call window')
  }
  assert.equal(returned.size, 2, 'The fixed basket program creates exactly two fixture transactions')
  assert.ok(returned.size <= config.maximumSignedTransactions)
  let actualFees = 0
  for (const tx of returned.values()) {
    const fee = tx.inputs.reduce((sum, input) => sum + input.sourceTransaction!.outputs[input.sourceOutputIndex]!.satoshis!, 0) - tx.outputs.reduce((sum, output) => sum + output.satoshis!, 0)
    assert.ok(Number.isSafeInteger(fee) && fee >= 0)
    actualFees += fee
  }
  assert.ok(actualFees <= config.maximumActualFees)
  const protectedOutpoints = new Set<string>()
  const native = call(report, 'fixture-native').result, external = call(report, 'fixture-external').result
  // Every fixed request protects its source even if the wallet's response is a
  // predicate failure. A late submission cannot turn that failure into a pass.
  for (const operation of operations) protectedOutpoints.add(operation.method === 'internalizeAction'
    ? `${external.txid}.${operation.externalIndex}`
    : `${native.txid}.${operation.method === 'createAction' ? operation.sourceIndex : operation.relinquishIndex}`)
  let ancestorVisits = 0
  for (const submission of binding.finalSubmissions) for (const entry of observedSubmissionTransactions(submission, {
    resolvedTransactions: binding.resolvedTransactions, requireResolvedAncestors: true,
    trustedMinedRoot: { txid: binding.fixture.txid, rawHex: binding.fixture.rawHex }
  })) {
    ancestorVisits++
    for (const input of entry.transaction.inputs) assert.ok(!protectedOutpoints.has(`${input.sourceTXID ?? input.sourceTransaction?.id('hex')}.${input.sourceOutputIndex}`), 'Protected basket outpoint spent in final submission ancestry')
  }
  const last = snapshotPair(report, operations.at(-1)!.id)
  for (const variant of variants.filter(value => value.accepted)) {
    membership(report, `${variant.id}.final-membership`, last.rowsAfter, variant.name)
    membership(report, `${variant.id}.reopened-membership`, last.rowsAfter, variant.name)
  }
  assert.equal(report.reopen?.kind, 'PUBLIC_CWI_HANDLE_REFRESH')
  assert.equal(report.reopen.nativeBrowserRestart, false)
  assert.equal(call(report, 'reopened-identity').result.publicKey, binding.identity)
  const assertions = basketAssertions(checked)
  assert.deepEqual(report.assertions, assertions)
  return { verified: true as const, assertions, funding, signedTransactions: returned.size, actualFees,
    ownedSnapshots: 80, protectedOutpoints: protectedOutpoints.size, ancestorVisits, completeBRC100Conformance: false as const }
}
