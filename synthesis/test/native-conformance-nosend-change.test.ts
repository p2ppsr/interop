// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Beef, Transaction, UnlockingScript } from '@bsv/sdk'
import { ControlledWalletServices } from '../src/wallet-lab/services.js'
import { createFixtureWallet } from '../src/storage-sync/fixture-wallet.js'
import { clauseAssertionIds, clauseOracle4AssertionIds } from '../src/wallet-lab/native/conformance-clauses-model.js'
import { clauseOracle4Id, noSendChangeInputId, noSendChangeOutputId, noSendChangeReadId, noSendChangeSetupId, prepareNoSendChangeFixture } from '../src/wallet-lab/native/conformance-nosend-change.js'
import { verifyNoSendChangeFixture } from '../src/wallet-lab/native/verify-conformance-nosend-change.js'
import { captureClauseError } from '../src/wallet-lab/native/conformance-clauses.js'
import { deriveClauseOutcomes } from '../src/wallet-lab/native/verify-conformance-clauses.js'

const root = path.resolve(import.meta.dirname, '../..'), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-nosend-change-'))
fs.writeFileSync(path.join(directory, 'index.html'), '<title>noSendChange reference fixture</title>')
const fixtureRevision = process.env.TPNIL_NOSEND_FIXTURE_REVISION === '2' ? 2 : 1
const selectedOracle = fixtureRevision === 2 ? 'tpnil-brc100-clause-oracle@6.0.0' : clauseOracle4Id
const language = process.env.TPNIL_NOSEND_STORAGE === 'go' ? 'go' : 'typescript'
const services = new ControlledWalletServices({ webroot: directory, components: { storage: language }, ...(language === 'go' ? { go: { binary: path.join(root, 'out/itcve-go-storage-portability'), storagePortabilityPatch: true } } : {}) })
let wallet: Awaited<ReturnType<typeof createFixtureWallet>> | undefined, report: any
beforeAll(async () => {
  await services.start()
  await services.fundRemoteWalletFromTeranode('77'.repeat(32), JSON.parse(fs.readFileSync(path.join(root, 'fixtures/teranode/wab-funding-v1.json'), 'utf8')))
  wallet = await createFixtureWallet(services, '77'.repeat(32))
  const trace: any[] = []
  const call = async (id: string, method: string, args: any) => {
    const row: any = { id, method, args: structuredClone(args) }; trace.push(row)
    try { row.result = await (wallet as any)[method](structuredClone(args)) } catch (error) { row.error = captureClauseError(error) }
    return row
  }
  const prepared = await prepareNoSendChangeFixture(call, fixtureRevision)
  expect(prepared.outpoints?.length).toBeGreaterThan(0)
  const base = { description: 'TPNIL parameter validation fixture', outputs: [{ satoshis: 1, lockingScript: '51', outputDescription: 'TPNIL validation output', basket: 'tpnil clause parameters', tags: ['clause'], customInstructions: 'fixture' }], labels: ['tpnil-clauses'], options: { signAndProcess: false, noSend: true, randomizeOutputs: false, noSendChange: prepared.outpoints } }
  const control = await call(`control.${noSendChangeInputId}`, 'createAction', base)
  expect(control.error).toBeUndefined()
  await call(`cleanup.control.${noSendChangeInputId}`, 'abortAction', { reference: control.result.signableTransaction.reference })
  const invalidOutpoints = [...prepared.outpoints!]; invalidOutpoints[0] = '!invalid!'
  const negative = await call(noSendChangeInputId, 'createAction', { ...base, options: { ...base.options, noSendChange: invalidOutpoints } })
  Object.assign(negative, { base, controlId: control.id, controlUsesFreshReference: false })
  const flushed = await call('cleanup.batch', 'createAction', { description: 'TPNIL release noSend fixture', options: { sendWith: [prepared.pendingBatch.result.txid], acceptDelayedBroadcast: false } })
  expect(flushed.error).toBeUndefined()
  report = JSON.parse(JSON.stringify({ claim: 'LAB_SELF_TEST_ONLY', oracle: selectedOracle, identity: (await wallet.getPublicKey({ identityKey: true })).publicKey, positives: [], trace }))
}, 60_000)
afterAll(async () => {
  await wallet?.destroy(); await services.close(); fs.rmSync(directory, { recursive: true, force: true })
  if (process.env.TPNIL_NOSEND_EVIDENCE && report) {
    const destination = path.resolve(process.env.TPNIL_NOSEND_EVIDENCE)
    fs.mkdirSync(destination, { recursive: true })
    const assertions = (await deriveClauseOutcomes(report)).filter(row => [noSendChangeInputId, noSendChangeOutputId].includes(row.id))
    fs.writeFileSync(path.join(destination, 'reference.json'), JSON.stringify({ ...report, schema: 'tpnil-nosend-change-reference@1', claim: 'ENGINEERING_OBSERVATION_ONLY', scope: 'Two prospective noSendChange predicates through actual reference public APIs; no native wallet claim', implementation: language, components: services.componentIdentity, assertions, cleanup: { walletDestroyed: true, servicesClosed: true, temporaryDatabaseRemoved: !fs.existsSync(directory) } }, null, 2) + '\n', { flag: 'wx' })
  }
})
const outcomes = async (value: any) => Object.fromEntries((await deriveClauseOutcomes(value)).filter(row => [noSendChangeInputId, noSendChangeOutputId].includes(row.id)).map(row => [row.id, row.result]))
const row = (value: any, id: string) => value.trace.find((entry: any) => entry.id === id)

