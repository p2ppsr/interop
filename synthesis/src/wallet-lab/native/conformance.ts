import { completionModules, runNativeCompletionSuite } from './coverage-completion/suite.js'
import type { IdentityTrustOracleOptions } from './identity-trust-oracle2.js'
import type { ControlledHeaderFixture } from './controlled-header-fixture.js'
import type { NativeScenarioContext } from '../yours-driver.js'
import { aggregateOutcome, type VectorResult, type VectorOutcome } from '../model.js'
import { runNativePermissionConformance } from './conformance-permissions.js'
import { lifecycleOracleId, runConformanceLifecycle } from './conformance-lifecycle.js'
import { runNativePortability } from './conformance-portability.js'
import { nativeWalletBoundary, runNativeIntegration } from './integrated.js'
import { runNativeClauseConformance } from './conformance-clauses.js'
import { todoSubmissionBinding } from './todo-submission-binding.js'
import { runNativeConditionalConformance } from './conformance-conditional.js'

function vector(id: VectorResult['id'], report: any, file: string, limitations: string[] = []): VectorResult {
  const assertions = report.assertions.map((row: any) => ({ id: row.id, outcome: row.result as VectorOutcome, detail: row.detail ?? 'Independent predicate is retained with its raw observations.', evidence: [file] }))
  const outcome: VectorOutcome = assertions.some((row: any) => row.outcome === 'FAIL') ? 'FAIL' : assertions.some((row: any) => row.outcome === 'BLOCKED') ? 'BLOCKED' : assertions.length > 0 && assertions.every((row: any) => row.outcome === 'PASS') ? 'PASS' : 'INCONCLUSIVE'
  return { id, outcome, assertions, limitations }
}

