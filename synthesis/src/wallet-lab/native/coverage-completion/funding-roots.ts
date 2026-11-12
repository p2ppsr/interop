// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import { Beef, P2PKH, PrivateKey, ProtoWallet, PublicKey, Transaction, Utils } from '@bsv/sdk'
import { coverageAtomic } from '../coverage-transactions-program.js'
import { getTransactionCoveragePolicy, tc } from '../coverage-transactions-model.js'
import { coverageObservationEncoding, decodeCoverageObservation } from '../coverage-observation.js'
import { spendsOnlyDeclaredNativePayments } from '../verify-conformance-reserves.js'
import { observedSubmissionTransactions } from '../verify-transaction-state-bindings.js'
import { verifyCompletionFunding } from './funding.js'
import type { BasketParentBinding } from './baskets-parent.js'

async function verifiedPublicPayment(bytes: any, claimedId: string, binding: BasketParentBinding) {
  const tx = coverageAtomic(bytes), reader = new Utils.Reader(bytes), graph = Beef.fromReader(reader), id = tx.id('hex')
  assert.ok(reader.eof() && reader.pos === bytes.length, 'Payment BEEF framing is not exact')
  assert.equal(id, claimedId); assert.equal(binding.storageTransactions.get(id)?.toHex(), tx.toHex()); assert.equal(binding.resolvedTransactions.get(id)?.toHex(), tx.toHex())
  assert.equal(graph.findTxid(binding.fixture.txid)?.tx?.toHex(), binding.fixture.rawHex)
  const tracker = { currentHeight: async () => binding.fixture.fundingHeight + binding.fixture.maturityDepth,
    isValidRootForHeight: async (root: string, height: number) => root === binding.fixture.merkleRoot && height === binding.fixture.fundingHeight }
  assert.ok(await graph.verify(tracker, false)); assert.ok(await tx.verify(tracker))
  for (const bump of graph.bumps) {
    const leaves = bump.path[0]?.filter(leaf => typeof leaf.hash === 'string') ?? []; assert.ok(leaves.length > 0)
    for (const leaf of leaves) assert.ok(await tracker.isValidRootForHeight(bump.computeRoot(leaf.hash!), bump.blockHeight), 'Supplied payment proof has a foreign root')
  }
  for (const value of graph.txs) {
    assert.ok(value.tx, 'Public payment funding cannot depend on an unproved TXID-only entry')
    assert.equal(binding.resolvedTransactions.get(value.txid)?.toHex(), value.tx.toHex(), 'Public payment public ancestry differs from independent graph')
  }
  return tx
}

/** This is only a narrow funding-root admission, not a transaction-module or
 * native qualification. It is safe before unrelated final-ledger traversal. */
