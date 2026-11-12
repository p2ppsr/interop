import fs from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { expect, it } from 'vitest'
import { selectedCoverageExtensionPolicy, coverageExtensionOracle3, type CoverageExtensionReport } from '../src/wallet-lab/native/coverage-extension-model.js'
import { deriveCoverageExtensionOutcomes } from '../src/wallet-lab/native/coverage-extension-verifier.js'
// LAB_SELF_TEST_ONLY prospective copies; retained oracle2 evidence is unchanged.
const original = JSON.parse(gunzipSync(fs.readFileSync(path.resolve(import.meta.dirname,
  '../../programs/ISI-4/profiles/native-coverage-extension-2.0.0/reference/report.json.gz'))).toString()) as CoverageExtensionReport
const policy = selectedCoverageExtensionPolicy(coverageExtensionOracle3)
const sample = () => {
  const r = { ...structuredClone(original), oracle: coverageExtensionOracle3, policySha256: policy.sha256 }
  const row = r.trace.find(call => call.id === 'crypto.identity-false')!
  delete row.result; row.error = { name: 'WERR_INVALID_PARAMETER', message: 'The identityKey parameter must be true or undefined', parameter: 'identityKey' }
  return r
}
const verdict = async (r: CoverageExtensionReport) => (await deriveCoverageExtensionOutcomes(r)).find(row => row.id === 'coverage-extension.crypto.identityKey-override')!.result
it('keeps literal-false rejection and independent ordinary child-key control in oracle3', async () => {
  expect(policy.revision).toBe(3); expect(await verdict(sample())).toBe('PASS'); expect(await verdict(original)).toBe('PASS'); const legacy = sample(); legacy.oracle = original.oracle; legacy.policySha256 = original.policySha256; expect(await verdict(legacy)).toBe('FAIL')
})
it.each(['false-accepted', 'true-is-child', 'ordinary-control-corrupt', 'wrong-error-parameter'])('rejects %s after the oracle correction', async mutation => {
  const r = sample(), row = (id: string) => r.trace.find(call => call.id === id)!
  if (mutation === 'false-accepted') { row('crypto.identity-false').error = undefined; row('crypto.identity-false').result = structuredClone(row('ordinary.getPublicKey').result) }
  if (mutation === 'true-is-child') row('crypto.identity-true').result = structuredClone(row('ordinary.getPublicKey').result)
  if (mutation === 'ordinary-control-corrupt') row('ordinary.getPublicKey').result.publicKey = r.identity
  if (mutation === 'wrong-error-parameter') row('crypto.identity-false').error = { name: 'WERR_INVALID_PARAMETER', message: 'The basket parameter is invalid', parameter: 'basket' }
  expect(await verdict(r)).toBe('FAIL')
})
