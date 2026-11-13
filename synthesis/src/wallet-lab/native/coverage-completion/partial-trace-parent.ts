// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import { Transaction } from '@bsv/sdk'
import type { BasketParentBinding } from './baskets-parent.js'
import { nativeCompletionProviders } from './providers.js'
import { evaluatePartialTrace } from './partial-trace-verifier.js'
import { observedSubmissionTransactions } from '../verify-transaction-state-bindings.js'

/** Values must come from the current complete parent execution, never a child
 * report or a stored self-declared admission packet. */
export interface PartialTracePrerequisites {
  conditionalTransactionBindings: any
  transactionStateBindings: any
  submissionAncestryBindings: any
  coverageSuiteBindings: {
    verified: true; prelude: any; browser: any; permissions: any
    transactions: any; extension: any; certificates: any
  }
}

export function verifyPartialTracePrerequisites(prior: PartialTracePrerequisites, roots: string[], finalCount: number) {
  assert.ok(prior && typeof prior === 'object', 'Current complete parent prerequisites are required')
  const suite = prior.coverageSuiteBindings
  assert.equal(suite?.verified, true); assert.equal(suite.prelude.verified, true)
  assert.equal(suite.prelude.beforeOtherCustomerTransactions, true)
  assert.deepEqual([...suite.prelude.initialFundingOutpoints].sort(), [...roots].sort())
  assert.deepEqual(suite.browser, { verified: true, contexts: 5, restarts: 4, sameProfile: true })
  assert.equal(suite.permissions.verified, true); assert.equal(suite.permissions.finalLedgerBound, true)
  for (const name of ['transactions', 'extension', 'certificates'] as const) {
    const value = suite[name]; assert.equal(value.verified, true); assert.equal(value.funding.verified, true)
    assert.ok(roots.every(root => value.funding.declaredNativePayments.includes(root)))
  }
  assert.equal(suite.extension.transactionOwnershipAndFundingStillRequired, false)
  assert.equal(suite.certificates.finalLedgerChecked, true); assert.equal(suite.transactions.finalCount, finalCount)
  for (const binding of [prior.conditionalTransactionBindings, prior.transactionStateBindings]) {
    assert.equal(binding?.verifiedEvidence, true)
    assert.ok(Array.isArray(binding.transactions) && Array.isArray(binding.invalidNativeResponses))
    assert.equal(binding.allReturnedTransactionsProven, binding.invalidNativeResponses.length === 0)
  }
  assert.equal(prior.transactionStateBindings.finalSubmissionBinding.verified, true)
  assert.equal(prior.transactionStateBindings.finalSubmissionBinding.finalCount, finalCount)
  assert.equal(prior.submissionAncestryBindings.verified, true)
  assert.equal(prior.submissionAncestryBindings.finalCount, finalCount)
  assert.ok(Number.isSafeInteger(prior.submissionAncestryBindings.transactionsChecked) && prior.submissionAncestryBindings.transactionsChecked >= 0)
  assert.ok(Number.isSafeInteger(prior.submissionAncestryBindings.ancestorsChecked) && prior.submissionAncestryBindings.ancestorsChecked >= 0)
  return { verified: true as const, fullNativeAdmission: false as const }
}

/** Supplemental scoped observations inherit no admission from their producer.
 * Raw files, initial funding, actual storage bodies, full final graph and current
 * parent receipts must all join before any supplemental PASS is admitted. */
export async function verifyPartialTraceParent(report: any, binding: BasketParentBinding, prior: PartialTracePrerequisites) {
  assert.ok(['ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0', 'ITCVE-1@4.8.0'].includes(binding.profile))
  const checked = await evaluatePartialTrace(report, binding.readEvidence)
  const joined = verifyPartialTraceRawBindings(report, checked, binding, prior)
  return { ...joined, assertions: checked.assertions }
}

/** Raw-parent join is separately testable; it never derives predicates or admits
 * a native run on its own. The production entrypoint always recomputes first. */