describe('Prospective noSendChange oracle4, with actual reference public calls', () => {
  it('preserves oracle3 inventory and adds one explicit final-outpoint predicate', () => {
    expect(clauseAssertionIds).toHaveLength(232); expect(clauseOracle4AssertionIds).toHaveLength(233)
    expect(clauseOracle4AssertionIds.slice(0, 232)).toEqual(clauseAssertionIds)
    expect(clauseOracle4AssertionIds[232]).toBe(noSendChangeOutputId)
  })
  it('binds a successful public caller control to signed mined ancestry and public action outputs', async () => {
    const verified = await verifyNoSendChangeFixture(report)
    expect(verified.outpoints.length).toBeGreaterThan(0)
    expect(row(report, noSendChangeSetupId).args.outputs[0].satoshis).toBe(fixtureRevision === 2 ? 997 : 1)
    const actual = await deriveClauseOutcomes(report)
    expect(await outcomes(report), JSON.stringify(actual.filter(row => [noSendChangeInputId, noSendChangeOutputId].includes(row.id)))).toEqual({ [noSendChangeInputId]: 'PASS', [noSendChangeOutputId]: 'PASS' })
  })
  it('keeps a stale returned outpoint FAIL while the independently derived caller control remains meaningful', async () => {
    const value = structuredClone(report)
    row(value, noSendChangeSetupId).result.noSendChange = [`${'01'.repeat(32)}.1`]
    expect(await outcomes(value)).toEqual({ [noSendChangeInputId]: 'PASS', [noSendChangeOutputId]: 'FAIL' })
  })
  it('accepts a valid optional subset and leaves an absent optional return explicitly blocked', async () => {
    const subset = structuredClone(report), absent = structuredClone(report), duplicate = structuredClone(report)
    row(subset, noSendChangeSetupId).result.noSendChange = row(subset, noSendChangeSetupId).result.noSendChange.slice(0, 1)
    delete row(absent, noSendChangeSetupId).result.noSendChange
    row(duplicate, noSendChangeSetupId).result.noSendChange.push(row(duplicate, noSendChangeSetupId).result.noSendChange[0])
    expect((await outcomes(subset))[noSendChangeOutputId]).toBe('PASS')
    expect((await outcomes(absent))[noSendChangeOutputId]).toBe('BLOCKED')
    expect((await outcomes(duplicate))[noSendChangeOutputId]).toBe('FAIL')
  })
  it('rejects incorrect signed identity, proof, script, output ownership and public lookup binding', async () => {
    const mutations: Array<(value: any) => void> = [
      value => { value.oracle = fixtureRevision === 2 ? clauseOracle4Id : 'tpnil-brc100-clause-oracle@6.0.0' },
      value => { row(value, noSendChangeSetupId).result.txid = '01'.repeat(32) },
      value => { const entry = row(value, noSendChangeSetupId), beef = Beef.fromBinary(entry.result.tx); beef.bumps[0]!.blockHeight++; entry.result.tx = beef.toBinaryAtomic(entry.result.txid) },
      value => { const entry = row(value, noSendChangeSetupId), tx = Transaction.fromAtomicBEEF(entry.result.tx); tx.inputs[0]!.unlockingScript = UnlockingScript.fromHex('00'); entry.result.tx = tx.toAtomicBEEF(); entry.result.txid = tx.id('hex') },
      value => { row(value, noSendChangeSetupId).args.options.noSend = false },
      value => { row(value, noSendChangeSetupId).method = 'signAction' },
      value => { row(value, noSendChangeReadId).args.labels = ['other label'] },
      value => { row(value, noSendChangeReadId).result.actions[0].txid = '02'.repeat(32) },
      value => { row(value, noSendChangeReadId).result.actions[0].status = 'unproven' },
      value => { row(value, noSendChangeReadId).result.actions[0].outputs[1].basket = 'foreign basket' },
      value => { row(value, noSendChangeReadId).result.actions[0].outputs[1].satoshis++ },
      value => { row(value, noSendChangeReadId).result.actions[0].outputs[1].lockingScript = '51' },
      value => { row(value, noSendChangeReadId).result.actions[0].outputs[1].spendable = false },
      value => { row(value, noSendChangeReadId).result.actions.push(structuredClone(row(value, noSendChangeReadId).result.actions[0])) },
      value => { value.trace.push(structuredClone(row(value, noSendChangeReadId))) }
    ]
    for (const mutate of mutations) { const value = structuredClone(report); mutate(value); await expect(verifyNoSendChangeFixture(value)).rejects.toThrow() }
  })
  it('never converts a missing positive control, invalid acceptance, or unrelated engine error into a passing input predicate', async () => {
    const missing = structuredClone(report), invalidAccepted = structuredClone(report), exception = structuredClone(report), wrongBase = structuredClone(report)
    delete row(missing, `control.${noSendChangeInputId}`).result; row(missing, `control.${noSendChangeInputId}`).error = { message: 'Request timed out', name: 'Error' }
    row(invalidAccepted, noSendChangeInputId).result = { txid: '03'.repeat(32) }; delete row(invalidAccepted, noSendChangeInputId).error
    row(exception, noSendChangeInputId).error = { name: 'Error', message: "Cannot read properties of null (reading 'trim')" }
    row(wrongBase, noSendChangeInputId).base.options.noSendChange = [`${'04'.repeat(32)}.1`]
    expect((await outcomes(missing))[noSendChangeInputId]).toBe('BLOCKED')
    for (const value of [invalidAccepted, exception, wrongBase]) expect((await outcomes(value))[noSendChangeInputId]).toBe('FAIL')
  })
  it('retains oracle3 behavior and has no extra predicate without explicit opt-in', async () => {
    const value = structuredClone(report); value.oracle = 'tpnil-brc100-clause-oracle@3.0.0'
    const derived = await deriveClauseOutcomes(value)
    expect(derived).toHaveLength(232); expect(derived.some(entry => entry.id === noSendChangeOutputId)).toBe(false)
  })
})
