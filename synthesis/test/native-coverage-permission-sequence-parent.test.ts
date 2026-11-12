import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'vitest'
import { selftestFixture } from './fixtures/native-permission-sequence/fixture.js'
import { verifyPermissionSequenceParent } from '../src/wallet-lab/native/coverage-completion/permissions-parent.js'
import { evaluatePermissionSequence } from '../src/wallet-lab/native/coverage-completion/permissions-verifier.js'
import { encodeCoverageObservation } from '../src/wallet-lab/native/coverage-observation.js'

/** Synthetic parent contract only. Native source, browser process and provider
 * admission are separate mandatory gates, not supplied by this test. */
async function fixture() {
  const f = await selftestFixture(true), report: any = f.report
  report.mode = 'NATIVE_OBSERVATION'
  const time = Date.parse(report.startedAt), at = (offset: number) => new Date(time + offset).toISOString()
  const evidence = f.evidence, put = (name: string, value: unknown) => evidence.set(name, Buffer.from(JSON.stringify(value)))
  const original = { identity: report.identity, certificate: report.anchor.certificate, endedAt: at(-1), steps: [{ id: 'setup-basket',
    outcome: { status: 'fulfilled', value: { txid: f.transaction.id('hex'), tx: f.transaction.toAtomicBEEF() } } }] }
  const anchorName = 'conformance/permission-coverage.json'; put(anchorName, original)
  report.anchor.sourceEvidencePath = anchorName
  report.anchor.sourceEvidenceSha256 = createHash('sha256').update(evidence.get(anchorName)!).digest('hex')
  const contexts: any[] = [{ sequence: 0, profileBinding: report.contextProfileBinding, extensionId: report.extensionId, openedAt: at(-10000) }]
  for (let sequence = 1; sequence <= 4; sequence++) {
    const value = at(-9000 + sequence * 1000), receipt = { schema: 'tpnil-native-browser-restart@1', sequence,
      profileBinding: report.contextProfileBinding, extensionId: report.extensionId, identity: report.identity,
      startedAt: value, closedAt: value, openedAt: value, unlockedAt: value, endedAt: value,
      oldPageCount: 1, oldPagesClosed: true, version: 'yours-wallet-5.1.1', sandboxEvidence: `native-sandbox-restart-${sequence}.txt` }
    contexts.at(-1).closedAt = value; contexts.push({ sequence, profileBinding: receipt.profileBinding, extensionId: receipt.extensionId, openedAt: value, restart: receipt })
    evidence.set(receipt.sandboxEvidence, Buffer.from('PID namespaces Yes\nSeccomp-BPF sandbox Yes'))
    evidence.set(`conformance/restart-${sequence}-unlocked.png`, Buffer.from('89504e470d0a1a0a', 'hex'))
  }
  for (const row of report.observations.filter((row: any) => row.kind === 'restart')) {
    contexts.at(-1).closedAt = row.value.closedAt
    contexts.push({ sequence: row.value.sequence, profileBinding: row.value.profileBinding, extensionId: row.value.extensionId,
      openedAt: row.value.openedAt, restart: structuredClone(row.value) })
  }
  // The later certificate module owns context8. It must be present in the full
  // parent, but is not falsely claimed to be verified by the permission module.
  contexts.push({ sequence: 8 })
  put('native-browser-contexts.json', { schema: 'tpnil-native-browser-contexts@1', contexts })
  put('conformance/permission-extension.json', { restarts: [contexts[3].restart] })
  put('conformance/coverage-certificates.json', encodeCoverageObservation({ restart: { kind: 'NATIVE_BROWSER_RESTART', receipt: contexts[4].restart } }))
  const checked = await evaluatePermissionSequence(report, f.read)
  report.assertions = checked.outcomes.map(row => ({ id: row.id, result: row.structuralAndCryptographicChecks === 'SATISFIED' ? 'PASS' : row.result,
    detail: row.structuralAndCryptographicChecks === 'SATISFIED' ? 'Scoped public sequence and cryptographic predicates matched; native admission also requires the complete parent evidence.' : row.detail }))
  const binding = { profile: 'ITCVE-1@4.5.0' as const, identity: report.identity,
    globalSubmissions: [] as any[], finalSubmissions: [] as any[], storageTransactions: new Map([[f.transaction.id('hex'), f.transaction]]),
    resolvedTransactions: new Map([[f.transaction.id('hex'), f.transaction], [f.source.id('hex'), f.source]]),
    declaredNativePayments: [`${f.source.id('hex')}.0`], readEvidence: f.read }
  return { ...f, report, binding, original, contexts, put }
}