export async function deriveTransactionCoveragePaymentRoots(report: any, binding: BasketParentBinding) {
  assert.ok(['ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(binding.profile))
  const selected = getTransactionCoveragePolicy(3)
  assert.equal(report.schema, 'tpnil-native-coverage-transactions@3.0.0')
  assert.equal(report.oracle, selected.policy.oracle); assert.equal(report.policySha256, selected.policySha256)
  assert.equal(report.claim, 'ENGINEERING_OBSERVATION_ONLY'); assert.equal(report.completeBRC100Conformance, false)
  assert.equal(report.identity, binding.identity)
  const one = (id: string) => { const rows = report.trace.filter((row: any) => row.id === id); assert.equal(rows.length, 1, `Exactly one ${id} required`); return rows[0] }
  const index = (n: any) => assert.ok(Number.isSafeInteger(n) && n >= 0)
  index(report.submissionStart); index(report.submissionEnd)
  assert.ok(report.submissionStart <= report.submissionEnd && report.submissionEnd <= binding.globalSubmissions.length)
  assert.deepEqual(report.submissionPrefix, binding.globalSubmissions.slice(0, report.submissionStart))
  assert.deepEqual(report.submissions, binding.globalSubmissions.slice(report.submissionStart, report.submissionEnd))
  const sender = new ProtoWallet(PrivateKey.fromHex(tc.funderKey))
  const senderIdentityKey = (await sender.getPublicKey({ identityKey: true })).publicKey
  const key = (await sender.getPublicKey({ protocolID: [2, '3241645161d8'], keyID: `${tc.prefix} ${tc.suffix}`, counterparty: binding.identity })).publicKey
  const script = new P2PKH().lock(PublicKey.fromString(key).toAddress()).toHex()
  const identity = one('funder-identity'), incoming = one('incoming-fixture'), payment = one('payment'), both = one('both')
  assert.deepEqual([identity, incoming, payment, both].map(row => report.trace.indexOf(row)),
    [identity, incoming, payment, both].map(row => report.trace.indexOf(row)).sort((a, b) => a - b))
  for (const row of [identity, incoming, payment, both]) {
    assert.equal(row.error, undefined); index(row.submissionStart); index(row.submissionEnd)
    assert.ok(row.submissionStart >= report.submissionStart && row.submissionStart <= row.submissionEnd && row.submissionEnd <= report.submissionEnd)
    if (row !== incoming) assert.equal(row.submissionStart, row.submissionEnd, 'Getter or internalization emitted a submission')
  }
  assert.equal(identity.actor, 'funder'); assert.equal(identity.method, 'getPublicKey'); assert.deepEqual(identity.args, { identityKey: true }); assert.equal(identity.result.publicKey, senderIdentityKey)
  const outputs = Array.from({ length: 10 }, (_, i) => ({ satoshis: i < 2 ? 1000 : i === 8 ? tc.sourceSatoshis : 7,
    lockingScript: i < 2 ? script : tc.sourceScript, outputDescription: `TPNIL extension incoming ${i}` }))
  assert.equal(incoming.actor, 'funder'); assert.equal(incoming.method, 'createAction')
  assert.deepEqual(incoming.args, { description: 'TPNIL transaction extension incoming fixture', labels: [tc.label], outputs, options: { randomizeOutputs: false, acceptDelayedBroadcast: false } })
  const tx = await verifiedPublicPayment(incoming.result.tx, incoming.result.txid, binding), id = tx.id('hex')
  assert.ok(spendsOnlyDeclaredNativePayments(tx, [`${binding.fixture.txid}.${binding.fixture.outputIndex}`]))
  const native = new Set(binding.declaredNativePayments), visited = new Set<string>()
  const forbidNative = (value: Transaction, depth = 0) => {
    assert.ok(depth < 32); const current = value.id('hex'); if (visited.has(current)) return; visited.add(current)
    if (current === binding.fixture.txid) return
    for (const input of value.inputs) {
      const outpoint = `${input.sourceTXID ?? input.sourceTransaction?.id('hex')}.${input.sourceOutputIndex}`
      assert.ok(!native.has(outpoint), 'Controlled incoming funder consumed native-owned funding')
      assert.ok(input.sourceTransaction); forbidNative(input.sourceTransaction, depth + 1)
    }
  }
  forbidNative(tx)
  assert.ok(tx.outputs.length >= outputs.length)
  for (const [i, output] of outputs.entries()) { assert.equal(tx.outputs[i]?.satoshis, output.satoshis); assert.equal(tx.outputs[i]?.lockingScript.toHex(), output.lockingScript) }
  for (const output of tx.outputs.slice(outputs.length)) assert.match(output.lockingScript.toHex(), /^76a914[0-9a-f]{40}88ac$/, 'Incoming fixture may add only funder change')
  const remittance = { derivationPrefix: tc.prefix, derivationSuffix: tc.suffix, senderIdentityKey }
  for (const [row, outputIndex] of [[payment, 0], [both, 1]] as const) {
    const requested: any[] = [{ outputIndex, protocol: 'wallet payment', paymentRemittance: remittance }]
    if (outputIndex === 1) requested.push({ outputIndex: 3, protocol: 'basket insertion', insertionRemittance: { basket: tc.basket, tags: ['extension 3'], customInstructions: 'extension:3' } })
    assert.equal(row.actor, 'wallet'); assert.equal(row.method, 'internalizeAction')
    assert.deepEqual(row.args, { tx: incoming.result.tx, outputs: requested, description: `TPNIL extension ${row.id}`, labels: [tc.label] })
    assert.equal(row.result.accepted, true); assert.ok(incoming.submissionEnd <= row.submissionStart)
  }
  const receipts = binding.globalSubmissions.slice(incoming.submissionStart, incoming.submissionEnd).filter(row => row.txid === id && row.verdict === 'ACCEPTED_BY_NETWORK')
  assert.ok(receipts.length > 0, 'Incoming payment has no independently accepted scoped receipt')
  for (const receipt of receipts) assert.equal(observedSubmissionTransactions(receipt, { resolvedTransactions: binding.resolvedTransactions, requireResolvedAncestors: true,
    trustedMinedRoot: { txid: binding.fixture.txid, rawHex: binding.fixture.rawHex } })[0]?.transaction.toHex(), tx.toHex())
  return { verified: true as const, fullModuleAdmission: false as const, addedNativePayments: [`${id}.0`, `${id}.1`], actualPaymentSatoshis: 2000 }
}

/** The one50000 public payment has its own strict original BEEF check before
 * the complete fixed funding sequence is checked against independent storage. */
export async function deriveCompletionReserveRoot(report: any, binding: BasketParentBinding) {
  assert.ok(['ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(binding.profile))
  const payments = report.trace.filter((row: any) => row.id === 'completion-payment')
  assert.equal(payments.length, 1)
  await verifiedPublicPayment(payments[0].result?.tx, payments[0].result?.txid, binding)
  return verifyCompletionFunding(report, binding)
}

/** Derive only the three explicitly declared additional incoming outpoints.
 * Descendants, public report root lists and unrelated fixture outputs are never
 * added. Complete module and final-ledger parents remain mandatory later. */
export async function deriveCompletionNativeFundingRoots(binding: BasketParentBinding) {
  assert.ok(['ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(binding.profile))
  assert.equal(new Set(binding.declaredNativePayments).size, binding.declaredNativePayments.length)
  const transactionReport = JSON.parse(binding.readEvidence('conformance/coverage-transactions.json').toString())
  const incoming = await deriveTransactionCoveragePaymentRoots(transactionReport, binding)
  const initial = [...binding.declaredNativePayments], withIncoming = [...initial, ...incoming.addedNativePayments]
  assert.equal(new Set(withIncoming).size, withIncoming.length)
  const completionReport = decodeCoverageObservation<any>(JSON.parse(binding.readEvidence('conformance/completion-funding.json').toString()), coverageObservationEncoding)
  const completion = await deriveCompletionReserveRoot(completionReport, { ...binding, declaredNativePayments: withIncoming })
  const roots = [...withIncoming, completion.addedNativePayment]; assert.equal(new Set(roots).size, roots.length)
  assert.deepEqual(completion.declaredNativePayments, roots)
  return { verified: true as const, fullModuleAdmission: false as const, initialNativePayments: initial,
    addedNativePayments: [...incoming.addedNativePayments, completion.addedNativePayment], declaredNativePayments: roots,
    actualAddedPaymentSatoshis: incoming.actualPaymentSatoshis + completion.actualPaymentSatoshis }
}
