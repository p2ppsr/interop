import {nativeProofResources} from './proof-resources.js'
import assert from 'node:assert/strict'
import { P2PKH, PrivateKey, ProtoWallet, PublicKey, Transaction } from '@bsv/sdk'
import { verifyNativeReserveStorage } from './conformance-reserve-storage.js'

const policy = { schema: 'tpnil-native-funding-reserves@1', count: 2, satoshisEach: 10_000, stage: 'before-all-customer-scenarios', recoveryScope: 'unaffected-preexisting-funds' }
/** Every accepted pre-scenario transaction shares one UTXO history. Repeated
 * ancestors are visited once; conflicting spends by distinct txids fail closed. */
export function verifyReserveGraph(transactions: Transaction[], protectedOutpoints: string[]): void {
  const visited = new Set<string>(), spent = new Map<string, string>()
  function visit(tx: Transaction, depth = 0): void {
    assert.ok(depth < nativeProofResources().maximumProofDepth); const txid = tx.id('hex'); if (visited.has(txid)) return; visited.add(txid)
    for (const input of tx.inputs) {
      const outpoint = `${input.sourceTXID ?? input.sourceTransaction?.id('hex')}.${input.sourceOutputIndex}`
      const previous = spent.get(outpoint)
      assert.ok(previous === undefined, `Conflicting or duplicate accepted spends of ${outpoint}`)
      spent.set(outpoint, txid)
      if (input.sourceTransaction) visit(input.sourceTransaction, depth + 1)
    }
  }
  for (const tx of transactions) visit(tx)
  for (const outpoint of protectedOutpoints) assert.ok(!spent.has(outpoint), `Initial native payment already consumed before customer scenarios: ${outpoint}`)
}
export function spendsOnlyDeclaredNativePayments(tx: Transaction, roots: string[], depth = 0): boolean {
  assert.ok(depth < nativeProofResources().maximumProofDepth)
  return tx.inputs.length > 0 && tx.inputs.every(input => {
    const outpoint = `${input.sourceTXID ?? input.sourceTransaction?.id('hex')}.${input.sourceOutputIndex}`
    return roots.includes(outpoint) || input.sourceTransaction !== undefined && spendsOnlyDeclaredNativePayments(input.sourceTransaction, roots, depth + 1)
  })
}
/** The method corpus's own declared 1000-satoshi payment is eligible only for
 * later clause operations, never for baseline/rejection funding preconditions. */
