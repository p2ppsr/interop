import fs from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { test } from 'vitest'
import { Transaction, PrivateKey, Script } from '@bsv/sdk'
import { policySha256 } from '../src/wallet-lab/native/coverage-completion/baskets-model.js'
import { verifyBasketObservations } from '../src/wallet-lab/native/coverage-completion/baskets-verifier.js'
import { basketAssertions, verifyBasketParent } from '../src/wallet-lab/native/coverage-completion/baskets-parent.js'

const directory = new URL('./fixtures/native-basket-boundaries/', import.meta.url)
const provenance = JSON.parse(fs.readFileSync(new URL('provenance.json', directory), 'utf8'))
const read = (name: string) => {
  const entry = provenance.files.find((row: any) => row.path === `${name}.gz`)
  const bytes = fs.readFileSync(new URL(entry.path, directory)), raw = gunzipSync(bytes)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.gzipSha256)
  assert.equal(createHash('sha256').update(raw).digest('hex'), entry.originalSha256)
  return JSON.parse(raw.toString())
}
const original = read('report.json'), originalBinding = read('binding.json')
const mined = JSON.parse(fs.readFileSync(new URL('../../fixtures/teranode/wab-funding-v1.json', import.meta.url), 'utf8'))

/** Explicit self-test adaptation: original calls/transactions are retained; an
 * empty second provider exercises parent joins. This is not a native capture. */
async function fixture() {
  const report = structuredClone(original), retained = structuredClone(originalBinding)
  report.schema = 'tpnil-native-basket-boundaries@1.0.0'
  report.claim = 'ENGINEERING_OBSERVATION_ONLY'; report.mode = 'NATIVE_OBSERVATION'; report.policySha256 = policySha256
  report.reopen.kind = 'PUBLIC_CWI_HANDLE_REFRESH'
  const source = report.providerRegistry[0], counterpart = { id: 'source/replacement-wallet.itcve.test',
    identityKey: PrivateKey.fromHex('12'.repeat(32)).toPublicKey().toString(), componentIdentity: structuredClone(source.componentIdentity) }
  const registry = [source, counterpart]
  report.providerRegistry = registry; report.finalProviderRegistry = structuredClone(registry)
  for (const row of report.snapshots) row.observation.snapshots.providers.push({ id: counterpart.id, componentIdentity: counterpart.componentIdentity,
    snapshot: { schema: 'tpnil-native-output-snapshot@2.0.0', identityKey: report.identity, providerIdentityKey: counterpart.identityKey, outputs: [] } })
  const observations = retained.outputObservations
  for (const row of report.snapshots) observations[row.observation.sequence] = structuredClone(row.observation)
  const storage = new Map<string, Transaction>(retained.storageTransactions.map((row: any) => [row.txid, Transaction.fromHex(row.rawTxHex)]))
  const graph = new Map(storage)
  const add = (tx: Transaction) => { graph.set(tx.id('hex'), tx); for (const input of tx.inputs) if (input.sourceTransaction) add(input.sourceTransaction) }
  add(Transaction.fromAtomicBEEF([...Buffer.from(mined.atomicBeefHex, 'hex')]))
  for (const row of [...retained.fundingTrace, ...report.trace]) if (row.result?.tx) add(Transaction.fromAtomicBEEF(row.result.tx))
  const payment = retained.fundingTrace.find((row: any) => row.id === 'initial-payment').result.txid
  const evidence: Record<string, any> = { 'service-components.json': source.componentIdentity,
    'conformance/service-counterparts.json': { 'replacement-wallet.itcve.test': counterpart.componentIdentity },
    'native-output-provider-registry.json': structuredClone(registry), 'native-output-snapshot-observations.json': observations }
  const binding = { profile: 'ITCVE-1@4.5.0' as const, identity: report.identity, fixture: mined,
    storageTransactions: storage, resolvedTransactions: graph, declaredNativePayments: [`${payment}.0`],
    globalSubmissions: retained.globalSubmissions, finalSubmissions: retained.finalSubmissions,
    readEvidence: (name: string) => Buffer.from(JSON.stringify(evidence[name])) }
  report.assertions = basketAssertions(await verifyBasketObservations(report))
  return { report, binding, evidence }
}

