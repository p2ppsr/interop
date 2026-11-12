import { expect, it } from 'vitest'
import { LockingScript, Transaction } from '@bsv/sdk'
import { verifyTransactionStateSnapshots } from '../src/wallet-lab/native/verify-transaction-state-bindings.js'

// Snapshot tests do not claim transaction validity; script/mined/funding proof is
// covered by the shared admission tests using retained actual native bytes.
const tx = new Transaction(1, [], [{ satoshis: 1, lockingScript: LockingScript.fromHex('51') }], 0)
const identity = `02${'11'.repeat(32)}`
const submissions = [{ txid: tx.id('hex'), beefHex: 'fixture-bytes', verdict: 'ACCEPTED_BY_NETWORK' }]
const stored = new Map([[tx.id('hex'), tx]])
const report = () => ({ identity, submissionStart: 0, submissionEnd: 1, submissions: [{ index: 0, txid: tx.id('hex'), serializedHex: 'fixture-bytes', verdict: 'ACCEPTED_BY_NETWORK' }], storageTransactions: [{ txid: tx.id('hex'), rawTxHex: tx.toHex() }] })

it('binds earlier transaction state snapshots to the independent final native ledger', () => {
  expect(() => verifyTransactionStateSnapshots(report() as any, stored, submissions, identity)).not.toThrow()
})

it.each([
  ['identity', (r: any) => { r.identity = 'another wallet' }],
  ['negative window', (r: any) => { r.submissionStart = -1 }],
  ['unbounded window', (r: any) => { r.submissionEnd = 2 }],
  ['missing submission', (r: any) => { r.submissions = [] }],
  ['different serialized bytes', (r: any) => { r.submissions[0].serializedHex = 'other bytes' }],
  ['changed verdict', (r: any) => { r.submissions[0].verdict = 'REJECTED' }],
  ['duplicate stored identity', (r: any) => { r.storageTransactions.push({ ...r.storageTransactions[0] }) }],
  ['changed stored bytes', (r: any) => { r.storageTransactions[0].rawTxHex = '00' }],
  ['missing stored identity and bytes', (r: any) => { r.storageTransactions[0] = { txid: 'ab'.repeat(32), rawTxHex: undefined } }]
] as const)('rejects %s', (_name, mutate) => {
  const r = report(); mutate(r)
  expect(() => verifyTransactionStateSnapshots(r as any, stored, submissions, identity)).toThrow()
})

import fs from 'node:fs'
import path from 'node:path'
import { MerklePath, UnlockingScript } from '@bsv/sdk'
import { verifyTransactionStateFinalSubmissions } from '../src/wallet-lab/native/verify-transaction-state-bindings.js'
import { deriveTransactionStateOutcomes } from '../src/wallet-lab/native/verify-transaction-states.js'
import type { StateReport } from '../src/wallet-lab/native/conformance-transaction-states-model.js'
const reference: StateReport = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../fixtures/native-transaction-states/reference-20261111/report.json'), 'utf8'))
const funding = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../fixtures/teranode/wab-funding-v1.json'), 'utf8'))
const fanout = Transaction.fromAtomicBEEF(reference.trace.find(row => row.id === 'fanout')!.result.tx)
const initial = reference.submissions.map(row => ({ txid: row.txid, beefHex: row.serializedHex, verdict: row.verdict }))
async function delayed(index: number, verdict = 'ACCEPTED_BY_NETWORK', raw = false) {
  const late = new Transaction(1, [{ sourceTransaction: fanout, sourceOutputIndex: index, unlockingScript: UnlockingScript.fromHex('51') }], [{ satoshis: 95, lockingScript: LockingScript.fromHex('51') }], 0)
  expect(await late.verify({ currentHeight: async () => funding.fundingHeight + funding.maturityDepth, isValidRootForHeight: async (root, height) => root === funding.merkleRoot && height === funding.fundingHeight })).toBe(true)
  return { txid: late.id('hex'), beefHex: raw ? late.toHex() : Buffer.from(late.toAtomicBEEF()).toString('hex'), verdict }
}

it('checks all final-provider rows after module end without truncating the shutdown ledger', async () => {
  const result = await verifyTransactionStateFinalSubmissions(reference, initial, initial)
  expect(result.verified).toBe(true); expect(result.finalCount).toBe(initial.length)
  expect(result.protectedClaims.some(row => row.outpoint === `${fanout.id('hex')}.4`)).toBe(true)
  expect(result.protectedClaims.some(row => row.outpoint === `${fanout.id('hex')}.5`)).toBe(false) // This reference safely recovered and spent5.
})

