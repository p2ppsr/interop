import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { canonicalJson, sha256Hex } from '../../determinism.js'
import { aggregateOutcome, type VectorResult } from '../model.js'
import { verifyNativePermissionConformance } from './verify-conformance-permissions.js'
import { verifyConformanceLifecycle } from './verify-conformance-lifecycle.js'
import { verifyNativePortability } from './verify-conformance-portability.js'
import { verifyNativeClauseConformance } from './verify-conformance-clauses.js'
import { validateComponentIdentity } from '../go-services.js'

export async function verifyNativeConformance(evidenceDirectory: string, baselineVectors: VectorResult[], lifecycleOracle?: string, portabilityOracle?: string, clauseOracle = 'tpnil-brc100-clause-oracle@3.0.0', profile: 'ITCVE-1@1.4.0' | 'ITCVE-1@1.5.0' | 'ITCVE-1@2.0.0' | 'ITCVE-1@4.0.0' = 'ITCVE-1@1.4.0') {
  const read = (name: string) => JSON.parse(fs.readFileSync(path.join(evidenceDirectory, 'conformance', `${name}.json`), 'utf8'))
  const report = read('result')
  const release511 = profile === 'ITCVE-1@4.0.0'
  const closure = release511 || profile === 'ITCVE-1@2.0.0'
  const coverage = closure || profile === 'ITCVE-1@1.5.0'
  assert.equal(report.schema, release511 ? 'tpnil-native-conformance@5.0.0' : closure ? 'tpnil-native-conformance@4.0.0' : coverage ? 'tpnil-native-conformance@3.0.0' : 'tpnil-native-conformance@2.0.0'); assert.equal(report.profile, profile); assert.equal(report.program, release511 ? 'ISI-4@5.0.0' : closure ? 'ISI-4@4.0.0' : coverage ? 'ISI-4@3.0.0' : 'ISI-4@2.0.0')
  assert.equal(clauseOracle, release511 ? 'tpnil-brc100-clause-oracle@5.0.0' : coverage ? 'tpnil-brc100-clause-oracle@4.0.0' : 'tpnil-brc100-clause-oracle@3.0.0')
  assert.equal(read('clauses').oracle, clauseOracle, 'Clause report selected a different oracle from the frozen plan')
  assert.deepEqual(read('baseline-vectors'), baselineVectors, 'Original ToDo observations were altered by the prospective scenario')
  const integrated = JSON.parse(fs.readFileSync(path.join(evidenceDirectory, 'integrated/result.json'), 'utf8'))
  assert.equal(typeof integrated.walletIdentity, 'string', 'Native conformance requires the joined wallet identity')
  assert.equal(read('permissions').schema, closure ? 'tpnil-native-permission-conformance@2' : 'tpnil-native-permission-conformance@1')
  assert.equal(read('permissions').oracle, closure ? 'tpnil-native-permission-oracle@2.0.0' : undefined)
  if (coverage) {
    assert.equal(read('permission-lifecycle').schema, closure ? 'tpnil-native-permission-lifecycle@2.0.0' : 'tpnil-native-permission-lifecycle@1.0.0')
    assert.equal(read('permission-lifecycle').oracle, closure ? 'tpnil-native-permission-lifecycle-oracle@2.0.0' : 'tpnil-native-permission-lifecycle-oracle@1.0.0')
  }
  const permission = verifyNativePermissionConformance(read('permissions'), name => fs.readFileSync(path.join(evidenceDirectory, name)), integrated.walletIdentity)
  const permissionLifecycle = coverage ? await (await import('./verify-conformance-permission-lifecycle.js')).verifyNativePermissionLifecycle(read('permission-lifecycle'), name => fs.readFileSync(path.join(evidenceDirectory, name)), integrated.walletIdentity) : undefined
  const lifecycle = await verifyConformanceLifecycle(read('lifecycle'))
  if (lifecycleOracle !== undefined) {
    assert.equal(lifecycleOracle, 'tpnil-native-lifecycle-oracle@3.0.0')
    assert.equal(read('lifecycle').schema, 'tpnil-native-conformance-lifecycle@3')
    assert.equal(read('lifecycle').oracle, lifecycleOracle)
  } else assert.equal(read('lifecycle').schema, 'tpnil-native-conformance-lifecycle@2')
  assert.deepEqual(read('lifecycle').serviceIdentity, JSON.parse(fs.readFileSync(path.join(evidenceDirectory, 'service-components.json'), 'utf8')))
  const portabilityReport = read('portability')
  if (coverage) assert.equal(portabilityOracle, 'tpnil-native-portability-oracle@3.0.0', 'Coverage profile requires the signed-completion oracle')
  if (portabilityOracle !== undefined) {
    assert.equal(portabilityOracle, coverage ? 'tpnil-native-portability-oracle@3.0.0' : 'tpnil-native-portability-oracle@2.0.0')
    assert.equal(portabilityReport.schema, coverage ? 'tpnil-native-storage-portability@3' : 'tpnil-native-storage-portability@2')
    assert.equal(portabilityReport.oracle, portabilityOracle)
    const primary = JSON.parse(fs.readFileSync(path.join(evidenceDirectory, 'service-components.json'), 'utf8'))
    assert.deepEqual(portabilityReport.components.source, primary)
    const patch = fs.readFileSync(path.resolve(import.meta.dirname, release511 ? '../../../../infra/adapters/storage-list-actions/patch.lock.json' : '../../../../infra/adapters/storage-portability/patch.lock.json'))
    for (const identity of [primary, portabilityReport.components.replacement]) {
      validateComponentIdentity(identity, profile)
      assert.equal(identity.go.compatibilityPatch.schema, release511 ? 'tpnil-storage-list-actions-go-build@1.0.0' : 'tpnil-storage-portability-go-build@1.0.0')
      assert.equal(identity.go.compatibilityPatch.patchLockSha256, sha256Hex(patch), 'Portability requires the admitted ancestry export build')
    }
  } else {
    assert.equal(portabilityReport.schema, 'tpnil-native-storage-portability@1')
    assert.equal(portabilityReport.oracle, undefined, 'Historical portability cannot select a new oracle')
  }
  const portability = await verifyNativePortability(portabilityReport)
  assert.equal(read('clauses').substrate, 'unchanged-native-window.CWI', 'Reference clauses cannot qualify a native wallet')
  const clauses = await verifyNativeClauseConformance(read('clauses'), JSON.parse(fs.readFileSync(path.join(evidenceDirectory, 'integrated/boundary.json'), 'utf8')))
  const conditional = release511 ? await (await import('./verify-conformance-conditional.js')).verifyNativeConditionalConformance(read('conditional')) : undefined
  const permissionCoverage = release511 ? await (await import('./verify-conformance-permission-coverage.js')).verifyNativePermissionCoverage(read('permission-coverage'), name => fs.readFileSync(path.join(evidenceDirectory, name)), integrated.walletIdentity) : undefined
  const identities = read('service-counterparts')
  assert.deepEqual(Object.keys(identities), ['replacement-wallet.itcve.test'])
  for (const identity of Object.values(identities) as Record<string, unknown>[]) validateComponentIdentity(identity, profile)
  const baseline = baselineVectors.map(vector => ({ id: vector.id, outcome: vector.outcome, assertions: vector.assertions.map(row => ({ id: row.id, outcome: row.outcome })) }))
  const actual = report.vectors.map((vector: any) => ({ id: vector.id, outcome: vector.outcome, assertions: vector.assertions.map((row: any) => ({ id: row.id, outcome: row.outcome })) }))
  assert.deepEqual(actual.slice(0, 4), baseline.slice(0, 4))
  const verified = [permission, lifecycle, portability, clauses]
  for (const [offset, item] of verified.entries()) {
    const expected = item.assertions.map((row: any) => ({ id: offset === 1 ? `public-api/${row.id}` : row.id, outcome: row.result }))
    if (offset === 0 && permissionLifecycle) expected.push(...permissionLifecycle.assertions.map((row: any) => ({ id: row.id, outcome: row.result })))
    if (offset === 0 && permissionCoverage) expected.push(...permissionCoverage.assertions.map((row: any) => ({ id: row.id, outcome: row.result })))
    if (offset === 3 && conditional) expected.push(...conditional.assertions.map((row: any) => ({ id: `conditional/${row.id}`, outcome: row.result })))
    if (offset === 1) expected.unshift(...baseline[5]!.assertions)
    const outcome = expected.some((row: any) => row.outcome === 'FAIL') ? 'FAIL' : expected.some((row: any) => row.outcome === 'BLOCKED') ? 'BLOCKED' : expected.length > 0 && expected.every((row: any) => row.outcome === 'PASS') ? 'PASS' : 'INCONCLUSIVE'
    assert.deepEqual(actual[offset + 4], { id: `ISI-4-V00${offset + 5}`, outcome, assertions: expected })
  }
  assert.equal(report.outcome, aggregateOutcome(report.vectors))
  for (const name of ['lifecycle', 'portability', 'clauses', ...(release511 ? ['conditional', 'permission-coverage'] : [])]) assert.equal(read(name).identity, integrated.walletIdentity, `${name} belongs to the joined native wallet`)
  assert.deepEqual(read('portability').components.replacement, identities['replacement-wallet.itcve.test'])
  // All vectors retain their evidence references and raw per-predicate outcomes.
  for (const vector of report.vectors) for (const assertion of vector.assertions) {
    assert.ok(Array.isArray(assertion.evidence) && assertion.evidence.length > 0)
    for (const name of assertion.evidence) { assert.match(name, /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/); assert.ok(!name.includes('..')); assert.ok(fs.statSync(path.join(evidenceDirectory, name)).isFile()) }
  }
  return { verified: true, outcome: report.outcome, vectors: report.vectors, semanticProjection: canonicalJson(actual) }
}
