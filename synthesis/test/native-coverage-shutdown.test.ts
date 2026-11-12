import { LockingScript, Transaction } from '@bsv/sdk'
import { expect, it } from 'vitest'
import { coveragePaymentScript } from '../src/wallet-lab/native/conformance-permission-coverage-model.js'
import { verifyCoverageDeniedPaymentsThroughShutdown } from '../src/wallet-lab/native/verify-shutdown-submissions.js'

const receipt = (satoshis: number, verdict = 'ACCEPTED_BY_NETWORK', script = coveragePaymentScript) => {
  const tx = new Transaction(1, [], [{ lockingScript: LockingScript.fromHex(script), satoshis }], 0)
  return { txid: tx.id('hex'), verdict, beefHex: tx.toHex() }
}
const prefix = [receipt(53), receipt(31), receipt(37)]
const module = { submissions: prefix, submissionWindow: { startIndex: 1, endIndex: 3 } }

it('keeps prior transactions and distinct approved allowance amounts outside the denied markers', () => {
  expect(verifyCoverageDeniedPaymentsThroughShutdown(module, prefix, [...prefix, receipt(53, 'ACCEPTED_BY_NETWORK', '51')])).toMatchObject({ verified: true, checked: 3, deniedAmounts: [53, 59, 61, 67] })
})

it.each(['ACCEPTED_BY_NETWORK', 'REJECTED', 'UNKNOWN'])('rejects each late denied coverage payment regardless of verdict: %s', verdict => {
  for (const amount of [53, 59, 61, 67]) expect(() => verifyCoverageDeniedPaymentsThroughShutdown(module, prefix, [...prefix, receipt(amount, verdict)])).toThrow('Denied coverage payment')
})

it('rejects clipped or rebound global prefixes and out-of-range module windows', () => {
  for (const candidate of [
    { ...module, submissions: prefix.slice(1) },
    { ...module, submissionWindow: { startIndex: -1, endIndex: 3 } },
    { ...module, submissionWindow: { startIndex: 1, endIndex: 4 } }
  ]) expect(() => verifyCoverageDeniedPaymentsThroughShutdown(candidate, prefix, prefix)).toThrow()
  expect(() => verifyCoverageDeniedPaymentsThroughShutdown(module, prefix, [receipt(17), ...prefix.slice(1)])).toThrow()
  expect(() => verifyCoverageDeniedPaymentsThroughShutdown(module, prefix, [...prefix, { ...receipt(17), txid: '00'.repeat(32) }])).toThrow('Final submission identity')
})
