import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { LockingScript, MerklePath, Transaction, UnlockingScript } from '@bsv/sdk'
import { tc, transactionCoverageIds, type TransactionCoverageReport as Report } from '../src/wallet-lab/native/coverage-transactions-model.js'
import { coverageAtomic, coverageDuplicateControlAtomic } from '../src/wallet-lab/native/coverage-transactions-program.js'
import { deriveTransactionCoverageOutcomes, verifyNativeTransactionCoverage, verifyTransactionCoverageParentBindings } from '../src/wallet-lab/native/coverage-transactions-verifier.js'
const dir = path.resolve(import.meta.dirname, '../../programs/ISI-4/profiles/native-coverage-transactions-1.0.0/reference-batch-fixed')
const baseline: Report = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, 'report.json.gz'))).toString())
const submissions = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, 'submissions.json.gz'))).toString())
const fixture = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../fixtures/teranode/wab-funding-v1.json'), 'utf8'))
const copy = () => structuredClone(baseline)
const row = (report: Report, name: string) => report.trace.find(r => r.id === name)!
const result = async (report: Report, suffix: string) => (await deriveTransactionCoverageOutcomes(report)).find(r => r.id.endsWith(`/${suffix}`))!.result
async function derive(report: Report) { report.assertions = await deriveTransactionCoverageOutcomes(report); report.result = report.assertions.some(r => r.result === 'FAIL') ? 'FAIL' : 'BLOCKED'; return report }
function binding(report = baseline) {
  const graph = new Map<string, Transaction>(), storage = new Map<string, Transaction>()
  for (const entry of report.storageTransactions) { const tx = Transaction.fromHex(entry.rawTxHex); graph.set(entry.txid, tx); storage.set(entry.txid, tx) }
  const add = (tx: Transaction) => { if (graph.has(tx.id('hex'))) expect(graph.get(tx.id('hex'))!.toHex()).toBe(tx.toHex()); graph.set(tx.id('hex'), tx); for (const input of tx.inputs) if (input.sourceTransaction) add(input.sourceTransaction) }
  add(coverageAtomic([...Buffer.from(fixture.atomicBeefHex, 'hex')]))
  for (const r of report.trace) for (const bytes of [r.result?.tx, r.error?.tx, r.id.endsWith('-control') ? r.args?.tx : undefined]) if (bytes) try { add(r.id === 'proof-duplicate-control' && bytes === r.args.tx ? coverageDuplicateControlAtomic(bytes) : coverageAtomic(bytes)) } catch { /* Malformed response stays in its predicate. */ }
  return { identity: report.identity, globalSubmissions: structuredClone(submissions), finalSubmissions: structuredClone(submissions), storageTransactions: storage, graph: { resolvedTransactions: graph, requireResolvedAncestors: true, trustedMinedRoot: { txid: fixture.txid, rawHex: fixture.rawHex } } }
}
function lateSpend(source: Transaction, index: number, satoshis = 1) {
  return new Transaction(1, [{ sourceTransaction: source, sourceOutputIndex: index, unlockingScript: UnlockingScript.fromHex(source.outputs[index]!.lockingScript.toHex() === tc.sourceScript ? '51' : ''), sequence: 0xffffffff }], [{ satoshis, lockingScript: LockingScript.fromHex('51') }], 0)
}
const ledgerRow = (tx: Transaction, verdict = 'ACCEPTED_BY_NETWORK') => ({ txid: tx.id('hex'), beefHex: Buffer.from(tx.toAtomicBEEF()).toString('hex'), verdict })