test('complete synthetic parent joins eight scoped checks and retains the broader native gate', async () => {
  const f = await fixture(), result = await verifyPermissionSequenceParent(f.report, f.binding)
  assert.equal(result.assertions.length, 8); assert.ok(result.assertions.every(row => row.result === 'PASS'))
  assert.equal(result.completeBRC100Conformance, false)
})
for (const kind of ['old-profile', 'reference-mode', 'missing-ui-freshness', 'stale-anchor-digest', 'forged-anchor-body', 'trailing-anchor-beef', 'missing-storage', 'missing-graph', 'foreign-funding', 'missing-context', 'wrong-profile-context', 'unclosed-browser', 'unencoded-certificate', 'forged-parent-restart', 'unexpected-submission', 'unbound-final-prefix', 'promoted-failure', 'missing-cleanup'] as const)
  test(`permission parent rejects ${kind}`, async () => {
    const f = await fixture()
    if (kind === 'old-profile') (f.binding as any).profile = 'ITCVE-1@4.4.0'
    if (kind === 'reference-mode') f.report.mode = 'REFERENCE'
    if (kind === 'missing-ui-freshness') f.report.freshness.kind = 'UNAVAILABLE'
    if (kind === 'stale-anchor-digest') f.report.anchor.sourceEvidenceSha256 = '0'.repeat(64)
    if (kind === 'forged-anchor-body') f.report.anchor.rawTxHex += '00'
    if (kind === 'trailing-anchor-beef') { f.original.steps[0]!.outcome.value.tx.push(0); f.put('conformance/permission-coverage.json', f.original); f.report.anchor.sourceEvidenceSha256 = createHash('sha256').update(f.evidence.get('conformance/permission-coverage.json')!).digest('hex') }
    if (kind === 'missing-storage') f.binding.storageTransactions.clear()
    if (kind === 'missing-graph') f.binding.resolvedTransactions.clear()
    if (kind === 'foreign-funding') f.binding.declaredNativePayments = ['0'.repeat(64) + '.0']
    if (kind === 'missing-context') { f.contexts.pop(); f.put('native-browser-contexts.json', { schema: 'tpnil-native-browser-contexts@1', contexts: f.contexts }) }
    if (kind === 'wrong-profile-context') { f.contexts[6].profileBinding = 'f'.repeat(64); f.put('native-browser-contexts.json', { schema: 'tpnil-native-browser-contexts@1', contexts: f.contexts }) }
    if (kind === 'unclosed-browser') { f.contexts[5].closedAt = '2000-01-01T00:00:00.000Z'; f.put('native-browser-contexts.json', { schema: 'tpnil-native-browser-contexts@1', contexts: f.contexts }) }
    if (kind === 'unencoded-certificate') f.put('conformance/coverage-certificates.json', { restart: { kind: 'NATIVE_BROWSER_RESTART', receipt: f.contexts[4].restart } })
    if (kind === 'forged-parent-restart') { f.contexts[6].restart.oldPagesClosed = false; f.put('native-browser-contexts.json', { schema: 'tpnil-native-browser-contexts@1', contexts: f.contexts }) }
    if (kind === 'unexpected-submission') { f.report.submissionEnd = 1; f.report.submissionSuffix = [{}]; f.binding.globalSubmissions.push({}) }
    if (kind === 'unbound-final-prefix') f.binding.globalSubmissions.push({ txid: 'unbound' })
    if (kind === 'promoted-failure') f.report.assertions[0].result = 'FAIL'
    if (kind === 'missing-cleanup') f.report.cleanup.pagesClosed = false
    await assert.rejects(verifyPermissionSequenceParent(f.report, f.binding))
  })
