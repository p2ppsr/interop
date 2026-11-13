import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const policyBytes = fs.readFileSync(path.resolve(import.meta.dirname, '../../../../programs/ISI-4/profiles/native-conformance-5.0.0/conditional-oracle-1.0.0.json'))
export const conditionalPolicy = JSON.parse(policyBytes.toString())
export const conditionalPolicySha256 = createHash('sha256').update(policyBytes).digest('hex')
const revision2Bytes = fs.readFileSync(path.resolve(import.meta.dirname, '../../../../programs/ISI-4/profiles/native-conformance-5.0.0/conditional-oracle-2.0.0.json'))
export function conditionalPolicySelection(revision: 1 | 2 = 1) {
  if (revision !== 1 && revision !== 2) throw new Error(`Unsupported conditional fixture revision ${revision}`)
  const policy = revision === 1 ? conditionalPolicy : JSON.parse(revision2Bytes.toString())
  return { revision, policy, oracle: policy.oracle as 'tpnil-native-conditional-oracle@1.0.0' | 'tpnil-native-conditional-oracle@2.0.0', policySha256: revision === 1 ? conditionalPolicySha256 : createHash('sha256').update(revision2Bytes).digest('hex') }
}
export const conditionalConfig = {
  basket: 'tpnil conditional population', label: 'tpnil conditional population',
  population: 11, satoshis: 2, lockingScript: '7551',
  certificateType: Buffer.alloc(32, 71).toString('base64'),
  issuanceType: Buffer.alloc(32, 72).toString('base64'),
  fields: { name: 'TPNIL conditional identity', private: 'Unrevealed conditional field' },
  revealerKeyHex: '74'.repeat(32), verifierKeyHex: '69'.repeat(32), alternateVerifierKeyHex: '70'.repeat(32),
  issuerOrigin: 'https://certifier.itcve.test'
} as const
export interface ConditionalCall { id: string; method: string; args: any; result?: any; error?: any; submissionStart: number; submissionEnd: number }
export interface ConditionalReport {
  schema: 'tpnil-native-conditional@1.0.0'; oracle: ReturnType<typeof conditionalPolicySelection>['oracle']
  claim: 'ENGINEERING_OBSERVATION_ONLY'; policySha256: string; identity: string
  trace: ConditionalCall[]; certificates: any[]; issuer: any; errors: string[]
  actionReferences?: Array<{ txid: string; reference: string }>
  transactions: Array<{ role: string; txid: string; atomicBeef: number[] }>
  submissions: Array<{ index: number; txid: string; serializedHex: string; verdict: string }>
  assertions: Array<{ id: string; result: 'PASS' | 'FAIL' | 'BLOCKED'; detail: string }>
  remainingCoverage: typeof conditionalPolicy.remainingCoverage
  completeBRC100Conformance: false; result: 'PASS' | 'FAIL' | 'BLOCKED'
}
export function conditionalBasket(bytes: number, unicode = false): string {
  const suffix = unicode ? 'é' : ''
  return 'tpnil' + 'a'.repeat(bytes - 5 - Buffer.byteLength(suffix)) + suffix
}

/** Frozen public requests; predicates independently decode the populated ledger. */
export const conditionalQueryCases: Record<string, { method: string; args: any }> = {
  'outputs-any-default': { method: 'listOutputs', args: { basket: conditionalConfig.basket, tags: ['row0', 'row1'], limit: 10000 } },
  'outputs-empty-tags': { method: 'listOutputs', args: { basket: conditionalConfig.basket, tags: [], limit: 10000 } },
  'outputs-no-match': { method: 'listOutputs', args: { basket: conditionalConfig.basket, tags: ['absent conditional tag'], limit: 10000 } },
  'outputs-limit1': { method: 'listOutputs', args: { basket: conditionalConfig.basket, limit: 1 } },
  'outputs-offset1': { method: 'listOutputs', args: { basket: conditionalConfig.basket, offset: 1, limit: 1 } },
  'outputs-minus2': { method: 'listOutputs', args: { basket: conditionalConfig.basket, offset: -2, limit: 1 } },
  'outputs-max-limit': { method: 'listOutputs', args: { basket: conditionalConfig.basket, limit: 10000 } },
  ...Object.fromEntries(['locking scripts', 'includeTags', 'includeLabels', 'includeCustomInstructions'].map(flag => [`outputs-only-${flag.replaceAll(' ', '-')}`, { method: 'listOutputs', args: { basket: conditionalConfig.basket, limit: 10000, ...(flag === 'locking scripts' ? { include: flag } : { [flag]: true }) } }])),
  'actions-any-default': { method: 'listActions', args: { labels: ['tpnil conditional even', 'tpnil conditional odd'], limit: 10000 } },
  'actions-empty-labels': { method: 'listActions', args: { labels: [], limit: 10000 } },
  'actions-no-match': { method: 'listActions', args: { labels: ['absent conditional label'], limit: 10000 } },
  'actions-overlap': { method: 'listActions', args: { labels: [conditionalConfig.label, 'tpnil conditional even'], labelQueryMode: 'any', limit: 10000 } },
  'actions-limit1': { method: 'listActions', args: { labels: [conditionalConfig.label], limit: 1 } },
  'actions-offset1': { method: 'listActions', args: { labels: [conditionalConfig.label], offset: 1, limit: 1 } },
  'actions-max-limit': { method: 'listActions', args: { labels: [conditionalConfig.label], limit: 10000 } },
  ...Object.fromEntries(['includeLabels', 'includeInputs', 'includeInputSourceLockingScripts', 'includeInputUnlockingScripts', 'includeOutputs', 'includeOutputLockingScripts'].map(flag => [`actions-only-${flag}`, { method: 'listActions', args: { labels: [conditionalConfig.label], limit: 10000, [flag]: true, ...(flag.startsWith('includeInput') && flag !== 'includeInputs' ? { includeInputs: true } : {}), ...(flag === 'includeOutputLockingScripts' ? { includeOutputs: true } : {}) } }])),
  'actions-scripts-without-parents': { method: 'listActions', args: { labels: [conditionalConfig.label], limit: 10000, includeInputSourceLockingScripts: true, includeInputUnlockingScripts: true, includeOutputLockingScripts: true } }
}