export function verifyPartialTraceRawBindings(report: any, checked: any, binding: BasketParentBinding, prior: PartialTracePrerequisites) {
  assert.ok(['ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0', 'ITCVE-1@4.8.0'].includes(binding.profile))
  const modules = checked.modules
  const json = (name: string) => JSON.parse(binding.readEvidence(name).toString())
  assert.equal(report.identity, binding.identity)
  for (const [name, entry] of Object.entries(checked.inputs) as any[]) {
    assert.equal(entry.missing, undefined, `Missing fixed source ${name}`)
    assert.equal(modules[name].identity, binding.identity, `Foreign module identity ${name}`)
  }
  assert.deepEqual(json('native-submissions.json'), binding.globalSubmissions)
  assert.deepEqual(binding.finalSubmissions.slice(0, binding.globalSubmissions.length), binding.globalSubmissions)
  const registry = nativeCompletionProviders(binding.readEvidence)
  assert.deepEqual(json('native-output-provider-registry.json'), registry)
  const storage = json('native-transactions.json')
  assert.equal(new Set(storage.map((row: any) => row.txid)).size, storage.length)
  assert.equal(binding.storageTransactions.size, storage.length)
  for (const row of storage) {
    const tx = Transaction.fromHex(row.rawTxHex); assert.equal(tx.id('hex'), row.txid)
    assert.equal(binding.storageTransactions.get(row.txid)?.toHex(), row.rawTxHex)
    assert.equal(binding.resolvedTransactions.get(row.txid)?.toHex(), row.rawTxHex)
  }
  const funding = json('funding.json'), reserves = json('conformance/funding-reserves.json')
  assert.equal(reserves.payments.length, 2)
  const roots = [`${funding.fundingTxid}.0`, ...reserves.payments.map((row: any) => row.outpoint)]
  assert.equal(new Set(roots).size, 3); assert.ok(roots.every(point => binding.declaredNativePayments.includes(point)))
  for (const point of roots) {
    const [id, index] = point.split('.'), tx = binding.resolvedTransactions.get(id)
    assert.ok(tx); assert.equal(tx.outputs[Number(index)]?.satoshis, 10000)
    assert.equal(binding.storageTransactions.get(id)?.toHex(), tx.toHex())
  }
  const prerequisites = verifyPartialTracePrerequisites(prior, roots, binding.finalSubmissions.length)
  const index = (value: any) => assert.ok(Number.isSafeInteger(value) && value >= 0)
  index(report.submissionStart); index(report.submissionEnd)
  assert.ok(report.submissionEnd >= report.submissionStart && report.submissionEnd <= binding.globalSubmissions.length)
  const dated = (value: string) => { const time = Date.parse(value); assert.equal(new Date(time).toISOString(), value); return time }
  assert.ok(dated(report.startedAt) <= dated(report.endedAt))
  const normal = (rows: any[]) => rows.map((row, i) => ({ index: i, txid: row.txid, serializedHex: row.beefHex, verdict: row.verdict }))
  assert.deepEqual(modules.conditional.submissions, normal(binding.globalSubmissions.slice(0, modules.conditional.submissions.length)))
  for (const name of ['states', 'transactions', 'certificateStates', 'certificates']) {
    const value = modules[name]; index(value.submissionStart); index(value.submissionEnd)
    assert.ok(value.submissionEnd >= value.submissionStart && value.submissionEnd <= report.submissionStart)
    const slice = binding.globalSubmissions.slice(value.submissionStart, value.submissionEnd)
    assert.deepEqual(value.submissions, name === 'states' ? normal(slice).map((row, i) => ({ ...row, index: value.submissionStart + i })) : slice)
    if (name !== 'states') assert.deepEqual(value.submissionPrefix, binding.globalSubmissions.slice(0, value.submissionStart))
  }
  const contexts = json('native-browser-contexts.json').contexts
  assert.ok(contexts.length >= 5)
  if (modules.certificates.restart?.kind === 'NATIVE_BROWSER_RESTART') {
    assert.deepEqual(modules.certificates.restart.receipt, contexts[4].restart)
    assert.equal(contexts[4].restart.identity, binding.identity)
    assert.ok(dated(modules.certificates.restart.receipt.endedAt) <= dated(report.startedAt))
  }
  // The existing parent performs all signature, intent and safety checks. This
  // extra traversal proves that its current graph covers every retained final
  // target/ancestor, including rejected and late submissions.
  let graphVisits = 0
  for (const row of binding.finalSubmissions) for (const entry of observedSubmissionTransactions(row, {
    resolvedTransactions: binding.resolvedTransactions, requireResolvedAncestors: true,
    trustedMinedRoot: { txid: binding.fixture.txid, rawHex: binding.fixture.rawHex }
  })) {
    assert.equal(binding.resolvedTransactions.get(entry.txid)?.toHex(), entry.transaction.toHex())
    graphVisits++
  }
  return { verified: true as const, fullNativeAdmission: false as const, prerequisites, finalCount: binding.finalSubmissions.length,
    providers: registry.length, graphVisits, wholeRowQualifications: 0, completeBRC100Conformance: false as const }
}
