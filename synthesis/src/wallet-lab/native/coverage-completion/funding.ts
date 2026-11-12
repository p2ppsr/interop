// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import { P2PKH, PrivateKey, ProtoWallet, PublicKey } from '@bsv/sdk'
import type { NativeScenarioContext } from '../../yours-driver.js'
import { createFixtureWallet } from '../../../storage-sync/fixture-wallet.js'
import { nativeWalletBoundary } from '../integrated.js'
import { captureClauseError } from '../conformance-clauses.js'
import { coverageObservationEncoding, writeCoverageObservation } from '../coverage-observation.js'
import { verifyCoverageModuleFunding } from '../verify-coverage-suite.js'
import { atomic, validateOwned } from './baskets-verifier.js'
import type { BasketParentBinding } from './baskets-parent.js'
import { nativeCompletionProviders } from './providers.js'

export const completionFundingPolicy = {
  schema: 'tpnil-native-completion-funding@1.0.0', amount: 50000, maximumOwnedSatoshis: 100000, maximumFee: 1000,
  stage: 'after-original-535-before-completion',
  derivationPrefix: Buffer.from('tpnil native completion funding').toString('base64'),
  derivationSuffix: Buffer.from('ITCVE-1@4.5.0').toString('base64'), funderKey: '77'.repeat(32)
} as const
const paymentArgs = (lockingScript: string) => ({ description: 'Declared native completion reserve', outputs: [
  { satoshis: completionFundingPolicy.amount, lockingScript, outputDescription: 'Single shared completion reserve' }
], options: { randomizeOutputs: false, acceptDelayedBroadcast: false } })
const keyArgs = (identity: string) => ({ protocolID: [2, '3241645161d8'], keyID: `${completionFundingPolicy.derivationPrefix} ${completionFundingPolicy.derivationSuffix}`, counterparty: identity })
const acceptanceArgs = (tx: number[], senderIdentityKey: string) => ({ tx, outputs: [{ outputIndex: 0, protocol: 'wallet payment',
  paymentRemittance: { derivationPrefix: completionFundingPolicy.derivationPrefix, derivationSuffix: completionFundingPolicy.derivationSuffix, senderIdentityKey }
}], description: 'Accept declared native completion reserve' })

function ownedValue(rows: any[]) {
  const unique = new Map<string, number>()
  for (const row of rows) if (row.spendable) {
    assert.equal(typeof row.outpoint, 'string'); assert.ok(Number.isSafeInteger(row.satoshis) && row.satoshis >= 0)
    if (unique.has(row.outpoint)) assert.equal(unique.get(row.outpoint), row.satoshis)
    unique.set(row.outpoint, row.satoshis)
  }
  return [...unique.values()].reduce((sum, amount) => sum + amount, 0)
}

