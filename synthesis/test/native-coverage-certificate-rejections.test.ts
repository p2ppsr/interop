import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { test } from 'vitest'
import { PrivateKey, Transaction, LockingScript, UnlockingScript } from '@bsv/sdk'
import { decodeCoverageObservation, coverageObservationEncoding } from '../src/wallet-lab/native/coverage-observation.js'
import { evaluateCertificateRejections } from '../src/wallet-lab/native/coverage-completion/certificate-rejections-verifier.js'
import { certificateRejectionAssertions, verifyCertificateRejectionParent } from '../src/wallet-lab/native/coverage-completion/certificate-rejections-parent.js'

const directory = new URL('./fixtures/native-certificate-rejections/basket-anchor/', import.meta.url)
const provenance = JSON.parse(fs.readFileSync(new URL('provenance.json', directory), 'utf8'))
const read = (name: string) => {
  const entry = provenance.files.find((r: any) => r.path === `${name}.gz`), bytes = fs.readFileSync(new URL(entry.path, directory)), raw = gunzipSync(bytes)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.gzipSha256)
  assert.equal(createHash('sha256').update(raw).digest('hex'), entry.originalSha256)
  return JSON.parse(raw.toString())
}
const original = decodeCoverageObservation<any>(read('report.json'), coverageObservationEncoding)
const result = (checked: any, id: string) => checked.results.find((r: any) => r.id.includes(id))
test('real browser library reference retains19 scoped passes and unavailable native restart', async () => {
  const checked = await evaluateCertificateRejections(structuredClone(original))
  assert.deepEqual(checked.counts, { SCOPED_PASS: 19, FAIL: 0, BLOCKED: 1 })
  assert.equal(checked.nativeAssertionsAccepted, 0)
  assert.equal(original.trace.length, 114); assert.equal(original.inventories.length, 44)
})
for (const id of ['control-direct', 'control-distinct', 'control-issuance']) test(`rejects an incomplete newly inserted ${id} positive control`, async () => {
  const report = structuredClone(original), row = report.trace.find((r: any) => r.id === `${id}.inventory.page-0`)
  delete row.result.certificates.find((c: any) => c.serialNumber === report.trace.find((r: any) => r.id === id).result.serialNumber).signature
  const checked = await evaluateCertificateRejections(report)
  assert.ok((checked.counts.FAIL ?? 0) > 0); assert.ok((checked.counts.SCOPED_PASS ?? 0) < 19)
})
for (const mutation of ['accepted-negative', 'persistent-write', 'wrong-keyring', 'wrong-subject', 'cut-after-call', 'altered-ledger-identity', 'reused-cut', 'missing-provider', 'timeout', 'contradictory-result', 'wrong-request'] as const)
  test(`rejects ${mutation} in actual certificate observations`, async () => {
    const report = structuredClone(original), row = report.trace.find((r: any) => r.id === 'direct.missing-signature')
    const before = report.inventories.find((r: any) => r.id === 'direct.missing-signature.before'), after = report.inventories.find((r: any) => r.id === 'direct.missing-signature.after')
    if (mutation === 'accepted-negative') { delete row.error; row.result = report.fixtures['direct.missing-signature'] }
    if (mutation === 'persistent-write') after.observation.snapshots.providers[0].snapshot.certificates[0].signature = 'changed'
    if (mutation === 'wrong-keyring') report.fixtures['direct.missing-signature'].masterKeyring.name = Buffer.alloc(32).toString('base64')
    if (mutation === 'wrong-subject') report.fixtures['direct.missing-signature'].subject = PrivateKey.fromHex('72'.repeat(32)).toPublicKey().toString()
    if (mutation === 'cut-after-call') before.endedAt = after.endedAt
    if (mutation === 'altered-ledger-identity') before.observation.identityKey = PrivateKey.fromHex('72'.repeat(32)).toPublicKey().toString()
    if (mutation === 'reused-cut') after.observation = structuredClone(before.observation)
    if (mutation === 'missing-provider') before.observation.snapshots.providers = []
    if (mutation === 'timeout') row.error.message = 'signature validation timed out'
    if (mutation === 'contradictory-result') row.result = { certificate: 'valid' }
    if (mutation === 'wrong-request') row.args.fields = {}
    assert.notEqual(result(await evaluateCertificateRejections(report), 'direct-missing-signature').result, 'SCOPED_PASS')
  })

/** Explicit LAB_SELF_TEST_ONLY composition of genuine public data. Synthetic
 * browser receipts exercise parent joins; they are never native evidence. */
