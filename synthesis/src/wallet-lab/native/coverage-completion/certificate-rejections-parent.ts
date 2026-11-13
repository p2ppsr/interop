// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import type { BasketParentBinding } from './baskets-parent.js'
import { nativeCompletionProviders } from './providers.js'
import { coverageAtomic } from '../coverage-transactions-program.js'
import { observedSubmissionTransactions } from '../verify-transaction-state-bindings.js'
import { evaluateCertificateRejections, inventory, call } from './certificate-rejections-verifier.js'
import { canonical, config } from './certificate-rejections-model.js'

const equal = (a: unknown, b: unknown) => assert.equal(canonical(a), canonical(b))
const time = (value: string) => { const n = Date.parse(value); assert.equal(new Date(n).toISOString(), value); return n }
export function certificateRejectionAssertions(checked: Awaited<ReturnType<typeof evaluateCertificateRejections>>) {
  return checked.results.map(row => ({ id: `completion.${row.id}`, result: row.result === 'SCOPED_PASS' ? 'PASS' : row.result,
    detail: row.result === 'SCOPED_PASS' ? 'Public certificate rejection or proof matches complete independent retained-state cuts; native parent admission is also required.' : row.detail }))
}

/** This module makes no transaction and cannot exempt an unknown submission as
 * a permission grant. Complete native source/identity/provider/shutdown admission
 * is supplied by the enclosing parent, which also owns later module ledgers. */
