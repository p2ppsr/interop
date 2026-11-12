import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
export const transactionStatePolicyPath = 'programs/ISI-4/profiles/native-conformance-5.0.0/transaction-states-1.0.0.json'
const bytes = fs.readFileSync(path.resolve(import.meta.dirname, '../../../..', transactionStatePolicyPath))
export const transactionStatePolicy = JSON.parse(bytes.toString())
export const transactionStatePolicySha256 = createHash('sha256').update(bytes).digest('hex')
export const stateConfig = { basket: 'tpnil transaction state sources', resultBasket: 'tpnil transaction state results', label: 'tpnil transaction state actions', sourceCount: 16, sourceSatoshis: 100, lockingScript: '7551' } as const
export const stateCaseIds = [
  'transaction.defaults.noSend-omitted-false', 'transaction.defaults.randomizeOutputs-omitted-true',
  'transaction.defaults.version-default', 'transaction.defaults.lockTime-default', 'transaction.defaults.sequenceNumber-default',
  'transaction.signing-branches.all-unlockingScripts', 'transaction.signing-branches.mixed-inputs', 'transaction.signing-branches.abort-then-sign-reject',
  'transaction.consuming-conflicts.input-absent-from-beef', 'transaction.consuming-conflicts.input-index-out-of-range',
  'transaction.consuming-conflicts.already-spent-input', 'transaction.consuming-conflicts.script-and-length-conflict',
  'transaction.consuming-conflicts.missing-script-and-length', 'transaction.consuming-conflicts.spend-index-not-in-reference',
  'transaction.consuming-conflicts.script-length-mismatch', 'transaction.batch-send.returnTXIDOnly',
  'transaction.proof-trust.truncated-proof', 'transaction.proof-trust.unknown-without-trust'
] as const
export interface StateCall { id: string; method: string; args: any; result?: any; error?: any; submissionStart: number; submissionEnd: number }
export interface StateReport { schema: string; oracle: string; claim: string; policySha256: string; identity: string;
  trace: StateCall[]; skipped: Array<{ id: string; dependency: string }>; errors: string[];
  submissionStart: number; submissionEnd: number; submissions: Array<{ index: number; txid: string; serializedHex: string; verdict: string }>;
  storageTransactions: Array<{ txid: string; rawTxHex: string }>;
  assertions: Array<{ id: string; result: 'PASS' | 'FAIL' | 'BLOCKED'; detail: string }>; result: 'PASS' | 'FAIL' | 'BLOCKED'; completeBRC100Conformance: false }
export const fanoutArgs = () => ({ description: 'TPNIL transaction state fanout', labels: [stateConfig.label], outputs: Array.from({ length: stateConfig.sourceCount }, (_, i) => ({ satoshis: stateConfig.sourceSatoshis, lockingScript: stateConfig.lockingScript, outputDescription: `TPNIL state source ${i}`, basket: stateConfig.basket, tags: [`state source ${i}`] })), options: { randomizeOutputs: false, acceptDelayedBroadcast: false } })
