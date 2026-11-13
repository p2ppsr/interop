import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import type { CoveragePermissionCall } from './permission-coverage-observer.js'
export const certificateCoveragePolicyPath = 'programs/ISI-4/profiles/native-coverage-certificates-1.0.0/policy.json'
const bytes = fs.readFileSync(path.resolve(import.meta.dirname, '../../../..', certificateCoveragePolicyPath))
export const certificateCoveragePolicy = JSON.parse(bytes.toString())
export const certificateCoveragePolicySha256 = createHash('sha256').update(bytes).digest('hex')
export const certificateCoverageIds: string[] = certificateCoveragePolicy.assertions.map((id: string) => `coverage-certificates.${id}`)
export const certificateCoverageConfig = {
  issuerKeys: ['81'.repeat(32), '82'.repeat(32)], transportKey: '83'.repeat(32),
  type: Buffer.alloc(32, 171).toString('base64'), issuanceType: Buffer.alloc(32, 172).toString('base64'),
  serials: [173, 174].map(value => Buffer.alloc(32, value).toString('base64')),
  fields: { name: 'TPNIL additional certificate identity', private: 'Unrevealed certificate coverage field' },
  absentName: 'TPNIL absent certificate coverage identity', issuerUrl: 'https://certifier.itcve.test/certificate-coverage',
  origins: ['https://certificate-identity.itcve.test', 'https://certificate-attribute.itcve.test'],
  basket: 'tpnil certificate coverage revocation', script: '7551', satoshis: 7,
  anyone: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'
} as const
export type CertificateCoverageOutcome = { id: string; result: 'PASS' | 'FAIL' | 'BLOCKED'; detail: string }
export interface CertificateCoverageCall { id: string; method: string; args: any; result?: any; error?: any; startedAt: string; endedAt: string; submissionStart: number; submissionEnd: number; routeStart: number; routeEnd: number }
export interface CertificateCoverageSubmission { txid: string; beefHex: string; verdict: string }
export interface CertificateCoverageReport {
  schema: 'tpnil-native-coverage-certificates@1.0.0'; oracle: string; policySha256: string;
  claim: 'ENGINEERING_OBSERVATION_ONLY'; completeBRC100Conformance: false; finalLedgerRequired: true;
  identity: string; trace: CertificateCoverageCall[]; fixtures: any[]; publicCertificates: any[]; issuer: any[];
  publication?: any; lookup: Array<{ callId: string; question: any; answer: any }>;
  lookupMode: string; lookupClosed: boolean; routeClosed: boolean; restart?: any; settings: any;
  permissionSteps: CoveragePermissionCall[]; extensionId?: string; errors: string[];
  submissionStart: number; submissionEnd: number; submissionPrefix: CertificateCoverageSubmission[]; submissions: CertificateCoverageSubmission[];
  routeStart: number; routeEnd: number; routes: any[]; assertions: CertificateCoverageOutcome[]; result: 'PASS' | 'FAIL' | 'BLOCKED'
}