export async function verifyCertificateRejectionParent(report: any, binding: BasketParentBinding) {
  assert.ok(['ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0', 'ITCVE-1@4.8.0'].includes(binding.profile)); assert.equal(report.mode, 'NATIVE_OBSERVATION'); assert.equal(report.identity, binding.identity)
  const read = binding.readEvidence, json = (name: string) => JSON.parse(read(name).toString())
  const registry = nativeCompletionProviders(read), ledger = json('native-completion-inventory-ledger.json')
  equal(json('native-output-provider-registry.json'), registry); equal(report.providerRegistry, registry); equal(ledger.registry, registry)
  assert.ok(Number.isSafeInteger(report.snapshotStart) && report.snapshotStart >= 0)
  assert.equal(report.snapshotEnd - report.snapshotStart, config.inventoryCuts)
  assert.ok(report.snapshotEnd <= ledger.certificates.length)
  equal(ledger.certificates.slice(report.snapshotStart, report.snapshotEnd), report.inventories.map((cut: any) => cut.observation))
  for (const cut of report.inventories) equal(cut.observation.registry, registry)

  const anchorBytes = read('conformance/basket-boundaries.json'), basket = JSON.parse(anchorBytes.toString())
  assert.equal(report.anchor.source, 'conformance/basket-boundaries.json')
  assert.equal(report.anchor.sha256, createHash('sha256').update(anchorBytes).digest('hex'))
  const fixture = basket.trace.filter((row: any) => row.id === 'fixture-external'); assert.equal(fixture.length, 1)
  assert.equal(fixture[0].actor, 'funder'); assert.equal(fixture[0].error, undefined)
  const transaction = coverageAtomic(fixture[0].result.tx), txid = transaction.id('hex')
  assert.equal(fixture[0].result.txid, txid); assert.equal(report.anchor.outpoint, `${txid}.15`); assert.equal(report.revocationOutpoint, report.anchor.outpoint)
  assert.equal(report.anchor.rawTxHex, transaction.toHex()); assert.equal(transaction.outputs[15]?.satoshis, 2); assert.equal(transaction.outputs[15]?.lockingScript.toHex(), '51')
  assert.equal(binding.storageTransactions.get(txid)?.toHex(), transaction.toHex()); assert.equal(binding.resolvedTransactions.get(txid)?.toHex(), transaction.toHex())
  assert.ok(report.submissionStart >= basket.submissionEnd)
  assert.ok(time(basket.trace.at(-1).endedAt) <= time(report.startedAt))
  for (const submission of binding.finalSubmissions) for (const entry of observedSubmissionTransactions(submission, {
    resolvedTransactions: binding.resolvedTransactions, requireResolvedAncestors: true,
    trustedMinedRoot: { txid: binding.fixture.txid, rawHex: binding.fixture.rawHex }
  })) for (const input of entry.transaction.inputs) assert.notEqual(`${input.sourceTXID ?? input.sourceTransaction?.id('hex')}.${input.sourceOutputIndex}`, report.revocationOutpoint, 'Certificate revocation anchor spent in final ancestry')

  const routes = json('routes.json')
  assert.ok(Number.isSafeInteger(report.routeStart) && report.routeStart >= 0 && report.routeEnd <= routes.length)
  equal(routes.slice(report.routeStart, report.routeEnd), report.routes)
  assert.ok(Number.isSafeInteger(report.submissionStart) && report.submissionStart >= 0)
  assert.equal(report.submissionEnd, report.submissionStart); equal(report.submissions, [])
  equal(binding.globalSubmissions.slice(0, report.submissionStart), report.submissionPrefix)
  equal(binding.finalSubmissions.slice(0, binding.globalSubmissions.length), binding.globalSubmissions)
  for (const row of report.trace) { assert.equal(row.submissionStart, report.submissionStart); assert.equal(row.submissionEnd, report.submissionStart) }

  const contexts = json('native-browser-contexts.json')
  assert.equal(contexts.schema, 'tpnil-native-browser-contexts@1'); assert.equal(contexts.contexts.length, 9)
  assert.equal(report.contextBaseSequence, 7); assert.equal(report.extensionId, contexts.contexts[0].extensionId); assert.equal(report.contextProfileBinding, contexts.contexts[0].profileBinding)
  const previous = contexts.contexts[7], current = contexts.contexts[8], receipt = current.restart
  equal(report.restart.receipt, receipt); assert.equal(report.restart.kind, 'NATIVE_BROWSER_RESTART')
  assert.equal(current.sequence, 8); assert.equal(receipt.sequence, 8); assert.equal(receipt.schema, 'tpnil-native-browser-restart@1')
  assert.equal(current.profileBinding, report.contextProfileBinding); assert.equal(receipt.profileBinding, report.contextProfileBinding)
  assert.equal(current.extensionId, report.extensionId); assert.equal(receipt.extensionId, report.extensionId); assert.equal(receipt.identity, binding.identity)
  assert.equal(previous.closedAt, receipt.closedAt); assert.equal(current.openedAt, receipt.openedAt); assert.equal(receipt.oldPagesClosed, true)
  assert.equal(receipt.version, 'yours-wallet-5.1.1'); assert.ok(Number.isSafeInteger(receipt.oldPageCount) && receipt.oldPageCount > 0)
  assert.equal(receipt.sandboxEvidence, 'native-sandbox-restart-8.txt')
  const sandbox = read(receipt.sandboxEvidence).toString(); assert.match(sandbox, /PID namespaces\s+Yes/); assert.match(sandbox, /Seccomp-BPF sandbox\s+Yes/)
  assert.equal(read('conformance/restart-8-unlocked.png').subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  assert.ok(time(previous.openedAt) <= time(receipt.startedAt))
  assert.ok(time(previous.restart.endedAt) <= time(report.startedAt)); assert.ok(time(report.restart.startedAt) <= time(receipt.startedAt))
  assert.ok(time(receipt.startedAt) <= time(receipt.closedAt) && time(receipt.closedAt) <= time(receipt.openedAt) && time(receipt.openedAt) <= time(receipt.unlockedAt) && time(receipt.unlockedAt) <= time(receipt.endedAt) && time(receipt.endedAt) <= time(report.restart.endedAt))
  const checked = await evaluateCertificateRejections(report)
  const before = inventory(report, 'baseline'), after = inventory(report, 'cleanup.inventory')
  equal(before.certificates, after.certificates)
  for (const id of ['control-direct', 'control-distinct', 'control-issuance']) {
    const original = call(report, id)
    if (original.result !== undefined && !original.error) {
      const cleanup = call(report, `cleanup-${id}`); assert.equal(cleanup.method, 'relinquishCertificate'); assert.equal(cleanup.error, undefined)
      equal(cleanup.args, { type: original.result.type, certifier: original.result.certifier, serialNumber: original.result.serialNumber }); assert.equal(cleanup.result?.relinquished, true)
    }
  }
  const assertions = certificateRejectionAssertions(checked); equal(report.assertions, assertions)
  return { verified: true as const, assertions, certificateCuts: config.inventoryCuts, browserRestarts: 1, signedTransactions: 0,
    completeBRC100Conformance: false as const }
}
