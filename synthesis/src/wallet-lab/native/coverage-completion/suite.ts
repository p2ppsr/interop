// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import type { NativeScenarioContext } from '../../yours-driver.js'
import { coverageObservationEncoding, decodeCoverageObservation } from '../coverage-observation.js'
import { rows as permissionRows } from './permissions-model.js'
import { operations } from './baskets-model.js'
import { methods, variants } from './pagination-model.js'
import { runNativeCompletionFunding, verifyCompletionFunding } from './funding.js'
import { runNativePermissionSequence } from './permissions-run.js'
import { runNativeBasketCompletion } from './baskets-run.js'
import { runNativePaginationCompletion } from './pagination-run.js'
import { verifyPermissionSequenceParent } from './permissions-parent.js'
import { basketAssertions, verifyBasketParent, type BasketParentBinding } from './baskets-parent.js'
import { paginationAssertions, verifyPaginationParent } from './pagination-parent.js'
import { evaluatePermissionSequence } from './permissions-verifier.js'
import { verifyBasketObservations } from './baskets-verifier.js'
import { evaluatePagination } from './pagination-verifier.js'
import { rows as certificateRejectionRows } from './certificate-rejections-model.js'
import { runNativeCertificateRejections } from './certificate-rejections-run.js'
import { evaluateCertificateRejections } from './certificate-rejections-verifier.js'
import { certificateRejectionAssertions, verifyCertificateRejectionParent } from './certificate-rejections-parent.js'
import { rows as transactionBranchRows } from './transaction-branches-model.js'
import { runNativeTransactionBranches } from './transaction-branches-run.js'
import { evaluateTransactionBranches, transactionBranchAssertions, verifyTransactionBranchParent } from './transaction-branches-parent.js'
import { partialTraceIds } from './partial-trace-model.js'
import { runNativePartialTrace } from './partial-trace-run.js'
import { evaluatePartialTrace, partialTraceAssertions } from './partial-trace-verifier.js'
import { verifyPartialTraceParent, type PartialTracePrerequisites } from './partial-trace-parent.js'

export const completionModules = [
  { name: 'permissions', vector: 4, file: 'permission-sequence', encoded: false, ids: [...permissionRows] },
  { name: 'baskets', vector: 7, file: 'basket-boundaries', encoded: false, ids: operations.map(row => `completion.baskets.${row.id}`) },
  { name: 'pagination', vector: 7, file: 'pagination', encoded: true, ids: ['fixture', ...methods.flatMap(method => [
    ...variants.slice(0, 7).map(([variant]) => `${method}/${variant}`), `${method}/page-union-control`
  ])].map(id => `completion.pagination.${id}`) },
  { name: 'certificateRejections', vector: 7, file: 'certificate-rejections', encoded: true, ids: certificateRejectionRows.map(id => `completion.${id}`) },
  { name: 'transactionBranches', vector: 7, file: 'transaction-branches', encoded: true, ids: transactionBranchRows.map(id => `completion.${id}`) },
  { name: 'partialTrace', vector: 7, file: 'partial-trace', encoded: false, ids: partialTraceIds }
] as const

export async function runNativeCompletionSuite(context: NativeScenarioContext) {
  const reports: Record<string, any> = {}, errors: Array<{ module: string; error: string }> = []
  const execute = async (name: string, fn: () => Promise<unknown>) => {
    try { reports[name] = await fn() } catch (error) { errors.push({ module: name, error: error instanceof Error ? error.stack ?? error.message : String(error) }) }
  }
  await execute('funding', () => runNativeCompletionFunding(context))
  if (reports.funding) {
    await execute('permissions', () => runNativePermissionSequence(context))
    await execute('baskets', () => runNativeBasketCompletion(context))
    if (reports.baskets) await execute('pagination', () => runNativePaginationCompletion(context))
    if (reports.baskets) await execute('certificateRejections', () => runNativeCertificateRejections(context))
    if (reports.certificateRejections) await execute('transactionBranches', () => runNativeTransactionBranches(context))
  }
  await execute('partialTrace', () => runNativePartialTrace(context))
  context.evidence.addJson('conformance/completion-suite.json', { schema: 'tpnil-native-completion-suite@1.0.0',
    profile: context.services.submissionOrdering ? 'ITCVE-1@4.6.0' : 'ITCVE-1@4.5.0', claim: 'ENGINEERING_OBSERVATION_ONLY', modules: Object.keys(reports), errors,
    completeBRC100Conformance: false })
  return reports
}

