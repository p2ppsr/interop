import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { Beef, PushDrop, Transaction, Utils } from '@bsv/sdk'
import type { TeranodeWalletFundingFixture } from './services.js'

interface Boundary {
  funding: { txid: string; outputIndex: number; satoshis: number; blockHash: string; atomicBeefSha256: string }
  wab: { version: string; sourceRevision: string }
  faucetPayments: Array<{ amount: number; txid: string; outputIndex: number }>
  umpRecords: Array<{
    txid: string; outputIndex: number; presentationHash: string; recoveryHash: string; beefHex: string; beefSha256: string
  }>
  overlayObservations: Array<{ operation: string; topics?: string[]; txid?: string; admittedOutputs?: number[] }>
  submissions: Array<{ txid: string; verdict: string; byteLength: number; atomicBeefHex: string; atomicBeefSha256: string }>
  routes: Array<{ host: string; disposition: string }>
}

const [boundaryPath, fixturePath, amountArgument] = process.argv.slice(2)
if (!boundaryPath || !fixturePath || !amountArgument)
  throw new Error('usage: verify-android-boundary.ts CONTROLLED-BOUNDARY-JSON TERANODE-FUNDING-JSON TASK-SATOSHIS')
const taskSatoshis = Number(amountArgument)
assert.ok(Number.isSafeInteger(taskSatoshis) && taskSatoshis > 0)
const boundary = JSON.parse(fs.readFileSync(boundaryPath, 'utf8')) as Boundary
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as TeranodeWalletFundingFixture
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

assert.equal(boundary.funding.txid, fixture.txid)
assert.equal(boundary.funding.outputIndex, fixture.outputIndex)
assert.equal(boundary.funding.satoshis, fixture.satoshis)
assert.equal(boundary.funding.blockHash, fixture.fundingBlockHash)
assert.equal(boundary.funding.atomicBeefSha256, fixture.atomicBeefSha256)
assert.equal(boundary.wab.version, '1.8.2')
assert.equal(boundary.wab.sourceRevision, '6e53b215c43af5ea2e50bcdb7f136e23ee7da080')
const fundingBeef = Uint8Array.from(Utils.toArray(fixture.atomicBeefHex, 'hex'))
assert.equal(digest(fundingBeef), fixture.atomicBeefSha256)
const funding = Transaction.fromAtomicBEEF(fundingBeef)
assert.equal(funding.id('hex'), fixture.txid)
assert.equal(funding.outputs[fixture.outputIndex]?.satoshis, fixture.satoshis)
assert.ok(await Beef.fromBinary(fundingBeef).verify({
  isValidRootForHeight: async (root, height) => root === fixture.merkleRoot && height === fixture.fundingHeight,
  currentHeight: async () => fixture.fundingHeight + fixture.maturityDepth
}))

const transactions = new Map<string, Transaction>()
for (const submission of boundary.submissions) {
  assert.equal(submission.verdict, 'ACCEPTED_BY_NETWORK')
  const bytes = Uint8Array.from(Utils.toArray(submission.atomicBeefHex, 'hex'))
  assert.equal(bytes.length, submission.byteLength)
  assert.equal(digest(bytes), submission.atomicBeefSha256)
  const tx = Transaction.fromAtomicBEEF(bytes)
  assert.equal(tx.id('hex'), submission.txid)
  assert.ok(!transactions.has(submission.txid), 'duplicate submitted transaction')
  transactions.set(submission.txid, tx)
}

function descendsFrom(transaction: Transaction, ancestor: string, depth = 0): boolean {
  assert.ok(depth < 24, 'transaction ancestry exceeds the controlled bound')
  return transaction.inputs.some(input => input.sourceTXID === ancestor ||
    (input.sourceTransaction !== undefined && descendsFrom(input.sourceTransaction, ancestor, depth + 1)))
}

assert.equal(boundary.faucetPayments.length, 1)
const payment = boundary.faucetPayments[0]!
assert.equal(payment.amount, 1_000)
const faucet = transactions.get(payment.txid)
assert.ok(faucet, 'faucet transaction was not submitted')
assert.equal(faucet.outputs[payment.outputIndex]?.satoshis, payment.amount)
assert.ok(descendsFrom(faucet, fixture.txid), 'faucet does not descend from the mined output')
assert.equal(boundary.umpRecords.length, 1)
const record = boundary.umpRecords[0]!
const ump = transactions.get(record.txid)
assert.ok(ump, 'UMP transaction was not submitted')
assert.ok(descendsFrom(ump, payment.txid), 'UMP does not descend from the faucet payment')
const umpBytes = Uint8Array.from(Utils.toArray(record.beefHex, 'hex'))
assert.equal(digest(umpBytes), record.beefSha256)
assert.equal(Transaction.fromBEEF(umpBytes).id('hex'), record.txid)
const fields = PushDrop.decode(ump.outputs[record.outputIndex]!.lockingScript).fields
assert.equal(Utils.toHex(fields[6]!).toLowerCase(), record.presentationHash)
assert.equal(Utils.toHex(fields[7]!).toLowerCase(), record.recoveryHash)
assert.ok(boundary.overlayObservations.some(observation => observation.operation === 'submit' &&
  observation.txid === record.txid && observation.topics?.includes('tm_users') &&
  observation.admittedOutputs?.includes(record.outputIndex)))

const tasks = [...transactions.entries()].filter(([txid, transaction]) =>
  txid !== record.txid && transaction.outputs.some(output => {
    if (output.satoshis !== taskSatoshis) return false
    try { return PushDrop.decode(output.lockingScript).fields.length >= 2 } catch { return false }
  }))
assert.equal(tasks.length, 1, 'expected one accepted ToDo token transaction at the declared amount')
const [taskTxid, task] = tasks[0]!
assert.ok(descendsFrom(task, payment.txid), 'ToDo token does not descend from the faucet payment')
assert.ok(boundary.routes.some(route => route.host === 'wab.itcve.test' && route.disposition === 'controlled-service'))
assert.ok(boundary.routes.some(route => route.host === 'todo.itcve.test' && route.disposition === 'controlled-application'))

process.stdout.write(`${JSON.stringify({
  schema: 'tpnil-isi4-android-boundary-verification@1.0.0',
  verified: true,
  fundingTxid: fixture.txid,
  faucetTxid: payment.txid,
  faucetSatoshis: payment.amount,
  umpTxid: record.txid,
  taskTxid,
  taskOutputSatoshis: taskSatoshis,
  acceptedSubmissionCount: transactions.size,
  applicationCompletion: 'OUTSIDE_BOUNDARY'
}, null, 2)}\n`)