export async function runNativeConformance(context: NativeScenarioContext, coverage = false, closure = false, nativeRevision: 'legacy' | 'yours-5.1.1' | 'pr368-7e39006' | 'pr368-observer3' | 'pr368-coverage1' | 'pr368-coverage2' | 'pr368-coverage3' = 'legacy', fixtureRevision: 1 | 2 = 1, headerFixture?: ControlledHeaderFixture, identityTrustOracle?: IdentityTrustOracleOptions['oracle']): Promise<{ vectors: VectorResult[] }> {
  const completion = nativeRevision === 'pr368-coverage3'
  const recovery = completion || nativeRevision === 'pr368-coverage2'
  const expanded = recovery || nativeRevision === 'pr368-coverage1'
  const observer3 = nativeRevision === 'pr368-observer3'
  const candidate = expanded || observer3 || nativeRevision === 'pr368-7e39006'
  if ((observer3 || expanded) && (fixtureRevision !== 2 || headerFixture !== 'tpnil-native-controlled-header@1.0.0' || identityTrustOracle !== 'tpnil-native-identity-trust-oracle@2.0.0')) throw new Error('Observer3 requires its prospective fixtures and identity trust oracle')
  const release511 = candidate || nativeRevision === 'yours-5.1.1'
  if (fixtureRevision === 2 && !release511) throw new Error('Fixture revision2 requires the explicit release511-family profile')
  if (release511 && !closure) throw new Error('Yours5.1.1 requires the complete native closure')
  coverage = coverage || closure
  const { application, services, evidence, baselineVectors } = context
  const profile = completion ? 'ITCVE-1@4.5.0' : recovery ? 'ITCVE-1@4.4.0' : expanded ? 'ITCVE-1@4.3.0' : observer3 ? 'ITCVE-1@4.2.0' : candidate ? 'ITCVE-1@4.1.0' : release511 ? 'ITCVE-1@4.0.0' : closure ? 'ITCVE-1@2.0.0' : coverage ? 'ITCVE-1@1.5.0' : 'ITCVE-1@1.4.0'
  const program = completion ? 'ISI-4@5.5.0' : recovery ? 'ISI-4@5.4.0' : expanded ? 'ISI-4@5.3.0' : observer3 ? 'ISI-4@5.2.0' : candidate ? 'ISI-4@5.1.0' : release511 ? 'ISI-4@5.0.0' : closure ? 'ISI-4@4.0.0' : coverage ? 'ISI-4@3.0.0' : 'ISI-4@2.0.0'
  const wallet = nativeWalletBoundary(application, true)
  const permission = await context.manualPrompt(() => runNativePermissionConformance({ context: context.context, evidence, extensionId: context.extensionId, trustedClick: closure }))
  const lifecycle = await runConformanceLifecycle(wallet, services, { receiptMode: 'storage-rpc', oracle: lifecycleOracleId, submissionBinding: todoSubmissionBinding })
  evidence.addJson('conformance/lifecycle.json', lifecycle)
  const portability = await runNativePortability({ application, services, evidence, password: context.password, ...(recovery ? { extensionId: context.extensionId } : {}), oracle: completion ? 'tpnil-native-portability-oracle@4.0.0' : coverage ? 'tpnil-native-portability-oracle@3.0.0' : 'tpnil-native-portability-oracle@2.0.0' })
  let clauses: any
  let conditional: any
  let transactionStates: any
  let certificateStates: any
  await runNativeIntegration({ application, services, evidence, profile, fixtureRevision, headerFixture, identityTrustOracle, beforeTrustRestore: async boundaryReport => {
    clauses = await runNativeClauseConformance({ wallet, evidence, boundaryReport, ...(release511 ? { oracle: completion ? 'tpnil-brc100-clause-oracle@7.0.0' as const : fixtureRevision === 2 ? 'tpnil-brc100-clause-oracle@6.0.0' as const : 'tpnil-brc100-clause-oracle@5.0.0' as const } : coverage ? { oracle: 'tpnil-brc100-clause-oracle@4.0.0' as const } : {}) })
    if (release511) conditional = await runNativeConditionalConformance({ wallet, services, evidence, boundaryReport, fixtureRevision })
    if (fixtureRevision === 2) transactionStates = await (await import('./conformance-transaction-states.js')).runNativeTransactionStates({ wallet, services, evidence, boundaryReport, oracleRevision: observer3 || expanded ? 2 : 1 })
    if (fixtureRevision === 2) certificateStates = await (await import('./conformance-certificate-states.js')).runNativeCertificateStates({ wallet, services, evidence, boundaryReport })
  } })
  if (!clauses) throw new Error('Native clause scenario did not execute')
  const permissionLifecycle = coverage ? await context.manualPrompt(async () => (await import('./conformance-permission-lifecycle.js')).runNativePermissionLifecycle(context, { trustedClick: closure })) : undefined
  if (permissionLifecycle) evidence.addJson('conformance/permission-lifecycle.json', permissionLifecycle)
  const permissionCoverage = expanded ? JSON.parse(evidence.readBytes('conformance/permission-coverage.json').toString()) : release511 ? await context.manualPrompt(async () => (await import('./conformance-permission-coverage.js')).runNativePermissionCoverage(context, fixtureRevision === 2 ? 3 : 1)) : undefined
  const extensions = expanded ? await (await import('./coverage-suite.js')).runNativeCoverageSuite(context, permissionCoverage!, completion ? 'ITCVE-1@4.5.0' : undefined) : undefined
  const completions = completion ? await runNativeCompletionSuite(context) : undefined
  const vectors = structuredClone(baselineVectors)
  vectors[4] = vector('ISI-4-V005', permission, 'conformance/permissions.json', ['Visible native permission UI and public CWI; other wallet substrates retain separate admission.'])
  if (permissionLifecycle) {
    const added = vector('ISI-4-V005', permissionLifecycle, 'conformance/permission-lifecycle.json')
    vectors[4] = { ...vectors[4]!, assertions: [...vectors[4]!.assertions, ...added.assertions], outcome: aggregateOutcome([vectors[4]!, added]) }
  }
  if (permissionCoverage) {
    const added = vector('ISI-4-V005', permissionCoverage, 'conformance/permission-coverage.json')
    vectors[4] = { ...vectors[4]!, assertions: [...vectors[4]!.assertions, ...added.assertions], outcome: aggregateOutcome([vectors[4]!, added]) }
  }
  const stronger = vector('ISI-4-V006', lifecycle, 'conformance/lifecycle.json')
  vectors[5] = { ...vectors[5]!, assertions: [...vectors[5]!.assertions, ...stronger.assertions.map(row => ({ ...row, id: `public-api/${row.id}` }))], outcome: aggregateOutcome([vectors[5]!, stronger]) }
  vectors[6] = vector('ISI-4-V007', portability, 'conformance/portability.json', ['Native configured counterpart replacement; portable file formats and other wallets are separate profiles.'])
  vectors[7] = vector('ISI-4-V008', clauses, 'conformance/clauses.json', ['The clause coverage inventory retains unexecuted obligations as BLOCKED; method execution alone cannot establish complete BRC-100 conformance.'])
  if (conditional) {
    const added = vector('ISI-4-V008', conditional, 'conformance/conditional.json')
    vectors[7] = { ...vectors[7]!, assertions: [...vectors[7]!.assertions, ...added.assertions.map(row => ({ ...row, id: `conditional/${row.id}` }))], outcome: aggregateOutcome([vectors[7]!, added]) }
  }
  if (transactionStates) {
    const added = vector('ISI-4-V008', transactionStates, 'conformance/transaction-states.json')
    vectors[7] = { ...vectors[7]!, assertions: [...vectors[7]!.assertions, ...added.assertions.map(row => ({ ...row, id: `transaction-states/${row.id}` }))], outcome: aggregateOutcome([vectors[7]!, added]) }
  }
  if (certificateStates) {
    const added = vector('ISI-4-V008', certificateStates, 'conformance/certificate-states.json')
    vectors[7] = { ...vectors[7]!, assertions: [...vectors[7]!.assertions, ...added.assertions], outcome: aggregateOutcome([vectors[7]!, added]) }
  }
  if (extensions) {
    const { permissionExtensionPolicy } = await import('./coverage-permissions-model.js')
    const { transactionCoverageIds } = await import('./coverage-transactions-model.js')
    const { coverageExtensionIds } = await import('./coverage-extension-model.js')
    const { certificateCoverageIds } = await import('./coverage-certificates-model.js')
    const modules: Array<[string, number, string, string[]]> = [
      ['permissions', 4, 'permission-extension', permissionExtensionPolicy().assertions],
      ['transactions', 7, 'coverage-transactions', transactionCoverageIds],
      ['extension', 7, 'coverage-extension', coverageExtensionIds],
      ['certificates', 7, 'coverage-certificates', certificateCoverageIds]
    ]
    for (const [name, index, file, ids] of modules) {
      const report = extensions[name] ?? { assertions: ids.map(id => ({ id, result: 'BLOCKED', detail: 'Prospective module did not complete; retained suite execution errors require investigation.' })) }
      if (JSON.stringify(report.assertions.map((a: any) => a.id)) !== JSON.stringify(ids)) throw new Error(`Coverage module ${name} predicate identity differs`)
      const added = vector(index === 4 ? 'ISI-4-V005' : 'ISI-4-V008', report, `conformance/${file}.json`)
      vectors[index] = { ...vectors[index]!, assertions: [...vectors[index]!.assertions, ...added.assertions], outcome: aggregateOutcome([vectors[index]!, added]) }
    }
  }
  if (completions) for (const module of completionModules) {
    const report = completions[module.name] ?? { assertions: module.ids.map(id => ({ id, result: 'BLOCKED', detail: 'Completion module did not finish; retained suite errors require investigation.' })) }
    if (JSON.stringify(report.assertions.map((row: any) => row.id)) !== JSON.stringify(module.ids)) throw new Error(`Completion module ${module.name} predicate identity differs`)
    const index = module.vector, added = vector(index === 4 ? 'ISI-4-V005' : 'ISI-4-V008', report, `conformance/${module.file}.json`)
    vectors[index] = { ...vectors[index]!, assertions: [...vectors[index]!.assertions, ...added.assertions], outcome: aggregateOutcome([vectors[index]!, added]) }
  }
  evidence.addJson('conformance/result.json', { schema: release511 ? 'tpnil-native-conformance@5.0.0' : closure ? 'tpnil-native-conformance@4.0.0' : coverage ? 'tpnil-native-conformance@3.0.0' : 'tpnil-native-conformance@2.0.0', profile, program, claim: 'ENGINEERING_OBSERVATION_ONLY', vectors, outcome: aggregateOutcome(vectors) })
  return { vectors }
}
