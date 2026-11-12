// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
export const partialTraceSchema = 'tpnil-native-partial-trace@1.0.0'
export const partialTraceOracle = 'tpnil-native-partial-trace-oracle@1.0.0'
export const partialTracePolicyPath = 'programs/ISI-4/profiles/native-coverage-partial-trace-1.0.0/policy.json'
const root = path.resolve(import.meta.dirname, '../../../../..'), bytes = fs.readFileSync(path.join(root, partialTracePolicyPath))
export const partialTracePolicy = JSON.parse(bytes.toString())
export const partialTracePolicySha256 = createHash('sha256').update(bytes).digest('hex')
export const partialTraceIds: string[] = partialTracePolicy.rows.map((row: any) => `completion.partial-trace.${row.id}`)
export function verifyPartialTracePolicy() {
  assert.equal(partialTracePolicy.oracle, partialTraceOracle); assert.equal(partialTracePolicy.profile, 'ITCVE-1@4.5.0')
  assert.equal(partialTraceIds.length, 63); assert.equal(new Set(partialTraceIds).size, 63)
  assert.equal(partialTracePolicy.maximumPublicCalls, 0); assert.equal(partialTracePolicy.maximumNewSignedTransactions, 0)
  assert.deepEqual(Object.keys(partialTracePolicy.modules), ['conditional', 'states', 'transactions', 'certificateStates', 'certificates'])
  for (const module of Object.values(partialTracePolicy.modules) as any[]) assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root, module.policy))).digest('hex'), module.policySha256)
  return true
}
