import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import type { NativeOutputSnapshotObservation } from '../native-output-snapshot.js'
export const coverageExtensionPolicyPath = 'programs/ISI-4/profiles/native-coverage-extension-1.0.0/policy.json'
const bytes = fs.readFileSync(path.resolve(import.meta.dirname, '../../../..', coverageExtensionPolicyPath))
export const coverageExtensionPolicy = JSON.parse(bytes.toString())
export const coverageExtensionPolicySha256 = createHash('sha256').update(bytes).digest('hex')
export const coverageExtensionOracle2 = 'tpnil-native-coverage-extension-oracle@2.0.0'
export function selectedCoverageExtensionPolicy(oracle: string) {
  if (oracle === coverageExtensionPolicy.oracle) return { policy: coverageExtensionPolicy, sha256: coverageExtensionPolicySha256, revision: 1 as const }
  assert.equal(oracle, coverageExtensionOracle2, 'Unknown coverage extension oracle')
  const bytes = fs.readFileSync(path.resolve(import.meta.dirname, '../../../../programs/ISI-4/profiles/native-coverage-extension-2.0.0/policy.json'))
  const policy = JSON.parse(bytes.toString()); assert.equal(policy.oracle, coverageExtensionOracle2)
  return { policy, sha256: createHash('sha256').update(bytes).digest('hex'), revision: 2 as const }
}
export const normalizedExtensionBasket = 'tpnil name'
export const extensionConfig = { protocolID: [0, 'tpnil coverage extension'] as [0, string], keyID: 'coverage extension 1', peerKey: '61'.repeat(32), verifierKey: '62'.repeat(32), label: 'tpnil-coverage-extension', sourceBasket: 'tpnil extension sources', validBasket: 'abcde', sourceSatoshis: 20, membershipSatoshis: 7, lockingScript: '7551', data: [...Buffer.from('TPNIL coverage extension cryptographic control')] }
export const privilegedMethods = ['getPublicKey', 'revealCounterpartyKeyLinkage', 'revealSpecificKeyLinkage', 'encrypt', 'decrypt', 'createHmac', 'verifyHmac', 'createSignature', 'verifySignature'] as const
export const reasonVariants = ['missing-reason', 'short-reason', 'overlong-reason'] as const
export const cryptoVariants = ['data-only', 'hash-only', 'neither-data-nor-hash', 'forSelf-false-default', 'forSelf-true', 'anyone-counterparty', 'identityKey-override'] as const
export const basketVariants = [{ id: 'bytes-0', value: '' }, { id: 'bytes-4', value: 'abcd' }, { id: 'bytes-5', value: 'abcde' }, { id: 'uppercase', value: 'TPNIL name' }, { id: 'double-space', value: 'tpnil  name' }, { id: 'trailing-basket', value: 'tpnil basket' }] as const
export const basketMethods = ['createAction', 'internalizeAction', 'listOutputs', 'relinquishOutput'] as const
export const coverageExtensionIds = [...cryptoVariants.map(id => `coverage-extension.crypto.${id}`), ...reasonVariants.flatMap(id => privilegedMethods.map(method => `coverage-extension.privileged.${id}.${method}`)), ...basketVariants.flatMap(({ id }) => basketMethods.map(method => `coverage-extension.basket.${id}.${method}`)), 'coverage-extension.discovery.identity-match', 'coverage-extension.discovery.attribute-match', 'coverage-extension.query.relinquished-excluded']
export type ExtensionOutcome = { id: string; result: 'PASS' | 'FAIL' | 'BLOCKED'; detail: string }
export interface ExtensionCall { id: string; actor: 'wallet' | 'funder'; method: string; args: any; result?: any; error?: any; submissionStart: number; submissionEnd: number; startedAt?: string; endedAt?: string }
export interface ExtensionSubmission { txid: string; beefHex: string; verdict: string }
export interface CoverageExtensionReport { schema: string; oracle: string; policySha256: string; claim: 'ENGINEERING_OBSERVATION_ONLY'; completeBRC100Conformance: false; identity: string; anchors: { boundary: any; clauses: any; trust?: any }; peerSignature: number[]; trace: ExtensionCall[]; outputSnapshotWindow?: { startIndex: number; endIndex: number }; outputSnapshots?: Array<{ callId: string; phase: 'before' | 'after'; observation: NativeOutputSnapshotObservation }>; errors: string[]; submissionStart: number; submissionEnd: number; submissionPrefix: ExtensionSubmission[]; submissions: ExtensionSubmission[]; storageTransactions: Array<{ txid: string; rawTxHex: string }>; assertions: ExtensionOutcome[]; result: 'PASS' | 'FAIL' | 'BLOCKED'; finalLedgerRequired: true }
export const extensionFixtureArgs = (actor: 'wallet' | 'funder', revision: 1 | 2 = 1) => ({ description: `TPNIL coverage ${actor} fixture`, labels: [extensionConfig.label], outputs: Array.from({ length: actor === 'wallet' ? 12 : 6 }, (_, index) => ({ satoshis: actor === 'wallet' && index < 6 ? extensionConfig.sourceSatoshis : extensionConfig.membershipSatoshis, lockingScript: extensionConfig.lockingScript, outputDescription: `TPNIL coverage ${actor} output ${index}`, ...(actor === 'wallet' ? { basket: index < 6 ? extensionConfig.sourceBasket : revision === 2 && index === 9 ? normalizedExtensionBasket : extensionConfig.validBasket, tags: [`coverage ${index}`], customInstructions: `coverage:${index}` } : {}) })), options: { randomizeOutputs: false, acceptDelayedBroadcast: false } })
