// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { Transaction } from '@bsv/sdk'
import { expect, it } from 'vitest'
import { selectedCoverageExtensionPolicy, coverageExtensionOracle4, type CoverageExtensionReport } from '../src/wallet-lab/native/coverage-extension-model.js'
import { deriveCoverageExtensionOutcomes } from '../src/wallet-lab/native/coverage-extension-verifier.js'
const original = JSON.parse(gunzipSync(fs.readFileSync(path.resolve(import.meta.dirname, '../../programs/ISI-4/profiles/native-coverage-extension-2.0.0/reference/report.json.gz'))).toString()) as CoverageExtensionReport
function sample() {
  // LAB_SELF_TEST_ONLY mutation: insert one exact already accepted receipt.
  const report = structuredClone(original); report.oracle = coverageExtensionOracle4; report.policySha256 = selectedCoverageExtensionPolicy(coverageExtensionOracle4).sha256
  const creation = report.trace.find(r => r.id === 'fixture-external')!, call = report.trace.find(r => r.id === 'basket.bytes-5.internalizeAction')!
  const receipt = { txid: creation.result.txid, beefHex: Transaction.fromAtomicBEEF(creation.result.tx).toHex(), verdict: 'ACCEPTED_BY_NETWORK' }
  report.submissions.splice(call.submissionStart - report.submissionStart, 0, receipt); report.submissionEnd++
  let later = false
  for (const row of report.trace) { if (row === call) { row.submissionEnd++; later = true } else if (later) { row.submissionStart++; row.submissionEnd++ } }
  return report
}
const verdict = async (report: CoverageExtensionReport, id = 'basket.bytes-5.internalizeAction') => (await deriveCoverageExtensionOutcomes(report)).find(r => r.id === `coverage-extension.${id}`)!.result
it('admits exact positive-import replay while preserving the retained normalized-membership failure', async () => {
  const report = sample(); expect(await verdict(report)).toBe('PASS'); expect(await verdict(report, 'basket.uppercase.internalizeAction')).toBe('FAIL')
})
it('rejects the same receipt when attributed to a rejected namespace call', async () => {
  const report = sample(), denied = report.trace.find(r => r.id === 'basket.bytes-0.internalizeAction')!
  // Leave its actual rejection and independently observed snapshots intact.
  denied.submissionEnd++
  await expect(deriveCoverageExtensionOutcomes(report)).rejects.toThrow()
})
it('does not use a captured oracle4 flag to admit replay under oracle3', async () => {
  const report = sample(), policy = selectedCoverageExtensionPolicy('tpnil-native-coverage-extension-oracle@3.0.0')
  report.oracle = policy.policy.oracle; report.policySha256 = policy.sha256
  expect(await verdict(report)).toBe('FAIL')
})
it('rejects an exact receipt duplicated beyond the bounded positive window', async () => {
  const report = sample(), call = report.trace.find(r => r.id === 'basket.bytes-5.internalizeAction')!
  report.submissions.splice(call.submissionEnd - report.submissionStart, 0, structuredClone(report.submissions[call.submissionStart - report.submissionStart]!)); report.submissionEnd++
  let later = false
  for (const row of report.trace) { if (row === call) { row.submissionEnd++; later = true } else if (later) { row.submissionStart++; row.submissionEnd++ } }
  expect(await verdict(report)).toBe('FAIL')
})
