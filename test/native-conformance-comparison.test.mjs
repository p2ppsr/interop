import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import { compareNativeConformance } from '../scripts/compare-native-conformance.mjs'

const root = path.resolve(import.meta.dirname, '..')
const archive = path.join(root, 'journals/native-integrated-reevaluation/2026-11-11/43059172140/native-reevaluation.zip')
const baseline = [1, 2].map(i => JSON.parse(execFileSync('unzip', ['-p', archive, `original/repetition-${i}/record.json`], { maxBuffer: 8 * 1024 * 1024 })))
function fixture() {
  return baseline.map(record => {
    const copy = structuredClone(record); copy.itcve = 'ITCVE-1@4.0.0'; copy.artifacts.wallet.version = 'synthetic-comparison-fixture'
    for (const vector of copy.vectors) for (const row of vector.assertions) if (row.id === 'namespace.basket.reserved') row.outcome = 'PASS'
    copy.vectors[7].assertions.push({ id: 'conditional/fixture.population', outcome: 'PASS' })
    return copy
  })
}

test('accounts for all99 failures while separating oracle corrections and newly added coverage', () => {
  const report = compareNativeConformance(baseline, fixture(), {})
  assert.deepEqual(report.originalFailureOutcomes, { PASS: 1, FAIL: 98, BLOCKED: 0, INCONCLUSIVE: 0 })
  assert.equal(report.failures.length, 99); assert.equal(report.additionalCoverage.assertions, 1)
  assert.equal(report.originalBlockedGate.after, 'BLOCKED'); assert.equal(report.completeBRC100Conformance, false)
  assert.equal(report.failures.find(row => row.id === 'namespace.basket.reserved').attribution, 'PROSPECTIVE_NAMESPACE_ORACLE_CORRECTION')
  assert.equal(report.claim, 'DERIVED_RECORD_COMPARISON_ONLY')
})

test('rejects missing, duplicated, renamed or mismatched repetition obligations', () => {
  for (const mutate of [
    records => records.forEach(r => r.vectors[7].assertions.pop()),
    records => records.forEach(r => r.vectors[7].assertions.shift()),
    records => records.forEach(r => { r.vectors[7].assertions[0].id += '-renamed' }),
    records => records.forEach(r => r.vectors[7].assertions.push(r.vectors[7].assertions[0])),
    records => { records[1].vectors[0].assertions[0].outcome = 'FAIL' }
  ]) {
    const candidate = fixture(); mutate(candidate)
    // Removing added coverage is permitted; removing a baseline obligation is not.
    if (candidate[0].vectors[7].assertions.length === baseline[0].vectors[7].assertions.length && candidate[0].vectors[7].assertions[0].id === baseline[0].vectors[7].assertions[0].id) {
      assert.equal(compareNativeConformance(baseline, candidate, {}).additionalCoverage.assertions, 0)
    } else assert.throws(() => compareNativeConformance(baseline, candidate, {}))
  }
})

test('reports regressions without hiding them behind improved failure totals', () => {
  const candidate = fixture()
  candidate.forEach(r => { r.vectors[0].assertions[0].outcome = 'FAIL' })
  const report = compareNativeConformance(baseline, candidate, {})
  assert.equal(report.regressions.length, 1); assert.equal(report.originalFailureOutcomes.PASS, 1)
})

test('keeps candidate engineering identity and rejects mixed artifacts or release claims', () => {
  const records = fixture().map(record => ({ ...record, itcve: 'ITCVE-1@4.1.0', claim: 'ENGINEERING_OBSERVATION_ONLY', walletCandidate: { officialRelease: false }, artifacts: { ...record.artifacts, wallet: { ...record.artifacts.wallet, version: '5.1.1-pr368.7e39006' } } }))
  const report = compareNativeConformance(baseline, records, {})
  assert.equal(report.candidate.recordClaim, 'ENGINEERING_OBSERVATION_ONLY'); assert.equal(report.candidate.walletCandidate.officialRelease, false)
  for (const mutate of [
    rows => { rows[1].artifacts.wallet.sha256 = '00'.repeat(32) },
    rows => { rows[1].itcve = 'ITCVE-1@4.0.0' },
    rows => { rows[0].claim = 'EXPERIMENTAL_CONFORMANCE_RESULT' },
    rows => { rows[0].walletCandidate.officialRelease = true }
  ]) { const changed = structuredClone(records); mutate(changed); assert.throws(() => compareNativeConformance(baseline, changed, {})) }
})
