import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { LockingScript, Transaction, UnlockingScript } from '@bsv/sdk'
import { getTransactionCoveragePolicy, type TransactionCoverageReport as Report } from '../src/wallet-lab/native/coverage-transactions-model.js'
import { coverageAtomic, coverageDuplicateControlAtomic } from '../src/wallet-lab/native/coverage-transactions-program.js'
import { deriveTransactionCoverageOutcomes, verifyNativeTransactionCoverage, verifyTransactionCoverageParentBindings } from '../src/wallet-lab/native/coverage-transactions-verifier.js'
const dir = path.resolve(import.meta.dirname, '../../programs/ISI-4/profiles/native-coverage-transactions-2.0.0/reference')
const read = (name: string) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, `${name}.gz`))).toString())
const reference: Report = read('report.json'), row = (r: Report, id: string) => r.trace.find(x => x.id === id)!
const copy = () => structuredClone(reference)
const result = async (r: Report, suffix: string) => (await deriveTransactionCoverageOutcomes(r)).find(x => x.id.endsWith(`/${suffix}`))!.result
const replay = (r: Report) => { r.policySha256 = getTransactionCoveragePolicy(2).policySha256; return r }
function parent(r = reference, load = read) {
  const fixture = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../fixtures/teranode/wab-funding-v1.json'), 'utf8'))
  const graph = new Map<string, Transaction>(), stored = new Map<string, Transaction>()
  for (const entry of load('final-storage-transactions.json')) { const tx = Transaction.fromHex(entry.rawTxHex); graph.set(entry.txid, tx); stored.set(entry.txid, tx) }
  const add = (tx: Transaction) => { if (graph.has(tx.id('hex'))) expect(graph.get(tx.id('hex'))!.toHex()).toBe(tx.toHex()); graph.set(tx.id('hex'), tx); for (const input of tx.inputs) if (input.sourceTransaction) add(input.sourceTransaction) }
  add(coverageAtomic([...Buffer.from(fixture.atomicBeefHex, 'hex')]))
  for (const call of r.trace) for (const bytes of [call.result?.tx, call.error?.tx, call.id.endsWith('-control') ? call.args?.tx : undefined]) if (bytes) try { add(call.id === 'proof-duplicate-control' && bytes === call.args.tx ? coverageDuplicateControlAtomic(bytes) : coverageAtomic(bytes)) } catch { /* Invalid data remains independently scored. */ }
  return { identity: r.identity, globalSubmissions: load('submissions.json'), finalSubmissions: load('final-submissions.json'), storageTransactions: stored, graph: { resolvedTransactions: graph, requireResolvedAncestors: true, trustedMinedRoot: { txid: fixture.txid, rawHex: fixture.rawHex } } }
}
describe('transaction oracle2 ordinary controls and independently bound delayed progress', () => {
  it('preserves failed samples and executed source separately from explicit local reevaluation', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); expect(manifest.actualNative).toBe(false); expect(manifest.nativeQualification).toBeNull()
    for (const [name, entry] of Object.entries(manifest.files) as any) { const zipped = fs.readFileSync(path.join(dir, name)), raw = zlib.gunzipSync(zipped); expect(createHash('sha256').update(zipped).digest('hex')).toBe(entry.sha256); expect(createHash('sha256').update(raw).digest('hex')).toBe(entry.uncompressedSha256); expect(raw.length).toBe(entry.uncompressedBytes) }
    for (const label of ['status-progress-failure', 'sqlite-control-failure', 'preclose-only-pass', 'positive-control-window-failure']) expect(read(`${label}/source-before.json`)).toEqual(read(`${label}/source-after.json`))
    const original = read('positive-control-window-failure/report.json'); expect(original.assertions.filter((r: any) => r.result === 'FAIL')).toHaveLength(1)
    const raw = ({ assertions, result, policySha256, ...r }: Report) => r; expect(raw(reference)).toEqual(raw(original)); expect(read('verification.json').claim).toBe('OFFLINE_REEVALUATION_OF_LIBRARY_TRACE')
  })
  it('verifies21 predicates with121calls and retains the interpretation as blocked', async () => { const c = await verifyNativeTransactionCoverage(copy()); expect(c.counts).toEqual({ PASS: 21, FAIL: 0, BLOCKED: 1 }); expect(reference.trace).toHaveLength(121); expect(c.assertions.find(x => x.result === 'BLOCKED')!.id).toBe('transaction.internalization/conflicting-remittance') })
  it('permits duplicate encoding rejection while requiring ordinary full-proof controls', async () => { expect(row(reference, 'proof-duplicate-control').error).toBeDefined(); expect(row(reference, 'proof-duplicate-create-control').error).toBeDefined(); expect(reference.trace.some(x => x.id === 'proof-duplicate-create-control-cleanup')).toBe(false); expect(row(reference, 'proof-conflicting-control').result.accepted).toBe(true); expect(row(reference, 'proof-conflicting-create-control-cleanup').result.aborted).toBe(true); expect(await result(copy(), 'conflicting-proof')).toBe('PASS') })
  it.each(['create', 'internalize'])('fails accepted contradictory proof in%s', async method => { const r = copy(), call = row(r, `proof-conflicting-${method}`); delete call.error; call.result = { accepted: true }; expect(await result(r, 'conflicting-proof')).toBe('FAIL') })
  it.each(['internalize', 'create', 'abort'])('requires the ordinary%s positive control', async method => { const r = copy(), call = row(r, method === 'internalize' ? 'proof-conflicting-control' : method === 'create' ? 'proof-conflicting-create-control' : 'proof-conflicting-create-control-cleanup'); if (method === 'internalize') call.result.accepted = false; if (method === 'create') call.result.signableTransaction.tx = [0]; if (method === 'abort') call.result.aborted = false; expect(await result(r, 'conflicting-proof')).toBe('FAIL') })
  it.each(['schema', 'policy', 'unknown', 'legacy-schema'])('rejects%s binding mutations', async mode => { const r = copy(); if (mode === 'schema') r.schema = 'tpnil-native-coverage-transactions@1.0.0'; if (mode === 'policy') r.policySha256 = getTransactionCoveragePolicy(1).policySha256; if (mode === 'unknown') r.oracle = 'tpnil-native-coverage-transactions-oracle@99.0.0'; if (mode === 'legacy-schema') r.oracle = 'tpnil-native-coverage-transactions-oracle@1.0.0'; await expect(deriveTransactionCoverageOutcomes(r)).rejects.toThrow() })
  it('normalizes the real status transitions only under revision2', async () => { const r = replay(read('status-progress-failure/report.json')); expect(await result(r, 'wrong-merkle-root')).toBe('PASS'); r.oracle = getTransactionCoveragePolicy(1).policy.oracle; r.schema = 'tpnil-native-coverage-transactions@1.0.0'; r.policySha256 = getTransactionCoveragePolicy(1).policySha256; expect(await result(r, 'wrong-merkle-root')).toBe('FAIL') })
  it.each(['unknown', 'unsigned', 'rejected', 'after-window', 'reverse', 'metadata', 'body', 'actor'])('does not normalize%s progress', async mode => {
    const r = replay(read('status-progress-failure/report.json')), before = row(r, 'proof-wrong-root-before-actions'), after = row(r, 'proof-wrong-root-after-actions'), index = before.result.actions.findIndex((a: any, i: number) => a.status !== after.result.actions[i].status), txid = before.result.actions[index].txid, prior = r.trace.find(c => c.result?.txid === txid && c.result?.tx)!
    if (mode === 'unknown') { before.result.actions[index].txid = 'a1'.repeat(32); after.result.actions[index].txid = 'a1'.repeat(32) }
    if (mode === 'unsigned') delete prior.result.tx
    if (mode === 'rejected' || mode === 'after-window') { const matches = r.submissions.filter(e => e.txid === txid), accepted = structuredClone(matches); for (const e of matches) e.verdict = 'REJECTED'; if (mode === 'after-window') { r.submissions.push(...accepted); r.submissionEnd += accepted.length } }
    if (mode === 'reverse') before.result.actions[index].status = 'failed'
    if (mode === 'metadata') after.result.actions[index].satoshis++
    if (mode === 'body') prior.result.tx = row(r, 'fanout').result.tx
    if (mode === 'actor') prior.actor = 'funder'
    if (mode === 'actor') await expect(deriveTransactionCoverageOutcomes(r)).rejects.toThrow(); else expect(await result(r, 'wrong-merkle-root')).toBe('FAIL')
  })
  it.each(['rejected', 'unknown', 'unsigned', 'not-delayed'])('does not excuse%s control-window submissions', async mode => {
    const r = copy(), control = row(r, 'proof-wrong-root-create-control-cleanup'); expect(control.submissionEnd).toBeGreaterThan(control.submissionStart)
    const entry = r.submissions[control.submissionStart - r.submissionStart]!, prior = r.trace.find(c => c.result?.txid === entry.txid && c.result?.tx)!
    if (mode === 'rejected') entry.verdict = 'REJECTED'
    if (mode === 'unknown') { delete prior.result.tx; prior.result.txid = 'a2'.repeat(32) }
    if (mode === 'unsigned') delete prior.result.tx
    if (mode === 'not-delayed') r.trace.find(c => c.result?.signableTransaction?.reference === prior.args.reference)!.args.options.acceptDelayedBroadcast = false
    if (mode === 'not-delayed') await expect(deriveTransactionCoverageOutcomes(r)).rejects.toThrow(); else expect(await result(r, 'wrong-merkle-root')).toBe('FAIL')
  })
  it('binds actual post-close provider rows and independently counts23transactions/414fee sats', async () => { const c = read('local-service-closure.json'); expect(c.servicesClosed).toBe(true); expect(c.finalProviders.flatMap((p: any) => p.submissions)).toEqual(read('final-submissions.json')); const v = await verifyTransactionCoverageParentBindings(copy(), parent()); expect(v).toMatchObject({ verified: true, signedTransactions: 23, aggregateFeesSatoshis: 414, publicCalls: 121 }); expect(v.protectedClaims.some(x => x.id.endsWith('/conflicting-proof'))).toBe(true) })
  it.each(['direct', 'ancestor', 'rejected'])('rejects a protected proof input spend hidden as%s', async mode => {
    const b = parent(), source = coverageAtomic(row(reference, 'proof-conflicting-control').args.tx), spend = new Transaction(1, [{ sourceTransaction: source, sourceOutputIndex: 0, unlockingScript: UnlockingScript.fromHex('51'), sequence: 0xffffffff }], [{ satoshis: 1, lockingScript: LockingScript.fromHex('51') }], 0)
    const target = mode === 'ancestor' ? new Transaction(1, [{ sourceTransaction: spend, sourceOutputIndex: 0, unlockingScript: UnlockingScript.fromHex(''), sequence: 0xffffffff }], [{ satoshis: 1, lockingScript: LockingScript.fromHex('51') }], 0) : spend
    b.finalSubmissions.push({ txid: target.id('hex'), beefHex: Buffer.from(target.toAtomicBEEF()).toString('hex'), verdict: mode === 'rejected' ? 'REJECTED' : 'ACCEPTED_BY_NETWORK' }); await expect(verifyTransactionCoverageParentBindings(copy(), b)).rejects.toThrow(/Protected/)
  })
})


