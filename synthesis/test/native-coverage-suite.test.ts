import assert from 'node:assert/strict'
import { test } from 'vitest'
import { LockingScript, MerklePath, PrivateKey, Transaction, UnlockingScript } from '@bsv/sdk'
import { verifyCoverageBrowserChain, verifyCoverageModuleFunding } from '../src/wallet-lab/native/verify-coverage-suite.js'

function fixture() {
  const mined = new Transaction(1, [], [{ satoshis: 1000, lockingScript: LockingScript.fromHex('51') }], 0)
  mined.merklePath = new MerklePath(10, [[{ offset: 0, hash: mined.id('hex'), txid: true }]])
  const spend = (parent: Transaction, index: number, amounts: number[]) => new Transaction(1, [{ sourceTransaction: parent, sourceOutputIndex: index, unlockingScript: UnlockingScript.fromHex(''), sequence: 0xffffffff }], amounts.map(satoshis => ({ satoshis, lockingScript: LockingScript.fromHex('51') })), 0)
  const payment = spend(mined, 0, [500, 490]), native = spend(payment, 0, [400]), foreign = spend(payment, 1, [390])
  const map = new Map([mined, payment, native, foreign].map(tx => [tx.id('hex'), tx]))
  const binding = { identity: PrivateKey.fromHex('78'.repeat(32)).toPublicKey().toString(), fixture: { txid: mined.id('hex'), rawHex: mined.toHex(), outputIndex: 0, fundingHeight: 10, maturityDepth: 100, merkleRoot: mined.id('hex') }, storageTransactions: new Map(map), resolvedTransactions: new Map(map), declaredNativePayments: [`${payment.id('hex')}.0`] }
  const call = (tx: Transaction, extra: any = {}) => ({ id: 'native', method: 'createAction', actor: 'wallet' as const, args: {}, result: { txid: tx.id('hex'), tx: tx.toAtomicBEEF() }, ...extra })
  return { payment, native, foreign, binding, call, spend }
}
test('module funding binds exact native inputs and same-source signed storage', async () => {
  const f = fixture(), result = await verifyCoverageModuleFunding([f.call(f.native)], f.binding)
  assert.equal(result.admitted.length, 1); assert.ok(result.declaredNativePayments.includes(`${f.native.id('hex')}.0`))
})
test('fixture funding cannot silently become native implicit funding', async () => {
  const f = fixture()
  await assert.rejects(verifyCoverageModuleFunding([f.call(f.foreign)], f.binding), /undeclared implicit funding/)
  const args = { inputs: [{ outpoint: `${f.payment.id('hex')}.1` }] }
  assert.equal((await verifyCoverageModuleFunding([f.call(f.foreign, { args })], f.binding)).admitted.length, 1)
  await assert.rejects(verifyCoverageModuleFunding([f.call(f.foreign, { args: { inputs: [{ outpoint: `${f.payment.id('hex')}.0` }] } })], f.binding), /omitted/)
})
test('fixture actor cannot consume native-owned payments', async () => {
  const f = fixture()
  await assert.rejects(verifyCoverageModuleFunding([f.call(f.native, { actor: 'funder' })], f.binding), /Fixture actor spent/)
  assert.equal((await verifyCoverageModuleFunding([f.call(f.foreign, { actor: 'funder' })], f.binding)).admitted.length, 1)
})
for (const response of ['txid-only', 'trailing-bytes', 'invalid-bytes', 'wrong-txid'] as const) test(`recoverable ${response} retains failure and cannot bypass actor funding`, async () => {
  const f = fixture(), outcome = { assertions: [{ id: 'native-predicate', result: 'FAIL' }], predicateFor: () => 'native-predicate' }
  const row = (tx: Transaction) => {
    const call: any = f.call(tx)
    if (response === 'txid-only') delete call.result.tx
    if (response === 'trailing-bytes') call.result.tx.push(99)
    if (response === 'invalid-bytes') call.result.tx = [999]
    if (response === 'wrong-txid') call.result.txid = 'ab'.repeat(32)
    return call
  }
  await assert.rejects(verifyCoverageModuleFunding([row(f.foreign)], f.binding, outcome), /undeclared implicit funding/)
  assert.equal((await verifyCoverageModuleFunding([row(f.native)], f.binding, outcome)).admitted.length, 1)
  await assert.rejects(verifyCoverageModuleFunding([row(f.native)], f.binding, { ...outcome, assertions: [{ id: 'native-predicate', result: 'PASS' }] }), /predicate FAIL/)
})
for (const mutation of ['missing-storage', 'missing-graph', 'wrong-body', 'wrong-txid', 'wrong-mined-root', 'foreign-sign-reference'] as const) test(`coverage funding rejects ${mutation}`, async () => {
  const f = fixture(), row = f.call(f.native)
  if (mutation === 'missing-storage') f.binding.storageTransactions.delete(f.native.id('hex'))
  if (mutation === 'missing-graph') f.binding.resolvedTransactions.delete(f.native.id('hex'))
  if (mutation === 'wrong-body') f.binding.storageTransactions.set(f.native.id('hex'), f.foreign)
  if (mutation === 'wrong-txid') row.result.txid = f.foreign.id('hex')
  if (mutation === 'wrong-mined-root') f.binding.fixture.rawHex = f.foreign.toHex()
  if (mutation === 'foreign-sign-reference') { row.method = 'signAction'; row.args = { reference: 'foreign' } }
  await assert.rejects(verifyCoverageModuleFunding([row], f.binding))
})

