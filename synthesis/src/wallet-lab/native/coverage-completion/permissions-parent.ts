// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { Transaction } from '@bsv/sdk'
import { verifyCoverageBrowserChain } from '../verify-coverage-suite.js'
import { spendsOnlyDeclaredNativePayments } from '../verify-conformance-reserves.js'
import { evaluatePermissionSequence } from './permissions-verifier.js'
import { canonical, config, program, type Report } from './permissions-model.js'
import { coverageObservationEncoding, decodeCoverageObservation } from '../coverage-observation.js'
import { coverageAtomic } from '../coverage-transactions-program.js'

const same = (a: unknown, b: unknown) => assert.equal(canonical(a), canonical(b))
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')
const time = (value: string) => {
  const result = Date.parse(value)
  assert.equal(new Date(result).toISOString(), value)
  return result
}

export interface PermissionSequenceParent {
  identity: string
  profile: 'ITCVE-1@4.5.0' | 'ITCVE-1@4.6.0' | 'ITCVE-1@4.7.0'
  globalSubmissions: any[]
  finalSubmissions: any[]
  storageTransactions: Map<string, Transaction>
  resolvedTransactions: Map<string, Transaction>
  declaredNativePayments: string[]
  readEvidence(name: string): Buffer
}

/** Joins only this module's eight predicates. Native installation, source,
 * isolation, complete provider registry and shutdown remain parent obligations.
 * A mode label or a coherent self-test cannot replace these concrete joins. */
export async function verifyPermissionSequenceParent(report: Report, binding: PermissionSequenceParent) {
  assert.ok(['ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(binding.profile))
  assert.equal(report.promptScopeRevision, ['ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(binding.profile) ? 2 : undefined)
  assert.equal(report.mode, 'NATIVE_OBSERVATION')
  assert.equal(report.identity, binding.identity)
  assert.equal(report.freshness.kind, 'PUBLIC_UI_OBSERVATION')
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.cleanup, { pagesClosed: true, routesUnregistered: true })
  const read = binding.readEvidence
  const json = (name: string) => JSON.parse(read(name).toString())
  const anchorName = 'conformance/permission-coverage.json'
  const anchor = json(anchorName)
  assert.equal(report.anchor.sourceEvidencePath, anchorName)
  assert.equal(report.anchor.sourceEvidenceSha256, sha(read(anchorName)))
  assert.equal(anchor.identity, report.identity)
  same(report.anchor.certificate, anchor.certificate)
  const setup = anchor.steps.filter((row: any) => row.id === 'setup-basket')
  assert.equal(setup.length, 1)
  const value = setup[0].outcome.value
  assert.equal(setup[0].outcome.status, 'fulfilled')
  const publicTransaction = coverageAtomic(value.tx)
  assert.equal(publicTransaction.id('hex'), value.txid)
  assert.equal(report.anchor.outpoint, `${value.txid}.0`)
  assert.equal(publicTransaction.toHex(), report.anchor.rawTxHex)
  assert.equal(binding.storageTransactions.get(value.txid)?.toHex(), publicTransaction.toHex())
  const resolved = binding.resolvedTransactions.get(value.txid)
  assert.ok(resolved, 'Original permission fixture lacks independent resolved ancestry')
  assert.equal(resolved.toHex(), publicTransaction.toHex())
  assert.ok(spendsOnlyDeclaredNativePayments(resolved, binding.declaredNativePayments))
  assert.equal(resolved.outputs[0]?.satoshis, config.basketAmount)
  assert.equal(resolved.outputs[0]?.lockingScript.toHex(), '51')
  assert.ok(time(anchor.endedAt) <= time(report.startedAt))

  const contexts = json('native-browser-contexts.json')
  assert.equal(contexts.schema, 'tpnil-native-browser-contexts@1')
  assert.equal(contexts.contexts.length, 9)
  verifyCoverageBrowserChain({ ...contexts, contexts: contexts.contexts.slice(0, 5) }, binding.identity,
    json('conformance/permission-extension.json'), decodeCoverageObservation(json('conformance/coverage-certificates.json'), coverageObservationEncoding), read)
  assert.equal(report.contextBaseSequence, 4)
  assert.equal(report.contextProfileBinding, contexts.contexts[0].profileBinding)
  assert.equal(report.extensionId, contexts.contexts[0].extensionId)
  assert.ok(time(contexts.contexts[4].restart.endedAt) <= time(report.startedAt))
  const restarts = report.observations.filter(row => row.kind === 'restart')
  assert.equal(restarts.length, config.additionalRestarts)
  for (let offset = 0; offset < restarts.length; offset++) {
    const index = 5 + offset, current = contexts.contexts[index], previous = contexts.contexts[index - 1]
    const receipt = current.restart
    same(receipt, restarts[offset]!.value)
    assert.equal(current.sequence, index)
    assert.equal(current.profileBinding, report.contextProfileBinding)
    assert.equal(current.extensionId, report.extensionId)
    assert.equal(previous.closedAt, receipt.closedAt)
    assert.equal(current.openedAt, receipt.openedAt)
    assert.ok(time(previous.openedAt) <= time(receipt.startedAt))
    assert.ok(time(previous.restart.endedAt) <= time(receipt.startedAt))
  }
  same(report.observations.map(row => [row.kind, row.id]), program(report.anchor).map(row => [row.kind, row.id]))

  // The selected candidate stores these protocol, basket and certificate grants
  // locally. This exact non-spending program includes no counterparty pact and
  // authorizes no transaction. Unexpected submissions cannot be exempted as
  // permission tokens without a separately frozen program and oracle.
  assert.ok(Number.isSafeInteger(report.submissionStart) && report.submissionStart >= 0)
  assert.equal(report.submissionEnd, report.submissionStart)
  assert.equal(report.submissionPrefix.length, report.submissionStart)
  same(report.submissionSuffix, [])
  assert.ok(report.submissionEnd <= binding.globalSubmissions.length)
  same(report.submissionPrefix, binding.globalSubmissions.slice(0, report.submissionStart))
  assert.ok(binding.finalSubmissions.length >= binding.globalSubmissions.length)
  same(binding.finalSubmissions.slice(0, binding.globalSubmissions.length), binding.globalSubmissions)
  for (const row of report.observations) if (row.kind === 'call') {
    assert.equal(row.value.submissionStart, report.submissionStart)
    assert.equal(row.value.submissionEnd, report.submissionEnd)
  }
  const checked = await evaluatePermissionSequence(report, read)
  const assertions = checked.outcomes.map(row => ({ id: row.id,
    result: row.structuralAndCryptographicChecks === 'SATISFIED' ? 'PASS' : row.result,
    detail: row.structuralAndCryptographicChecks === 'SATISFIED'
      ? 'Scoped public sequence and cryptographic predicates matched; native admission also requires the complete parent evidence.' : row.detail }))
  same((report as Report & { assertions: unknown }).assertions, assertions)
  return { verified: true as const, assertions, completeBRC100Conformance: false as const,
    browserContexts: 9, additionalRestarts: 3, publicCalls: 83, finalLedgerBound: true as const }
}