it('independently verifies the fresh SQLite-retry reference without reclassifying its original results', async () => {
  const folder = path.resolve(dir, '../reference-sqlite-retry'), m = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8'))
  expect(m.actualNative).toBe(false); expect(m.nativeQualification).toBeNull(); expect(m.publicWalletMethodRetries).toBe(0)
  for (const [name, entry] of Object.entries(m.files) as any) { const zipped = fs.readFileSync(path.join(folder, name)), raw = zlib.gunzipSync(zipped); expect(createHash('sha256').update(zipped).digest('hex')).toBe(entry.sha256); expect(createHash('sha256').update(raw).digest('hex')).toBe(entry.uncompressedSha256) }
  const load = (name: string) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(folder, `${name}.gz`))).toString()), report = load('report.json')
  expect(load('source-before.json')).toEqual(load('source-after.json'))
  expect((await verifyNativeTransactionCoverage(report)).counts).toEqual({ PASS: 21, FAIL: 0, BLOCKED: 1 })
  expect((await verifyTransactionCoverageParentBindings(report, parent(report, load)))).toMatchObject({ verified: true, signedTransactions: 23, aggregateFeesSatoshis: 414, publicCalls: 121 })
  expect(load('closure.json').finalProviders.flatMap((p: any) => p.submissions)).toEqual(load('final-submissions.json'))
})
