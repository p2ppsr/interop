// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { Transaction } from '@bsv/sdk'
import { rows, bounds } from './transaction-branches-model.js'
import { verifyTransactionBranches } from './transaction-branches-verifier.js'
import { hydrateTransactionCompletionFixture } from './transaction-known-source.js'
import { nativeCompletionProviders } from './providers.js'
import type { BasketParentBinding } from './baskets-parent.js'

export function verifyTransactionActiveProvider(report: any, read: (name: string) => Buffer, profile: BasketParentBinding['profile'] = 'ITCVE-1@4.5.0') {
  const modern = profile === 'ITCVE-1@4.8.0'
  const json = (name: string) => JSON.parse(read(name).toString()), portability = json('conformance/portability.json'), contexts = json('native-browser-contexts.json')
  assert.equal(portability.mode, 'native-ui'); assert.equal(portability.counterparts.url, 'https://replacement-wallet.itcve.test')
  for (const stage of ['replacement-active', 'source-removed-from-config']) assert.equal(portability.ui.filter((row: any) => row.stage === stage).length, 1)
  const registry = nativeCompletionProviders(read)
  assert.equal(portability.counterparts.destination.storageIdentityKey, registry.find(row => row.id === 'source/replacement-wallet.itcve.test')!.identityKey)
  const instant = (s: string) => { const value = Date.parse(s); assert.equal(new Date(value).toISOString(), s); return value }
  for (const [stage, observation, cut] of [['initial', report.activeProviderInitial, report.cuts[0]], ['full-set', report.activeProvider, report.cuts.find((r: any) => r.id === 'full-set-before')]] as const) {
    assert.equal(observation.kind, 'NATIVE_REMOTE_BACKUP_UI')
    assert.equal(observation.representation, modern ? 'ACTIVE_STORAGE_SUMMARY_V2' : undefined)
    const allowed = [{ id: 'source', providerUrl: 'https://wallet.1sat.app' }, { id: 'source/replacement-wallet.itcve.test', providerUrl: 'https://replacement-wallet.itcve.test' }]
    const selected = allowed.find(provider => provider.id === observation.id); assert.ok(selected && registry.some(row => row.id === selected.id))
    assert.equal(observation.providerUrl, selected.providerUrl)
    assert.deepEqual(observation.candidates.map((row: any) => ({ id: row.id, providerUrl: row.providerUrl })), allowed)
    for (const candidate of observation.candidates) {
      assert.equal(typeof candidate.present, 'boolean')
      if (candidate.present) { assert.equal(typeof candidate.card, 'string'); assert.ok(candidate.card.split('\n').map((s: string) => modern ? s.trim().toLowerCase() : s.trim()).includes(modern ? new URL(candidate.providerUrl).host.toLowerCase() : new URL(candidate.providerUrl).host)) }
      else assert.equal(candidate.card, null)
    }
    const active = observation.candidates.filter((row: any) => row.present && row.card.split('\n').map((s: string) => s.trim().toLowerCase()).includes(modern ? 'active storage' : 'in use'))
    if(modern){assert.equal(observation.summaryButtons,1);assert.equal(observation.makeActiveButtons,0);assert.equal(typeof observation.activeSummary,'string');assert.equal(active[0]?.card,observation.activeSummary);assert.equal(observation.activeSummary.split('\n').filter((line:string)=>line.trim().toLowerCase()==='active storage').length,1)}
    assert.equal(active.length, 1); assert.equal(active[0].id, selected.id); assert.deepEqual(observation.activeCards, [active[0].card])
    assert.equal(observation.mainScreenshot, `conformance/transaction-branches-provider-cards-${stage}.png`)
    const mainBytes = read(observation.mainScreenshot); assert.equal(mainBytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    assert.equal(createHash('sha256').update(mainBytes).digest('hex'), observation.mainScreenshotSha256)
    assert.equal(observation.url, `chrome-extension://${contexts.contexts[0].extensionId}/index.html`)
    const lines = observation.card.split('\n').map((line: string) => line.trim())
    assert.ok(lines.includes(new URL(selected.providerUrl).host) && lines.includes(observation.providerUrl))
    assert.equal(lines.filter((line: string) => line.toLowerCase() === 'in use').length, 1); assert.ok(!lines.some((line:string)=>line.toLowerCase()==='backup copy'))
    assert.equal(observation.screenshot, `conformance/transaction-branches-active-provider-${stage}.png`)
    const bytes = read(observation.screenshot); assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    assert.equal(createHash('sha256').update(bytes).digest('hex'), observation.screenshotSha256)
    assert.ok(instant(report.startedAt) <= instant(observation.startedAt) && instant(observation.startedAt) <= instant(observation.endedAt) && instant(observation.endedAt) <= instant(cut.startedAt))
    if (stage === 'full-set') assert.ok(instant(report.trace.find((row: any) => row.id === 'full-held-b').endedAt) <= instant(observation.startedAt))
  }
}

export function transactionBranchAssertions(checked: any) {
  return checked.outcomes.map((row: any) => ({ id: `completion.${row.id}`, result: row.localChecks === 'SATISFIED' ? 'PASS' : row.result,
    detail: row.localChecks === 'SATISFIED' ? 'Exact public transaction branch, complete owned-state cuts and independent signed proof match; full native parent admission is also required.' : row.detail }))
}
export async function evaluateTransactionBranches(report: any) {
  const isolated = report.unknownSource?.storage ?? []
  return verifyTransactionBranches(report, { identity: report.identity, declaredNativePayments: report.declaredNativePayments,
    fixture: report.fixture, storage: [...report.observedStorage, ...isolated.filter((r: any) => r.rawTxHex !== null)],
    finalSubmissions: report.finalSubmissions,
    outputObservations: [...Array(report.outputObservationStart).fill(null), ...report.cuts.map((cut: any) => cut.observation)],
    providerRegistry: report.providerRegistry, routes: report.finalRoutes, unknownSource: report.unknownSource })
}
export async function verifyTransactionBranchParent(report: any, binding: BasketParentBinding) {
  assert.ok(['ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0', 'ITCVE-1@4.8.0'].includes(binding.profile)); assert.equal(report.mode, 'NATIVE_OBSERVATION'); assert.equal(report.identity, binding.identity)
  assert.deepEqual(report.fixture, binding.fixture)
  const read = binding.readEvidence, json = (name: string) => JSON.parse(read(name).toString()), registry = nativeCompletionProviders(read)
  verifyTransactionActiveProvider(report, read, binding.profile)
  assert.deepEqual(report.providerRegistry, registry); assert.deepEqual(json('native-output-provider-registry.json'), registry)
  const observations = json('native-output-snapshot-observations.json')
  assert.ok(Number.isSafeInteger(report.outputObservationStart) && report.outputObservationStart >= 0)
  assert.equal(report.outputObservationEnd - report.outputObservationStart, report.cuts.length)
  assert.deepEqual(observations.slice(report.outputObservationStart, report.outputObservationEnd), report.cuts.map((cut: any) => cut.observation))
  assert.deepEqual(report.finalRoutes, json('routes.json').slice(0, report.finalRoutes.length))
  assert.deepEqual(report.submissions, binding.globalSubmissions.slice(0, report.submissions.length))
  assert.deepEqual(report.finalSubmissions, binding.globalSubmissions.slice(0, report.finalSubmissions.length))
  assert.deepEqual(binding.finalSubmissions.slice(0, binding.globalSubmissions.length), binding.globalSubmissions)
  for (const row of report.observedStorage) assert.equal(binding.storageTransactions.get(row.txid)?.toHex(), row.rawTxHex, 'Module storage receipt differs from final independently observed Go storage')
  assert.ok(report.walletCalls <= bounds.walletCalls); assert.ok(report.funderCalls + (report.unknownSource?.trace.length ?? 0) <= bounds.externalFunderCalls)
  await hydrateTransactionCompletionFixture(report, binding)
  // Every implicit native input must descend from the independently admitted
  // completion/root inventory. Public explicit sources are checked separately.
  const checked = await verifyTransactionBranches(report, { identity: binding.identity, declaredNativePayments: binding.declaredNativePayments,
    fixture: binding.fixture, storage: [...binding.resolvedTransactions].map(([txid, tx]) => ({ txid, rawTxHex: tx.toHex() })),
    finalSubmissions: binding.finalSubmissions, outputObservations: observations, providerRegistry: registry, routes: json('routes.json'), unknownSource: report.unknownSource })
  const assertions = transactionBranchAssertions(checked)
  assert.deepEqual(assertions.map((row: any) => row.id), rows.map(row => `completion.${row}`)); assert.deepEqual(report.assertions, assertions)
  return { verified: true as const, assertions, publicCalls: report.walletCalls + report.funderCalls + (report.unknownSource?.trace.length ?? 0),
    independentCuts: report.cuts.length, completeBRC100Conformance: false as const }
}
