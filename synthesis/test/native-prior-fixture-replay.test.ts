// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { Transaction } from '@bsv/sdk'
import { expect, it } from 'vitest'
import { verifyPriorFixtureReplay } from '../src/wallet-lab/native/prior-fixture-replay.js'
import { tracker, verifyBasketObservations } from '../src/wallet-lab/native/coverage-completion/baskets-verifier.js'
import { selectedBasketPolicy } from '../src/wallet-lab/native/coverage-completion/baskets-model.js'
import { ControlledWalletServices } from '../src/wallet-lab/services.js'
import { createFixtureWallet } from '../src/storage-sync/fixture-wallet.js'

const original = JSON.parse(gunzipSync(fs.readFileSync(new URL('./fixtures/native-basket-boundaries/report.json.gz', import.meta.url))).toString())
function sample() {
  // LAB_SELF_TEST_ONLY adversarial adaptation of retained exact mined fixture.
  const report = structuredClone(original); report.schema = 'tpnil-native-basket-boundaries@1.0.0'; report.claim = 'ENGINEERING_OBSERVATION_ONLY'; report.mode = 'LAB_SELF_TEST_ONLY'; const creation = report.trace.find((r: any) => r.id === 'fixture-external'), call = report.trace.find((r: any) => r.id === 'control.internalizeAction')
  const receipt = { txid: creation.result.txid, beefHex: Transaction.fromAtomicBEEF(creation.result.tx).toHex(), verdict: 'ACCEPTED_BY_NETWORK' }
  const offset = call.submissionStart - report.submissionStart
  report.submissions.splice(offset, 0, receipt); report.submissionEnd++
  let later = false
  for (const row of report.trace) { if (row === call) { row.submissionEnd++; later = true } else if (later) { row.submissionStart++; row.submissionEnd++ } }
  report.policySha256 = selectedBasketPolicy(2).sha256
  return { report, creation, call, ledger: [...report.submissionPrefix, ...report.submissions], receipt }
}
it('admits only the exact prior fixture and preserves the legacy zero-receipt verdict', async () => {
  const f = sample()
  expect((await verifyPriorFixtureReplay(f.call, f.creation, f.ledger, tracker)).replayReceipts).toBe(1)
  expect((await verifyBasketObservations(f.report, 2)).fixtureValid).toBe(true)
  const legacy = structuredClone(f.report); legacy.policySha256 = selectedBasketPolicy(1).sha256
  expect((await verifyBasketObservations(legacy)).fixtureValid).toBe(false)
})
const mutations: Record<string, (f: ReturnType<typeof sample>) => void> = {
  'changed target': f => { f.ledger[f.call.submissionStart]!.txid = '00'.repeat(32) },
  'new transaction': f => { f.ledger[f.call.submissionStart]!.beefHex = f.ledger[f.creation.submissionStart - 1]!.beefHex },
  'extra serialized suffix': f => { f.ledger[f.call.submissionStart]!.beefHex += '00' },
  'extra ancestry envelope': f => { f.ledger[f.call.submissionStart]!.beefHex = Buffer.from(f.creation.result.tx).toString('hex') },
  'rejected receipt': f => { f.ledger[f.call.submissionStart]!.verdict = 'REJECTED' },
  'missing prior acceptance': f => { f.ledger[f.creation.submissionStart]!.verdict = 'REJECTED' },
  'prior wrong window': f => { f.creation.submissionEnd = f.creation.submissionStart },
  'replay before creation': f => { f.call.submissionStart = 0; f.call.submissionEnd = 1 },
  'unbounded repeated receipt': f => { f.ledger.splice(f.call.submissionEnd, 0, structuredClone(f.receipt)); f.call.submissionEnd++ },
  'rejected import': f => { f.call.error = { message: 'invalid basket' }; delete f.call.result },
  'different public proof': f => { f.call.args.tx = [...f.call.args.tx, 0] },
  'sparse public proof': f => { delete f.creation.result.tx[10]; f.call.args.tx = f.creation.result.tx },
  'invalid mined proof': f => { const bytes = f.creation.result.tx; bytes[40] ^= 1; f.call.args.tx = bytes },
  'read-only call': f => { f.call.method = 'listOutputs' }
}
for (const [name, mutate] of Object.entries(mutations)) it(`rejects ${name}`, async () => { const f = sample(); mutate(f); await expect(verifyPriorFixtureReplay(f.call, f.creation, f.ledger, tracker)).rejects.toThrow() })

const go = path.resolve(import.meta.dirname, '../../out/itcve-go-storage-caller-known-inputs')
it.skipIf(process.env.TPNIL_TEST_PRIOR_FIXTURE_GO !== '1')('observes actual exact Go rebroadcast across two independently owned providers', async () => {
  expect(fs.existsSync(go)).toBe(true)
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'tpnil-prior-fixture-'))
  const source = new ControlledWalletServices({ webroot: dir, submissionOrdering: 'tpnil-owned-submission-order@1', components: { storage: 'go' }, go: { binary: go, storageCallerKnownInputsPatch: true, terminalRejectionReceipts: true } })
  const replacement = source.createStorageCounterpart(dir, '12'.repeat(32))
  let funder: any, wallet: any, adopted = false
  const ledger = () => source.submissions.map(row => ({ txid: row.txid, beefHex: Buffer.from(row.bytes).toString('hex'), verdict: row.verdict }))
  const retained = path.resolve(import.meta.dirname, '../../out/source7-prior-fixture-go'); fs.mkdirSync(retained, { recursive: true })
  try {
    await source.start(); await replacement.start(); source.registerStorageCounterpart('replacement-wallet.itcve.test', replacement.storageUrl, replacement); adopted = true
    await source.fundRemoteWalletFromTeranode('77'.repeat(32), JSON.parse(fs.readFileSync(new URL('../../fixtures/teranode/wab-funding-v1.json', import.meta.url), 'utf8')))
    for (const header of source.headers.values()) replacement.registerHeader(header)
    funder = await createFixtureWallet(source, '77'.repeat(32)); wallet = await createFixtureWallet(replacement, '78'.repeat(32))
    const creation: any = { method: 'createAction', args: { description: 'Exact prior fixture replay control', outputs: [{ satoshis: 2, lockingScript: '51', outputDescription: 'Exact imported output' }], options: { acceptDelayedBroadcast: false, randomizeOutputs: false } }, submissionStart: ledger().length }
    creation.result = await funder.createAction(creation.args); creation.submissionEnd = ledger().length
    const call: any = { method: 'internalizeAction', args: { tx: creation.result.tx, description: 'Import prior fixture on independent storage', outputs: [{ outputIndex: 0, protocol: 'basket insertion', insertionRemittance: { basket: 'tpnil replay control' } }] }, submissionStart: ledger().length }
    call.result = await wallet.internalizeAction(call.args); call.submissionEnd = ledger().length
    const result = await verifyPriorFixtureReplay(call, creation, ledger(), tracker)
    fs.writeFileSync(path.join(retained, 'observation.json'), JSON.stringify({ claim: 'LAB_SELF_TEST_ONLY', nativeQualification: false, creation, call, ledger: ledger(), result }, null, 2) + '\n')
    expect(result.replayReceipts).toBe(1)
  } finally { await wallet?.destroy(); await funder?.destroy(); if (!adopted) await replacement.close(); await source.close(); fs.rmSync(dir, { recursive: true, force: true }) }
}, 120_000)
