// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { Transaction } from '@bsv/sdk'
import type { NativeScenarioContext } from '../../yours-driver.js'
import { config, type Anchor } from './permissions-model.js'
import { captureNativePermissionSequence, nativePermissionSequencePorts, readNativeSequenceEvidence } from './permissions-driver.js'
import { evaluatePermissionSequence } from './permissions-verifier.js'

/** Executes public CWI and visible UI only. The native parent subsequently joins
 * these scoped predicates to complete browser, funding and shutdown evidence. */
export async function runNativePermissionSequence(context: NativeScenarioContext) {
  const sourceEvidencePath = 'conformance/permission-coverage.json'
  const bytes = context.evidence.readBytes(sourceEvidencePath)
  const original = JSON.parse(bytes.toString())
  const contexts = JSON.parse(context.evidence.readBytes('native-browser-contexts.json').toString())
  assert.equal(contexts.schema, 'tpnil-native-browser-contexts@1')
  assert.equal(contexts.contexts.length, 5, 'Permission sequence must follow the original coverage certificate restart')
  const setup = original.steps.filter((row: any) => row.id === 'setup-basket')
  assert.equal(setup.length, 1)
  assert.equal(setup[0].outcome.status, 'fulfilled')
  const value = setup[0].outcome.value, transaction = Transaction.fromAtomicBEEF(value.tx)
  assert.equal(transaction.id('hex'), value.txid)
  const anchor: Anchor = { identity: original.identity, certificate: original.certificate,
    basket: config.basket, outpoint: `${value.txid}.0`, satoshis: config.basketAmount,
    lockingScript: '51', rawTxHex: transaction.toHex(), sourceEvidencePath,
    sourceEvidenceSha256: createHash('sha256').update(bytes).digest('hex') }
  const report = await context.manualPrompt(() => captureNativePermissionSequence(anchor,
    nativePermissionSequencePorts(context, 4, contexts.contexts[0].profileBinding)))
  context.evidence.flush()
  const checked = await evaluatePermissionSequence(report, readNativeSequenceEvidence(context))
  const assertions = checked.outcomes.map(row => ({ id: row.id,
    result: row.structuralAndCryptographicChecks === 'SATISFIED' ? 'PASS' : row.result,
    detail: row.structuralAndCryptographicChecks === 'SATISFIED'
      ? 'Scoped public sequence and cryptographic predicates matched; native admission also requires the complete parent evidence.' : row.detail }))
  const retained = { ...report, assertions, parentAdmissionRequired: true,
    result: assertions.some(row => row.result === 'FAIL') ? 'FAIL' : assertions.some(row => row.result === 'BLOCKED') ? 'BLOCKED' : 'PASS' }
  context.evidence.addJson('conformance/permission-sequence.json', retained)
  return retained
}
