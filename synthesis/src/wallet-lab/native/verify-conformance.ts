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

export async function verifyNativeConformance(evidenceDirectory: string, baselineVectors: VectorResult[], lifecycleOracle?: string, portabilityOracle?: string, clauseOracle = 'tpnil-brc100-clause-oracle@3.0.0', profile: 'ITCVE-1@1.4.0' | 'ITCVE-1@1.5.0' | 'ITCVE-1@2.0.0' | 'ITCVE-1@4.0.0' | 'ITCVE-1@4.1.0' | 'ITCVE-1@4.2.0' | 'ITCVE-1@4.3.0' | 'ITCVE-1@4.4.0' = 'ITCVE-1@1.4.0') {
  const read = (name: string) => JSON.parse(fs.readFileSync(path.join(evidenceDirectory, 'conformance', `${name}.json`), 'utf8'))
  const report = read('result')
  const recovery = profile === 'ITCVE-1@4.4.0'
  const expanded = recovery || profile === 'ITCVE-1@4.3.0'
  if (expanded) assert.equal(JSON.parse(fs.readFileSync(path.join(evidenceDirectory, 'conformance/permission-extension.json'), 'utf8')).identityPermission, recovery ? 'explicit-allow-v1' : undefined)
  const observer3 = profile === 'ITCVE-1@4.2.0'
  const candidate = expanded || observer3 || profile === 'ITCVE-1@4.1.0'
  const release511 = candidate || profile === 'ITCVE-1@4.0.0'
  const closure = release511 || profile === 'ITCVE-1@2.0.0'
  const coverage = closure || profile === 'ITCVE-1@1.5.0'
  assert.equal(report.schema, release511 ? 'tpnil-native-conformance@5.0.0' : closure ? 'tpnil-native-conformance@4.0.0' : coverage ? 'tpnil-native-conformance@3.0.0' : 'tpnil-native-conformance@2.0.0'); assert.equal(report.profile, profile); assert.equal(report.program, recovery ? 'ISI-4@5.4.0' : expanded ? 'ISI-4@5.3.0' : observer3 ? 'ISI-4@5.2.0' : candidate ? 'ISI-4@5.1.0' : release511 ? 'ISI-4@5.0.0' : closure ? 'ISI-4@4.0.0' : coverage ? 'ISI-4@3.0.0' : 'ISI-4@2.0.0')
  const fixtureRevision = clauseOracle === 'tpnil-brc100-clause-oracle@6.0.0' ? 2 : 1
  if (observer3 || expanded) assert.equal(fixtureRevision, 2, 'Observer3 requires its prospective fixture revision')
  assert.equal(clauseOracle, release511 ? fixtureRevision === 2 ? 'tpnil-brc100-clause-oracle@6.0.0' : 'tpnil-brc100-clause-oracle@5.0.0' : coverage ? 'tpnil-brc100-clause-oracle@4.0.0' : 'tpnil-brc100-clause-oracle@3.0.0')
  assert.equal(read('clauses').oracle, clauseOracle, 'Clause report selected a different oracle from the frozen plan')
  if (release511) {
    assert.equal(read('conditional').oracle, `tpnil-native-conditional-oracle@${fixtureRevision === 2 ? 2 : 1}.0.0`)
    assert.equal(read('permission-coverage').oracle, `tpnil-native-permission-coverage-oracle@${expanded ? 5 : fixtureRevision === 2 ? 3 : 1}.0.0`)
  }
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
    const patch = fs.readFileSync(path.resolve(import.meta.dirname, expanded ? '../../../../infra/adapters/storage-sqlite-retry/patch.lock.json' : fixtureRevision === 2 ? '../../../../infra/adapters/storage-native-contracts/patch.lock.json' : release511 ? '../../../../infra/adapters/storage-list-actions/patch.lock.json' : '../../../../infra/adapters/storage-portability/patch.lock.json'))
    for (const identity of [primary, portabilityReport.components.replacement]) {
      validateComponentIdentity(identity, profile)
      assert.equal(identity.go.compatibilityPatch.schema, expanded ? 'tpnil-storage-sqlite-retry-go-build@1.0.0' : fixtureRevision === 2 ? 'tpnil-storage-native-contracts-go-build@1.0.0' : release511 ? 'tpnil-storage-list-actions-go-build@1.0.0' : 'tpnil-storage-portability-go-build@1.0.0')
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
  if (fixtureRevision === 2) assert.equal(read('transaction-states').oracle, `tpnil-native-transaction-states-oracle@${observer3 || expanded ? 2 : 1}.0.0`, 'Transaction state oracle differs from the selected profile')
  const transactionStates = fixtureRevision === 2 ? await (await import('./verify-transaction-states.js')).verifyNativeTransactionStates(read('transaction-states')) : undefined
  const certificateStates = fixtureRevision === 2 ? await (await import('./verify-certificate-states.js')).verifyNativeCertificateStates(read('certificate-states')) : undefined
  if (fixtureRevision === 2) {
    const boundary = JSON.parse(fs.readFileSync(path.join(evidenceDirectory, 'integrated/boundary.json'), 'utf8'))
    ;(await import('./verify-certificate-states.js')).verifyCertificateStateParentBindings(read('certificate-states'), {
      boundary, identity: integrated.walletIdentity,
      globalRoutes: JSON.parse(fs.readFileSync(path.join(evidenceDirectory, 'routes.json'), 'utf8')),
      globalSubmissions: JSON.parse(fs.readFileSync(path.join(evidenceDirectory, 'native-submissions.json'), 'utf8'))
    })
  }
  const permissionCoverage = release511 ? await (await import('./verify-conformance-permission-coverage.js')).verifyNativePermissionCoverage(read('permission-coverage'), name => fs.readFileSync(path.join(evidenceDirectory, name)), integrated.walletIdentity, expanded ? { profile: recovery ? 'ITCVE-1@4.4.0' : 'ITCVE-1@4.3.0' } : undefined) : undefined
  let extensions: { permissions: any; transactions: any; extension: any; certificates: any } | undefined
  if (expanded) {
    const suite = read('coverage-suite')
    assert.equal(suite.schema, 'tpnil-native-coverage-suite@1.0.0'); assert.equal(suite.claim, 'ENGINEERING_OBSERVATION_ONLY')
    assert.deepEqual(suite.modules, ['permissions', 'transactions', 'extension', 'certificates']); assert.deepEqual(suite.errors, [])
    const reports = { permissions: read('permission-extension'), transactions: read('coverage-transactions'), extension: read('coverage-extension'), certificates: read('coverage-certificates') }
    const policies = [
      ['permissions', 'native-coverage-permissions-1.0.0'], ['transactions', 'native-coverage-transactions-2.0.0'],
      ['extension', 'native-coverage-extension-2.0.0'], ['certificates', 'native-coverage-certificates-1.0.0']
    ] as const
    for (const [name, directory] of policies) {
      const bytes = fs.readFileSync(path.resolve(import.meta.dirname, `../../../../programs/ISI-4/profiles/${directory}/policy.json`)), policy = JSON.parse(bytes.toString())
      assert.equal(reports[name].oracle, policy.oracle); assert.equal(reports[name].policySha256, sha256Hex(bytes)); assert.equal(reports[name].identity, integrated.walletIdentity)
    }
    const evidence = (name: string) => fs.readFileSync(path.join(evidenceDirectory, name))
    extensions = {
      permissions: await (await import('./coverage-permissions-verifier.js')).verifyPermissionExtension(reports.permissions, read('permission-coverage'), evidence, integrated.walletIdentity),
      transactions: await (await import('./coverage-transactions-verifier.js')).verifyNativeTransactionCoverage(reports.transactions),
      extension: await (await import('./coverage-extension-verifier.js')).verifyNativeCoverageExtension(reports.extension),
      certificates: await (await import('./coverage-certificates-verify.js')).verifyCertificateCoverage(reports.certificates, evidence)
    }
    assert.deepEqual(Object.values(extensions).map(item => item.assertions.length), [15, 22, 61, 11])
  }
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
    if (offset === 3 && transactionStates) expected.push(...transactionStates.assertions.map((row: any) => ({ id: `transaction-states/${row.id}`, outcome: row.result })))
    if (offset === 3 && certificateStates) expected.push(...certificateStates.assertions.map((row: any) => ({ id: row.id, outcome: row.result })))
    if (extensions && offset === 0) expected.push(...extensions.permissions.assertions.map((row: any) => ({ id: row.id, outcome: row.result })))
    if (extensions && offset === 3) for (const name of ['transactions', 'extension', 'certificates'] as const) expected.push(...extensions[name].assertions.map((row: any) => ({ id: row.id, outcome: row.result })))
    if (offset === 1) expected.unshift(...baseline[5]!.assertions)
    const outcome = expected.some((row: any) => row.outcome === 'FAIL') ? 'FAIL' : expected.some((row: any) => row.outcome === 'BLOCKED') ? 'BLOCKED' : expected.length > 0 && expected.every((row: any) => row.outcome === 'PASS') ? 'PASS' : 'INCONCLUSIVE'
    assert.deepEqual(actual[offset + 4], { id: `ISI-4-V00${offset + 5}`, outcome, assertions: expected })
  }
  if (expanded) {
    const all = actual.flatMap((vector: any) => vector.assertions.map((row: any) => `${vector.id}/${row.id}`))
    assert.equal(all.length, 535); assert.equal(new Set(all).size, 535, 'Expanded predicate inventory contains duplicates')
    const profileManifest = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, recovery ? '../../../../itcves/ITCVE-1/4.4.0/profile.json' : '../../../../itcves/ITCVE-1/4.3.0/profile.json'), 'utf8'))
    for (const vector of actual.slice(4)) assert.deepEqual(vector.assertions.map((row: any) => row.id), profileManifest.nativeConformance.assertions[vector.id])
  }
  assert.equal(report.outcome, aggregateOutcome(report.vectors))
  for (const name of ['lifecycle', 'portability', 'clauses', ...(release511 ? ['conditional', 'permission-coverage'] : []), ...(fixtureRevision === 2 ? ['transaction-states', 'certificate-states'] : [])]) assert.equal(read(name).identity, integrated.walletIdentity, `${name} belongs to the joined native wallet`)
  assert.deepEqual(read('portability').components.replacement, identities['replacement-wallet.itcve.test'])
  // All vectors retain their evidence references and raw per-predicate outcomes.
  for (const vector of report.vectors) for (const assertion of vector.assertions) {
    assert.ok(Array.isArray(assertion.evidence) && assertion.evidence.length > 0)
    for (const name of assertion.evidence) { assert.match(name, /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/); assert.ok(!name.includes('..')); assert.ok(fs.statSync(path.join(evidenceDirectory, name)).isFile()) }
  }
  return { verified: true, outcome: report.outcome, vectors: report.vectors, semanticProjection: canonicalJson(actual) }
}