function browserFixture() {
  const identity = PrivateKey.fromHex('78'.repeat(32)).toPublicKey().toString(), profileBinding = 'ab'.repeat(32), extensionId = 'a'.repeat(32)
  const time = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString()
  const contexts: any[] = [{ sequence: 0, profileBinding, extensionId, openedAt: time(0) }]
  for (let n = 1; n <= 4; n++) {
    const receipt = { schema: 'tpnil-native-browser-restart@1', sequence: n, profileBinding, extensionId, identity, version: 'yours-wallet-5.1.1', oldPagesClosed: true, oldPageCount: 3, startedAt: time(n * 10), closedAt: time(n * 10 + 1), openedAt: time(n * 10 + 2), unlockedAt: time(n * 10 + 3), endedAt: time(n * 10 + 4), sandboxEvidence: `native-sandbox-restart-${n}.txt` }
    contexts[n - 1].closedAt = receipt.closedAt; contexts.push({ sequence: n, profileBinding, extensionId, openedAt: receipt.openedAt, restart: receipt })
  }
  const permission = { restarts: [structuredClone(contexts[3].restart)] }, certificate = { restart: { kind: 'NATIVE_BROWSER_RESTART', receipt: structuredClone(contexts[4].restart) } }
  const read = (name: string) => name.endsWith('.png') ? Buffer.from('89504e470d0a1a0a', 'hex') : Buffer.from('PID namespaces Yes\nSeccomp-BPF sandbox Yes')
  return { value: { schema: 'tpnil-native-browser-contexts@1', contexts }, identity, permission, certificate, read }
}
test('coverage parent admits all five same-profile native contexts', () => {
  const f = browserFixture(); assert.equal(verifyCoverageBrowserChain(f.value, f.identity, f.permission, f.certificate, f.read).contexts, 5)
})
for (const mutation of ['missing-context', 'swapped-identity', 'new-profile', 'unclosed-pages', 'backward-time', 'overlapping-restarts', 'fake-permission-restart', 'reference-certificate-restart', 'sandbox-disabled'] as const) test(`whole browser chain rejects ${mutation}`, () => {
  const f = browserFixture(), receipt = f.value.contexts[3].restart
  if (mutation === 'missing-context') f.value.contexts.pop()
  if (mutation === 'swapped-identity') receipt.identity = PrivateKey.fromHex('79'.repeat(32)).toPublicKey().toString()
  if (mutation === 'new-profile') receipt.profileBinding = 'cd'.repeat(32)
  if (mutation === 'unclosed-pages') receipt.oldPagesClosed = false
  if (mutation === 'backward-time') receipt.unlockedAt = f.value.contexts[0].openedAt
  if (mutation === 'overlapping-restarts') receipt.startedAt = f.value.contexts[2].restart.openedAt
  if (mutation === 'fake-permission-restart') f.permission.restarts = [f.value.contexts[2].restart]
  if (mutation === 'reference-certificate-restart') f.certificate.restart.kind = 'REFERENCE_CLIENT_REOPEN'
  if (mutation === 'sandbox-disabled') f.read = () => Buffer.from('PID namespaces No\nSeccomp-BPF sandbox No')
  assert.throws(() => verifyCoverageBrowserChain(f.value, f.identity, f.permission, f.certificate, f.read))
})
