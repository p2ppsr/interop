import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

export const certificateStatePolicyPath = 'programs/ISI-4/profiles/native-conformance-5.0.0/certificate-states-1.0.0.json'
const bytes = fs.readFileSync(path.resolve(import.meta.dirname, '../../../..', certificateStatePolicyPath))
export const certificateStatePolicy = JSON.parse(bytes.toString())
export const certificateStatePolicySha256 = createHash('sha256').update(bytes).digest('hex')
export const certificateStateConfig = {
  issuerKeys: ['78'.repeat(32), '79'.repeat(32)], verifierKey: '7a'.repeat(32), otherSubjectKey: '7b'.repeat(32),
  types: [Buffer.alloc(32, 141).toString('base64'), Buffer.alloc(32, 142).toString('base64')],
  serials: [201, 202, 203, 204].map(value => Buffer.alloc(32, value).toString('base64')),
  fields: { name: 'TPNIL certificate state identity', private: 'Undisclosed certificate state field' },
  issuerUrl: 'https://certifier.itcve.test/certificate-state'
} as const
export const certificateStateIds = [
  'fixture-authentication', 'fixture-acquisition', 'acquire-tampered-field', 'acquire-wrong-subject',
  'direct-extra-url', 'issuance-direct-fields', 'proof-control', 'proof-tuple-mismatches',
  'inventory-issuer', 'inventory-type', 'inventory-combined', 'inventory-empty', 'inventory-no-match', 'cleanup'
].map(id => `certificate-states.${id}`)
export const certificateStateCallIds = [
  'baseline', 'tampered-field', 'after-tampered', 'wrong-subject', 'after-wrong-subject',
  'acquire-a', 'direct-extra-url', 'acquire-c', 'after-acquisition', 'proof-control',
  'proof-wrong-certifier', 'proof-wrong-serial', 'proof-wrong-subject', 'proof-wrong-signature', 'after-proof',
  'issuance-direct-fields', 'after-issuance', 'filter-issuer', 'filter-type', 'filter-combined', 'filter-empty', 'filter-no-match',
  'cleanup-a', 'cleanup-b', 'cleanup-c', 'after-cleanup'
] as const
export interface CertificateStateCall { id: string; method: string; args: any; result?: any; error?: any; submissionStart: number; submissionEnd: number; httpStart: number; httpEnd: number; routeStart: number; routeEnd: number }
export interface CertificateStateReport {
  schema: 'tpnil-native-certificate-states@1.0.0'; oracle: string; policySha256: string; claim: 'ENGINEERING_OBSERVATION_ONLY'; identity: string;
  boundaryAnchor: { txid: string; atomicBeef: number[]; outputIndex: 1 } | null;
  fixtures: any[]; trace: CertificateStateCall[]; errors: string[];
  httpRequests: Array<{ method: string; path: string }>; route: { host: string; registered: boolean; unregistered: boolean };
  routeStart: number; routeEnd: number; routes: Array<{ sequence: number; method: string; host: string; pathname: string; disposition: string; status?: number }>;
  submissionPrefix: Array<{ txid: string; beefHex: string; verdict: string }>; submissions: Array<{ txid: string; beefHex: string; verdict: string }>;
  submissionStart: number; submissionEnd: number;
  assertions: Array<{ id: string; result: 'PASS' | 'FAIL' | 'BLOCKED'; detail: string }>;
  result: 'PASS' | 'FAIL' | 'BLOCKED'; completeBRC100Conformance: false;
}