export async function verifyCompletionReports(read: (name: string) => Buffer) {
  const results: Record<string, any> = {}
  for (const module of completionModules) {
    const report: any = decodeCoverageObservation(JSON.parse(read(`conformance/${module.file}.json`).toString()), module.encoded ? coverageObservationEncoding : undefined)
    let assertions: any[]
    if (module.name === 'permissions') {
      const checked = await evaluatePermissionSequence(report, read)
      assertions = checked.outcomes.map(row => ({ id: row.id, result: row.structuralAndCryptographicChecks === 'SATISFIED' ? 'PASS' : row.result,
        detail: row.structuralAndCryptographicChecks === 'SATISFIED' ? 'Scoped public sequence and cryptographic predicates matched; native admission also requires the complete parent evidence.' : row.detail }))
    } else if (module.name === 'baskets') assertions = basketAssertions(await verifyBasketObservations(report))
    else if (module.name === 'pagination') assertions = paginationAssertions(await evaluatePagination(report))
    else if (module.name === 'certificateRejections') assertions = certificateRejectionAssertions(await evaluateCertificateRejections(report))
    else if (module.name === 'transactionBranches') assertions = transactionBranchAssertions(await evaluateTransactionBranches(report))
    else assertions = partialTraceAssertions(await evaluatePartialTrace(report, read))
    assert.deepEqual(assertions.map(row => row.id), [...module.ids]); assert.deepEqual(report.assertions, assertions)
    results[module.name] = { assertions, report }
  }
  return results
}

export async function verifyCompletionParent(binding: BasketParentBinding, prerequisites: PartialTracePrerequisites) {
  const json = (name: string) => JSON.parse(binding.readEvidence(`conformance/${name}.json`).toString())
  const suite = json('completion-suite')
  assert.equal(suite.schema, 'tpnil-native-completion-suite@1.0.0'); assert.equal(suite.profile, binding.profile)
  assert.deepEqual(suite.modules, ['funding', ...completionModules.map(row => row.name)]); assert.deepEqual(suite.errors, [])
  const fundingReport = decodeCoverageObservation<any>(json('completion-funding'), coverageObservationEncoding)
  const preceding = decodeCoverageObservation<any>(json('coverage-certificates'), coverageObservationEncoding)
  const funding = await verifyCompletionFunding(fundingReport, binding)
  const funded = { ...binding, declaredNativePayments: funding.declaredNativePayments }
  const reports = await verifyCompletionReports(binding.readEvidence)
  const at = (value: string) => { const number = Date.parse(value); assert.equal(new Date(number).toISOString(), value); return number }
  assert.ok(at(preceding.trace.at(-1).endedAt) <= at(fundingReport.startedAt), 'Completion funding precedes original certificate coverage completion')
  assert.ok(preceding.submissionEnd <= fundingReport.submissionStart)
  assert.ok(at(fundingReport.endedAt) <= at(reports.permissions.report.startedAt))
  assert.ok(fundingReport.submissionEnd <= reports.permissions.report.submissionStart)
  assert.ok(at(reports.permissions.report.endedAt) <= at(reports.baskets.report.trace[0].startedAt))
  assert.ok(reports.permissions.report.submissionEnd <= reports.baskets.report.submissionStart)
  assert.ok(at(reports.baskets.report.trace.at(-1).endedAt) <= reports.pagination.report.trace[0].start)
  assert.ok(reports.baskets.report.submissionEnd <= reports.pagination.report.submissionStart)
  assert.ok(reports.pagination.report.trace.at(-1).end <= at(reports.certificateRejections.report.startedAt))
  assert.ok(reports.pagination.report.submissionEnd <= reports.certificateRejections.report.submissionStart)
  assert.ok(at(reports.certificateRejections.report.endedAt) <= at(reports.transactionBranches.report.startedAt))
  assert.ok(reports.certificateRejections.report.submissionEnd <= reports.transactionBranches.report.initialSubmissionCount)
  assert.ok(at(reports.transactionBranches.report.endedAt) <= at(reports.partialTrace.report.startedAt))
  assert.ok(reports.transactionBranches.report.submissions.length <= reports.partialTrace.report.submissionStart)
  const permissions = await verifyPermissionSequenceParent(reports.permissions.report, funded)
  const baskets = await verifyBasketParent(reports.baskets.report, funded)
  const pagination = await verifyPaginationParent(reports.pagination.report, { ...funded, declaredNativePayments: baskets.funding.declaredNativePayments })
  const certificateRejections = await verifyCertificateRejectionParent(reports.certificateRejections.report, funded)
  const transactionBranches = await verifyTransactionBranchParent(reports.transactionBranches.report, { ...funded, declaredNativePayments: pagination.funding.declaredNativePayments })
  const partialTrace = await verifyPartialTraceParent(reports.partialTrace.report, funded, prerequisites)
  return { verified: true as const, funding, permissions, baskets, pagination, certificateRejections, transactionBranches, partialTrace, completeBRC100Conformance: false as const }
}