export async function runNativeCompletionFunding(context: NativeScenarioContext) {
  const services = context.services, wallet = nativeWalletBoundary(context.application, true)
  const report: any = { schema: completionFundingPolicy.schema, policy: completionFundingPolicy, claim: 'ENGINEERING_OBSERVATION_ONLY',
    startedAt: new Date().toISOString(), endedAt: '', trace: [], snapshots: [], errors: [], cleanup: { funderClosed: false }, submissionStart: services.submissions.length, submissionEnd: services.submissions.length }
  const funder = await createFixtureWallet(services, completionFundingPolicy.funderKey)
  let primary: unknown, cleanupError: unknown
  const call = async (id: string, actor: 'wallet' | 'funder', method: string, args: any) => {
    const row: any = { id, actor, method, args: structuredClone(args), startedAt: new Date().toISOString(), endedAt: '', submissionStart: services.submissions.length, submissionEnd: services.submissions.length }
    report.trace.push(row)
    try { row.result = structuredClone(await (actor === 'wallet' ? wallet : funder as any)[method](args)); return row.result }
    catch (error) { row.error = captureClauseError(error); throw error }
    finally { row.endedAt = new Date().toISOString(); row.submissionEnd = services.submissions.length }
  }
  const snapshot = async () => {
    const sequence = services.nativeOutputSnapshotObservations.length
    try { await services.nativeOutputSnapshots(report.identity) } finally { report.snapshots.push(services.nativeOutputSnapshotObservations[sequence]) }
    return validateOwned(report.snapshots.at(-1).snapshots, report.identity, services.nativeOutputProviderRegistry)
  }
  try {
    report.identity = (await call('wallet-identity', 'wallet', 'getPublicKey', { identityKey: true })).publicKey
    const before = await snapshot()
    report.initialOwnedSatoshis = ownedValue(before)
    assert.ok(report.initialOwnedSatoshis + completionFundingPolicy.amount <= completionFundingPolicy.maximumOwnedSatoshis)
    const sender = (await call('funder-identity', 'funder', 'getPublicKey', { identityKey: true })).publicKey
    const key = (await call('funder-key', 'funder', 'getPublicKey', keyArgs(report.identity))).publicKey
    const payment = await call('completion-payment', 'funder', 'createAction', paymentArgs(new P2PKH().lock(PublicKey.fromString(key).toAddress()).toHex()))
    await call('completion-acceptance', 'wallet', 'internalizeAction', acceptanceArgs(payment.tx, sender))
    report.finalOwnedSatoshis = ownedValue(await snapshot())
    assert.ok(report.finalOwnedSatoshis <= completionFundingPolicy.maximumOwnedSatoshis)
  } catch (error) { report.errors.push(String(error)); primary = error }
  finally {
    try { await funder.destroy(); report.cleanup.funderClosed = true }
    catch (error) { cleanupError = error; report.errors.push(`Funder cleanup: ${String(error)}`) }
    finally {
      report.endedAt = new Date().toISOString(); report.submissionEnd = services.submissions.length
      writeCoverageObservation(context.evidence, 'conformance/completion-funding.json', report, coverageObservationEncoding)
    }
  }
  if (primary && cleanupError) throw new AggregateError([primary, cleanupError], 'Completion funding and cleanup failed', { cause: primary })
  if (primary) throw primary
  if (cleanupError) throw cleanupError
  return report
}

