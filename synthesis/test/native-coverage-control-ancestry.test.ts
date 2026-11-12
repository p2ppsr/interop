import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'
import { Transaction } from '@bsv/sdk'
import { hydrateCoverageControlAncestry } from '../src/wallet-lab/native/coverage-control-ancestry.js'
import { deriveTransactionCoverageOutcomes } from '../src/wallet-lab/native/coverage-transactions-verifier.js'
import { observedSubmissionTransactions } from '../src/wallet-lab/native/verify-transaction-state-bindings.js'

const archive = path.resolve(import.meta.dirname, '../../journals/integrated-native-attempts/2026-11-12/43216478235/native-integrated.zip')
expect(createHash('sha256').update(fs.readFileSync(archive)).digest('hex')).toBe('6701efea0672ddf069796dfd96b221ae21415fbc478871a97b8be0c9449aad23')
const read = (rep: number, name: string) => JSON.parse(execFileSync('unzip', ['-p', archive, `repetition-${rep}/${name}`], { maxBuffer: 16 * 1024 * 1024 }).toString())
const originals = [1, 2].map(rep => ({ report: read(rep, 'evidence/conformance/coverage-transactions.json'), rows: read(rep, 'evidence/native-transactions.json'), fixture: read(rep, 'evidence/mined-funding-source.json').fixture, shutdown: read(rep, 'shutdown-submissions.json') }))
const fixture = (index = 0) => { const source = originals[index]!, storage = new Map<string, Transaction>(source.rows.map((row: any) => [row.txid, Transaction.fromHex(row.rawTxHex)])); const resolved = new Map(storage); resolved.set(source.fixture.txid, Transaction.fromAtomicBEEF([...Buffer.from(source.fixture.atomicBeefHex, 'hex')])); return { report: structuredClone(source.report), binding: { profile: 'ITCVE-1@4.5.0', identity: source.report.identity, fixture: source.fixture, storageTransactions: storage, resolvedTransactions: resolved }, final: source.shutdown.submissions } }
for (const index of [0, 1]) it(`independently hydrates only fixed positive control proofs from native6 repetition${index + 1}`, async () => {
  const f = fixture(index), original = JSON.stringify(f.report), row = f.report.trace.find((v: any) => v.id === 'proof-unknown-control'), tx = Transaction.fromAtomicBEEF(row.args.tx), bridge = tx.inputs[0]!.sourceTransaction!.id('hex')
  expect(f.binding.resolvedTransactions.has(bridge)).toBe(false)
  const result = await hydrateCoverageControlAncestry(f.report, f.binding)
  expect(result.admitted).toHaveLength(3); expect(result.retainedChildFindings.FAIL).toBe(3); expect(result.newNativeQualification).toBe(false)
  expect(f.binding.resolvedTransactions.get(bridge)?.toHex()).toBe(tx.inputs[0]!.sourceTransaction!.toHex())
  for (const row of f.final) expect(() => observedSubmissionTransactions(row, { resolvedTransactions: f.binding.resolvedTransactions, requireResolvedAncestors: true, trustedMinedRoot: f.binding.fixture })).not.toThrow()
  expect(JSON.stringify(f.report)).toBe(original)
}, 30_000)
it('retains a rejected control as FAIL without admitting its bridge or hiding a later submission', async () => {
  const f = fixture(), row = f.report.trace.find((r: any) => r.id === 'proof-unknown-control')
  delete row.result; row.error = { name: 'Error', message: 'controlled valid-proof rejection' }
  f.report.assertions = await deriveTransactionCoverageOutcomes(f.report); f.report.result = 'FAIL'
  const result = await hydrateCoverageControlAncestry(f.report, f.binding)
  expect(result.unavailable).toEqual(['proof-unknown-control']); expect(result.admitted).toHaveLength(2)
  expect(result.retainedChildFindings.FAIL).toBeGreaterThan(3)
  const target = Transaction.fromAtomicBEEF(row.args.tx).id('hex'), submission = f.final.find((r: any) => r.txid === target)
  expect(() => observedSubmissionTransactions(submission, { resolvedTransactions: f.binding.resolvedTransactions, requireResolvedAncestors: true, trustedMinedRoot: f.binding.fixture })).toThrow('unresolved unmined ancestry')
}, 30_000)
for (const [name, mutate] of [
  ['legacy profile', (f: any) => { f.binding.profile = 'ITCVE-1@4.4.0' }],
  ['wrong wallet', (f: any) => { f.binding.identity = originals[1]!.report.identity }],
  ['missing stored target', (f: any) => { f.binding.storageTransactions.delete(f.report.trace.find((r: any) => r.id === 'proof-unknown-control').result.txid) }],
  ['wrong stored target', (f: any) => { const id = f.report.trace.find((r: any) => r.id === 'proof-unknown-control').result.txid; f.binding.storageTransactions.set(id, Transaction.fromHex(originals[1]!.rows[0].rawTxHex)) }],
  ['foreign mined root', (f: any) => { f.binding.fixture = { ...f.binding.fixture, merkleRoot: '55'.repeat(32) } }],
  ['wrong retained bridge', (f: any) => { const row = f.report.trace.find((r: any) => r.id === 'proof-wrong-root-control'), id = Transaction.fromAtomicBEEF(row.args.tx).inputs[0]!.sourceTransaction!.id('hex'); f.binding.resolvedTransactions.set(id, Transaction.fromHex(originals[1]!.rows[0].rawTxHex)) }],
  ['changed control bytes', (f: any) => { f.report.trace.find((r: any) => r.id === 'proof-conflicting-control').args.tx.push(0) }],
  ['wrong controlled actor', (f: any) => { f.report.trace.find((r: any) => r.id === 'proof-parent').actor = 'wallet' }]
] as const) it(`rejects ${name} without partially admitting graph bodies`, async () => {
  const f = fixture(); mutate(f); const before = new Map([...f.binding.resolvedTransactions].map(([id, tx]) => [id, tx.toHex()])); await expect(hydrateCoverageControlAncestry(f.report, f.binding)).rejects.toThrow(); expect(new Map([...f.binding.resolvedTransactions].map(([id, tx]) => [id, tx.toHex()]))).toEqual(before)
}, 30_000)
