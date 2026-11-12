import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { LockingScript, P2PKH, PrivateKey, Transaction, UnlockingScript } from '@bsv/sdk'
import { describe, expect, it } from 'vitest'
import { coveragePaymentScript } from '../src/wallet-lab/native/conformance-permission-coverage-model.js'
import { verifyFinalPermissionSubmissionAncestry } from '../src/wallet-lab/native/verify-submission-ancestry.js'

// LAB_SELF_TEST_ONLY: immutable native permission receipts plus independently
// signed/script-valid adversarial descendants. The coverage scope is a test
// projection, never a replacement native coverage report or qualification.
const root = path.resolve(import.meta.dirname, '../..')
const archive = path.join(root, 'journals/integrated-native-attempts/2026-11-09/42697283161/native-integrated.zip')
expect(createHash('sha256').update(fs.readFileSync(archive)).digest('hex')).toBe('20f854ee8fa3f32eaa3122bf20f8200204d7b04ae31df7f4542cd31138021176')
const read = (name: string) => execFileSync('unzip', ['-p', archive, `repetition-2/evidence/${name}`], { maxBuffer: 16 * 1024 * 1024 })
const global = JSON.parse(read('native-submissions.json').toString())
const permission = JSON.parse(read('conformance/permission-lifecycle.json').toString())
const storage = new Map<string, Transaction>(JSON.parse(read('native-transactions.json').toString()).map((row: any) => [row.txid, Transaction.fromHex(row.rawTxHex)]))
const graph = new Map<string, Transaction>(storage)
const remember = (tx: Transaction) => { graph.set(tx.id('hex'), tx); if (!tx.merklePath) for (const input of tx.inputs) if (input.sourceTransaction) remember(input.sourceTransaction) }
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/teranode/wab-funding-v1.json'), 'utf8'))
remember(Transaction.fromAtomicBEEF([...Buffer.from(fixture.atomicBeefHex, 'hex')]))
for (const row of global) { try { remember(Transaction.fromAtomicBEEF([...Buffer.from(row.beefHex, 'hex')])) } catch { /* Raw bodies are hydrated below. */ } }
for (const tx of graph.values()) for (const input of tx.inputs) if (!input.sourceTransaction) input.sourceTransaction = graph.get(input.sourceTXID!)
const tracker = { currentHeight: async () => fixture.fundingHeight + fixture.maturityDepth, isValidRootForHeight: async (merkle: string, height: number) => merkle === fixture.merkleRoot && height === fixture.fundingHeight }
const reference = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/native-transaction-states/reference-20261111/report.json'), 'utf8'))
const fanout = Transaction.fromAtomicBEEF(reference.trace.find((row: any) => row.id === 'fanout').result.tx)
const receipt = (tx: Transaction, verdict = 'ACCEPTED_BY_NETWORK', raw = false) => ({ txid: tx.id('hex'), beefHex: raw ? tx.toHex() : Buffer.from(tx.toAtomicBEEF()).toString('hex'), verdict })
const binding = (tail: ReturnType<typeof receipt>[] = []) => ({ globalSubmissions: global, finalSubmissions: [...global, ...tail], permissionReport: structuredClone(permission),
  coverageReport: { identity: permission.identity, oracle: 'tpnil-native-permission-coverage-oracle@3.0.0', submissions: global, submissionWindow: { startIndex: global.length, endIndex: global.length } },
  identity: permission.identity, storageTransactions: new Map(storage), resolvedTransactions: new Map(graph), trustedMinedRoot: { txid: fixture.txid, rawHex: fixture.rawHex }, readEvidence: read })
async function hiddenPayment(script: string, amount: number) {
  const ancestor = new Transaction(1, [{ sourceTransaction: fanout, sourceOutputIndex: 15, unlockingScript: UnlockingScript.fromHex('51') }], [
    { satoshis: amount, lockingScript: LockingScript.fromHex(script) }, { satoshis: 99 - amount, lockingScript: LockingScript.fromHex('51') }
  ], 0)
  const child = new Transaction(1, [{ sourceTransaction: ancestor, sourceOutputIndex: 1, unlockingScript: UnlockingScript.fromHex('') }], [{ satoshis: 98 - amount, lockingScript: LockingScript.fromHex('51') }], 0)
  expect(await child.verify(tracker)).toBe(true)
  return { ancestor, child }
}