export async function verifyBoundaryFundingRoot(boundary: any, binding: { identity: string; fixture: any; storageTransactions: Map<string, Transaction>; submissions: any[]; metadataTxid: string }): Promise<string | undefined> {
  const receipts = boundary.trace.filter((row: any) => row.method === 'internalizeAction' && row.args.description === 'TPNIL boundary incoming payment')
  if (receipts.length === 0 || receipts[0].result?.accepted !== true) return undefined
  assert.equal(receipts.length, 1)
  const receipt = receipts[0], tx = Transaction.fromAtomicBEEF(receipt.args.tx), txid = tx.id('hex')
  const sender = new ProtoWallet(PrivateKey.fromHex('77'.repeat(32))), senderIdentityKey = (await sender.getPublicKey({ identityKey: true })).publicKey
  const derivationPrefix = Buffer.from('tpnil boundary corpus').toString('base64'), derivationSuffix = Buffer.from('payment 1').toString('base64')
  assert.deepEqual(receipt.args, { tx: receipt.args.tx, outputs: [{ outputIndex: 0, protocol: 'wallet payment', paymentRemittance: { senderIdentityKey, derivationPrefix, derivationSuffix } }], description: 'TPNIL boundary incoming payment' })
  assert.equal(boundary.trace.find((row: any) => row.method === 'getPublicKey' && row.args.identityKey === true).result.publicKey, binding.identity)
  const key = await sender.getPublicKey({ protocolID: [2, '3241645161d8'], keyID: `${derivationPrefix} ${derivationSuffix}`, counterparty: binding.identity, forSelf: false })
  assert.equal(tx.outputs[0]?.lockingScript.toHex(), new P2PKH().lock(PublicKey.fromString(key.publicKey).toAddress()).toHex()); assert.equal(tx.outputs[0]?.satoshis, 1000)
  function ancestry(current: Transaction, depth = 0): boolean { assert.ok(depth < nativeProofResources().maximumProofDepth); return current.inputs.some(input => input.sourceTXID === binding.fixture.txid || input.sourceTransaction !== undefined && ancestry(input.sourceTransaction, depth + 1)) }
  assert.ok(ancestry(tx), 'Corpus payment does not descend from the exact mined funding fixture')
  assert.ok(await tx.verify({ currentHeight: async () => binding.fixture.fundingHeight + binding.fixture.maturityDepth, isValidRootForHeight: async (root, height) => root === binding.fixture.merkleRoot && height === binding.fixture.fundingHeight }))
  assert.equal(binding.storageTransactions.get(txid)?.toHex(), tx.toHex())
  const submitted = binding.submissions.findIndex(row => row.txid === txid && row.verdict === 'ACCEPTED_BY_NETWORK')
  assert.ok(submitted >= 0 && submitted < binding.submissions.findIndex(row => row.txid === binding.metadataTxid), 'Corpus payment must precede clause metadata creation')
  const bytes = [...Buffer.from(binding.submissions[submitted].beefHex, 'hex')]
  let observed: Transaction; try { observed = Transaction.fromAtomicBEEF(bytes) } catch { observed = Transaction.fromBinary(bytes) }
  assert.equal(observed.toHex(), tx.toHex())
  return `${txid}.0`
}
export async function verifyConformanceReserves(report: any, binding: {
  policy: any; identity: string; initialFundingTxid: string; scenarioStartedAt: string;
  workerStartedAt: string; submissions: any[]; firstCustomerTxid: string;
  transactions: Map<string, Transaction>; storageTransactions: Map<string, Transaction>; fixture: any
}): Promise<{ verified: true; roots: string[] }> {
  assert.deepEqual(binding.policy, policy); assert.deepEqual(report.policy, policy); assert.equal(report.schema, policy.schema)
  assert.equal(report.identity, binding.identity)
  const timestamp = (value: string) => { const time = Date.parse(value); assert.ok(Number.isFinite(time)); assert.equal(new Date(time).toISOString(), value); return time }
  assert.ok(timestamp(binding.workerStartedAt) <= timestamp(report.startedAt))
  assert.ok(timestamp(report.startedAt) <= timestamp(report.completedAt))
  assert.ok(timestamp(report.completedAt) <= timestamp(binding.scenarioStartedAt), 'Reserves must exist before all customer scenarios')
  assert.equal(report.payments.length, 2)
  assert.deepEqual(report.trace.map((row: any) => row.sequence), [0, 1, 2, 3, 4])
  assert.deepEqual(report.trace.map((row: any) => row.method), ['getPublicKey', 'getPublicKey', 'internalizeAction', 'getPublicKey', 'internalizeAction'])
  assert.deepEqual(report.trace[0].args, { identityKey: true }); assert.equal(report.trace[0].result.publicKey, binding.identity)
  const storedOutputs = await verifyNativeReserveStorage(report.storageSnapshot, binding.identity)
  assert.ok(timestamp(report.storageSnapshot.startedAt) >= timestamp(report.startedAt))
  assert.ok(timestamp(report.storageSnapshot.endedAt) <= timestamp(report.completedAt))
  const sender = new ProtoWallet(PrivateKey.fromHex('22'.repeat(32)))
  assert.equal(report.senderIdentity, (await sender.getPublicKey({ identityKey: true })).publicKey)
  const firstCustomer = binding.submissions.findIndex(row => row.txid === binding.firstCustomerTxid)
  const initial = binding.submissions.findIndex(row => row.txid === binding.initialFundingTxid)
  assert.ok(initial >= 0 && firstCustomer > initial)
  const roots: string[] = [], tracker = { currentHeight: async () => binding.fixture.fundingHeight + binding.fixture.maturityDepth,
    isValidRootForHeight: async (root: string, height: number) => root === binding.fixture.merkleRoot && height === binding.fixture.fundingHeight }
  function ancestry(tx: Transaction, target: string, depth = 0): boolean { assert.ok(depth < nativeProofResources().maximumProofDepth); return tx.inputs.some(input => input.sourceTXID === target || input.sourceTransaction !== undefined && ancestry(input.sourceTransaction, target, depth + 1)) }
  function spendsPayment(tx: Transaction, target: string, depth = 0): boolean { assert.ok(depth < nativeProofResources().maximumProofDepth); return tx.inputs.some(input => input.sourceTXID === target && input.sourceOutputIndex === 0 || input.sourceTransaction !== undefined && spendsPayment(input.sourceTransaction, target, depth + 1)) }
  for (const [index, payment] of report.payments.entries()) {
    assert.equal(payment.index, index)
    const prefix = Buffer.from('tpnil-conformance-reserves').toString('base64'), suffix = Buffer.from(`initial-${index + 1}`).toString('base64'), keyID = `${prefix} ${suffix}`
    assert.equal(payment.derivationPrefix, prefix); assert.equal(payment.derivationSuffix, suffix)
    const key = report.trace[1 + index * 2], receipt = report.trace[2 + index * 2]
    assert.deepEqual(key.args, { protocolID: [2, '3241645161d8'], keyID, counterparty: report.senderIdentity, forSelf: true })
    const expectedKey = (await sender.getPublicKey({ protocolID: [2, '3241645161d8'], keyID, counterparty: binding.identity, forSelf: false })).publicKey
    assert.equal(key.result.publicKey, expectedKey); assert.equal(payment.publicKey, expectedKey)
    const tx = Transaction.fromAtomicBEEF(payment.beef), txid = tx.id('hex')
    assert.equal(payment.txid, txid); assert.equal(payment.outpoint, `${txid}.0`)
    assert.equal(tx.outputs[0]?.satoshis, 10_000)
    assert.equal(tx.outputs[0]?.lockingScript.toHex(), new P2PKH().lock(PublicKey.fromString(expectedKey).toAddress()).toHex())
    assert.ok(ancestry(tx, binding.fixture.txid)); assert.ok(await tx.verify(tracker))
    assert.ok(!spendsPayment(tx, binding.initialFundingTxid) && report.payments.every((other: any) => !spendsPayment(tx, other.txid)), 'Declared reserves cannot spend one another or the initial native payment outputs')
    assert.equal(binding.storageTransactions.get(txid)?.toHex(), tx.toHex(), 'Reserve transaction missing from independently retained storage bytes')
    assert.ok(Number.isSafeInteger(payment.submissionIndex) && payment.submissionIndex > initial && payment.submissionIndex < firstCustomer)
    if (index > 0) assert.ok(payment.submissionIndex > report.payments[index - 1].submissionIndex)
    const submission = binding.submissions[payment.submissionIndex]
    assert.equal(submission.txid, txid); assert.equal(submission.verdict, 'ACCEPTED_BY_NETWORK')
    const bytes = [...Buffer.from(submission.beefHex, 'hex')]
    let submitted: Transaction; try { submitted = Transaction.fromAtomicBEEF(bytes) } catch { submitted = Transaction.fromBinary(bytes) }
    assert.equal(submitted.toHex(), tx.toHex())
    assert.deepEqual(receipt.args, { tx: payment.beef, outputs: [{ outputIndex: 0, protocol: 'wallet payment', paymentRemittance: { derivationPrefix: prefix, derivationSuffix: suffix, senderIdentityKey: report.senderIdentity } }], description: `TPNIL initial conformance reserve ${index + 1}`, labels: ['tpnil-initial-conformance-reserve'] })
    assert.deepEqual(receipt.result, payment.internalized); assert.equal(receipt.result.accepted, true)
    const output = storedOutputs.filter((row: any) => `${row.txid}.${row.vout}` === payment.outpoint)
    assert.equal(output.length, 1); assert.equal(output[0].spendable, true); assert.equal(output[0].satoshis, 10_000); assert.ok(output[0].spentBy === undefined || output[0].spentBy === null)
    roots.push(txid)
  }
  assert.equal(new Set(roots).size, 2)
  const prior = binding.submissions.slice(0, firstCustomer).map(row => {
    assert.equal(row.verdict, 'ACCEPTED_BY_NETWORK', 'No rejected customer operation may precede initial reserve preparation')
    const tx = binding.transactions.get(row.txid); assert.ok(tx, 'Accepted pre-scenario transaction is missing')
    return tx
  })
  verifyReserveGraph(prior, [binding.initialFundingTxid, ...roots].map(txid => `${txid}.0`))
  return { verified: true, roots }
}
