import {nativeCompletionProfile} from '../completion-profile.js'
// SPDX-License-Identifier: Apache-2.0
import type { NativeScenarioContext } from '../../yours-driver.js'
import { nativeWalletBoundary } from '../integrated.js'
import { createFixtureWallet } from '../../../storage-sync/fixture-wallet.js'
import { runNativeBasketBoundaries } from './baskets-driver.js'
import { verifyBasketObservations } from './baskets-verifier.js'
import { basketAssertions } from './baskets-parent.js'

export async function runNativeBasketCompletion(context: NativeScenarioContext) {
  const wallet = new Proxy({}, { get: (_target, method) => typeof method !== 'string' || method === 'then' ? undefined
    : (args: unknown) => nativeWalletBoundary(context.application, true)[method](args) })
  const funder = await createFixtureWallet(context.services, '77'.repeat(32))
  try {
    const { report } = await runNativeBasketBoundaries({ wallet, funder, services: context.services, mode: 'NATIVE_OBSERVATION', policyRevision: context.integratedProfile ? nativeCompletionProfile(context.integratedProfile).basketRevision : 1,
      reopen: async () => wallet,
      onProgress: (value: unknown) => { context.evidence.addJson('conformance/basket-boundaries-observed.json', value); context.evidence.flush() } })
    const checked = await verifyBasketObservations(report, context.integratedProfile ? nativeCompletionProfile(context.integratedProfile).basketRevision : 1), assertions = basketAssertions(checked)
    const retained = { ...report, assertions, parentAdmissionRequired: true,
      result: assertions.some(row => row.result === 'FAIL') ? 'FAIL' : assertions.some(row => row.result === 'BLOCKED') ? 'BLOCKED' : 'PASS' }
    context.evidence.addJson('conformance/basket-boundaries.json', retained)
    return retained
  } finally { await funder.destroy() }
}