describe('prospective transaction coverage with actual TypeScript wallet and Go storage evidence', () => {
  it('binds every retained fixture byte and the exact executed prospective source', () => {
    const p = JSON.parse(fs.readFileSync(path.join(dir, 'provenance.json'), 'utf8'))
    expect(p.claim).toBe('LAB_SELF_TEST_ONLY'); expect(p.actualNative).toBe(false); expect(p.nativeQualification).toBeNull()
    for (const [name, entry] of Object.entries(p.files) as any) {
      const compressed = fs.readFileSync(path.join(dir, name)), raw = zlib.gunzipSync(compressed)
      expect(createHash('sha256').update(compressed).digest('hex')).toBe(entry.sha256)
      expect(createHash('sha256').update(raw).digest('hex')).toBe(entry.uncompressedSha256); expect(raw.length).toBe(entry.uncompressedBytes)
    }
    const source = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, 'source-before.json.gz'))).toString())
    expect(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, 'source-after.json.gz'))).toString())).toEqual(source)
    const executedSource = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, 'source-inventory.json.gz'))).toString())
    const preserved = JSON.parse(fs.readFileSync(path.join(dir, 'source-preserved-before-oracle2/manifest.json'), 'utf8'))
    expect(createHash('sha256').update(fs.readFileSync(path.join(dir, 'provenance.json'))).digest('hex')).toBe(preserved.originalProvenanceSha256)
    for (const entry of preserved.files) {
      const compressed = fs.readFileSync(path.join(dir, entry.gzipPath)), raw = zlib.gunzipSync(compressed)
      expect(createHash('sha256').update(compressed).digest('hex')).toBe(entry.gzipSha256)
      expect(createHash('sha256').update(raw).digest('hex')).toBe(executedSource[entry.originalPath]); expect(entry.sourceSha256).toBe(executedSource[entry.originalPath])
    }
  })
  it('retains all 22 mapped rows, two actual reference failures and one unresolved interpretation', async () => {
    const verified = await verifyNativeTransactionCoverage(copy())
    expect(verified.counts).toEqual({ PASS: 19, FAIL: 2, BLOCKED: 1 }); expect(verified.assertionCount).toBe(22)
    expect(baseline.trace).toHaveLength(122); expect(verified.assertions.map(r => r.id)).toEqual(transactionCoverageIds)
    expect(verified.assertions.filter(r => r.result === 'FAIL').map(r => r.id)).toEqual(['transaction.proof-trust/conflicting-proof', 'transaction.internalization/both-output-types'])
    expect(row(baseline, 'batch-sign').error).toBeUndefined(); expect(row(baseline, 'batch-sign').result.sendWithResults).toHaveLength(2)
  })
  it('joins actual fees, original submissions and all final ancestry without promoting failed rows', async () => {
    const verified = await verifyTransactionCoverageParentBindings(copy(), binding())
    expect(verified.publicCalls).toBe(122); expect(verified.signedTransactions).toBe(24); expect(verified.aggregateFeesSatoshis).toBe(424)
    expect(verified.unprovenClaims.map(x => x.id)).toContain('transaction.proof-trust/conflicting-proof')
  })
  it('uses distinct existing100-satoshi sources for every native held-change anchor', () => {
    const fanout = row(baseline, 'fanout').result.txid
    for (const [id, index] of [['held-a', 5], ['held-b', 6], ['held-inactive', 7], ['held-unknown-control', 8]] as const) {
      const call = row(baseline, id), tx = coverageAtomic(call.result.tx)
      expect(call.args.inputs[0].outpoint).toBe(`${fanout}.${index}`)
      expect(tx.inputs.some(input => input.sourceTransaction?.id('hex') === fanout && input.sourceOutputIndex === index && input.sourceTransaction?.outputs[index]!.satoshis === 100)).toBe(true)
      expect(call.result.noSendChange.length).toBeGreaterThan(0)
    }
  })
  it('binds foreign held change to its own independent100-satoshi source', () => {
    const call = row(baseline, 'foreign-held'), source = row(baseline, 'incoming-fixture').result.txid
    expect(call.actor).toBe('funder'); expect(call.args.inputs[0].outpoint).toBe(`${source}.8`)
    expect(coverageAtomic(row(baseline, 'incoming-fixture').result.tx).outputs[8]!.satoshis).toBe(100)
    expect(call.result.noSendChange.length).toBeGreaterThan(0)
  })
  it.each(['omit', 'duplicate', 'reorder', 'actor', 'method', 'args', 'skip'])('rejects %s transcript mutation', async mode => {
    const r = copy()
    if (mode === 'omit') r.trace.splice(3, 1)
    if (mode === 'duplicate') r.trace.push(structuredClone(r.trace[3]!))
    if (mode === 'reorder') [r.trace[3], r.trace[4]] = [r.trace[4]!, r.trace[3]!]
    if (mode === 'actor') row(r, 'foreign-sign').actor = 'funder'
    if (mode === 'method') row(r, 'foreign-abort').method = 'signAction'
    if (mode === 'args') row(r, 'change-foreign').args.options.noSendChange = []
    if (mode === 'skip') r.skipped.push({ id: 'foreign', dependency: 'incoming-fixture' })
    await expect(deriveTransactionCoverageOutcomes(r)).rejects.toThrow()
  })
  it.each(['timeout', 'not implemented', 'network failed', 'insufficient funds'])('does not turn %s into validation success', async message => {
    const r = copy(); row(r, 'missing-payment').error = { name: 'Error', message }
    expect(await result(r, 'missing-paymentRemittance')).toBe('FAIL')
  })
  it.each(['missing-payment', 'missing-insertion', 'wrong-derivation', 'wrong-prefix', 'wrong-sender', 'index-range'])('rejects successful invalid internalization %s', async name => {
    const r = copy(), call = row(r, name); delete call.error; call.result = { accepted: true }
    const suffix = name === 'missing-payment' ? 'missing-paymentRemittance' : name === 'missing-insertion' ? 'missing-insertionRemittance' : name === 'index-range' ? 'output-index-out-of-range' : 'wrong-derivation'
    expect(await result(r, suffix)).toBe('FAIL')
  })
  it.each(['basket', 'actions'])('binds %s inventory equality after a rejected call', async inventory => {
    const r = copy(); row(r, `missing-insertion-after-${inventory}`).result.extraMutation = true
    expect(await result(r, 'missing-insertionRemittance')).toBe('FAIL')
  })
  it('rejects false or missing publicly attributed credit without accessing the reserved default basket', async () => {
    expect(baseline.trace.some(r => r.method === 'listOutputs' && r.args.basket === 'default')).toBe(false)
    for (const mode of ['satoshis', 'unrelated', 'remove']) {
      const r = copy(), action = row(r, 'payment-after-actions').result.actions[0]
      if (mode === 'satoshis') action.satoshis++
      if (mode === 'unrelated') action.outputs[0].lockingScript = '51'
      if (mode === 'remove') action.outputs = []
      expect(await result(r, 'wallet-payment')).toBe('FAIL')
    }
  })
  it('requires exact insertion metadata and both independently credited output types', async () => {
    const tags = copy(); row(tags, 'insertion-after-basket').result.outputs[0].tags = ['unrelated']; expect(await result(tags, 'basket-insertion')).toBe('FAIL')
    const missing = copy(); row(missing, 'both-after-actions').result.actions[0].outputs = []; expect(await result(missing, 'both-output-types')).toBe('FAIL')
  })
  it('does not equate a delayed sending receipt with completed delivery', async () => {
    const r = copy(), call = row(r, 'default-create-omitted'); expect(call.result.sendWithResults[0].status).toBe('sending')
    call.result.sendWithResults[0].status = 'unproven'; expect(await result(r, 'acceptDelayedBroadcast-omitted-true')).toBe('FAIL')
  })
  it('rejects a forged noSendChange identity even if another valid transaction is retained', async () => {
    const r = copy(); row(r, 'foreign-held').result.noSendChange[0] = `${row(r, 'held-a').result.txid}.1`
    // Dependent arguments deliberately track the mutation, so the semantic oracle must reject the foreign source swap.
    row(r, 'change-foreign').args.options.noSendChange[0] = row(r, 'foreign-held').result.noSendChange[0]
    expect(await result(r, 'foreign-output')).toBe('FAIL')
  })
  it('requires actual foreign owner completion after both rejected native calls', async () => {
    const r = copy(), owner = row(r, 'foreign-owner-sign'); delete owner.result; owner.error = { name: 'Error', message: 'reference is unknown' }
    expect(await result(r, 'foreign-reference-reject')).toBe('FAIL')
  })
  it.each(['unknown', 'wrong-root'])('requires full-proof positive controls for %s', async mode => {
    const r = copy(); row(r, `proof-${mode}-control`).result.accepted = false
    expect(await result(r, mode === 'unknown' ? 'unknown-not-in-knownTxids' : 'wrong-merkle-root')).toBe('FAIL')
  })
  it.each(['valid', 'omit', 'duplicate', 'unrelated', 'failed', 'missing-submission'])('independently checks a %s batch positive-control ledger using real signed bytes', async mode => {
    // Actual successful batch bytes; mutate only the declared hostile copy.
    const r = copy(), call = row(r, 'batch-sign')
    const offset = call.submissionStart - r.submissionStart
    if (mode === 'omit') call.result.sendWithResults.pop()
    if (mode === 'duplicate') call.result.sendWithResults.push(structuredClone(call.result.sendWithResults[0]))
    if (mode === 'unrelated') call.result.sendWithResults[0].txid = '12'.repeat(32)
    if (mode === 'failed') call.result.sendWithResults[0].status = 'failed'
    if (mode === 'missing-submission') r.submissions[offset]!.verdict = 'REJECTED'
    expect(await result(r, 'sign-sendWith')).toBe(mode === 'valid' ? 'PASS' : 'FAIL')
  })
  it('keeps valid identical-proof duplicate controls distinct from a referenced contradictory root', () => {
    const valid = row(baseline, 'proof-duplicate-control')
    expect(valid.result.accepted).toBe(true); expect(row(baseline, 'proof-duplicate-create-control-cleanup').result.aborted).toBe(true)
    expect(coverageDuplicateControlAtomic(valid.args.tx).id('hex')).toBe(valid.result.txid)
    expect(() => coverageDuplicateControlAtomic(row(baseline, 'proof-conflicting-control').args.tx)).toThrow()
    expect(() => coverageDuplicateControlAtomic(row(baseline, 'proof-conflicting-internalize').args.tx)).toThrow()
  })
  it('retains the merged payment amount mismatch while both actual outputs remain visible', async () => {
    const action = row(baseline, 'both-after-actions').result.actions[0]
    expect(action.outputs.filter((o: any) => o.basket === 'default').reduce((sum: number, o: any) => sum + o.satoshis, 0)).toBe(2000)
    expect(action.satoshis).toBe(1000); expect(await result(copy(), 'both-output-types')).toBe('FAIL')
  })
  it('cannot relabel the actual credit or duplicate-proof failures as PASS', async () => {
    const r = copy(); for (const a of r.assertions) if (a.result === 'FAIL') a.result = 'PASS'; r.result = 'BLOCKED'
    await expect(verifyNativeTransactionCoverage(r)).rejects.toThrow()
  })
  it.each(['identity', 'prefix', 'storage', 'root', 'resolve'])('rejects broken final parent %s binding', async mode => {
    const b = binding()
    if (mode === 'identity') b.identity = '02' + '11'.repeat(32)
    if (mode === 'prefix') b.finalSubmissions.splice(0, 1)
    if (mode === 'storage') b.storageTransactions.delete(baseline.storageTransactions[0]!.txid)
    if (mode === 'root') b.graph.trustedMinedRoot.rawHex = '00'
    if (mode === 'resolve') b.graph.requireResolvedAncestors = false
    await expect(verifyTransactionCoverageParentBindings(copy(), b)).rejects.toThrow()
  })
  it.each(['direct', 'ancestor', 'rejected', 'fake-bump'])('rejects a late relinquished spend hidden as %s', async mode => {
    const b = binding(), source = coverageAtomic(row(baseline, 'incoming-fixture').result.tx), spend = lateSpend(source, 2)
    let target = spend
    if (mode === 'ancestor') target = lateSpend(spend, 0)
    if (mode === 'fake-bump') { b.graph.resolvedTransactions.set(spend.id('hex'), spend); spend.merklePath = new MerklePath(123, [[{ offset: 0, txid: true, hash: spend.id('hex') }]]) }
    b.finalSubmissions.push(ledgerRow(target, mode === 'rejected' ? 'REJECTED' : 'ACCEPTED_BY_NETWORK'))
    await expect(verifyTransactionCoverageParentBindings(copy(), b)).rejects.toThrow(/Protected|unresolved/)
  })
  it('rejects replay of a previously permitted target after the observed call window', async () => {
    const b = binding(), txid = row(baseline, 'held-child').result.txid
    b.finalSubmissions.push(structuredClone(submissions.find((x: any) => x.txid === txid)))
    await expect(verifyTransactionCoverageParentBindings(copy(), b)).rejects.toThrow(/Protected/)
  })
  it('permits an approved earlier held child as a genuine later descendant ancestor', async () => {
    const b = binding(), held = coverageAtomic(row(baseline, 'held-child').result.tx), later = lateSpend(held, 0)
    b.finalSubmissions.push(ledgerRow(later))
    expect((await verifyTransactionCoverageParentBindings(copy(), b)).verified).toBe(true)
  })
})
