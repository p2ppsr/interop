import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { Transaction } from '@bsv/sdk'
import { test } from 'vitest'
import { verifyCompletionFunding } from '../src/wallet-lab/native/coverage-completion/funding.js'

const directory = new URL('./fixtures/native-completion-funding/', import.meta.url)
const provenance = JSON.parse(fs.readFileSync(new URL('provenance.json', directory), 'utf8'))
const compressed = fs.readFileSync(new URL('reference.json.gz', directory)), bytes = gunzipSync(compressed)
assert.equal(createHash('sha256').update(compressed).digest('hex'), provenance.gzipSha256)
assert.equal(createHash('sha256').update(bytes).digest('hex'), provenance.originalSha256)
const original = JSON.parse(bytes.toString())

function fixture() {
  const { report, binding: retained, evidence } = structuredClone(original)
  const storage = new Map<string, Transaction>(retained.storageRows.map((row: any) => [row.txid, Transaction.fromHex(row.rawTxHex)]))
  const graph = new Map(storage), root = Transaction.fromAtomicBEEF([...Buffer.from(retained.fixture.atomicBeefHex, 'hex')])
  graph.set(root.id('hex'), root)
  function hydrate(tx: Transaction, ancestors = new Set<string>()): Transaction {
    const id = tx.id('hex'); assert.ok(!ancestors.has(id) && ancestors.size < 32)
    if (id === root.id('hex')) return root
    tx.merklePath = undefined
    for (const input of tx.inputs) { const parent = graph.get(input.sourceTXID!); assert.ok(parent); input.sourceTransaction = hydrate(parent, new Set([...ancestors, id])) }
    return tx
  }
  for (const tx of graph.values()) hydrate(tx)
  const binding = { ...retained, storageTransactions: storage, resolvedTransactions: graph,
    readEvidence: (name: string) => Buffer.from(JSON.stringify(evidence[name])) }
  return { report, binding, evidence }
}

test('actual candidate manager and Go reference binds one shared50000 payment with complete provider evidence', async () => {
  const f = fixture(), result = await verifyCompletionFunding(f.report, f.binding)
  assert.equal(result.verified, true); assert.equal(result.actualPaymentSatoshis, 50000); assert.equal(result.actualFee, 47)
  assert.equal(result.declaredNativePayments.length, 1)
  assert.equal(f.report.initialOwnedSatoshis, 0); assert.equal(f.report.finalOwnedSatoshis, 50000)
  assert.equal(f.evidence['native-output-provider-registry.json'].length, 2)
  assert.equal(provenance.claim, 'ACTUAL_CANDIDATE_4A_LOCAL_MANAGER_GO_REFERENCE_NOT_NATIVE_QUALIFICATION')
})

for (const kind of ['cap', 'stage', 'second-payment', 'wrong-actor', 'mutated-request', 'missing-cleanup', 'negative-index', 'fractional-index',
  'getter-submission', 'overlapping-window', 'missing-accepted-receipt', 'wrong-mined-root', 'missing-storage', 'missing-final-prefix',
  'omit-provider', 'rename-provider', 'swap-provider-identity', 'drop-snapshot', 'synchronized-omitted-provider', 'extra-owned-output',
  'wrong-derived-script', 'false-total'] as const) test(`funding parent rejects ${kind}`, async () => {
  const f = fixture(), payment = f.report.trace.find((row: any) => row.id === 'completion-payment')
  if (kind === 'cap') f.report.policy.maximumOwnedSatoshis = 100001
  if (kind === 'stage') f.report.policy.stage = 'refill-failed-base-cases'
  if (kind === 'second-payment') f.report.trace.push(structuredClone(payment))
  if (kind === 'wrong-actor') payment.actor = 'wallet'
  if (kind === 'mutated-request') payment.args.options.trustSelf = 'known'
  if (kind === 'missing-cleanup') f.report.cleanup.funderClosed = false
  if (kind === 'negative-index') f.report.submissionStart = -1
  if (kind === 'fractional-index') payment.submissionEnd += 0.5
  if (kind === 'getter-submission') f.report.trace[0].submissionEnd++
  if (kind === 'overlapping-window') f.report.trace[2].submissionStart--
  if (kind === 'missing-accepted-receipt') for (const row of f.binding.globalSubmissions) if (row.txid === payment.result.txid) row.verdict = 'REJECTED_BY_NETWORK'
  if (kind === 'wrong-mined-root') f.binding.fixture.merkleRoot = '00'.repeat(32)
  if (kind === 'missing-storage') f.binding.storageTransactions.delete(payment.result.txid)
  if (kind === 'missing-final-prefix') f.binding.finalSubmissions.shift()
  if (kind === 'omit-provider') f.evidence['native-output-provider-registry.json'].pop()
  if (kind === 'rename-provider') f.evidence['native-output-provider-registry.json'][1].id = 'invented'
  if (kind === 'swap-provider-identity') f.evidence['native-output-provider-registry.json'][1].identityKey = f.report.identity
  if (kind === 'drop-snapshot') f.evidence['native-output-snapshot-observations.json'].pop()
  if (kind === 'synchronized-omitted-provider') {
    f.evidence['native-output-provider-registry.json'].pop()
    for (const snapshot of [...f.report.snapshots, ...f.evidence['native-output-snapshot-observations.json']]) snapshot.snapshots.providers.pop()
  }
  if (kind === 'extra-owned-output') {
    const after = f.report.snapshots[1], outputs = after.snapshots.providers[0].snapshot.outputs
    const added = { ...outputs[0], outputId: outputs[0].outputId + 1 }; outputs.push(added)
    f.evidence['native-output-snapshot-observations.json'][1] = structuredClone(after)
  }
  if (kind === 'wrong-derived-script') payment.args.outputs[0].lockingScript = '51'
  if (kind === 'false-total') f.report.finalOwnedSatoshis = 100000
  await assert.rejects(verifyCompletionFunding(f.report, f.binding))
})