describe('prospective complete shutdown permission ancestry', () => {
  it('admits unchanged archived grant provenance with no invented coverage observation', async () => {
    const result = await verifyFinalPermissionSubmissionAncestry(binding())
    expect(result.verified).toBe(true); expect(result.approvedAncestor).toBe(permission.transactions.find((row: any) => row.role === 'spending-allow').txid)
  })
  it.each([5, 7])('rejects a denied lifecycle%s payment hidden in valid submitted ancestry', async amount => {
    const { child } = await hiddenPayment(permission.paymentScript, amount)
    await expect(verifyFinalPermissionSubmissionAncestry(binding([receipt(child)]))).rejects.toThrow('Unapproved denied payment')
  })
  it.each([53, 59, 61, 67])('rejects a denied coverage%s payment hidden in valid submitted ancestry', async amount => {
    const { child } = await hiddenPayment(coveragePaymentScript, amount)
    await expect(verifyFinalPermissionSubmissionAncestry(binding([receipt(child)]))).rejects.toThrow('Denied coverage payment')
  })
  it('does not exempt rejected-provider ancestry or a raw target resolved independently', async () => {
    const { ancestor, child } = await hiddenPayment(coveragePaymentScript, 53)
    const b = binding([receipt(child, 'REJECTED_INVALID_TX', true)])
    b.resolvedTransactions.set(ancestor.id('hex'), ancestor); b.resolvedTransactions.set(child.id('hex'), child)
    await expect(verifyFinalPermissionSubmissionAncestry(b)).rejects.toThrow('Denied coverage payment')
  })
  it('rejects an unresolved raw descendant instead of assuming absent denied ancestors', async () => {
    const { child } = await hiddenPayment(coveragePaymentScript, 53)
    await expect(verifyFinalPermissionSubmissionAncestry(binding([receipt(child, 'ACCEPTED_BY_NETWORK', true)]))).rejects.toThrow('unresolved unmined ancestry')
  })
  // Signing plus three complete ancestry checks can exceed five seconds on the
  // shared Linux runner. This is a test budget, never a relaxed verifier limit.
  it('permits the exact approved native grant as an ancestor but rejects replay as a new target', { timeout: 30_000 }, async () => {
    const original = permission.transactions.find((row: any) => row.role === 'spending-allow')
    const approved = Transaction.fromAtomicBEEF(original.atomicBeef)
    const index = approved.outputs.findIndex(output => output.satoshis === 5 && output.lockingScript.toHex() === permission.paymentScript)
    expect(index).toBeGreaterThanOrEqual(0)
    const child = new Transaction(1, [{ sourceTransaction: approved, sourceOutputIndex: index, sequence: 0xffffffff, unlockingScriptTemplate: new P2PKH().unlock(PrivateKey.fromHex('33'.repeat(32))) }], [{ satoshis: 4, lockingScript: LockingScript.fromHex('51') }], 0)
    await child.sign(); expect(await child.verify(tracker)).toBe(true)
    expect((await verifyFinalPermissionSubmissionAncestry(binding([receipt(child)]))).verified).toBe(true)
    await expect(verifyFinalPermissionSubmissionAncestry(binding([receipt(approved)]))).rejects.toThrow('Unapproved denied payment')
    const missing = binding([receipt(child)]); missing.storageTransactions.delete(approved.id('hex'))
    await expect(verifyFinalPermissionSubmissionAncestry(missing)).rejects.toThrow()
  })
  it('keeps the successful coverage7 recipient distinct from the lifecycle7 denial', async () => {
    const { child } = await hiddenPayment(coveragePaymentScript, 7)
    expect((await verifyFinalPermissionSubmissionAncestry(binding([receipt(child)]))).verified).toBe(true)
  })
  it.each(['prefix', 'txid', 'suffix', 'coverage-oracle', 'identity'])('rejects substituted%s evidence', async mode => {
    const { child } = await hiddenPayment(coveragePaymentScript, 7), b: any = binding([receipt(child)])
    if (mode === 'prefix') b.finalSubmissions = b.finalSubmissions.slice(1)
    if (mode === 'txid') b.finalSubmissions.at(-1).txid = 'ab'.repeat(32)
    if (mode === 'suffix') b.finalSubmissions.at(-1).beefHex += '00'
    if (mode === 'coverage-oracle') b.coverageReport.oracle = 'tpnil-native-permission-coverage-oracle@2.0.0'
    if (mode === 'identity') b.coverageReport.identity = PrivateKey.fromHex('66'.repeat(32)).toPublicKey().toString()
    await expect(verifyFinalPermissionSubmissionAncestry(b)).rejects.toThrow()
  })
})

it('requires explicit expanded profile for permission5 and retains every denied ancestor guard', async () => {
  const b: any = binding(); b.coverageReport.oracle = 'tpnil-native-permission-coverage-oracle@5.0.0'
  await expect(verifyFinalPermissionSubmissionAncestry(b)).rejects.toThrow()
  b.profile = 'ITCVE-1@4.3.0'; expect((await verifyFinalPermissionSubmissionAncestry(b)).verified).toBe(true)
  const { child } = await hiddenPayment(coveragePaymentScript, 53); b.finalSubmissions.push(receipt(child))
  await expect(verifyFinalPermissionSubmissionAncestry(b)).rejects.toThrow('Denied coverage payment')
  for (const revision of [3, 4]) { const wrong: any = binding(); wrong.coverageReport.oracle = `tpnil-native-permission-coverage-oracle@${revision}.0.0`; wrong.profile = 'ITCVE-1@4.3.0'; await expect(verifyFinalPermissionSubmissionAncestry(wrong)).rejects.toThrow() }
})
