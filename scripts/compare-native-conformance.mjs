import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const outcomes = ['PASS', 'FAIL', 'BLOCKED', 'INCONCLUSIVE']
function index(record) {
  const result = new Map()
  assert.equal(record.vectors.length, 8)
  for (const [i, vector] of record.vectors.entries()) {
    assert.equal(vector.id, `ISI-4-V00${i + 1}`)
    for (const assertion of vector.assertions) {
      assert.equal(typeof assertion.id, 'string'); assert.ok(assertion.id.length)
      assert.ok(outcomes.includes(assertion.outcome))
      const key = `${vector.id}/${assertion.id}`
      assert.ok(!result.has(key), `Duplicate assertion: ${key}`)
      result.set(key, { vector: vector.id, id: assertion.id, outcome: assertion.outcome })
    }
  }
  return result
}
function counts(rows) { return Object.fromEntries(outcomes.map(outcome => [outcome, rows.filter(row => row.outcome === outcome).length])) }
function matchingRepetitions(records) {
  assert.equal(records.length, 2)
  const indexes = records.map(index)
  assert.deepEqual([...indexes[0]], [...indexes[1]], 'Repetitions disagree in assertion identities or outcomes')
  assert.notDeepEqual(records[0], records[1], 'The same record was supplied twice')
  return indexes[0]
}

/** Arithmetic over already-retained records only. This is deliberately not an
 * admission verifier: the caller must publish the separate native qualification
 * and frozen-source replay receipts. No absent observation becomes a pass. */
export function compareNativeConformance(baseline, candidate, bindings) {
  const before = matchingRepetitions(baseline), after = matchingRepetitions(candidate)
  assert.equal(baseline[0].itcve, 'ITCVE-1@2.0.0'); assert.equal(baseline[1].itcve, 'ITCVE-1@2.0.0')
  assert.ok(['ITCVE-1@4.0.0', 'ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.3.0', 'ITCVE-1@4.4.0'].includes(candidate[0].itcve)); assert.equal(candidate[1].itcve, candidate[0].itcve)
  for (const records of [baseline, candidate]) assert.deepEqual(records[0].artifacts.wallet, records[1].artifacts.wallet, 'Repetitions use different wallet artifacts')
  if (['ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.3.0', 'ITCVE-1@4.4.0'].includes(candidate[0].itcve)) {
    for (const record of candidate) { assert.equal(record.claim, 'ENGINEERING_OBSERVATION_ONLY'); assert.equal(record.walletCandidate?.officialRelease, false); assert.equal(record.artifacts.wallet.version, ['ITCVE-1@4.3.0', 'ITCVE-1@4.4.0'].includes(record.itcve) ? '5.1.1-pr368.4a954ac' : record.itcve === 'ITCVE-1@4.2.0' ? '5.1.1-pr368.cb3c2f2' : '5.1.1-pr368.7e39006') }
    assert.deepEqual(candidate[0].walletCandidate, candidate[1].walletCandidate)
  }
  if (['ITCVE-1@4.3.0', 'ITCVE-1@4.4.0'].includes(candidate[0].itcve)) {
    assert.equal(after.size, 535, 'Expanded comparison requires all535 retained native observations')
    assert.deepEqual(candidate[0].artifacts.wallet, { id: 'yours-wallet-chromium-extension', version: '5.1.1-pr368.4a954ac', sha256: 'cd12b686c5295061bd4b727b32e17c3686e210fcdfa6aa2193790590458d9105', size: 13244753 })
    assert.equal(candidate[0].walletCandidate.sourceCommit, '4a954ac6bb0cb4403fb8ed548efd0cd8d1ba11b1')
    assert.equal(candidate[0].walletCandidate.manifest, 'fixtures/artifacts/yours-wallet-pr368-4a954ac/provenance.json')
    assert.equal(candidate[0].walletCandidate.manifestSha256, 'ee425f6f95e00fc711b6d426634e536e199786592452ace41370c1b6cd1f63ac')
  }
  assert.equal(before.size, 280)
  assert.deepEqual(counts([...before.values()]), { PASS: 180, FAIL: 99, BLOCKED: 1, INCONCLUSIVE: 0 })
  const transitions = [...before].map(([key, row]) => {
    assert.ok(after.has(key), `Original obligation was silently removed or renamed: ${key}`)
    const current = after.get(key)
    const oracleCorrection = ['namespace.protocol.reserved', 'namespace.basket.reserved'].includes(row.id)
    return { ...row, before: row.outcome, after: current.outcome, outcome: current.outcome,
      attribution: oracleCorrection ? 'PROSPECTIVE_NAMESPACE_ORACLE_CORRECTION' : 'NEW_ARTIFACT_AND_COMPONENT_OBSERVATION_NO_SINGLE_CAUSE_INFERENCE' }
  })
  const failures = transitions.filter(row => row.before === 'FAIL')
  assert.equal(failures.length, 99)
  const added = [...after].filter(([key]) => !before.has(key)).map(([, value]) => value)
  const regressions = transitions.filter(row => row.before === 'PASS' && row.after !== 'PASS')
  const gate = transitions.find(row => row.id === 'coverage.remaining-obligations')
  assert.ok(gate)
  return {
    schema: 'tpnil-native-conformance-comparison@1.0.0', claim: 'DERIVED_RECORD_COMPARISON_ONLY',
    qualificationRequired: 'Separate native environment qualification and frozen-source semantic replay are required; this comparison cannot qualify evidence.',
    bindings, denominator: { originalAssertions: 280, originalFailures: 99, originalBlocked: 1, repetitions: 2 },
    baseline: { profile: baseline[0].itcve, wallet: baseline[0].artifacts.wallet, counts: counts([...before.values()]) },
    candidate: { profile: candidate[0].itcve, wallet: candidate[0].artifacts.wallet, recordClaim: candidate[0].claim, ...(candidate[0].walletCandidate ? { walletCandidate: candidate[0].walletCandidate } : {}), counts: counts([...after.values()]) },
    originalFailureOutcomes: counts(failures), failures, originalBlockedGate: gate,
    regressions, additionalCoverage: { assertions: added.length, counts: counts(added), rows: added },
    completeBRC100Conformance: false
  }
}

export function compareNativeRecordDirectories(baselineDirectory, candidateDirectory) {
  const bindings = {}
  const read = (directory, kind) => [1, 2].map(index => {
    const name = `repetition-${index}/record.json`, bytes = fs.readFileSync(path.join(directory, name))
    bindings[`${kind}/${name}`] = { bytes: bytes.length, sha256: hash(bytes) }
    return JSON.parse(bytes)
  })
  const baseline = read(baselineDirectory, 'baseline'), candidate = read(candidateDirectory, 'candidate')
  return compareNativeConformance(baseline, candidate, bindings)
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [baseline, candidate, output] = process.argv.slice(2)
  assert.ok(baseline && candidate && output && process.argv.length === 5, 'Usage: node scripts/compare-native-conformance.mjs BASELINE_RECORD_ROOT CANDIDATE_RECORD_ROOT OUTPUT')
  const report = compareNativeRecordDirectories(baseline, candidate)
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify({ written: output, originalFailures: report.denominator.originalFailures, outcomes: report.originalFailureOutcomes, additionalAssertions: report.additionalCoverage.assertions, regressions: report.regressions.length, claim: report.claim }))
}
