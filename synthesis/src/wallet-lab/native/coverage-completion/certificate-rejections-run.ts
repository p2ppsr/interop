// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import type { NativeScenarioContext } from '../../yours-driver.js'
import { nativeWalletBoundary } from '../integrated.js'
import { coverageAtomic } from '../coverage-transactions-program.js'
import { coverageObservationEncoding, writeCoverageObservation } from '../coverage-observation.js'
import { captureCertificateRejections } from './certificate-rejections-driver.js'
import { evaluateCertificateRejections } from './certificate-rejections-verifier.js'
import { certificateRejectionAssertions } from './certificate-rejections-parent.js'

export async function runNativeCertificateRejections(context: NativeScenarioContext) {
  const source = 'conformance/basket-boundaries.json', bytes = context.evidence.readBytes(source), basket = JSON.parse(bytes.toString())
  const fixture = basket.trace.filter((row: any) => row.id === 'fixture-external')
  assert.equal(fixture.length, 1)
  const transaction = coverageAtomic(fixture[0].result.tx)
  assert.equal(transaction.id('hex'), fixture[0].result.txid)
  const anchor = { source, sha256: createHash('sha256').update(bytes).digest('hex'), rawTxHex: transaction.toHex(), outpoint: `${fixture[0].result.txid}.15` }
  const contexts = JSON.parse(context.evidence.readBytes('native-browser-contexts.json').toString())
  assert.equal(contexts.contexts.length, 8, 'Certificate completion follows all three permission sequence restarts')
  const wallet = new Proxy({}, { get: (_target, method) => typeof method !== 'string' || method === 'then' ? undefined
    : (args: unknown) => nativeWalletBoundary(context.application, true)[method](args) })
  const report = await captureCertificateRejections({ wallet, identity: basket.identity, revocationOutpoint: anchor.outpoint,
    runNonce: randomBytes(16).toString('hex'), providerRegistry: context.services.nativeOutputProviderRegistry,
    submissions: () => context.services.submissions.map(row => ({ txid: row.txid, beefHex: Buffer.from(row.bytes).toString('hex'), verdict: row.verdict })),
    routes: () => context.services.routes,
    certificateObservations: () => context.services.nativeCertificateInventoryObservations,
    observeCertificates: identity => context.services.nativeCertificateInventories(identity),
    registerIssuer: handler => context.services.registerControlledRoute('certifier.itcve.test', handler),
    restart: async () => {
      assert.ok(context.restartBrowser, 'Native certificate restart hook is absent')
      const restarted = await context.manualPrompt(() => context.restartBrowser!())
      context.application = restarted.application; context.context = restarted.context
      return { wallet, receipt: restarted.receipt, kind: 'NATIVE_BROWSER_RESTART' }
    },
    progress: value => writeCoverageObservation(context.evidence, 'conformance/certificate-rejections-observed.json', value, coverageObservationEncoding)
  })
  const retained = { ...report, mode: 'NATIVE_OBSERVATION', anchor, contextBaseSequence: 7,
    extensionId: contexts.contexts[0].extensionId, contextProfileBinding: contexts.contexts[0].profileBinding }
  const checked = await evaluateCertificateRejections(retained), assertions = certificateRejectionAssertions(checked)
  const complete = { ...retained, assertions, parentAdmissionRequired: true,
    result: assertions.some(row => row.result === 'FAIL') ? 'FAIL' : assertions.some(row => row.result === 'BLOCKED') ? 'BLOCKED' : 'PASS' }
  writeCoverageObservation(context.evidence, 'conformance/certificate-rejections.json', complete, coverageObservationEncoding)
  return complete
}
