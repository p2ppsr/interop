import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
export const transactionCoveragePolicyPath = 'programs/ISI-4/profiles/native-coverage-transactions-1.0.0/policy.json'
export const transactionCoverageIds = [
  'transaction.defaults/acceptDelayedBroadcast-omitted-true', 'transaction.signing-branches/foreign-reference-reject',
  ...['unknown-not-in-knownTxids', 'conflicting-proof', 'wrong-merkle-root'].map(x => `transaction.proof-trust/${x}`),
  ...['two-dependent-held', 'sign-sendWith', 'unknown-batch-txid'].map(x => `transaction.batch-send/${x}`),
  ...['valid-subset', 'foreign-output', 'already-spent', 'out-of-range', 'noSend-false'].map(x => `transaction.nosend-change/${x}`),
  ...['wallet-payment', 'basket-insertion', 'both-output-types', 'missing-paymentRemittance', 'missing-insertionRemittance', 'conflicting-remittance', 'wrong-derivation', 'output-index-out-of-range', 'relinquish-without-spend'].map(x => `transaction.internalization/${x}`)
]
export type TransactionCoverageRevision = 1 | 2 | 3
export const transactionCoveragePolicyPathForRevision = (revision: TransactionCoverageRevision = 1) => { assert.ok(revision === 1 || revision === 2 || revision === 3, 'Unsupported transaction coverage revision'); return revision === 1 ? transactionCoveragePolicyPath : `programs/ISI-4/profiles/native-coverage-transactions-${revision}.0.0/policy.json` }
export function getTransactionCoveragePolicy(revision: TransactionCoverageRevision = 1) {
  const bytes = fs.readFileSync(path.resolve(import.meta.dirname, '../../../..', transactionCoveragePolicyPathForRevision(revision))), policy = JSON.parse(bytes.toString())
  assert.equal(policy.oracle, `tpnil-native-coverage-transactions-oracle@${revision}.0.0`); assert.deepEqual(policy.variantIds, transactionCoverageIds)
  return { policy, policySha256: createHash('sha256').update(bytes).digest('hex') }
}
export const tc = { label: 'tpnil transaction extension', basket: 'tpnil transaction extension outputs', sources: 'tpnil transaction extension sources', funderKey: '77'.repeat(32), sourceScript: '7551', sourceCount: 12, sourceSatoshis: 100, prefix: Buffer.from('tpnil transaction extension').toString('base64'), suffix: Buffer.from('payment').toString('base64') }
export interface TransactionCoverageCall { id: string; actor: 'wallet' | 'funder'; method: string; args: any; result?: any; error?: any; submissionStart: number; submissionEnd: number }
export interface TransactionCoverageSubmission { txid: string; beefHex: string; verdict: string }
export interface TransactionCoverageOutcome { id: string; result: 'PASS' | 'FAIL' | 'BLOCKED'; detail: string }
export interface TransactionCoverageReport { schema: string; oracle: string; policySha256: string; claim: 'ENGINEERING_OBSERVATION_ONLY'; completeBRC100Conformance: false; identity: string; trace: TransactionCoverageCall[]; skipped: Array<{ id: string; dependency: string }>; submissionStart: number; submissionEnd: number; submissionPrefix: TransactionCoverageSubmission[]; submissions: TransactionCoverageSubmission[]; storageTransactions: Array<{ txid: string; rawTxHex: string }>; assertions: TransactionCoverageOutcome[]; result: 'PASS' | 'FAIL' | 'BLOCKED'; finalLedgerRequired: true }
export type TransactionCoverageExecute = (id: string, actor: TransactionCoverageCall['actor'], method: string, args: any) => Promise<TransactionCoverageCall>