test('retained exact public fixture supports scoped predicates while six conflicting-limit checks remain blocked', async () => {
  const f = await fixture(), result = await verifyBasketParent(f.report, f.binding)
  assert.equal(result.verified, true)
  assert.equal(result.ownedSnapshots, 80)
  assert.equal(result.signedTransactions, 2)
  assert.equal(result.assertions.filter(row => row.result === 'PASS').length, 33)
  assert.equal(result.assertions.filter(row => row.result === 'BLOCKED').length, 6)
  assert.equal(result.completeBRC100Conformance, false)
}, 30_000)

for (const kind of ['omit-all-providers', 'omit-retired-provider', 'forged-identity', 'wrong-component', 'omit-storage', 'wrong-root', 'foreign-native-funding', 'changed-observer-ledger', 'missing-submission', 'missing-final-prefix', 'promote-conflict', 'wrong-mode'] as const)
  test(`complete basket parent rejects ${kind}`, async () => {
    const f = await fixture()
    if (kind === 'omit-all-providers') { f.report.providerRegistry = []; f.report.finalProviderRegistry = [] }
    if (kind === 'omit-retired-provider') f.evidence['native-output-provider-registry.json'].pop()
    if (kind === 'forged-identity') f.evidence['native-output-provider-registry.json'][0].identityKey = f.report.identity
    if (kind === 'wrong-component') f.evidence['native-output-provider-registry.json'][0].componentIdentity = {}
    if (kind === 'omit-storage') f.binding.storageTransactions.clear()
    if (kind === 'wrong-root') f.binding.fixture = { ...mined, merkleRoot: '00'.repeat(32) }
    if (kind === 'foreign-native-funding') f.binding.declaredNativePayments = [`${mined.txid}.0`]
    if (kind === 'changed-observer-ledger') f.evidence['native-output-snapshot-observations.json'][f.report.snapshotStart].snapshots.providers = []
    if (kind === 'missing-submission') f.binding.globalSubmissions.pop()
    if (kind === 'missing-final-prefix') f.binding.finalSubmissions.shift()
    if (kind === 'promote-conflict') f.report.assertions.find((row: any) => row.result === 'BLOCKED').result = 'PASS'
    if (kind === 'wrong-mode') f.report.mode = 'LAB_SELF_TEST_ONLY'
    await assert.rejects(verifyBasketParent(f.report, f.binding))
  }, 30_000)

for (const ancestor of [false, true]) test(`late protected source spend is rejected ${ancestor ? 'inside ancestry' : 'as target'}`, async () => {
  const f = await fixture(), source = Transaction.fromAtomicBEEF(f.report.trace.find((row: any) => row.id === 'fixture-native').result.tx)
  const spend = new Transaction(1, [{ sourceTransaction: source, sourceOutputIndex: 0, unlockingScript: Script.fromHex('51'), sequence: 0xffffffff }], [{ satoshis: 90, lockingScript: Script.fromHex('51') }], 0)
  const target = ancestor ? new Transaction(1, [{ sourceTransaction: spend, sourceOutputIndex: 0, unlockingScript: Script.fromHex(''), sequence: 0xffffffff }], [{ satoshis: 80, lockingScript: Script.fromHex('51') }], 0) : spend
  f.binding.finalSubmissions.push({ txid: target.id('hex'), beefHex: Buffer.from(target.toAtomicBEEF()).toString('hex'), verdict: 'REJECTED_BY_NETWORK' })
  await assert.rejects(verifyBasketParent(f.report, f.binding), /Protected basket outpoint/)
}, 30_000)
