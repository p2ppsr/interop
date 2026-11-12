// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Beef, MerklePath, Transaction, Utils } from '@bsv/sdk'
import { ControlledWalletServices } from '../src/wallet-lab/services.js'
import { createFixtureWallet } from '../src/storage-sync/fixture-wallet.js'
import { clauseOracle7Id, noSendChangeInputId, noSendChangeOutputId, noSendChangeReadId, noSendChangeSetupId, noSendChangeSourceId, prepareNoSendChangeFixture } from '../src/wallet-lab/native/conformance-nosend-change.js'
import { verifyNoSendChangeFixture } from '../src/wallet-lab/native/verify-conformance-nosend-change.js'
import { captureClauseError } from '../src/wallet-lab/native/conformance-clauses.js'
import { deriveClauseOutcomes } from '../src/wallet-lab/native/verify-conformance-clauses.js'

const root = path.resolve(import.meta.dirname, '../..'), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-nosend-surplus-'))
fs.writeFileSync(path.join(directory, 'index.html'), '<title>Explicit noSend surplus laboratory fixture</title>')
const go = process.env.TPNIL_NOSEND_SURPLUS_STORAGE === 'go'
const services = new ControlledWalletServices({ webroot: directory, components: { storage: go ? 'go' : 'typescript' }, ...(go ? { go: { binary: path.join(root, 'out/itcve-go-storage-sqlite-retry'), storageSQLiteRetryPatch: true } } : {}) })
let wallet: any, report: any
const row = (value: any, id: string) => value.trace.find((entry: any) => entry.id === id)
const outcomes = async (value: any) => Object.fromEntries((await deriveClauseOutcomes(value)).filter(row => [noSendChangeInputId, noSendChangeOutputId].includes(row.id)).map(row => [row.id, row.result]))
beforeAll(async () => {
  await services.start()
  await services.fundRemoteWalletFromTeranode('77'.repeat(32), JSON.parse(fs.readFileSync(path.join(root, 'fixtures/teranode/wab-funding-v1.json'), 'utf8')))
  const factory = process.env.TPNIL_NOSEND_CANDIDATE_FIXTURE ? (await import(pathToFileURL(path.resolve(process.env.TPNIL_NOSEND_CANDIDATE_FIXTURE)).href)).createCandidateFixtureWallet : createFixtureWallet
  wallet = await factory(services, '77'.repeat(32))
  const trace: any[] = [], call = async (id: string, method: string, args: any) => {
    const entry: any = { id, method, args: structuredClone(args) }; trace.push(entry)
    try { entry.result = await wallet[method](structuredClone(args)) } catch (error) { entry.error = captureClauseError(error) }
    return entry
  }
  // Exercise the production helper using actual public wallet/storage calls.
  const prepared = await prepareNoSendChangeFixture(call, 3)
  report = JSON.parse(JSON.stringify({ claim: 'LAB_SELF_TEST_ONLY', oracle: clauseOracle7Id, positives: [], trace }))
  if (!prepared.outpoints?.length) throw Error(JSON.stringify(trace.map(r => ({ id: r.id, error: r.error, resultKeys: Object.keys(r.result ?? {}), actions: r.result?.actions?.map((a: any) => ({ status: a.status, outputs: a.outputs })) }))))
  const base = { description: 'TPNIL parameter validation fixture', outputs: [{ satoshis: 1, lockingScript: '51', outputDescription: 'TPNIL validation output', basket: 'tpnil clause parameters', tags: ['clause'], customInstructions: 'fixture' }], labels: ['tpnil-clauses'], options: { signAndProcess: false, noSend: true, randomizeOutputs: false, noSendChange: prepared.outpoints } }
  const control = await call(`control.${noSendChangeInputId}`, 'createAction', base)
  expect(control.error).toBeUndefined()
  await call(`cleanup.control.${noSendChangeInputId}`, 'abortAction', { reference: control.result.signableTransaction.reference })
  const invalid = [...prepared.outpoints!]; invalid[0] = '!invalid!'
  const negative = await call(noSendChangeInputId, 'createAction', { ...base, options: { ...base.options, noSendChange: invalid } })
  Object.assign(negative, { base, controlId: control.id })
  const release = await call('cleanup.batch', 'createAction', { description: 'TPNIL release noSend fixture', options: { sendWith: [prepared.pendingBatch.result.txid], acceptDelayedBroadcast: false } })
  expect(release.error).toBeUndefined()
  report = JSON.parse(JSON.stringify({ claim: 'LAB_SELF_TEST_ONLY', oracle: clauseOracle7Id, identity: (await wallet.getPublicKey({ identityKey: true })).publicKey, positives: [], trace }))
}, 60_000)
afterAll(async () => {
  try { await wallet?.destroy() } finally { await services.close(); fs.rmSync(directory, { recursive: true, force: true }) }
  if (process.env.TPNIL_NOSEND_SURPLUS_EVIDENCE && report) {
    const destination = path.resolve(process.env.TPNIL_NOSEND_SURPLUS_EVIDENCE); fs.mkdirSync(destination, { recursive: true })
    fs.writeFileSync(path.join(destination, 'reference.json'), JSON.stringify({ ...report, storage: go ? 'go' : 'typescript', candidateFixture: process.env.TPNIL_NOSEND_CANDIDATE_FIXTURE ?? null, assertions: await outcomes(report), submissions: services.submissions, cleanup: { walletDestroyed: true, servicesClosed: true }, nativeQualification: false }, null, 2) + '\n', { flag: 'wx' })
  }
})
describe('Prospective oracle7 explicit-source noSendChange fixture', () => {
  it('proves actual signed funding, surplus, managed output and successful positive control', async () => {
    expect(await outcomes(report)).toEqual({ [noSendChangeInputId]: 'PASS', [noSendChangeOutputId]: 'PASS' })
    const verified = await verifyNoSendChangeFixture(report), tx = Transaction.fromAtomicBEEF(row(report, noSendChangeSetupId).result.tx)
    expect(tx.inputs).toHaveLength(1); expect(verified.outpoints.length).toBeGreaterThan(0)
    expect(tx.outputs.slice(1).reduce((sum, output) => sum + output.satoshis!, 0)).toBeGreaterThanOrEqual(899)
  })
  it('binds policy lineage and preserves the executed oracle6 997-satoshi fixture', () => {
    const predecessor = fs.readFileSync(path.join(root, 'programs/ISI-4/profiles/native-conformance-5.0.0/clause-oracle-6.0.0.json'))
    const policy = JSON.parse(fs.readFileSync(path.join(root, 'programs/ISI-4/profiles/native-conformance-5.0.0/clause-oracle-7.0.0.json'), 'utf8'))
    expect(policy.oracle).toBe(clauseOracle7Id); expect(policy.predecessor.sha256).toBe(createHash('sha256').update(predecessor).digest('hex')); expect(policy.noSendChange).toMatchObject({ sourceSatoshis: 1000, anchorSatoshis: 1, anchorExplicitInputs: 1, maximumAnchorFeeSatoshis: 100, minimumManagedChangeSatoshis: 899, additionalPublicCalls: 1 })
    expect(JSON.parse(predecessor.toString()).noSendChange.anchorSatoshis).toBe(997)
  })
  it('rejects a validly spendable source whose rewritten anchor burns the bounded surplus as fees', async () => {
    const value = structuredClone(report), anchor = row(value, noSendChangeSetupId), tx = Transaction.fromAtomicBEEF(anchor.result.tx)
    tx.outputs[1]!.satoshis! -= 200
    anchor.result.tx = tx.toAtomicBEEF(); anchor.result.txid = tx.id('hex')
    anchor.result.noSendChange = [`${tx.id('hex')}.1`]
    const action = row(value, noSendChangeReadId).result.actions[0]
    action.txid = tx.id('hex'); action.outputs[1].satoshis = tx.outputs[1]!.satoshis
    await expect(verifyNoSendChangeFixture(value)).rejects.toThrow('Bounded anchor fee must preserve the declared surplus')
  })
  it('retains both exact original native6 failures under their executed oracle', async () => {
    const zip = path.join(root, 'journals/integrated-native-attempts/2026-11-12/43216478235/native-integrated.zip')
    expect(createHash('sha256').update(fs.readFileSync(zip)).digest('hex')).toBe('6701efea0672ddf069796dfd96b221ae21415fbc478871a97b8be0c9449aad23')
    for (const repetition of [1, 2]) {
      const original = JSON.parse(execFileSync('python3', ['-c', 'import sys,zipfile;print(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]).decode())', zip, `repetition-${repetition}/evidence/conformance/clauses.json`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }))
      await expect(verifyNoSendChangeFixture(original)).rejects.toThrow('A real wallet-managed change output is required')
    }
  })
  const extraProof = (value: any, target: 'source' | 'anchor', valid: boolean) => {
    const source = row(value, noSendChangeSourceId), anchor = row(value, noSendChangeSetupId)
    const subject = target === 'source' ? source : anchor, bytes = subject.result.tx, graph = Beef.fromBinary(bytes)
    const proof = valid ? MerklePath.fromBinary(graph.bumps[0]!.toBinary())
      : new MerklePath(graph.bumps[0]!.blockHeight, [[{ offset: 0, hash: 'ab'.repeat(32) }]])
    for (const leaf of proof.path[0]!) delete leaf.txid
    graph.bumps.push(proof)
    const writer = new Utils.Writer(); graph.toWriter(writer)
    subject.result.tx = [...bytes.slice(0, 36), ...writer.toArray()]
    if (target === 'source') anchor.args.inputBEEF = subject.result.tx
    const supplied = Beef.fromBinary(subject.result.tx)
    expect(supplied.bumps).toHaveLength(2)
    expect(supplied.bumps[1]!.path[0]!.every(leaf => leaf.txid !== true)).toBe(true)
  }
  for (const target of ['source', 'anchor'] as const) {
    it(`accepts a valid independently checked unmarked extra ${target} BUMP`, async () => {
      const value = structuredClone(report); extraProof(value, target, true)
      expect((await verifyNoSendChangeFixture(value)).outpoints.length).toBeGreaterThan(0)
    })
    it(`rejects an unmarked supplied false-root ${target} BUMP`, async () => {
      const value = structuredClone(report); extraProof(value, target, false)
      await expect(verifyNoSendChangeFixture(value)).rejects.toThrow('Every supplied BUMP root')
    })
  }
  const mutations: Array<[string, (value: any) => void]> = [
    ['source trailing byte', v => { row(v, noSendChangeSourceId).result.tx.push(0); row(v, noSendChangeSetupId).args.inputBEEF = row(v, noSendChangeSourceId).result.tx }],
    ['anchor trailing byte', v => { row(v, noSendChangeSetupId).result.tx.push(0) }],
    ['anchor sparse byte', v => { delete row(v, noSendChangeSetupId).result.tx[4] }],
    ['missing source', v => { v.trace = v.trace.filter((r: any) => r.id !== noSendChangeSourceId) }],
    ['source intent amount', v => { row(v, noSendChangeSourceId).args.outputs[0].satoshis++ }],
    ['source intent script', v => { row(v, noSendChangeSourceId).args.outputs[0].lockingScript = '00' }],
    ['source identity', v => { row(v, noSendChangeSourceId).result.txid = 'ab'.repeat(32) }],
    ['source ancestry', v => { const s = row(v, noSendChangeSourceId), b = Beef.fromBinary(s.result.tx); b.bumps[0]!.blockHeight++; s.result.tx = b.toBinaryAtomic(s.result.txid); row(v, noSendChangeSetupId).args.inputBEEF = s.result.tx }],
    ['automatic input substitution', v => { delete row(v, noSendChangeSetupId).args.inputs }],
    ['other explicit source', v => { row(v, noSendChangeSetupId).args.inputs[0].outpoint = `${'cd'.repeat(32)}.0` }],
    ['source setup after anchor', v => { const s = row(v, noSendChangeSourceId); v.trace = v.trace.filter((r: any) => r !== s); v.trace.push(s) }],
    ['noSend downgrade', v => { row(v, noSendChangeSetupId).args.options.noSend = false }],
    ['foreign change basket', v => { row(v, noSendChangeReadId).result.actions[0].outputs[1].basket = 'foreign basket' }],
    ['wrong change amount', v => { row(v, noSendChangeReadId).result.actions[0].outputs[1].satoshis++ }],
    ['duplicate source', v => { v.trace.push(structuredClone(row(v, noSendChangeSourceId))) }],
    ['legacy oracle relabel', v => { v.oracle = 'tpnil-brc100-clause-oracle@6.0.0' }]
  ]
  for (const [name, mutate] of mutations) it(`rejects ${name}`, async () => { const value = structuredClone(report); mutate(value); await expect(verifyNoSendChangeFixture(value)).rejects.toThrow() })
})
