import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { LockingScript, Transaction } from '@bsv/sdk'
import { expect, it } from 'vitest'
import { ControlledWalletServices } from '../src/wallet-lab/services.js'
import { closeWithSubmissionReceipt, shutdownOrderedPolicy } from '../src/wallet-lab/native/shutdown-submissions.js'
import { verifyOrderedSubmissionLedger } from '../src/wallet-lab/native/verify-shutdown-submissions.js'

const goBinary = path.resolve(import.meta.dirname, '../../out/itcve-go-storage-caller-known-inputs')
function row(index: number) {
  // LAB_SELF_TEST_ONLY: distinct, nonspendable metadata fixtures, not funding.
  const tx = new Transaction(1, [], [{ lockingScript: LockingScript.fromHex('51'), satoshis: index + 1 }], 0)
  return { txid: tx.id('hex'), bytes: tx.toUint8Array(), verdict: 'ACCEPTED_BY_NETWORK' as const }
}

for (const implementation of ['typescript', 'go'] as const) it.skipIf(implementation === 'go' && !fs.existsSync(goBinary))(`keeps interleaved ${implementation} owner events append-only through real service retirement`, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-submission-order-'))
  fs.writeFileSync(path.join(directory, 'index.html'), '<title>LAB_SELF_TEST_ONLY journal</title>')
  const source = new ControlledWalletServices({ webroot: directory, submissionOrdering: 'tpnil-owned-submission-order@1', components: { storage: implementation }, ...(implementation === 'go' ? { go: { binary: goBinary, storageCallerKnownInputsPatch: true, terminalRejectionReceipts: true } } : {}) })
  const child = source.createStorageCounterpart(directory, '12'.repeat(32))
  let adopted = false, closed = false
  try {
    await source.start(); await child.start()
    source.recordSubmission(row(0)); child.recordSubmission(row(1))
    source.registerStorageCounterpart('replacement-wallet.itcve.test', child.storageUrl, child); adopted = true
    const prefix = source.submissions.map(value => value.txid)
    source.recordSubmission(row(2)); child.recordSubmission(row(3)); source.recordSubmission(row(4)); child.recordSubmission(row(5))
    expect(prefix).toEqual([row(0).txid, row(1).txid])
    expect(source.submissions.map(value => value.txid)).toEqual([0, 1, 2, 3, 4, 5].map(value => row(value).txid))
    const observer = source.observeSubmissionClosure(), global = observer.initialSubmissions
    expect(observer.initialProviders[0]!.submissions.map(value => value.txid)).toEqual([0, 2, 4].map(value => row(value).txid))
    expect(global.map(value => value.txid)).toEqual([0, 1, 2, 3, 4, 5].map(value => row(value).txid))
    child.recordSubmission(row(6)); source.recordSubmission(row(7))
    fs.mkdirSync(path.join(directory, 'evidence/conformance'), { recursive: true })
    for (const name of ['record.json', 'evidence/conformance/permission-lifecycle.json', 'evidence/conformance/permission-coverage.json', 'evidence/conformance/service-counterparts.json']) fs.writeFileSync(path.join(directory, name), '{}')
    fs.writeFileSync(path.join(directory, 'evidence/native-submissions.json'), JSON.stringify(global))
    const result = await closeWithSubmissionReceipt({ directory, observer, initialCapturedAt: new Date().toISOString(), profile: 'ITCVE-1@4.6.0', closeBrowser: async () => {}, closeServices: async () => { await source.close(); closed = true }, removeProfile: () => {} })
    expect(result.errors).toEqual([]); expect(result.report.policy).toBe(shutdownOrderedPolicy)
    expect(source.submissions.map(value => value.txid)).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map(value => row(value).txid))
    expect(result.report.submissions.map(value => value.txid)).toEqual(source.submissions.map(value => value.txid))
    expect(verifyOrderedSubmissionLedger(result.report, global).final).toEqual(result.report.submissions)
    for (const mutate of [
      (r: any) => { r.provenance[6].providerIndex++ },
      (r: any) => { r.provenance[6].provider = 'source/unknown.itcve.test' },
      (r: any) => { r.submissions.splice(6, 1); r.provenance.splice(6, 1) },
      (r: any) => { r.submissions[0] = r.submissions[1] },
      (r: any) => { r.initialProvenance[0].providerIndex++ },
      (r: any) => { r.providers[1].submissions[0].txid = '00'.repeat(32) },
      (r: any) => { r.provenance[7] = r.provenance[6] }
    ]) {
      const changed = structuredClone(result.report); mutate(changed)
      expect(() => verifyOrderedSubmissionLedger(changed, global)).toThrow()
    }
  } finally {
    if (!closed) await source.close(); if (!adopted) await child.close(); fs.rmSync(directory, { recursive: true, force: true })
  }
}, 30_000)

it('retains a failed ordered shutdown receipt when the producer journal is missing', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-missing-submission-order-'))
  try {
    fs.mkdirSync(path.join(directory, 'evidence/conformance'), { recursive: true })
    for (const name of ['record.json', 'evidence/native-submissions.json', 'evidence/conformance/permission-lifecycle.json', 'evidence/conformance/permission-coverage.json', 'evidence/conformance/service-counterparts.json']) fs.writeFileSync(path.join(directory, name), '{}')
    const observer = { initialProviders: [{ id: 'source', submissions: [] }], initialSubmissions: [], readFinalProviders: () => [{ id: 'source', submissions: [] }] }
    const result = await closeWithSubmissionReceipt({ directory, observer, initialCapturedAt: new Date().toISOString(), profile: 'ITCVE-1@4.6.0', closeBrowser: async () => {}, closeServices: async () => {}, removeProfile: () => {} })
    expect(result.report.errors).toContain('Error: Ordered shutdown requires the declared producer journal')
    expect(fs.existsSync(path.join(directory, 'shutdown-submissions.json'))).toBe(true)
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})
