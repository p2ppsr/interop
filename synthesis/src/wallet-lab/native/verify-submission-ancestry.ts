import assert from 'node:assert/strict'
import { P2PKH, PrivateKey, Transaction } from '@bsv/sdk'
import { lifecyclePermissionConfig } from './conformance-permission-lifecycle-model.js'
import { coveragePaymentScript, permissionCoverageConfig } from './conformance-permission-coverage-model.js'
import { evaluateNativePermissionLifecycle } from './verify-conformance-permission-lifecycle.js'
import { observedSubmissionTransactions } from './verify-transaction-state-bindings.js'

export const finalSubmissionAncestryPolicy = 'tpnil-native-submission-ancestry-policy@1.0.0'
type Submission = { txid: string; beefHex: string; verdict: string }

/** Called only after complete provider provenance and native permission reports
 * have been independently verified. Earlier valid grants can be ancestors of
 * later spends; their target may not be replayed outside the grant window. */
export async function verifyFinalPermissionSubmissionAncestry(binding: {
  profile?: 'ITCVE-1@4.3.0' | 'ITCVE-1@4.4.0'
  globalSubmissions: Submission[]; finalSubmissions: Submission[]
  permissionReport: any; coverageReport: any; identity: string
  storageTransactions: Map<string, Transaction>; resolvedTransactions: Map<string, Transaction>
  trustedMinedRoot: { txid: string; rawHex: string }
  readEvidence(name: string): Buffer
}) {
  const { globalSubmissions: global, finalSubmissions: final, permissionReport: permission, coverageReport: coverage } = binding
  assert.deepEqual(final.slice(0, global.length), global, 'Final ancestry ledger differs from the verified global prefix')
  assert.equal(permission.identity, binding.identity); assert.equal(coverage.identity, binding.identity)
  if (binding.profile !== undefined) assert.ok(['ITCVE-1@4.3.0', 'ITCVE-1@4.4.0'].includes(binding.profile))
  assert.equal(coverage.oracle, binding.profile ? 'tpnil-native-permission-coverage-oracle@5.0.0' : 'tpnil-native-permission-coverage-oracle@3.0.0')
  for (const report of [permission, coverage]) {
    const window = report.submissionWindow
    assert.ok(Number.isSafeInteger(window.startIndex) && window.startIndex >= 0 && Number.isSafeInteger(window.endIndex) && window.endIndex >= window.startIndex && window.endIndex <= global.length)
    assert.equal(report.submissions.length, window.endIndex)
    assert.deepEqual(report.submissions, global.slice(0, window.endIndex))
  }
  const script = new P2PKH().lock(PrivateKey.fromHex(lifecyclePermissionConfig.paymentRecipientKeyHex).toPublicKey().toAddress()).toHex()
  assert.equal(permission.paymentScript, script)
  const grant = permission.steps.find((step: any) => step.id === 'spending-allow')
  const rows = permission.transactions.filter((row: any) => row.role === 'spending-allow')
  let approved: Transaction | undefined
  if (rows.length === 1 && grant?.outcome.status === 'fulfilled') {
    const assertions = await evaluateNativePermissionLifecycle(permission, binding.readEvidence, binding.identity)
    assert.equal(assertions.find(row => row.id === 'permission-lifecycle.spending-grant')?.result, 'PASS')
    approved = Transaction.fromAtomicBEEF(rows[0].atomicBeef)
    assert.equal(approved.id('hex'), rows[0].txid); assert.equal(approved.id('hex'), grant.outcome.value.txid)
    assert.equal(binding.storageTransactions.get(approved.id('hex'))?.toHex(), approved.toHex())
    assert.ok(Number.isSafeInteger(grant.submissionStart) && Number.isSafeInteger(grant.submissionEnd) && grant.submissionStart >= permission.submissionWindow.startIndex && grant.submissionEnd > grant.submissionStart && grant.submissionEnd <= permission.submissionWindow.endIndex)
    assert.ok(global.slice(grant.submissionStart, grant.submissionEnd).some(row => row.txid === approved!.id('hex') && observedSubmissionTransactions(row, { resolvedTransactions: binding.resolvedTransactions, requireResolvedAncestors: true, trustedMinedRoot: binding.trustedMinedRoot })[0]!.transaction.toHex() === approved!.toHex()), 'Approved ancestor has no original grant submission')
  }
  const deniedCoverage = ['overflow', 'alternate', 'revoked', 'revokedRestart'].map(key => permissionCoverageConfig.paymentAmounts[key])
  let transactionsChecked = 0, ancestorsChecked = 0
  for (let index = Math.min(permission.submissionWindow.startIndex, coverage.submissionWindow.startIndex); index < final.length; index++) {
    for (const observed of observedSubmissionTransactions(final[index]!, { resolvedTransactions: binding.resolvedTransactions, requireResolvedAncestors: true, trustedMinedRoot: binding.trustedMinedRoot })) {
      const tx = observed.transaction
      transactionsChecked++; if (!observed.isTarget) ancestorsChecked++
      if (index >= permission.submissionWindow.startIndex && tx.outputs.some(output => [lifecyclePermissionConfig.paymentSatoshis, lifecyclePermissionConfig.secondPaymentSatoshis].includes(output.satoshis as 5 | 7) && output.lockingScript.toHex() === script)) {
        assert.ok(approved && tx.id('hex') === approved.id('hex') && tx.toHex() === approved.toHex() && (!observed.isTarget || index >= grant.submissionStart && index < grant.submissionEnd), 'Unapproved denied payment appears in final submission ancestry')
      }
      if (index >= coverage.submissionWindow.startIndex) {
        assert.ok(!tx.outputs.some(output => deniedCoverage.includes(output.satoshis) && output.lockingScript.toHex() === coveragePaymentScript), 'Denied coverage payment appears in final submission ancestry')
      }
    }
  }
  return { verified: true as const, policy: finalSubmissionAncestryPolicy, finalCount: final.length, transactionsChecked, ancestorsChecked, approvedAncestor: approved?.id('hex') ?? null }
}
