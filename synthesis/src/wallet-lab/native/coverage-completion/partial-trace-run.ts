// SPDX-License-Identifier: Apache-2.0
import type { NativeScenarioContext } from '../../yours-driver.js'
import { evaluatePartialTrace } from './partial-trace-verifier.js'
export async function runNativePartialTrace(context: NativeScenarioContext) {
  const startedAt = new Date().toISOString(), submissionStart = context.services.submissions.length
  const { modules: _modules, ...checked } = await evaluatePartialTrace(undefined, name => context.evidence.readBytes(name))
  const report = { ...checked, startedAt, endedAt: new Date().toISOString(), submissionStart, submissionEnd: context.services.submissions.length }
  context.evidence.addJson('conformance/partial-trace.json', report)
  return report
}
