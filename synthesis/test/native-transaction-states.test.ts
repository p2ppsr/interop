import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { Transaction } from '@bsv/sdk'
import { deriveTransactionStateOutcomes, verifyNativeTransactionStates } from '../src/wallet-lab/native/verify-transaction-states.js'
import { type StateReport } from '../src/wallet-lab/native/conformance-transaction-states-model.js'
const root = path.resolve(import.meta.dirname, '../../fixtures/native-transaction-states/reference-20261111')
const bytes = fs.readFileSync(path.join(root, 'report.json'))
const baseline: StateReport = JSON.parse(bytes.toString())
const copy = () => structuredClone(baseline)
const row = (r: StateReport, id: string) => r.trace.find(x => x.id === id)!
const derive = async (r: StateReport) => { r.assertions = await deriveTransactionStateOutcomes(r); r.result = r.assertions.some(x => x.result === 'FAIL') ? 'FAIL' : r.assertions.some(x => x.result === 'BLOCKED') ? 'BLOCKED' : 'PASS'; return r }
const outcome = async (r: StateReport, suffix: string) => (await deriveTransactionStateOutcomes(r)).find(x => x.id.endsWith(suffix))?.result

describe('native transaction-state independent evidence predicates', () => {
  it('replays exact source-bound public reference with genuine TXID-only results', async () => {
    const provenance = JSON.parse(fs.readFileSync(path.join(root, 'provenance.json'), 'utf8'))
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(provenance.files['report.json'])
    const result = await verifyNativeTransactionStates(copy())
    expect(result.counts).toEqual({ PASS: 19, FAIL: 0, BLOCKED: 0 }); expect(result.transactions).toHaveLength(7)
    expect(result.transactions.filter(x => x.resultKind === 'TXID_ONLY').map(x => x.callId)).toEqual(['txid-only-create', 'txid-only-sign'])
  })
  it.each(['omit', 'duplicate', 'reorder', 'args', 'method', 'skip'])('rejects %s call accounting tampering', async mode => {
    const r = copy()
    if (mode === 'omit') r.trace.splice(3, 1)
    if (mode === 'duplicate') r.trace.push(structuredClone(r.trace[3]!))
    if (mode === 'reorder') [r.trace[2], r.trace[3]] = [r.trace[3]!, r.trace[2]!]
    if (mode === 'args') row(r, 'mixed-sign').args.spends = { 0: { unlockingScript: '51' } }
    if (mode === 'method') row(r, 'mixed-sign').method = 'createAction'
    if (mode === 'skip') r.skipped.push({ id: 'mixed-sign', dependency: 'mixed-prepare' })
    await expect(deriveTransactionStateOutcomes(r)).rejects.toThrow()
  })
  it.each(['mixed-prepare', 'abort-prepare', 'conflict-control', 'spend-index-not-in-reference-prepare', 'script-length-mismatch-prepare', 'txid-only-prepare'])('rejects a valid unrelated staged AtomicBEEF for %s', async id => {
    const r = copy(), target = row(r, id)
    const alternate = row(r, id === 'mixed-prepare' ? 'abort-prepare' : 'mixed-prepare').result.signableTransaction.tx
    target.result.signableTransaction.tx = structuredClone(alternate)
    const values = await deriveTransactionStateOutcomes(r)
    const names: Record<string, string> = { 'mixed-prepare': 'mixed-inputs', 'abort-prepare': 'abort-then-sign-reject', 'conflict-control': 'input-absent-from-beef', 'spend-index-not-in-reference-prepare': 'spend-index-not-in-reference', 'script-length-mismatch-prepare': 'script-length-mismatch', 'txid-only-prepare': 'returnTXIDOnly' }
    expect(values.find(x => x.id.endsWith(names[id]!))?.result).toBe('FAIL')
  })
  it('rejects wrong outputs and sequence on otherwise valid unsigned graphs', async () => {
    for (const change of ['output', 'sequence']) {
      const r = copy(), target = row(r, 'mixed-prepare'), tx = Transaction.fromAtomicBEEF(target.result.signableTransaction.tx)
      if (change === 'output') tx.outputs[0]!.satoshis = 9
      else tx.inputs[0]!.sequence = 123
      target.result.signableTransaction.tx = tx.toAtomicBEEF()
      expect(await outcome(r, 'mixed-inputs')).toBe('FAIL')
    }
  })
  it('requires actual storage for TXID-only results and exact source/intent', async () => {
    const absent = copy(), id = row(absent, 'txid-only-sign').result.txid
    absent.storageTransactions = absent.storageTransactions.filter(x => x.txid !== id)
    await expect(deriveTransactionStateOutcomes(absent)).rejects.toThrow(/stored/)
    const rebound = copy(); row(rebound, 'txid-only-sign').result.txid = row(rebound, 'direct-default').result.txid
    expect(await outcome(rebound, 'returnTXIDOnly')).toBe('FAIL')
  })
  it('rejects missing synchronous submission proof', async () => {
    const r = copy(), call = row(r, 'direct-default'); call.submissionEnd = call.submissionStart
    expect(await outcome(r, 'noSend-omitted-false')).toBe('FAIL')
  })
  it('rejects missing released sources after aborted or rejected calls', async () => {
    const r = copy(), fanout = row(r, 'fanout').result.txid
    row(r, 'source-after').result.outputs = row(r, 'source-after').result.outputs.filter((o: any) => o.outpoint !== `${fanout}.4`)
    expect(await outcome(r, 'abort-then-sign-reject')).toBe('FAIL')
  })
  it('rejects generic exceptions as parameter validation', async () => {
    const r = copy(); row(r, 'truncated-proof').error = { name: 'Error', message: 'network timeout' }
    expect(await outcome(r, 'truncated-proof')).toBe('FAIL')
  })
  it.each(['wrong-id', 'suffix', 'non-byte-suffix'])('retains recovered transaction provenance despite %s', async kind => {
    const r = copy(), target = row(r, 'direct-default'), actual = target.result.txid
    if (kind === 'wrong-id') target.result.txid = '11'.repeat(32)
    else target.result.tx.push(kind === 'suffix' ? 0 : 'not a byte')
    const result = await verifyNativeTransactionStates(await derive(r))
    expect(result.assertions.find(x => x.id.endsWith('all-unlockingScripts'))?.result).toBe('FAIL')
    expect(result.transactions.find(x => x.callId === 'direct-default')?.txid).toBe(actual)
  })
  it('retains undecodable native response only under its specific failed predicate', async () => {
    const r = copy(); row(r, 'direct-default').result = { tx: [1, 2, 3] }
    const result = await verifyNativeTransactionStates(await derive(r))
    expect(result.malformedNativeResponses).toEqual([{ callId: 'direct-default', predicateId: 'transaction.signing-branches.all-unlockingScripts', result: { tx: [1, 2, 3] } }])
  })
  it('binds a successful known-source recovery to signed bytes rather than accepting any success object', async () => {
    const r = copy(); row(r, 'input-absent-from-beef').result = {}
    expect(await outcome(r, 'input-absent-from-beef')).toBe('FAIL')
  })
  it.each(['input-index-out-of-range', 'already-spent-input'])('rejects a valid unrelated submission during structured rejection: %s', async id => {
    const r = copy(), target = row(r, id), position = r.trace.indexOf(target), index = target.submissionStart
    const extra = { ...structuredClone(r.submissions[0]!), index }
    r.submissions = [...r.submissions.filter(x => x.index < index), extra, ...r.submissions.filter(x => x.index >= index).map(x => ({ ...x, index: x.index + 1 }))]
    target.submissionEnd++
    for (const later of r.trace.slice(position + 1)) { later.submissionStart++; later.submissionEnd++ }
    r.submissionEnd++
    expect(await outcome(r, id)).toBe('FAIL')
  })
  it('preserves a recoverable malformed fanout as a failed fixture with blocked dependents', async () => {
    const r = copy(), old = row(r, 'fanout').result.tx, changed = [...old, 0]
    row(r, 'fanout').result.tx = changed
    for (const call of r.trace) if (JSON.stringify(call.args.inputBEEF) === JSON.stringify(old)) call.args.inputBEEF = changed
    const result = await verifyNativeTransactionStates(await derive(r))
    expect(result.counts).toEqual({ PASS: 0, FAIL: 1, BLOCKED: 18 })
    expect(result.transactions.find(x => x.callId === 'fanout')?.txid).toBe(row(r, 'fanout').result.txid)
  })
  it('does not waive a returned valid-shaped but unbound TXID as a malformed native failure', async () => {
    const r = copy(); row(r, 'direct-default').result = { txid: '11'.repeat(32) }
    await expect(verifyNativeTransactionStates(await derive(r))).rejects.toThrow(/unbound/)
  })
})