export async function verifyCompletionFunding(report: any, binding: BasketParentBinding) {
  assert.ok(['ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(binding.profile)); assert.equal(report.schema, completionFundingPolicy.schema)
  assert.deepEqual(report.policy, completionFundingPolicy); assert.deepEqual(report.errors, []); assert.equal(report.identity, binding.identity)
  assert.deepEqual(report.cleanup, { funderClosed: true })
  assert.ok(Number.isSafeInteger(report.submissionStart) && report.submissionStart >= 0)
  assert.ok(Number.isSafeInteger(report.submissionEnd) && report.submissionEnd >= report.submissionStart && report.submissionEnd <= binding.globalSubmissions.length)
  const expected = ['wallet-identity', 'funder-identity', 'funder-key', 'completion-payment', 'completion-acceptance']
  assert.deepEqual(report.trace.map((row: any) => row.id), expected)
  const [identity, sender, key, payment, accepted] = report.trace
  for (const row of report.trace) {
    assert.equal(row.error, undefined)
    assert.ok(Number.isSafeInteger(row.submissionStart) && row.submissionStart >= report.submissionStart)
    assert.ok(Number.isSafeInteger(row.submissionEnd) && row.submissionEnd >= row.submissionStart && row.submissionEnd <= report.submissionEnd)
    if (row.id !== 'completion-payment') assert.equal(row.submissionStart, row.submissionEnd, 'Read-only or acceptance call emitted a submission')
  }
  for (const row of [identity, sender]) { assert.equal(row.method, 'getPublicKey'); assert.deepEqual(row.args, { identityKey: true }) }
  assert.equal(identity.actor, 'wallet'); assert.equal(identity.result.publicKey, binding.identity)
  const funder = new ProtoWallet(PrivateKey.fromHex(completionFundingPolicy.funderKey))
  const senderIdentityKey = (await funder.getPublicKey({ identityKey: true })).publicKey
  assert.equal(sender.actor, 'funder'); assert.equal(sender.result.publicKey, senderIdentityKey)
  assert.equal(key.actor, 'funder'); assert.equal(key.method, 'getPublicKey'); assert.deepEqual(key.args, keyArgs(binding.identity))
  const publicKey = (await funder.getPublicKey({ ...keyArgs(binding.identity), protocolID: [2, '3241645161d8'] })).publicKey
  assert.equal(key.result.publicKey, publicKey)
  const script = new P2PKH().lock(PublicKey.fromString(publicKey).toAddress()).toHex()
  assert.equal(payment.actor, 'funder'); assert.equal(payment.method, 'createAction'); assert.deepEqual(payment.args, paymentArgs(script))
  const tx = atomic(payment.result.tx); assert.equal(tx.id('hex'), payment.result.txid)
  assert.equal(tx.outputs[0]?.satoshis, completionFundingPolicy.amount); assert.equal(tx.outputs[0]?.lockingScript.toHex(), script)
  assert.equal(accepted.actor, 'wallet'); assert.equal(accepted.method, 'internalizeAction'); assert.deepEqual(accepted.args, acceptanceArgs(payment.result.tx, senderIdentityKey)); assert.equal(accepted.result.accepted, true)
  assert.equal(accepted.submissionStart, accepted.submissionEnd)
  const funding = await verifyCoverageModuleFunding([payment], binding)
  assert.ok(binding.globalSubmissions.slice(payment.submissionStart, payment.submissionEnd).some(row => row.txid === tx.id('hex') && row.verdict === 'ACCEPTED_BY_NETWORK'))
  const fee = tx.inputs.reduce((sum, input) => sum + input.sourceTransaction!.outputs[input.sourceOutputIndex]!.satoshis!, 0) - tx.outputs.reduce((sum, output) => sum + output.satoshis!, 0)
  assert.ok(Number.isSafeInteger(fee) && fee >= 0 && fee <= completionFundingPolicy.maximumFee)
  const read = binding.readEvidence, registry = nativeCompletionProviders(read), observations = JSON.parse(read('native-output-snapshot-observations.json').toString())
  assert.deepEqual(JSON.parse(read('native-output-provider-registry.json').toString()), registry)
  assert.equal(report.snapshots.length, 2)
  const [before, after] = report.snapshots
  for (const snapshot of report.snapshots) {
    assert.equal(snapshot.error, undefined); assert.equal(snapshot.identityKey, binding.identity)
    assert.deepEqual(snapshot, observations[snapshot.sequence])
  }
  assert.equal(after.sequence, before.sequence + 1)
  const previous = validateOwned(before.snapshots, binding.identity, registry), next = validateOwned(after.snapshots, binding.identity, registry)
  const additions = next.filter((row: any) => !previous.some((old: any) => old.provider === row.provider && old.outputId === row.outputId))
  assert.equal(additions.length, 1); const added = additions[0]
  assert.equal(added.outpoint, `${tx.id('hex')}.0`); assert.equal(added.satoshis, completionFundingPolicy.amount); assert.equal(added.lockingScript, script); assert.equal(added.spendable, true); assert.equal(added.basketName, 'default')
  assert.deepEqual(next.filter((row: any) => row !== added), previous)
  assert.equal(report.initialOwnedSatoshis, ownedValue(previous)); assert.equal(report.finalOwnedSatoshis, ownedValue(next))
  assert.equal(report.finalOwnedSatoshis, report.initialOwnedSatoshis + completionFundingPolicy.amount)
  assert.ok(report.finalOwnedSatoshis <= completionFundingPolicy.maximumOwnedSatoshis)
  const at = (value: string) => { const n = Date.parse(value); assert.equal(new Date(n).toISOString(), value); return n }
  const times = [report.startedAt, identity.startedAt, identity.endedAt, before.startedAt, before.endedAt,
    ...[sender, key, payment, accepted].flatMap(row => [row.startedAt, row.endedAt]), after.startedAt, after.endedAt, report.endedAt].map(at)
  assert.ok(times.every((value, index) => index === 0 || value >= times[index - 1]!))
  let cursor = report.submissionStart
  for (const row of report.trace) { assert.equal(row.submissionStart, cursor); assert.ok(Number.isSafeInteger(row.submissionEnd) && row.submissionEnd >= cursor); cursor = row.submissionEnd }
  assert.equal(cursor, report.submissionEnd); assert.ok(cursor <= binding.globalSubmissions.length)
  assert.deepEqual(binding.finalSubmissions.slice(0, binding.globalSubmissions.length), binding.globalSubmissions)
  return { verified: true as const, funding, actualFee: fee, addedNativePayment: `${tx.id('hex')}.0`,
    declaredNativePayments: [...binding.declaredNativePayments, `${tx.id('hex')}.0`], actualPaymentSatoshis: completionFundingPolicy.amount }
}
