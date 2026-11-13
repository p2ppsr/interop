// SPDX-License-Identifier: Apache-2.0
// LAB_SELF_TEST_ONLY: retrospective controls over exact failed native16 bytes.
// These tests do not repair missing PNGs or issue native qualification.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'
import { decodeCoverageObservation, coverageObservationEncoding } from '../src/wallet-lab/native/coverage-observation.js'
import { bindLaterNativeOwnedSpend, deriveTransactionCoverageOutcomes } from '../src/wallet-lab/native/coverage-transactions-verifier.js'
import { transactionBranchAssertions, evaluateTransactionBranches } from '../src/wallet-lab/native/coverage-completion/transaction-branches-parent.js'
import { verifyPriorFixtureReplay } from '../src/wallet-lab/native/prior-fixture-replay.js'
import { tracker } from '../src/wallet-lab/native/coverage-completion/baskets-verifier.js'
const archive = path.resolve(import.meta.dirname, '../../journals/integrated-native-attempts/2026-11-13/43372408766')
const originals = JSON.parse(execFileSync('python3', ['-c', `import io,json,sys,zipfile,hashlib,pathlib
p=pathlib.Path(sys.argv[1]);m=json.loads((p/'attempt.json').read_bytes());b=b''.join((p/n).read_bytes()for n in m['originalArchive']['parts']);assert 'sha256:'+hashlib.sha256(b).hexdigest()==m['originalArchive']['digest'];z=zipfile.ZipFile(io.BytesIO(b));print(json.dumps([[json.loads(z.read(f'repetition-{n}/evidence/conformance/{name}.json'))for name in ['coverage-transactions','transaction-branches']]for n in [1,2]]))`, archive], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }))
const transaction = (n = 1): any => structuredClone(originals[n][0])
const branches = (n = 1): any => decodeCoverageObservation(structuredClone(originals[n][1]), coverageObservationEncoding)
const call = (r: any, id: string) => r.trace.find((c: any) => c.id === id)!
const receipt = (r: any) => r.submissions[call(r, 'foreign-sign').submissionStart - r.submissionStart]
const outcome = async (r: any) => (await deriveTransactionCoverageOutcomes(r)).find(row => row.id.endsWith('/foreign-reference-reject'))!
it.each([0, 1])('replays unchanged native16 repetition %i transaction branches without a native claim', async n => {
  const tx = transaction(n), r = branches(n)
  expect(tx.assertions.find((a: any) => a.id.endsWith('/foreign-reference-reject')).result).toBe(n ? 'FAIL' : 'PASS')
  expect((await outcome(tx)).result).toBe('PASS')
  const checked = await evaluateTransactionBranches(r)
  expect(checked.outcomes.filter((a: any) => a.localChecks === 'SATISFIED')).toHaveLength(7)
  expect(checked.outcomes.filter((a: any) => a.result === 'FAIL')).toHaveLength(0)
  expect(checked.acceptedNativeAssertions).toBe(0)
}, 60_000)
it.each(['rejected', 'extra-ancestry', 'held-source', 'non-delayed', 'unknown-source', 'different-body', 'later-source', 'foreign-target', 'returned-success', 'unrelated-error'])('rejects foreign control substitution: %s', async kind => {
  const r = transaction(), c = call(r, 'foreign-sign'), prior = call(r, 'default-sign-omitted'), stage = call(r, 'default-stage-omitted'), s = receipt(r)
  if (kind === 'rejected') s.verdict = 'REJECTED'
  if (kind === 'extra-ancestry') s.beefHex = Buffer.from(prior.result.tx).toString('hex')
  if (kind === 'held-source') stage.args.options.noSend = true
  if (kind === 'non-delayed') stage.args.options.acceptDelayedBroadcast = false
  if (kind === 'unknown-source') s.txid = 'ab'.repeat(32)
  if (kind === 'different-body') s.beefHex += '00'
  if (kind === 'later-source') { const i = r.trace.indexOf(prior); r.trace.splice(i, 1); r.trace.splice(r.trace.indexOf(c) + 1, 0, prior) }
  if (kind === 'foreign-target') { const target = call(r, 'foreign-owner-sign'); s.txid = target.result.txid; s.beefHex = Buffer.from(target.result.tx).toString('hex') }
  if (kind === 'returned-success') { c.result = { accepted: true }; delete c.error }
  if (kind === 'unrelated-error') c.error.message = 'Network timeout'
  let rejected = false
  try { rejected = (await outcome(r)).result !== 'PASS' } catch { rejected = true }
  expect(rejected).toBe(true)
}, 60_000)
it.each([0, 1])('verifies exact previously accepted truncation fixture replay %i', async n => {
  const r = branches(n), creation = call(r, 'truncation-source'), good = call(r, 'internalize-full-control'), bad = call(r, 'internalize-truncated')
  expect(bad.submissionEnd).toBe(bad.submissionStart)
  expect((await verifyPriorFixtureReplay(good, creation, r.submissions, tracker)).replayReceipts).toBe(1)
})

function laterFixture() {
  const report = transaction(0), later = branches(0)
  const parent = { verified: true as const, assertions: [
    { id: 'completion.transaction.nosend-change/valid-full', result: 'PASS' },
    { id: 'completion.transaction.batch-send/returnTXIDOnly', result: 'PASS' }
  ] }, funding = { verified: true as const }
  return { report, later, parent, funding, ledger: later.submissions }
}
it('joins only the exact later owned full-set spend and its declared held release', async () => {
  const f = laterFixture(), checked = await evaluateTransactionBranches(f.later)
  f.parent.assertions = transactionBranchAssertions(checked)
  const receipt = bindLaterNativeOwnedSpend(f.report, f.later, f.parent, f.funding, f.ledger)
  expect(receipt.outpoints).toHaveLength(2); expect(receipt.positions).toEqual([132])
  expect(receipt.txid).toBe(call(f.later, 'full-child-sign').result.txid)
})
it.each(['identity', 'profile', 'parent', 'funding', 'failed-row', 'foreign-signer', 'stage-reference', 'held-option', 'release-list', 'early-release', 'rejected-receipt', 'altered-body', 'extra-envelope'])('rejects later owner binding substitution: %s', kind => {
  const f = laterFixture(), held = call(f.later, 'full-child-sign'), release = call(f.later, 'batch-return-sign')
  if (kind === 'identity') f.later.identity = 'foreign'
  if (kind === 'profile') f.report.oracle = 'tpnil-native-coverage-transactions-oracle@3.0.0'
  if (kind === 'parent') (f.parent as any).verified = false
  if (kind === 'funding') (f.funding as any).verified = false
  if (kind === 'failed-row') f.parent.assertions[0]!.result = 'FAIL'
  if (kind === 'foreign-signer') held.actor = 'funder'
  if (kind === 'stage-reference') held.args.reference = 'different'
  if (kind === 'held-option') held.args.options.noSend = false
  if (kind === 'release-list') release.args.options.sendWith = []
  if (kind === 'early-release') release.submissionStart = 133
  if (kind === 'rejected-receipt') f.ledger[132].verdict = 'REJECTED'
  if (kind === 'altered-body') f.ledger[132].beefHex += '00'
  if (kind === 'extra-envelope') f.ledger[132].beefHex = Buffer.from(held.result.tx).toString('hex')
  expect(() => bindLaterNativeOwnedSpend(f.report, f.later, f.parent, f.funding, f.ledger)).toThrow()
})