it.each([4, 7, 8, 9, 10, 13, 14])('rejects a valid delayed spend of protected fanout output%s after shutdown', async index => {
  const late = await delayed(index)
  expect(initial.length).toBe(reference.submissionEnd)
  await expect(verifyTransactionStateFinalSubmissions(reference, initial, [...initial, late])).rejects.toThrow(/protected transaction-state input/)
})

it('rejects a late protected spend already present in the preclose global suffix', async () => {
  const global = [...initial, await delayed(4)]
  await expect(verifyTransactionStateFinalSubmissions(reference, global, global)).rejects.toThrow(/protected transaction-state input/)
})

it.each(['ACCEPTED_BY_NETWORK', 'REJECTED'])('does not exempt a %s raw serialized delayed attempt', async verdict => {
  await expect(verifyTransactionStateFinalSubmissions(reference, initial, [...initial, await delayed(4, verdict, true)])).rejects.toThrow(/protected transaction-state input/)
})

it('allows only the original signed identity to repeat the already-spent input', async () => {
  const originalId = reference.trace.find(row => row.id === 'direct-default')!.result.txid
  const original = initial.find(row => row.txid === originalId)!
  await expect(verifyTransactionStateFinalSubmissions(reference, initial, [...initial, original])).resolves.toMatchObject({ verified: true })
  await expect(verifyTransactionStateFinalSubmissions(reference, initial, [...initial, await delayed(0)])).rejects.toThrow(/already-spent-input/)
})

it('retains an independently failed native predicate without asserting absence of its spend', async () => {
  const failed = structuredClone(reference)
  failed.trace.find(row => row.id === 'abort-sign')!.error = { name: 'Error', message: 'unclassified native failure' }
  failed.assertions = await deriveTransactionStateOutcomes(failed); failed.result = 'FAIL'
  expect(failed.assertions.find(row => row.id.endsWith('abort-then-sign-reject'))?.result).toBe('FAIL')
  const result = await verifyTransactionStateFinalSubmissions(failed, initial, [...initial, await delayed(4)])
  expect(result.unprovenClaims).toContainEqual({ predicateId: 'transaction.signing-branches.abort-then-sign-reject', result: 'FAIL' })
  expect(result.protectedClaims.some(row => row.outpoint === `${fanout.id('hex')}.4`)).toBe(false)
})

it('rejects a forged FAIL label which tries to disable a proven PASS guard', async () => {
  const changed = structuredClone(reference)
  changed.assertions.find(row => row.id.endsWith('abort-then-sign-reject'))!.result = 'FAIL'; changed.result = 'FAIL'
  await expect(verifyTransactionStateFinalSubmissions(changed, initial, [...initial, await delayed(4)])).rejects.toThrow()
})

it('permits unrelated valid tail traffic without inventing a no-spend claim', async () => {
  await expect(verifyTransactionStateFinalSubmissions(reference, initial, [...initial, await delayed(6)])).resolves.toMatchObject({ verified: true })
})

it.each(['truncated', 'changed-prefix', 'wrong-id', 'trailing-bytes'])('rejects malformed or substituted final ledger: %s', async mode => {
  const final = [...initial, await delayed(6)]
  if (mode === 'truncated') final.splice(0, 2)
  if (mode === 'changed-prefix') final[0] = { ...final[0]!, verdict: 'REJECTED' }
  if (mode === 'wrong-id') final.at(-1)!.txid = '11'.repeat(32)
  if (mode === 'trailing-bytes') final.at(-1)!.beefHex += '00'
  await expect(verifyTransactionStateFinalSubmissions(reference, initial, final)).rejects.toThrow()
})

import { observedSubmissionTransactions } from '../src/wallet-lab/native/verify-transaction-state-bindings.js'
function descendant(parent: Transaction) {
  return new Transaction(1, [{ sourceTransaction: parent, sourceOutputIndex: 0, unlockingScript: UnlockingScript.fromHex('') }], [{ satoshis: 90, lockingScript: LockingScript.fromHex('51') }], 0)
}

it('rejects a valid forbidden spend hidden as an ancestor of the submitted target', async () => {
  const forbidden = Transaction.fromAtomicBEEF([...Buffer.from((await delayed(4)).beefHex, 'hex')]), child = descendant(forbidden)
  expect(await child.verify({ currentHeight: async () => funding.fundingHeight + funding.maturityDepth, isValidRootForHeight: async (root, height) => root === funding.merkleRoot && height === funding.fundingHeight })).toBe(true)
  const entry = { txid: child.id('hex'), beefHex: Buffer.from(child.toAtomicBEEF()).toString('hex'), verdict: 'REJECTED' }
  await expect(verifyTransactionStateFinalSubmissions(reference, initial, [...initial, entry])).rejects.toThrow(/protected transaction-state input/)
})