async function parentFixture() {
  const report = structuredClone(original), basket = JSON.parse(gunzipSync(fs.readFileSync(new URL('./fixtures/native-basket-boundaries/report.json.gz', import.meta.url))).toString())
  const basketBinding = JSON.parse(gunzipSync(fs.readFileSync(new URL('./fixtures/native-basket-boundaries/binding.json.gz', import.meta.url))).toString())
  report.mode = 'NATIVE_OBSERVATION'; report.contextBaseSequence = 7; report.contextProfileBinding = 'lab-self-test-profile'; report.extensionId = 'a'.repeat(32)
  const source = { ...report.providerRegistry[0], id: 'source' }, other = { id: 'source/replacement-wallet.itcve.test', identityKey: PrivateKey.fromHex('12'.repeat(32)).toPublicKey().toString(), componentIdentity: structuredClone(source.componentIdentity) }
  const registry = [source, other]; report.providerRegistry = registry
  for (const cut of report.inventories) {
    cut.observation.registry = structuredClone(registry)
    cut.observation.snapshots.providers[0].id = 'source'
    cut.observation.snapshots.providers.push({ id: other.id, componentIdentity: other.componentIdentity, snapshot: {
      schema: 'tpnil-native-certificate-inventory@1.0.0', identityKey: report.identity, providerIdentityKey: other.identityKey, certificates: [], fields: [] } })
  }
  const prefix = basketBinding.globalSubmissions
  report.submissionStart = prefix.length; report.submissionEnd = prefix.length; report.submissionPrefix = structuredClone(prefix)
  for (const row of report.trace) { row.submissionStart = prefix.length; row.submissionEnd = prefix.length }
  const receipt = { schema: 'tpnil-native-browser-restart@1', sequence: 8, profileBinding: report.contextProfileBinding, extensionId: report.extensionId,
    identity: report.identity, startedAt: report.restart.startedAt, closedAt: report.restart.startedAt, openedAt: report.restart.startedAt,
    unlockedAt: report.restart.endedAt, endedAt: report.restart.endedAt, oldPagesClosed: true, oldPageCount: 3,
    version: 'yours-wallet-5.1.1', sandboxEvidence: 'native-sandbox-restart-8.txt' }
  report.restart = { ...report.restart, kind: 'NATIVE_BROWSER_RESTART', receipt }
  const contexts = Array.from({ length: 9 }, (_v, sequence) => ({ sequence, profileBinding: report.contextProfileBinding, extensionId: report.extensionId,
    openedAt: report.startedAt, closedAt: receipt.closedAt, restart: { endedAt: report.startedAt } })) as any[]
  contexts[8] = { sequence: 8, profileBinding: report.contextProfileBinding, extensionId: report.extensionId, openedAt: receipt.openedAt, restart: receipt }
  const basketBytes = Buffer.from(JSON.stringify(basket)), tx = Transaction.fromAtomicBEEF(basket.trace.find((r: any) => r.id === 'fixture-external').result.tx)
  report.anchor = { source: 'conformance/basket-boundaries.json', sha256: createHash('sha256').update(basketBytes).digest('hex'), outpoint: `${tx.id('hex')}.15`, rawTxHex: tx.toHex() }
  const graph = new Map<string, Transaction>()
  const add = (t: Transaction) => { graph.set(t.id('hex'), t); for (const i of t.inputs) if (i.sourceTransaction) add(i.sourceTransaction) }
  for (const r of [...basketBinding.fundingTrace, ...basket.trace]) if (r.result?.tx) add(Transaction.fromAtomicBEEF(r.result.tx))
  const fixture = JSON.parse(fs.readFileSync(new URL('../../fixtures/teranode/wab-funding-v1.json', import.meta.url), 'utf8'))
  const evidence: Record<string, any> = { 'conformance/basket-boundaries.json': basket, 'service-components.json': source.componentIdentity,
    'conformance/service-counterparts.json': { 'replacement-wallet.itcve.test': other.componentIdentity }, 'native-output-provider-registry.json': registry,
    'native-completion-inventory-ledger.json': { registry, certificates: report.inventories.map((r: any) => structuredClone(r.observation)) },
    'routes.json': read('routes.json'), 'native-browser-contexts.json': { schema: 'tpnil-native-browser-contexts@1', contexts },
    'native-sandbox-restart-8.txt': 'PID namespaces Yes\nSeccomp-BPF sandbox Yes', 'conformance/restart-8-unlocked.png': Buffer.from('89504e470d0a1a0a', 'hex') }
  report.assertions = certificateRejectionAssertions(await evaluateCertificateRejections(report))
  const binding = { profile: 'ITCVE-1@4.5.0' as const, identity: report.identity, fixture, storageTransactions: graph, resolvedTransactions: graph,
    declaredNativePayments: [], globalSubmissions: prefix, finalSubmissions: prefix, readEvidence: (name: string) => Buffer.isBuffer(evidence[name]) ? evidence[name] : Buffer.from(typeof evidence[name] === 'string' ? evidence[name] : JSON.stringify(evidence[name])) }
  return { report, binding, evidence }
}
test('complete certificate parent binds actual public data with explicitly synthetic native receipt controls', async () => {
  const f = await parentFixture(), verified = await verifyCertificateRejectionParent(f.report, f.binding)
  assert.equal(verified.assertions.filter((r: any) => r.result === 'PASS').length, 20)
  assert.equal(verified.certificateCuts, 44); assert.equal(verified.signedTransactions, 0)
})
test('valid late signed transaction cannot spend the certificate revocation anchor', async () => {
  const f = await parentFixture(); await verifyCertificateRejectionParent(f.report, f.binding)
  const [txid, index] = f.report.anchor.outpoint.split('.'), parent = f.binding.resolvedTransactions.get(txid)!
  const tx = new Transaction(1, [{ sourceTransaction: parent, sourceOutputIndex: Number(index), unlockingScript: UnlockingScript.fromHex(''), sequence: 0xffffffff }], [{ satoshis: 1, lockingScript: LockingScript.fromHex('51') }], 0)
  assert.ok(await tx.verify({ currentHeight: async () => f.binding.fixture.fundingHeight + f.binding.fixture.maturityDepth,
    isValidRootForHeight: async (root: string, height: number) => root === f.binding.fixture.merkleRoot && height === f.binding.fixture.fundingHeight }))
  f.binding.resolvedTransactions.set(tx.id('hex'), tx)
  f.binding.finalSubmissions = [...f.binding.finalSubmissions, { txid: tx.id('hex'), beefHex: Buffer.from(tx.toAtomicBEEF()).toString('hex'), verdict: 'ACCEPTED_BY_NETWORK' }]
  await assert.rejects(verifyCertificateRejectionParent(f.report, f.binding), /revocation anchor spent/)
})
test('unassigned retained issuer attempt cannot be hidden by a shortened call window', async () => {
  const report = structuredClone(original), row = report.trace.find((r: any) => r.id === 'issuance.invalid-signature')
  assert.ok(row.routeEnd > row.routeStart); row.routeEnd--
  const checked = await evaluateCertificateRejections(report)
  assert.equal(checked.counts.SCOPED_PASS, 0)
})
for (const kind of ['missing-provider', 'wrong-ledger', 'dropped-route', 'changed-anchor', 'missing-storage', 'wrong-restart', 'wrong-identity', 'module-submission', 'missing-final-prefix', 'changed-verdict', 'wrong-version', 'zero-pages', 'wrong-sandbox-file', 'no-pid', 'no-seccomp', 'invalid-unlock-image', 'previous-open-after-restart'] as const)
  test(`native certificate parent rejects ${kind}`, async () => {
    const f = await parentFixture()
    await verifyCertificateRejectionParent(f.report, f.binding)
    if (kind === 'missing-provider') f.evidence['native-completion-inventory-ledger.json'].registry = []
    if (kind === 'wrong-ledger') f.evidence['native-completion-inventory-ledger.json'].certificates[0].sequence++
    if (kind === 'dropped-route') f.evidence['routes.json'].splice(f.report.routeStart, 1)
    if (kind === 'changed-anchor') f.report.anchor.sha256 = '00'.repeat(32)
    if (kind === 'missing-storage') f.binding.storageTransactions = new Map()
    if (kind === 'wrong-restart') f.report.restart.receipt.sequence = 7
    if (kind === 'wrong-identity') f.binding.identity = PrivateKey.fromHex('72'.repeat(32)).toPublicKey().toString()
    if (kind === 'module-submission') f.report.submissionEnd++
    if (kind === 'missing-final-prefix') f.binding.finalSubmissions = []
    if (kind === 'changed-verdict') f.report.assertions[0].result = 'BLOCKED'
    if (kind === 'wrong-version') f.report.restart.receipt.version = 'another-wallet'
    if (kind === 'zero-pages') f.report.restart.receipt.oldPageCount = 0
    if (kind === 'wrong-sandbox-file') f.report.restart.receipt.sandboxEvidence = 'native-sandbox-restart-7.txt'
    if (kind === 'no-pid') f.evidence['native-sandbox-restart-8.txt'] = 'PID namespaces No\nSeccomp-BPF sandbox Yes'
    if (kind === 'no-seccomp') f.evidence['native-sandbox-restart-8.txt'] = 'PID namespaces Yes\nSeccomp-BPF sandbox No'
    if (kind === 'invalid-unlock-image') f.evidence['conformance/restart-8-unlocked.png'] = Buffer.from('not a png')
    if (kind === 'previous-open-after-restart') f.evidence['native-browser-contexts.json'].contexts[7].openedAt = new Date(Date.parse(f.report.restart.endedAt) + 1000).toISOString()
    await assert.rejects(verifyCertificateRejectionParent(f.report, f.binding))
  })
