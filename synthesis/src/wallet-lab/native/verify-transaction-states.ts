import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { Beef, Transaction, Utils } from '@bsv/sdk'
import { specifiedError } from './conformance-clauses-model.js'
import { stateConfig as c, stateCaseIds, fanoutArgs, getTransactionStatePolicy, type StateCall, type StateReport } from './conformance-transaction-states-model.js'
const fixture = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../../../fixtures/teranode/wab-funding-v1.json'), 'utf8'))
const tracker = { currentHeight: async () => fixture.fundingHeight + fixture.maturityDepth, isValidRootForHeight: async (root: string, height: number) => root === fixture.merkleRoot && height === fixture.fundingHeight }
class Blocked extends Error {}
const caseId = (part: string) => stateCaseIds.find(id => id.endsWith(`.${part}`))!
function atomic(bytes: unknown): Transaction {
  assert.ok(Array.isArray(bytes) && bytes.length > 0)
  for (let i = 0; i < bytes.length; i++) assert.ok(Object.hasOwn(bytes, i) && Number.isInteger(bytes[i]) && bytes[i] >= 0 && bytes[i] <= 255)
  const reader = new Utils.Reader(bytes), graph = Beef.fromReader(reader)
  assert.ok(reader.eof(), 'Trailing BEEF bytes'); assert.match(graph.atomicTxid ?? '', /^[a-f0-9]{64}$/)
  const tx = Transaction.fromAtomicBEEF(bytes); assert.equal(tx.id('hex'), graph.atomicTxid); return tx
}
export function transactionStateRolePredicate(id: string): string {
  if (id === 'fanout') return 'fixture.fanout'
  if (['direct-default', 'direct-explicit'].includes(id)) return caseId('all-unlockingScripts')
  if (id.startsWith('mixed-')) return caseId('mixed-inputs')
  if (id.startsWith('abort-')) return caseId('abort-then-sign-reject')
  if (id.startsWith('txid-only-')) return caseId('returnTXIDOnly')
  if (id === 'conflict-control') return caseId('input-absent-from-beef')
  const value = caseId(id.replace(/-prepare$/, '')); assert.ok(value, `Unknown transaction state role ${id}`); return value
}
function inspect(report: StateReport) {
  const { policy, policySha256 } = getTransactionStatePolicy(report.oracle === 'tpnil-native-transaction-states-oracle@2.0.0' ? 2 : 1)
  assert.equal(report.schema, 'tpnil-native-transaction-states@1.0.0'); assert.equal(report.oracle, policy.oracle)
  assert.equal(report.claim, 'ENGINEERING_OBSERVATION_ONLY'); assert.equal(report.policySha256, policySha256)
  assert.deepEqual(policy.assertionIds, ['fixture.fanout', ...stateCaseIds]); assert.equal(report.completeBRC100Conformance, false); assert.match(report.identity, /^(02|03)[a-f0-9]{64}$/)
  assert.deepEqual(report.errors, []); assert.ok(report.trace.length <= policy.bounds.maximumPublicCalls)
  assert.equal(new Set(report.trace.map(r => r.id)).size, report.trace.length)
  const rows = new Map(report.trace.map(r => [r.id, r]))
  const row = (id: string): StateCall => { const r = rows.get(id); if (!r) throw new Blocked(`Required predecessor for ${id} did not return a reference`); return r }
  const stored = new Map<string, Transaction>()
  for (const entry of report.storageTransactions) {
    assert.match(entry.txid, /^[a-f0-9]{64}$/); assert.match(entry.rawTxHex, /^(?:[a-f0-9]{2})+$/)
    const tx = Transaction.fromHex(entry.rawTxHex); assert.equal(tx.toHex(), entry.rawTxHex); assert.equal(tx.id('hex'), entry.txid)
    assert.ok(!stored.has(entry.txid), 'Duplicate independent stored transaction'); stored.set(entry.txid, tx)
  }
  const expected: Array<{ id: string; method: string; args: any }> = [], skips: StateReport['skipped'] = []
  const expect = (id: string, method: string, args: any) => expected.push({ id, method, args })
  const dependent = (id: string, method: string, dependency: string, args: (reference: string) => any) => {
    const ref = rows.get(dependency)?.result?.signableTransaction?.reference
    if (typeof ref === 'string') expect(id, method, args(ref)); else skips.push({ id, dependency })
  }
  const cleanup = (id: string) => { const ref = rows.get(id)?.result?.signableTransaction?.reference; if (typeof ref === 'string') expect(`${id}-cleanup`, 'abortAction', { reference: ref }) }
  expect('fanout', 'createAction', fanoutArgs())
  let fanout: Transaction | undefined
  // Match the driver's branch decision; fixtureCheck separately requires strict EOF/proof validation.
  try { fanout = Transaction.fromAtomicBEEF(row('fanout').result?.tx); if (fanout.id('hex') !== row('fanout').result?.txid) fanout = undefined } catch { /* Retain failed setup. */ }
  if (fanout) {
    const input = (index: number, pending = false) => ({ outpoint: `${fanout!.id('hex')}.${index}`, inputDescription: `TPNIL state input ${index}`, ...(pending ? { unlockingScriptLength: 1 } : { unlockingScript: '51' }) })
    const outputs = [{ satoshis: 2, lockingScript: '51', outputDescription: 'TPNIL state result first', basket: c.resultBasket }, { satoshis: 3, lockingScript: '51', outputDescription: 'TPNIL state result second', basket: c.resultBasket }]
    const create = (id: string, inputs: any[], options: any = {}, extras: any = {}) => ({ description: `TPNIL state ${id}`, inputBEEF: row('fanout').result.tx, inputs, outputs, labels: [c.label], options: { acceptDelayedBroadcast: false, ...options }, ...extras })
    const prepare = (id: string, index: number) => expect(id, 'createAction', create(id, [input(index, true)], { signAndProcess: false, randomizeOutputs: false }))
    const listing = { basket: c.basket, include: 'locking scripts', includeTags: true, limit: 100 }
    expect('source-before', 'listOutputs', listing)
    expect('direct-default', 'createAction', create('direct-default', [input(0)]))
    expect('direct-explicit', 'createAction', create('direct-explicit', [{ ...input(1), sequenceNumber: 4294967294 }], { signAndProcess: true, noSend: false, returnTXIDOnly: false, randomizeOutputs: true }, { version: 2, lockTime: 0 }))
    expect('mixed-prepare', 'createAction', create('mixed-prepare', [input(2), input(3, true)], { randomizeOutputs: false }))
    dependent('mixed-sign', 'signAction', 'mixed-prepare', reference => ({ reference, spends: { 1: { unlockingScript: '51' } }, options: { acceptDelayedBroadcast: false } }))
    prepare('abort-prepare', 4); dependent('abort', 'abortAction', 'abort-prepare', reference => ({ reference }))
    dependent('abort-sign', 'signAction', 'abort-prepare', reference => ({ reference, spends: { 0: { unlockingScript: '51' } }, options: { acceptDelayedBroadcast: false } }))
    prepare('conflict-control', 5); dependent('conflict-control-abort', 'abortAction', 'conflict-control', reference => ({ reference }))
    const negatives: Array<[string, any]> = [
      ['input-absent-from-beef', create('input-absent-from-beef', [input(5)], {}, { inputBEEF: new Beef().toBinary() })],
      ['input-index-out-of-range', create('input-index-out-of-range', [input(fanout.outputs.length)])],
      ['already-spent-input', create('already-spent-input', [input(0)])],
      ['script-and-length-conflict', create('script-and-length-conflict', [{ ...input(7), unlockingScriptLength: 2 }])],
      ['missing-script-and-length', create('missing-script-and-length', [{ outpoint: input(8).outpoint, inputDescription: input(8).inputDescription }])]
    ]
    for (const [id, args] of negatives) { expect(id, 'createAction', args); cleanup(id) }
    for (const [id, index, spends] of [['spend-index-not-in-reference', 9, { 999999: { unlockingScript: '51' } }], ['script-length-mismatch', 10, { 0: { unlockingScript: '5151' } }]] as const) {
      prepare(`${id}-prepare`, index); dependent(id, 'signAction', `${id}-prepare`, reference => ({ reference, spends, options: { acceptDelayedBroadcast: false } })); dependent(`${id}-abort`, 'abortAction', `${id}-prepare`, reference => ({ reference }))
    }
    expect('txid-only-create', 'createAction', create('txid-only-create', [input(11)], { returnTXIDOnly: true, randomizeOutputs: false }))
    prepare('txid-only-prepare', 12); dependent('txid-only-sign', 'signAction', 'txid-only-prepare', reference => ({ reference, spends: { 0: { unlockingScript: '51' } }, options: { acceptDelayedBroadcast: false, returnTXIDOnly: true } }))
    expect('truncated-proof', 'createAction', create('truncated-proof', [input(13)], {}, { inputBEEF: row('fanout').result.tx.slice(0, 7) })); cleanup('truncated-proof')
    const unknown = new Beef(); unknown.mergeTxidOnly('a7'.repeat(32))
    expect('unknown-without-trust', 'createAction', create('unknown-without-trust', [{ ...input(14), outpoint: `${'a7'.repeat(32)}.0` }], {}, { inputBEEF: unknown.toBinary() })); cleanup('unknown-without-trust')
    expect('source-after', 'listOutputs', listing)
    expect('actions-after', 'listActions', { labels: [c.label], includeInputs: true, includeInputUnlockingScripts: true, includeOutputs: true, includeOutputLockingScripts: true, limit: 100 })
  }
  assert.deepEqual(report.trace.map(({ id, method, args }) => ({ id, method, args })), expected, 'Exact calls/order required')
  assert.deepEqual(report.skipped, skips, 'Skipped call must have a missing public predecessor')
  assert.ok(Number.isSafeInteger(report.submissionStart) && report.submissionStart >= 0 && Number.isSafeInteger(report.submissionEnd) && report.submissionEnd >= report.submissionStart)
  let previous = report.submissionStart
  for (const r of report.trace) { assert.ok(Number.isSafeInteger(r.submissionStart) && r.submissionStart >= previous && Number.isSafeInteger(r.submissionEnd) && r.submissionEnd >= r.submissionStart && r.submissionEnd <= report.submissionEnd); previous = r.submissionEnd }
  assert.deepEqual(report.submissions.map(r => r.index), Array.from({ length: report.submissionEnd - report.submissionStart }, (_, i) => report.submissionStart + i))
  for (const s of report.submissions) { assert.ok(['ACCEPTED_BY_NETWORK', 'REJECTED'].includes(s.verdict)); assert.match(s.serializedHex, /^(?:[a-f0-9]{2})+$/); let tx: Transaction; try { tx = atomic([...Buffer.from(s.serializedHex, 'hex')]) } catch { tx = Transaction.fromHex(s.serializedHex) }; assert.equal(tx.id('hex'), s.txid); assert.equal(stored.get(s.txid)?.toHex(), tx.toHex(), 'Submission must be independently stored') }
  return { row, fanout, stored, policy }
}
export async function deriveTransactionStateOutcomes(report: StateReport): Promise<StateReport['assertions']> {
  const { row, fanout, stored, policy } = inspect(report)
  const graph = new Map(stored); graph.set(fixture.txid, Transaction.fromAtomicBEEF([...Buffer.from(fixture.atomicBeefHex, 'hex')]))
  const hydrate = (tx: Transaction, visited = new Set<string>(), depth = 0): Transaction => {
    assert.ok(depth < 32, 'Historical proof depth retained'); const id = tx.id('hex'); assert.ok(!visited.has(id)); const next = new Set([...visited, id])
    if (!tx.merklePath) for (const input of tx.inputs) { const parent = input.sourceTransaction ?? graph.get(input.sourceTXID ?? ''); assert.ok(parent, 'Stored source absent'); input.sourceTransaction = hydrate(parent, next, depth + 1) }; return tx
  }
  const remember = (tx: Transaction) => { graph.set(tx.id('hex'), tx); if (!tx.merklePath) for (const input of tx.inputs) if (input.sourceTransaction) remember(input.sourceTransaction) }
  if (fanout) remember(fanout)
  const txFor = async (id: string, txidOnly = false) => {
    const r = row(id); assert.equal(r.error, undefined); assert.match(r.result?.txid ?? '', /^[a-f0-9]{64}$/); assert.equal(r.result?.signableTransaction, undefined)
    let tx: Transaction
    if (txidOnly) { assert.equal(r.result?.tx, undefined); const found = stored.get(r.result.txid); assert.ok(found); tx = hydrate(found) }
    else { tx = atomic(r.result?.tx); assert.equal(tx.id('hex'), r.result.txid) }
    assert.equal(stored.get(tx.id('hex'))?.toHex(), tx.toHex()); assert.ok(await tx.verify(tracker), 'Signed bytes and admitted ancestry must verify'); return tx
  }
  const prepared = (id: string) => {
    const r = row(id); assert.equal(r.error, undefined); assert.equal(r.result?.txid, undefined); assert.equal(r.result?.tx, undefined)
    const ref = r.result?.signableTransaction?.reference; assert.equal(typeof ref, 'string'); assert.ok(ref.length > 0 && Buffer.from(ref, 'base64').toString('base64') === ref)
    const tx = atomic(r.result?.signableTransaction?.tx)
    assert.equal(tx.inputs.length, r.args.inputs.length)
    for (let i = 0; i < r.args.inputs.length; i++) {
      const wanted = r.args.inputs[i], actual = tx.inputs[i]!
      assert.equal(`${actual.sourceTXID ?? actual.sourceTransaction?.id('hex')}.${actual.sourceOutputIndex}`, wanted.outpoint)
      assert.equal(actual.unlockingScript?.toHex(), wanted.unlockingScript ?? '')
      assert.ok(Number.isSafeInteger(actual.sequence) && actual.sequence! >= 0 && actual.sequence! <= 0xffffffff)
      if (wanted.sequenceNumber !== undefined) assert.equal(actual.sequence, wanted.sequenceNumber)
      assert.ok(actual.sourceTransaction, 'Staged input must retain its source body')
      assert.equal(actual.sourceTransaction.outputs[actual.sourceOutputIndex]?.lockingScript.toHex(), c.lockingScript)
      assert.equal(actual.sourceTransaction.outputs[actual.sourceOutputIndex]?.satoshis, c.sourceSatoshis)
    }
    assert.ok(Number.isSafeInteger(tx.version) && tx.version >= 0 && Number.isSafeInteger(tx.lockTime) && tx.lockTime >= 0)
    if (r.args.version !== undefined) assert.equal(tx.version, r.args.version)
    if (r.args.lockTime !== undefined) assert.equal(tx.lockTime, r.args.lockTime)
    const actual = tx.outputs.map(o => `${o.satoshis}:${o.lockingScript.toHex()}`)
    const wanted = r.args.outputs.map((o: any) => `${o.satoshis}:${o.lockingScript}`)
    for (const entry of wanted) assert.equal(actual.filter(value => value === entry).length, wanted.filter((value: string) => value === entry).length)
    if (r.args.options?.randomizeOutputs === false) assert.deepEqual(actual.slice(0, wanted.length), wanted)
    return tx
  }
  const available = (index: number) => { const r = row('source-after'); assert.equal(r.error, undefined); assert.ok(Array.isArray(r.result?.outputs)); const found = r.result.outputs.filter((o: any) => o.outpoint === `${fanout!.id('hex')}.${index}`); assert.equal(found.length, 1); assert.equal(found[0].satoshis, c.sourceSatoshis); assert.equal(found[0].lockingScript, c.lockingScript) }
  const intent = (tx: Transaction, inputs: number[], fixed = false) => {
    assert.equal(tx.inputs.length, inputs.length, 'Fixture explicit inputs cover all fees')
    assert.deepEqual(tx.inputs.map(i => `${i.sourceTXID ?? i.sourceTransaction?.id('hex')}.${i.sourceOutputIndex}`), inputs.map(i => `${fanout!.id('hex')}.${i}`))
    const wanted = ['2:51', '3:51'], actual = tx.outputs.map(o => `${o.satoshis}:${o.lockingScript.toHex()}`)
    for (const value of wanted) assert.equal(actual.filter(x => x === value).length, 1)
    if (fixed) assert.deepEqual(actual.slice(0, 2), wanted)
    for (const o of tx.outputs.filter(o => !wanted.includes(`${o.satoshis}:${o.lockingScript.toHex()}`))) assert.match(o.lockingScript.toHex(), /^76a914[0-9a-f]{40}88ac$/)
    for (const i of tx.inputs) assert.equal(i.unlockingScript?.toHex(), '51')
  }
  const submitted = (id: string, tx: Transaction) => { const r = row(id); assert.ok(report.submissions.some(s => s.txid === tx.id('hex') && s.index >= r.submissionStart && s.index < r.submissionEnd && s.verdict === 'ACCEPTED_BY_NETWORK')) }
  const noSpend = (index: number) => { for (const s of report.submissions) assert.ok(!stored.get(s.txid)!.inputs.some(i => (i.sourceTXID ?? i.sourceTransaction?.id('hex')) === fanout!.id('hex') && i.sourceOutputIndex === index), 'Rejected operation submitted a spend') }
  const rejected = (id: string, index?: number) => { const r = row(id); assert.equal(r.submissionEnd, r.submissionStart, 'Structured rejection must not emit a new submission'); assert.equal(r.result, undefined); assert.ok(specifiedError(r.error), 'Published parameter/state rejection required'); if (index !== undefined) { available(index); noSpend(index) } }
  const malformedSignCleanup = (id: string, index: number) => {
    prepared(`${id}-prepare`); rejected(id, index)
    const cleanup = row(`${id}-abort`)
    if (report.oracle !== 'tpnil-native-transaction-states-oracle@2.0.0') { assert.deepEqual(cleanup.result, { aborted: true }); return }
    assert.ok(policy.malformedSignCleanup.cases.includes(id))
    assert.equal(cleanup.submissionEnd, cleanup.submissionStart, 'Cleanup must not submit a transaction')
    const source = row('source-after').result.outputs.find((o: any) => o.outpoint === `${fanout!.id('hex')}.${index}`)
    assert.equal(source?.spendable, true, 'Automatic cancellation must release the exact source as publicly spendable')
    if (cleanup.result !== undefined) {
      assert.equal(cleanup.error, undefined); assert.deepEqual(cleanup.result, { aborted: true })
    } else {
      assert.ok(cleanup.error && typeof cleanup.error === 'object')
      assert.ok(policy.malformedSignCleanup.alreadyClosedError.names.includes(cleanup.error.name), 'Unexpected cleanup error class')
      assert.equal(cleanup.error.message, policy.malformedSignCleanup.alreadyClosedError.message, 'Cleanup error is not the source-bound already-closed reference response')
    }
  }
  const fixtureCheck = async () => {
    assert.ok(fanout); await txFor('fanout'); assert.ok(fanout.outputs.length >= c.sourceCount)
    const r = row('source-before'); assert.equal(r.error, undefined); assert.equal(r.result?.totalOutputs, c.sourceCount); assert.equal(r.result?.outputs?.length, c.sourceCount)
    assert.equal(new Set(r.result.outputs.map((o: any) => o.outpoint)).size, c.sourceCount)
    for (let i = 0; i < c.sourceCount; i++) { assert.equal(fanout.outputs[i]!.satoshis, c.sourceSatoshis); assert.equal(fanout.outputs[i]!.lockingScript.toHex(), c.lockingScript); const o = r.result.outputs.find((o: any) => o.outpoint === `${fanout!.id('hex')}.${i}`); assert.ok(o); assert.equal(o.satoshis, c.sourceSatoshis); assert.equal(o.lockingScript, c.lockingScript); assert.deepEqual(o.tags, [`state source ${i}`]) }
  }
  const tests: Record<string, () => Promise<void> | void> = {
    'fixture.fanout': fixtureCheck,
    [caseId('noSend-omitted-false')]: async () => { for (const [id, n] of [['direct-default', 0], ['direct-explicit', 1]] as const) { const tx = await txFor(id); intent(tx, [n]); submitted(id, tx) } },
    [caseId('randomizeOutputs-omitted-true')]: async () => { intent(await txFor('direct-default'), [0]); intent(await txFor('direct-explicit'), [1]) },
    [caseId('version-default')]: async () => { const a = await txFor('direct-default'); assert.ok(Number.isSafeInteger(a.version) && a.version >= 0 && a.version <= 0xffffffff); assert.equal((await txFor('direct-explicit')).version, 2) },
    [caseId('lockTime-default')]: async () => { const a = await txFor('direct-default'); assert.ok(Number.isSafeInteger(a.lockTime) && a.lockTime >= 0 && a.lockTime <= 0xffffffff); assert.equal((await txFor('direct-explicit')).lockTime, 0) },
    [caseId('sequenceNumber-default')]: async () => { const a = await txFor('direct-default'); assert.ok(Number.isSafeInteger(a.inputs[0]?.sequence) && a.inputs[0]!.sequence! >= 0 && a.inputs[0]!.sequence! <= 0xffffffff); assert.equal((await txFor('direct-explicit')).inputs[0]!.sequence, 4294967294) },
    [caseId('all-unlockingScripts')]: async () => { const a = await txFor('direct-default'), b = await txFor('direct-explicit'); intent(a, [0]); intent(b, [1]); assert.notEqual(a.id('hex'), b.id('hex')) },
    [caseId('mixed-inputs')]: async () => { const p = prepared('mixed-prepare'), tx = await txFor('mixed-sign'); assert.equal(p.inputs.length, 2); assert.equal(p.inputs[0]?.unlockingScript?.toHex(), '51'); assert.equal(p.inputs[1]?.unlockingScript?.toHex(), ''); intent(tx, [2, 3], true); assert.equal(tx.version, p.version); assert.equal(tx.lockTime, p.lockTime); assert.deepEqual(tx.inputs.map(i => i.sequence), p.inputs.map(i => i.sequence)); assert.deepEqual(tx.outputs.map(o => [o.satoshis, o.lockingScript.toHex()]), p.outputs.map(o => [o.satoshis, o.lockingScript.toHex()])); submitted('mixed-sign', tx) },
    [caseId('abort-then-sign-reject')]: () => { prepared('abort-prepare'); assert.deepEqual(row('abort').result, { aborted: true }); rejected('abort-sign', 4) },
    [caseId('input-absent-from-beef')]: async () => { prepared('conflict-control'); assert.deepEqual(row('conflict-control-abort').result, { aborted: true }); if (row('input-absent-from-beef').error) rejected('input-absent-from-beef', 5); else { const tx = await txFor('input-absent-from-beef'); intent(tx, [5]); submitted('input-absent-from-beef', tx) } },
    [caseId('input-index-out-of-range')]: () => rejected('input-index-out-of-range'),
    [caseId('already-spent-input')]: async () => { const tx = await txFor('direct-default'); intent(tx, [0]); submitted('direct-default', tx); rejected('already-spent-input'); const spends = new Set(report.submissions.filter(s => stored.get(s.txid)!.inputs.some(i => (i.sourceTXID ?? i.sourceTransaction?.id('hex')) === fanout!.id('hex') && i.sourceOutputIndex === 0)).map(s => s.txid)); assert.deepEqual([...spends], [tx.id('hex')]) },
    [caseId('script-and-length-conflict')]: async () => { if (row('script-and-length-conflict').error) rejected('script-and-length-conflict', 7); else { const tx = await txFor('script-and-length-conflict'); intent(tx, [7]); submitted('script-and-length-conflict', tx) } },
    [caseId('missing-script-and-length')]: () => rejected('missing-script-and-length', 8),
    [caseId('spend-index-not-in-reference')]: () => malformedSignCleanup('spend-index-not-in-reference', 9),
    [caseId('script-length-mismatch')]: () => malformedSignCleanup('script-length-mismatch', 10),
    [caseId('returnTXIDOnly')]: async () => { const a = await txFor('txid-only-create', true), b = await txFor('txid-only-sign', true); const p = prepared('txid-only-prepare'); intent(a, [11], true); intent(b, [12], true); assert.equal(b.version, p.version); assert.equal(b.lockTime, p.lockTime); assert.deepEqual(b.inputs.map(i => i.sequence), p.inputs.map(i => i.sequence)); assert.deepEqual(b.outputs.map(o => [o.satoshis, o.lockingScript.toHex()]), p.outputs.map(o => [o.satoshis, o.lockingScript.toHex()])); submitted('txid-only-create', a); submitted('txid-only-sign', b); assert.notEqual(a.id('hex'), b.id('hex')) },
    [caseId('truncated-proof')]: () => rejected('truncated-proof', 13),
    [caseId('unknown-without-trust')]: () => { assert.ok(!stored.has('a7'.repeat(32))); rejected('unknown-without-trust', 14) }
  }
  const results: StateReport['assertions'] = []; let fixtureValid = false
  try { await fixtureCheck(); fixtureValid = true } catch { /* Explicitly scored below. */ }
  for (const id of ['fixture.fanout', ...stateCaseIds]) {
    try { if (id !== 'fixture.fanout' && !fixtureValid) throw new Blocked('Valid funded source fixture unavailable'); await tests[id]!(); results.push({ id, result: 'PASS', detail: 'Independent fixed-policy predicate verified.' }) }
    catch (error) { results.push({ id, result: error instanceof Blocked ? 'BLOCKED' : 'FAIL', detail: error instanceof Blocked ? error.message : `Predicate ${id} did not hold against retained public observations.` }) }
  }
  return results
}
export async function verifyNativeTransactionStates(report: StateReport) {
  const assertions = await deriveTransactionStateOutcomes(report)
  assert.deepEqual(report.assertions, assertions); assert.equal(report.result, assertions.some(r => r.result === 'FAIL') ? 'FAIL' : assertions.some(r => r.result === 'BLOCKED') ? 'BLOCKED' : 'PASS')
  const transactions: Array<{ role: string; callId: string; predicateId: string; txid: string; rawHex: string; atomicBeef?: number[]; resultKind: string }> = [], malformedNativeResponses: Array<{ callId: string; predicateId: string; result: any }> = []
  for (const row of report.trace) {
    if (!['createAction', 'signAction'].includes(row.method) || !row.result || (!Object.hasOwn(row.result, 'txid') && !Object.hasOwn(row.result, 'tx'))) continue
    const predicateId = transactionStateRolePredicate(row.id); let tx: Transaction | undefined
    if (Array.isArray(row.result.tx)) {
      let size = 0
      while (size < row.result.tx.length && Object.hasOwn(row.result.tx, size) && Number.isInteger(row.result.tx[size]) && row.result.tx[size] >= 0 && row.result.tx[size] <= 255) size++
      const prefix = row.result.tx.slice(0, size)
      try { tx = Transaction.fromAtomicBEEF(prefix) } catch {
        try { const graph = Beef.fromReader(new Utils.Reader(prefix)); if (graph.atomicTxid) tx = graph.findTxid(graph.atomicTxid)?.tx } catch { /* No recoverable target: explicit mapped FAIL required. */ }
      }
    } else if (typeof row.result.txid === 'string' && /^[a-f0-9]{64}$/.test(row.result.txid)) {
      const entry = report.storageTransactions.find(s => s.txid === row.result.txid)
      assert.ok(entry, 'A valid-shaped TXID-only return cannot hide an unbound transaction')
      tx = Transaction.fromHex(entry.rawTxHex)
      if (!['txid-only-create', 'txid-only-sign'].includes(row.id)) assert.equal(assertions.find(a => a.id === predicateId)?.result, 'FAIL', 'Unexpected TXID-only result requires mapped FAIL')
    }
    if (tx) transactions.push({ role: `transaction-states/${row.id}`, callId: row.id, predicateId, txid: tx.id('hex'), rawHex: tx.toHex(), ...(Array.isArray(row.result.tx) ? { atomicBeef: row.result.tx } : {}), resultKind: row.result.tx === undefined ? 'TXID_ONLY' : 'ATOMIC_BEEF' })
    else { assert.equal(assertions.find(a => a.id === predicateId)?.result, 'FAIL', 'Malformed transaction requires its independently recomputed predicate FAIL'); malformedNativeResponses.push({ callId: row.id, predicateId, result: row.result }) }
  }
  return { verified: true as const, assertions, assertionCount: assertions.length, counts: Object.fromEntries(['PASS', 'FAIL', 'BLOCKED'].map(value => [value, assertions.filter(a => a.result === value).length])), transactions, malformedNativeResponses, completeBRC100Conformance: false }
}
