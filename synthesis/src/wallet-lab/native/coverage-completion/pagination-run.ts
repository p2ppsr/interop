// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { Transaction } from '@bsv/sdk'
import type { NativeScenarioContext } from '../../yours-driver.js'
import { nativeWalletBoundary } from '../integrated.js'
import { coverageObservationEncoding, writeCoverageObservation } from '../coverage-observation.js'
import { capturePagination } from './pagination-driver.js'
import { evaluatePagination } from './pagination-verifier.js'
import { paginationAssertions } from './pagination-parent.js'

export async function runNativePaginationCompletion(context: NativeScenarioContext) {
  const source = 'conformance/basket-boundaries.json', bytes = context.evidence.readBytes(source), basket = JSON.parse(bytes.toString())
  const fixture = basket.trace.find((row: any) => row.id === 'fixture-external').result
  const tx = Transaction.fromAtomicBEEF(fixture.tx)
  const anchor = { outpoint: `${tx.id('hex')}.15`, rawTxHex: tx.toHex(), source, sha256: createHash('sha256').update(bytes).digest('hex') }
  const wallet = new Proxy({}, { get: (_target, method) => typeof method !== 'string' || method === 'then' ? undefined
    : (args: unknown) => nativeWalletBoundary(context.application, true)[method](args) })
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-native-pagination-')), events: unknown[] = [], errors: string[] = []
  let overlay: any, overlayClosed = false
  try {
    const root = path.resolve(import.meta.dirname, '../../../../..')
    const { startOverlayNode } = await import(pathToFileURL(path.join(root, 'integrations/services/src/overlay.ts')).href)
    overlay = await startOverlayNode({ directory, name: `native_pagination_${process.pid}`, mongoUri: process.env.TPNIL_GO_MONGO_URI,
      tracker: { currentHeight: async () => 900100, findHeaderForHeight: async (height: number) => context.services.headers.get(height),
        isValidRootForHeight: async (value: string, height: number) => context.services.headers.get(height)?.merkleRoot === value },
      log: (...values: unknown[]) => events.push(values) })
    const report = await capturePagination({ wallet, services: context.services, overlayOrigin: overlay.origin, anchor,
      nonce: randomBytes(32).toString('hex'), mode: 'NATIVE_OBSERVATION', hooks: {
        async installLookup(answer) { const remove = context.services.installIdentityCoverageLookup(answer); return async () => remove() }
      } })
    writeCoverageObservation(context.evidence, 'conformance/pagination-observed.json', report, coverageObservationEncoding)
    const checked = await evaluatePagination(report), assertions = paginationAssertions(checked)
    const retained = { ...report, assertions, parentAdmissionRequired: true,
      result: assertions.some(row => row.result === 'FAIL') ? 'FAIL' : assertions.some(row => row.result === 'BLOCKED') ? 'BLOCKED' : 'PASS' }
    writeCoverageObservation(context.evidence, 'conformance/pagination.json', retained, coverageObservationEncoding)
    return retained
  } catch (error) { errors.push(String(error)); throw error }
  finally {
    try { if (overlay) { await overlay.close(); overlayClosed = true } } catch (error) { errors.push(String(error)) }
    writeCoverageObservation(context.evidence, 'conformance/pagination-environment.json', { schema: 'tpnil-native-pagination-environment@1.0.0', events, errors, overlayClosed }, coverageObservationEncoding)
    fs.rmSync(directory, { recursive: true, force: true })
  }
}
