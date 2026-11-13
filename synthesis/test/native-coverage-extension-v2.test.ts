import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { PrivateKey, Transaction } from '@bsv/sdk'
import { expect, it } from 'vitest'
import { deriveCoverageExtensionOutcomes, verifyCoverageExtensionOutputPersistence, verifyCoverageExtensionSnapshotBindings, verifyNativeCoverageExtension } from '../src/wallet-lab/native/coverage-extension-verifier.js'
import type { CoverageExtensionReport } from '../src/wallet-lab/native/coverage-extension-model.js'
// Retained real TS-to-Go observations plus explicitly derived adversarial copies.
// No synthetic object or reference wallet constitutes native qualification.
const directory = path.resolve(import.meta.dirname, '../../programs/ISI-4/profiles/native-coverage-extension-2.0.0/reference')
const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'))
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')
for (const row of manifest.files) { const stored = fs.readFileSync(path.join(directory, row.path)), raw = gunzipSync(stored); expect(sha(stored)).toBe(row.sha256); expect(stored.length).toBe(row.bytes); expect(sha(raw)).toBe(row.rawSha256); expect(raw.length).toBe(row.rawBytes) }
const read = (name: string) => JSON.parse(gunzipSync(fs.readFileSync(path.join(directory, `${name}.gz`))).toString())
const original: CoverageExtensionReport = read('report.json'), sample = () => structuredClone(original), callId = 'basket.bytes-0.internalizeAction'
const capture = (r: CoverageExtensionReport, phase: 'before' | 'after') => r.outputSnapshots!.find(row => row.callId === callId && row.phase === phase)!
const binding = () => ({ identity: original.identity, outputSnapshotObservations: read('output-observations.json'), outputProviderRegistry: read('output-providers.json') })
it('replays77 actual public calls and12 independent observations while retaining17PASS/42FAIL/2BLOCKED', async () => {
  expect(manifest.nativeExecutions).toBe(0); expect(manifest.sourceStable).toBe(true); expect(original.trace).toHaveLength(77)
  expect((await verifyNativeCoverageExtension(original)).counts).toEqual({ PASS: 17, FAIL: 42, BLOCKED: 2 })
  expect(verifyCoverageExtensionOutputPersistence(original, callId).verified).toBe(true)
  expect(verifyCoverageExtensionSnapshotBindings(original, binding())).toMatchObject({ verified: true, observations: 12, providers: 1 })
})
it('keeps exact uppercase caller input and proves normalized creation; later native-independent gaps stayFAIL', () => {
  expect(original.trace.find(row => row.id === 'basket.uppercase.createAction')!.args.outputs[0].basket).toBe('TPNIL name')
  expect(original.assertions.filter(row => row.id.includes('.basket.uppercase.')).map(row => row.result)).toEqual(['PASS', 'FAIL', 'FAIL', 'FAIL'])
  expect(original.trace.find(row => row.id === 'basket.normalized-after-create')!.result.outputs).toHaveLength(2)
})
it.each(['missing-pair', 'unavailable-before', 'unavailable-after'] as const)('reports missing control%s asBLOCKED, neverPASS', async mode => {
  const r = sample()
  if (mode === 'missing-pair') r.outputSnapshots = r.outputSnapshots!.filter(row => row.callId !== callId)
  else { const c = capture(r, mode === 'unavailable-before' ? 'before' : 'after'); delete c.observation.snapshots; c.observation.error = { name: 'Error', message: 'Owned provider snapshot unavailable' } }
  const outcome = (await deriveCoverageExtensionOutcomes(r)).find(row => row.id === `coverage-extension.${callId}`)
  expect(outcome!.result).toBe('BLOCKED')
})
it.each(['persisted-target', 'persisted-elsewhere', 'pending-output', 'unrelated-removal', 'metadata-write', 'spendability-write'] as const)('fails actual rejection with%s despite no transaction submission', async mode => {
  const r = sample(), before = capture(r, 'before').observation.snapshots!.providers[0]!.snapshot, after = capture(r, 'after').observation.snapshots!.providers[0]!.snapshot
  expect(verifyCoverageExtensionOutputPersistence(r, callId).verified).toBe(true)
  if (['persisted-target', 'persisted-elsewhere', 'pending-output'].includes(mode)) {
    const call = r.trace.find(row => row.id === callId)!, tx = Transaction.fromAtomicBEEF(call.args.tx), source = tx.outputs[0]!
    after.outputs.push({ outputId: Math.max(...after.outputs.map(row => row.outputId)) + 1, transactionId: Math.max(...after.outputs.map(row => row.transactionId)) + 1, outpoint: `${tx.id('hex')}.0`, txid: tx.id('hex'), rawTx: tx.toHex(), vout: 0, satoshis: source.satoshis!, lockingScript: source.lockingScript.toHex(), spendable: true, basketName: mode === 'persisted-elsewhere' ? 'unrelated basket name' : '', tags: ['coverage inserted 0'], customInstructions: 'coverage:inserted:0' })
    if (mode === 'pending-output') Object.assign(after.outputs.at(-1)!, { outpoint: null, txid: null, rawTx: null })
  }
  if (mode === 'unrelated-removal') after.outputs.shift()
  if (mode === 'metadata-write') after.outputs[0]!.customInstructions = 'unrelated metadata changed despite rejection'
  if (mode === 'spendability-write') after.outputs[0]!.spendable = !after.outputs[0]!.spendable
  expect(before).not.toEqual(after)
  expect(() => verifyCoverageExtensionOutputPersistence(r, callId)).toThrow('changed independently observed owned output state')
  expect((await deriveCoverageExtensionOutcomes(r)).find(row => row.id === `coverage-extension.${callId}`)!.result).toBe('FAIL')
})
it.each(['wrong-identity', 'wrong-provider', 'shifted-time', 'non-adjacent-observation', 'contradictory-control'] as const)('rejects%s snapshots', mode => {
  const r = sample(), c = capture(r, 'after'); expect(verifyCoverageExtensionOutputPersistence(r, callId).verified).toBe(true)
  if (mode === 'wrong-identity') c.observation.identityKey = PrivateKey.fromHex('2'.padStart(64, '0')).toPublicKey().toString()
  if (mode === 'wrong-provider') c.observation.snapshots!.providers[0]!.snapshot.providerIdentityKey = PrivateKey.fromHex('2'.padStart(64, '0')).toPublicKey().toString()
  if (mode === 'shifted-time') c.observation.startedAt = capture(r, 'before').observation.startedAt
  if (mode === 'non-adjacent-observation') c.observation.sequence++
  if (mode === 'contradictory-control') c.observation.error = { name: 'Error', message: 'Snapshot failed' }
  expect(() => verifyCoverageExtensionOutputPersistence(r, callId)).toThrow()
})
it.each(['omitted-capture', 'forged-capture', 'omitted-provider', 'provider-byte-substitution', 'window-shift', 'omitted-global-observation', 'ledger-sequence'] as const)('joins exact independent parent%s', mode => {
  const r = sample(), b = binding(); expect(verifyCoverageExtensionSnapshotBindings(r, b).verified).toBe(true)
  if (mode === 'omitted-capture') r.outputSnapshots!.splice(1, 1)
  if (mode === 'forged-capture') capture(r, 'after').observation.snapshots!.providers[0]!.snapshot.outputs[0]!.customInstructions = 'forged report-only metadata'
  if (mode === 'omitted-provider') b.outputProviderRegistry.push({ id: 'source/withdrawn.itcve.test', identityKey: PrivateKey.fromHex('3'.padStart(64, '0')).toPublicKey().toString(), componentIdentity: { components: { storage: 'go' } } })
  if (mode === 'provider-byte-substitution') b.outputProviderRegistry[0].componentIdentity = { components: { storage: 'unrelated' } }
  if (mode === 'window-shift') { r.outputSnapshotWindow!.startIndex++; r.outputSnapshotWindow!.endIndex++ }
  if (mode === 'omitted-global-observation') b.outputSnapshotObservations.splice(1, 1)
  if (mode === 'ledger-sequence') b.outputSnapshotObservations[0].sequence = 1
  expect(() => verifyCoverageExtensionSnapshotBindings(r, b)).toThrow()
})
it('rejects a changed normalized inventory rather than inheriting uppercase success', async () => {
  const r = sample(); r.trace.find(row => row.id === 'basket.normalized-after-create')!.result.outputs.pop()
  expect((await deriveCoverageExtensionOutcomes(r)).find(row => row.id === 'coverage-extension.basket.uppercase.createAction')!.result).toBe('FAIL')
})
