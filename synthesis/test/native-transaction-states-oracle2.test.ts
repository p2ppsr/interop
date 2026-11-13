import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { LockingScript, Transaction, UnlockingScript } from '@bsv/sdk'
import { expect, it } from 'vitest'
import { getTransactionStatePolicy, type StateReport } from '../src/wallet-lab/native/conformance-transaction-states-model.js'
import { deriveTransactionStateOutcomes, verifyNativeTransactionStates } from '../src/wallet-lab/native/verify-transaction-states.js'
import { verifyTransactionStateFinalSubmissions } from '../src/wallet-lab/native/verify-transaction-state-bindings.js'

const root = path.resolve(import.meta.dirname, '../..'), dir = path.join(root, 'fixtures/native-transaction-states/43157433977')
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
const stored = fs.readFileSync(path.join(dir, 'report.json.gz')), raw = gunzipSync(stored), sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')
assert.equal(stored.length, manifest.file.bytes); assert.equal(sha(stored), manifest.file.sha256); assert.equal(raw.length, manifest.file.rawBytes); assert.equal(sha(raw), manifest.file.rawSha256)
const original: StateReport = JSON.parse(raw.toString())
const reference: StateReport = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/native-transaction-states/reference-20261111/report.json'), 'utf8'))
const funding = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/teranode/wab-funding-v1.json'), 'utf8'))
const ids = ['spend-index-not-in-reference', 'script-length-mismatch']
const row = (r: StateReport, id: string) => r.trace.find(x => x.id === id)!
function selected(r = original): StateReport { const copy = structuredClone(r), { policy, policySha256 } = getTransactionStatePolicy(2); copy.oracle = policy.oracle; copy.policySha256 = policySha256; return copy }
async function derive(r: StateReport) { r.assertions = await deriveTransactionStateOutcomes(r); r.result = r.assertions.some(x => x.result === 'FAIL') ? 'FAIL' : r.assertions.some(x => x.result === 'BLOCKED') ? 'BLOCKED' : 'PASS'; return r }
const outcome = async (r: StateReport, suffix: string) => (await deriveTransactionStateOutcomes(r)).find(x => x.id.endsWith(suffix))?.result

it('preserves the original9PASS10FAIL and changes exactly two cleanup outcomes only in a separate oracle2 derivation', async () => {
  expect((await verifyNativeTransactionStates(structuredClone(original))).counts).toEqual({ PASS: 9, FAIL: 10, BLOCKED: 0 })
  const revised = await derive(selected()), result = await verifyNativeTransactionStates(revised)
  expect(result.counts).toEqual({ PASS: 11, FAIL: 8, BLOCKED: 0 })
  expect(revised.assertions.filter((a, i) => a.result !== original.assertions[i]!.result).map(a => a.id.split('.').at(-1))).toEqual(ids)
  expect(original.oracle).toBe('tpnil-native-transaction-states-oracle@1.0.0')
})

it('replays the actual TS-to-Go reference with all19 predicates and explicit successful cleanup unchanged', async () => {
  expect((await verifyNativeTransactionStates(await derive(selected(reference)))).counts).toEqual({ PASS: 19, FAIL: 0, BLOCKED: 0 })
})

const mutations: Array<[string, (r: StateReport, id: string, index: number) => void]> = [
  ['generic cleanup exception', (r, id) => { row(r, `${id}-abort`).error = { name: 'Error', message: 'network timeout' } }],
  ['different unauthorized cleanup', (r, id) => { row(r, `${id}-abort`).error.message = 'The action reference belongs to a different originator.' }],
  ['unknown cleanup error type', (r, id) => { row(r, `${id}-abort`).error.name = 'TypeError' }],
  ['false cleanup result', (r, id) => { row(r, `${id}-abort`).result = { aborted: false }; delete row(r, `${id}-abort`).error }],
  ['contradictory successful cleanup and error', (r, id) => { row(r, `${id}-abort`).result = { aborted: true } }],
  ['missing spendable source', (r, _id, index) => { const outpoint = `${row(r, 'fanout').result.txid}.${index}`; row(r, 'source-after').result.outputs = row(r, 'source-after').result.outputs.filter((o: any) => o.outpoint !== outpoint) }],
  ['source remains reserved', (r, _id, index) => { row(r, 'source-after').result.outputs.find((o: any) => o.outpoint === `${row(r, 'fanout').result.txid}.${index}`).spendable = false }],
  ['generic original sign error', (r, id) => { row(r, id).error = { name: 'Error', message: 'unclassified failure' } }],
  ['unrelated cleanup submission', (r, id) => {
    const target = row(r, `${id}-abort`), position = r.trace.indexOf(target), index = target.submissionStart
    const extra = { ...structuredClone(r.submissions[0]!), index }
    r.submissions = [...r.submissions.filter(x => x.index < index), extra, ...r.submissions.filter(x => x.index >= index).map(x => ({ ...x, index: x.index + 1 }))]
    target.submissionEnd++; for (const later of r.trace.slice(position + 1)) { later.submissionStart++; later.submissionEnd++ }; r.submissionEnd++
  }]
]
for (const [name, mutate] of mutations) it(`rejects ${name} under both revised cleanup predicates`, async () => {
  for (const [i, id] of ids.entries()) { const r = selected(); mutate(r, id, 9 + i); expect(await outcome(r, id)).toBe('FAIL') }
})

it('rejects a cleanup reference different from the issued staged reference', async () => {
  const r = selected(); row(r, `${ids[0]}-abort`).args.reference = row(r, 'mixed-prepare').result.signableTransaction.reference
  await expect(deriveTransactionStateOutcomes(r)).rejects.toThrow('Exact calls/order required')
})

it.each([9, 10])('still rejects a valid later spend of automatically released output%s, including a hidden ancestor', async index => {
  const r = await derive(selected(reference))
  for (const id of ids) { delete row(r, `${id}-abort`).result; row(r, `${id}-abort`).error = structuredClone(row(original, `${id}-abort`).error) }
  await derive(r)
  const fanout = Transaction.fromAtomicBEEF(row(r, 'fanout').result.tx)
  const forbidden = new Transaction(1, [{ sourceTransaction: fanout, sourceOutputIndex: index, unlockingScript: UnlockingScript.fromHex('51') }], [{ satoshis: 95, lockingScript: LockingScript.fromHex('51') }], 0)
  const child = new Transaction(1, [{ sourceTransaction: forbidden, sourceOutputIndex: 0, unlockingScript: UnlockingScript.fromHex('') }], [{ satoshis: 90, lockingScript: LockingScript.fromHex('51') }], 0)
  const tracker = { currentHeight: async () => funding.fundingHeight + funding.maturityDepth, isValidRootForHeight: async (root: string, height: number) => root === funding.merkleRoot && height === funding.fundingHeight }
  expect(await child.verify(tracker)).toBe(true)
  const initial = r.submissions.map(s => ({ txid: s.txid, beefHex: s.serializedHex, verdict: s.verdict }))
  await expect(verifyTransactionStateFinalSubmissions(r, initial, initial)).resolves.toMatchObject({ verified: true })
  for (const tx of [forbidden, child]) for (const verdict of ['ACCEPTED_BY_NETWORK', 'REJECTED']) {
    const late = { txid: tx.id('hex'), beefHex: Buffer.from(tx.toAtomicBEEF()).toString('hex'), verdict }
    await expect(verifyTransactionStateFinalSubmissions(r, initial, [...initial, late])).rejects.toThrow('protected transaction-state input')
  }
})
