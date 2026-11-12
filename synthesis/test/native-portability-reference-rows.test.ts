import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'
import { projectDataset } from '../src/storage-sync/projection.js'
import { projectDatasetWithReferenceOnlyRows } from '../src/storage-sync/projection-reference-rows.js'
import { verifyPortableProofClosure } from '../src/wallet-lab/native/portability-proof.js'

const archive = path.resolve(import.meta.dirname, '../../journals/integrated-native-attempts/2026-11-12/43216478235/native-integrated.zip')
expect(createHash('sha256').update(fs.readFileSync(archive)).digest('hex')).toBe('6701efea0672ddf069796dfd96b221ae21415fbc478871a97b8be0c9449aad23')
const reports = [1, 2].map(rep => JSON.parse(execFileSync('unzip', ['-p', archive, `repetition-${rep}/evidence/conformance/portability.json`], { maxBuffer: 16 * 1024 * 1024 }).toString()))
const pending = (dataset: any) => dataset.outputs.find((row: any) => !row.txid)
const parent = (dataset: any) => dataset.transactions.find((row: any) => row.transactionId === pending(dataset).transactionId)
for (const [index, report] of reports.entries()) it(`retains failed native6 repetition${index + 1} and compares every reference-only row prospectively`, () => {
  const original = JSON.stringify(report)
  expect(report.result).toBe('FAIL')
  expect(() => projectDataset(report.source)).toThrow('Output parent transaction bytes unavailable')
  expect(() => projectDataset(report.destination)).toThrow('Output parent transaction bytes unavailable')
  const source = projectDatasetWithReferenceOnlyRows(report.source), destination = projectDatasetWithReferenceOnlyRows(report.destination)
  expect(source).toEqual(destination)
  expect((source.outputs as any[]).length).toBe(report.source.outputs.length)
  expect((source.outputs as any[]).filter(row => row.key.startsWith('reference:'))).toHaveLength(18)
  expect((source.transactions as any[]).filter(row => row.key.startsWith('reference:'))).toHaveLength(9)
  expect(JSON.stringify(report)).toBe(original)
})
it('retains complete mined proof validation for all signed records in all four native snapshots', async () => {
  for (const report of reports) for (const side of ['source', 'destination']) {
    const proof = await verifyPortableProofClosure(report[side])
    expect(proof.verifiedTxids.length).toBeGreaterThanOrEqual(2)
    const pending = report[side].transactions.filter((row: any) => !row.txid)
    expect(pending).toHaveLength(9)
    expect(proof.verifiedTxids.every(id => /^[0-9a-f]{64}$/.test(id))).toBe(true)
  }
}, 30_000)
for (const field of ['satoshis', 'lockingScript', 'outputDescription', 'providedBy', 'purpose', 'customInstructions', 'derivationSuffix']) it(`does not drop changed reference-only ${field}`, () => {
  const source = reports[0].source, changed = structuredClone(source), row = pending(changed)
  row[field] = field === 'satoshis' ? row.satoshis + 1 : field === 'lockingScript' ? [81] : 'changed'
  expect(projectDatasetWithReferenceOnlyRows(changed)).not.toEqual(projectDatasetWithReferenceOnlyRows(source))
})
for (const [name, mutate] of [
  ['spendable', (d: any) => { pending(d).spendable = true }],
  ['spent', (d: any) => { pending(d).spentBy = d.transactions[0].transactionId }],
  ['wrong owner', (d: any) => { pending(d).userId += 1 }],
  ['wrong parent owner', (d: any) => { parent(d).userId += 1 }],
  ['signed identity without bytes', (d: any) => { pending(d).txid = '77'.repeat(32) }],
  ['unsigned active status', (d: any) => { parent(d).status = 'unsigned' }],
  ['noncanonical reference', (d: any) => { parent(d).reference += ' ' }],
  ['missing reference', (d: any) => { delete parent(d).reference }],
  ['missing parent', (d: any) => { pending(d).transactionId = 999999 }],
  ['duplicate parent', (d: any) => { d.transactions.push(structuredClone(parent(d))) }],
  ['duplicate output identity', (d: any) => { const row = structuredClone(pending(d)); row.vout += 100; d.outputs.push(row) }]
] as const) it(`rejects reference-only ${name}`, () => { const d = structuredClone(reports[0].source); mutate(d); expect(() => projectDatasetWithReferenceOnlyRows(d)).toThrow() })
it('a deleted reference-only output is a missing record, not equivalent', () => { const source = reports[0].source, changed = structuredClone(source), row = pending(changed); changed.outputs = changed.outputs.filter((v: any) => v !== row); expect(projectDatasetWithReferenceOnlyRows(changed)).not.toEqual(projectDatasetWithReferenceOnlyRows(source)) })
it('signed output bytes retain the historical exact-script guard', () => { const changed = structuredClone(reports[0].source), row = changed.outputs.find((v: any) => v.txid); row.lockingScript = [81]; expect(() => projectDatasetWithReferenceOnlyRows(changed)).toThrow('Stored output script differs') })
