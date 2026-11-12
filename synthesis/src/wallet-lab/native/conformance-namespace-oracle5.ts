// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs'
import { clauseOracle7Id } from './conformance-nosend-change.js'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

export const clauseOracle5Id = 'tpnil-brc100-clause-oracle@5.0.0'
export const clauseOracle6Id = 'tpnil-brc100-clause-oracle@6.0.0'
export const namespaceOracle5Policy = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../../../programs/ISI-4/profiles/native-conformance-5.0.0/namespace-oracle-5.0.0.json'), 'utf8'))

/** A reserved P-module rejection is a namespace refusal, even though the
 * generic error classifier excludes unsupported operations. This exception
 * applies only to the two exact source-bound calls; error structure is scored
 * independently. Existing oracle versions retain their original behavior. */
export function reservedNamespaceRejection(report: any, row: any): boolean {
  if ((report?.oracle !== clauseOracle5Id && report?.oracle !== clauseOracle6Id && report?.oracle !== clauseOracle7Id) || !isDeepStrictEqual(report.source, namespaceOracle5Policy.source)) return false
  const fixture = namespaceOracle5Policy.calls.find((entry: any) => entry.id === row?.id)
  return fixture !== undefined && row.method === fixture.method &&
    isDeepStrictEqual(row.args, fixture.args) && row.result === undefined &&
    row.error?.name === 'Error' && row.error.message === namespaceOracle5Policy.rejection.message
}