it('recognizes the permitted original signed transaction by its own ancestor identity', async () => {
  const original = Transaction.fromAtomicBEEF(reference.trace.find(row => row.id === 'direct-default')!.result.tx)
  const child = new Transaction(1, [{ sourceTransaction: original, sourceOutputIndex: original.outputs.findIndex(o => o.satoshis === 3 && o.lockingScript.toHex() === '51'), unlockingScript: UnlockingScript.fromHex('') }], [{ satoshis: 2, lockingScript: LockingScript.fromHex('51') }], 0)
  expect(await child.verify({ currentHeight: async () => funding.fundingHeight + funding.maturityDepth, isValidRootForHeight: async (root, height) => root === funding.merkleRoot && height === funding.fundingHeight })).toBe(true)
  await expect(verifyTransactionStateFinalSubmissions(reference, initial, [...initial, { txid: child.id('hex'), beefHex: Buffer.from(child.toAtomicBEEF()).toString('hex'), verdict: 'ACCEPTED_BY_NETWORK' }])).resolves.toMatchObject({ verified: true })
})

it('resolves raw descendant ancestry only from independently matched transaction bytes', async () => {
  const forbidden = Transaction.fromAtomicBEEF([...Buffer.from((await delayed(4)).beefHex, 'hex')]), child = descendant(forbidden)
  const entry = { txid: child.id('hex'), beefHex: child.toHex(), verdict: 'ACCEPTED_BY_NETWORK' }
  expect(() => observedSubmissionTransactions(entry, { requireResolvedAncestors: true })).toThrow(/unresolved/)
  const resolved = new Map(reference.storageTransactions.map(row => [row.txid, Transaction.fromHex(row.rawTxHex)]))
  const remember = (tx: Transaction) => { resolved.set(tx.id('hex'), tx); if (!tx.merklePath) for (const input of tx.inputs) if (input.sourceTransaction) remember(input.sourceTransaction) }
  for (const row of reference.trace) if (Array.isArray(row.result?.tx)) remember(Transaction.fromAtomicBEEF(row.result.tx))
  remember(child); remember(forbidden)
  expect(observedSubmissionTransactions(entry, { resolvedTransactions: resolved, requireResolvedAncestors: true, trustedMinedRoot: funding }).map(x => x.txid)).toContain(forbidden.id('hex'))
  await expect(verifyTransactionStateFinalSubmissions(reference, initial, [...initial, entry], { resolvedTransactions: resolved, requireResolvedAncestors: true, trustedMinedRoot: funding })).rejects.toThrow(/protected transaction-state input/)
  const wrong = new Transaction(2, child.inputs, child.outputs, child.lockTime)
  expect(() => observedSubmissionTransactions(entry, { resolvedTransactions: new Map([[child.id('hex'), wrong]]) })).toThrow(/body differs/)
})

it('does not let a fabricated BUMP hide a deeper forbidden ancestor', async () => {
  const forbidden = Transaction.fromAtomicBEEF([...Buffer.from((await delayed(4)).beefHex, 'hex')])
  const middle = descendant(forbidden)
  middle.merklePath = new MerklePath(funding.fundingHeight, [[{ offset: 0, txid: true, hash: middle.id('hex') }]])
  const target = new Transaction(1, [{ sourceTransaction: middle, sourceOutputIndex: 0, unlockingScript: UnlockingScript.fromHex('') }], [{ satoshis: 85, lockingScript: LockingScript.fromHex('51') }], 0)
  const entry = { txid: target.id('hex'), beefHex: Buffer.from(target.toAtomicBEEF()).toString('hex'), verdict: 'REJECTED' }
  expect(() => observedSubmissionTransactions(entry, { requireResolvedAncestors: true, trustedMinedRoot: funding })).toThrow(/unresolved/)
  const resolved = new Map(reference.storageTransactions.map(row => [row.txid, Transaction.fromHex(row.rawTxHex)]))
  const remember = (tx: Transaction) => { resolved.set(tx.id('hex'), tx); for (const input of tx.inputs) if (input.sourceTransaction) remember(input.sourceTransaction) }
  for (const row of reference.trace) if (Array.isArray(row.result?.tx)) remember(Transaction.fromAtomicBEEF(row.result.tx))
  remember(target)
  const graph = observedSubmissionTransactions(entry, { resolvedTransactions: resolved, requireResolvedAncestors: true, trustedMinedRoot: funding })
  expect(graph.map(row => row.txid)).toContain(forbidden.id('hex'))
  await expect(verifyTransactionStateFinalSubmissions(reference, initial, [...initial, entry], { resolvedTransactions: resolved, requireResolvedAncestors: true, trustedMinedRoot: funding })).rejects.toThrow(/protected transaction-state input/)
})
