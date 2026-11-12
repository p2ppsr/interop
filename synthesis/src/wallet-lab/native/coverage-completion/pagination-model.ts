// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto'
export const schema = 'tpnil-native-pagination@1.0.0' as const
export const bounds = { certificates: 11, queryCalls: 27, publicCalls: 160, uniqueSignedTransactions: 3, maximumActualFees: 10000, restarts: 0 } as const
export const methods = ['listCertificates', 'discoverByIdentityKey', 'discoverByAttributes'] as const
export const variants = [
  ['default-limit10', {}], ['limit1', { limit: 1 }], ['offset0', { limit: 10, offset: 0 }],
  ['offset1', { limit: 10, offset: 1 }], ['last-page', { limit: 10, offset: 10 }],
  ['beyond-end', { limit: 10, offset: 20 }], ['max-limit10000', { limit: 10000 }],
  ['union-first', { limit: 6, offset: 0 }], ['union-last', { limit: 6, offset: 6 }]
] as const
export const issuerKey = '8c'.repeat(32)
export const anyone = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'
export const trust = { name: 'TPNIL pagination issuer', description: 'Temporary pagination fixture issuer', trust: 4 }
export const hash = (s: string) => createHash('sha256').update(s).digest('hex')
export function fixtureConfig(nonce: string) {
  if (!/^[0-9a-f]{64}$/.test(nonce)) throw Error('Exact fresh32-byte run nonce required')
  return { type: Buffer.from(hash(`tpnil-pagination-type:${nonce}`), 'hex').toString('base64'), fields: { name: `TPNIL pagination ${nonce}`, private: 'Not publicly revealed' },
    serials: Array.from({ length: 11 }, (_, i) => Buffer.from(hash(`tpnil-pagination-serial:${nonce}:${i}`), 'hex').toString('base64')) }
}
export function queryProgram(identity: string, issuer: string, nonce: string) {
  const config = fixtureConfig(nonce)
  return methods.flatMap(method => variants.map(([variant, paging]) => ({ id: `${method}/${variant}`, method,
    args: { ...(method === 'listCertificates' ? { certifiers: [issuer], types: [config.type] } : method === 'discoverByIdentityKey' ? { identityKey: identity, seekPermission: true, forceRefresh: true } : { attributes: { name: config.fields.name }, seekPermission: true, forceRefresh: true }), ...paging } })))
}
export interface Call { id: string; method: string; args: any; result?: any; error?: any; start: number; end: number; submissionStart: number; submissionEnd: number }
export interface Report { schema: typeof schema; claim: 'ENGINEERING_OBSERVATION_ONLY'; mode: 'REFERENCE'|'LAB_SELF_TEST_ONLY'|'NATIVE_OBSERVATION'; nonce: string; identity: string; issuer: string; anchor: any; fixtures: any[]; publicCertificates: any[]; trace: Call[]; lookup: any[]; settings: any; publication: any; errors: string[]; lookupClosed: boolean; submissionStart: number; submissionEnd: number; submissions: any[]; completeBRC100Conformance: false }
