// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { P2PKH, PrivateKey } from '@bsv/sdk'
import type { NativeBrowserRestartReceipt } from '../yours-driver.js'
import type { CoveragePermissionCall } from './permission-coverage-observer.js'
import type { PermissionClickReceipt } from './permission-click.js'

const bytes = fs.readFileSync(path.resolve(import.meta.dirname, '../../../../programs/ISI-4/profiles/native-conformance-5.0.0/permission-coverage-1.0.0.json'))
export const permissionCoveragePolicy = JSON.parse(bytes.toString())
export const permissionCoveragePolicySha256 = createHash('sha256').update(bytes).digest('hex')
export const permissionCoverageOracle = 'tpnil-native-permission-coverage-oracle@1.0.0' as const
const revision2Bytes = fs.readFileSync(path.resolve(import.meta.dirname, '../../../../programs/ISI-4/profiles/native-conformance-5.0.0/permission-coverage-2.0.0.json'))
const revision3Bytes = fs.readFileSync(path.resolve(import.meta.dirname, '../../../../programs/ISI-4/profiles/native-conformance-5.0.0/permission-coverage-3.0.0.json'))
export function permissionCoverageSelection(revision: 1 | 2 | 3 = 1) {
  if (revision !== 1 && revision !== 2 && revision !== 3) throw new Error(`Unsupported permission coverage revision ${revision}`)
  const selectedBytes = revision === 1 ? bytes : revision === 2 ? revision2Bytes : revision3Bytes
  const policy = revision === 1 ? permissionCoveragePolicy : JSON.parse(selectedBytes.toString())
  return { revision, oracle: policy.oracle as 'tpnil-native-permission-coverage-oracle@1.0.0' | 'tpnil-native-permission-coverage-oracle@2.0.0' | 'tpnil-native-permission-coverage-oracle@3.0.0', policy, config: policy.configuration, policySha256: createHash('sha256').update(selectedBytes).digest('hex'), assertionIds: policy.assertionSuffixes.map((id: string) => `permission-coverage.${id}`) as string[], stepOrder: revision === 3 ? coverageStepOrder.flatMap(id => id === 'allowance-second' ? [id, 'allowance-third'] : [id]) : coverageStepOrder }
}
export const permissionCoverageCategories = ['protocol', 'basket', 'certificate', 'counterparty-linkage', 'specific-linkage'] as const
export type PermissionCoverageCategory = typeof permissionCoverageCategories[number]
export const permissionCoverageConfig = permissionCoveragePolicy.configuration
export const coverageConfig = permissionCoverageConfig
export const permissionCoverageAssertionIds: string[] = permissionCoveragePolicy.assertionSuffixes.map((id: string) => `permission-coverage.${id}`)
export const coverageCertificateType = Buffer.alloc(32, permissionCoverageConfig.certificateTypeByte).toString('base64')
export const coverageCertificateSerial = Buffer.alloc(32, permissionCoverageConfig.certificateSerialByte).toString('base64')
export const coveragePeer = PrivateKey.fromHex(permissionCoverageConfig.peerKeyHex).toPublicKey().toString()
export const coverageVerifier = PrivateKey.fromHex(permissionCoverageConfig.verifierKeyHex).toPublicKey().toString()
export const coveragePaymentScript = new P2PKH().lock(PrivateKey.fromHex(permissionCoverageConfig.paymentRecipientKeyHex).toPublicKey().toAddress()).toHex()
export const coverageManifest = {
  name: 'TPNIL isolated permission coverage',
  metanet: { groupPermissions: {
    description: 'Native permission persistence and bounded standing allowance fixture',
    protocolPermissions: [{ protocolID: permissionCoverageConfig.protocol, counterparty: coveragePeer, description: 'Coverage protocol access' }],
    basketAccess: [{ basket: permissionCoverageConfig.basket, description: 'Coverage basket access' }],
    certificateAccess: [{ type: coverageCertificateType, verifierPublicKey: coverageVerifier, fields: ['name'], description: 'Coverage selective certificate proof' }],
    spendingAuthorization: { amount: permissionCoverageConfig.allowanceSatoshis, description: 'A cumulative monthly allowance of 100 fixture satoshis' }
  } }
}
export const coverageStepOrder = [
  'identity', 'setup-basket', 'setup-certificate',
  ...permissionCoverageCategories.flatMap(id => [`${id}-grant`, `${id}-cached`, `${id}-alternate-deny`]),
  'manifest-grant', 'manifest-protocol', 'manifest-basket', 'manifest-certificate', 'allowance-first',
  ...permissionCoverageCategories.map(id => `${id}-restart`),
  'allowance-second', 'allowance-overflow', 'allowance-alternate',
  ...permissionCoverageCategories.map(id => `${id}-revoked`), 'allowance-revoked',
  ...permissionCoverageCategories.map(id => `${id}-revoked-restart`), 'allowance-revoked-restart'
]
export function coverageCategoryCall(category: PermissionCoverageCategory, certificate?: any) {
  const c = permissionCoverageConfig
  if (category === 'protocol') return { method: 'getPublicKey', args: { protocolID: c.protocol, keyID: c.keyID, counterparty: coveragePeer, forSelf: true, seekPermission: true } }
  if (category === 'basket') return { method: 'listOutputs', args: { basket: c.basket, include: 'entire transactions', includeTags: true, includeCustomInstructions: true } }
  if (category === 'certificate') return { method: 'proveCertificate', args: { certificate, fieldsToReveal: ['name'], verifier: coverageVerifier } }
  if (category === 'counterparty-linkage') return { method: 'revealCounterpartyKeyLinkage', args: { counterparty: coveragePeer, verifier: coverageVerifier } }
  return { method: 'revealSpecificKeyLinkage', args: { counterparty: coveragePeer, verifier: coverageVerifier, protocolID: c.linkageProtocol, keyID: c.linkageKeyID } }
}
export function coveragePaymentArgs(kind: 'first' | 'second' | 'third' | 'overflow' | 'alternate' | 'revoked' | 'revokedRestart', revision: 1 | 2 | 3 = 1) {
  const config = permissionCoverageSelection(revision).config
  if (kind === 'third' && revision !== 3) throw new Error('The third allowance payment requires permission coverage revision3')
  return { description: `TPNIL coverage allowance ${kind}`, outputs: [{ satoshis: config.paymentAmounts[kind], lockingScript: coveragePaymentScript, outputDescription: 'Native coverage allowance recipient' }], options: { randomizeOutputs: false, acceptDelayedBroadcast: false } }
}
export type CoverageScreenshot = { name: string; sha256: string; size: number }
export type CoverageStep = CoveragePermissionCall & { submissionStart: number; submissionEnd: number }
export interface CoverageRevocation {
  id: string; origin: string; pageUrl: string; requestNonce: string; startedAt: string; endedAt: string
  beforeBody: string; cardBody: string; confirmationBody: string; afterBody: string; afterOriginCardCount: number
  revoke: PermissionClickReceipt; confirm: PermissionClickReceipt
  before: CoverageScreenshot; confirmation: CoverageScreenshot; after: CoverageScreenshot
}
export interface NativePermissionCoverageReport {
  schema: 'tpnil-native-permission-coverage@1.0.0'; oracle: ReturnType<typeof permissionCoverageSelection>['oracle']; policySha256: string
  claim: 'ENGINEERING_OBSERVATION_ONLY'; identity: string; extensionId: string; startedAt: string; endedAt: string
  steps: CoverageStep[]; restarts: NativeBrowserRestartReceipt[]; revocations: CoverageRevocation[]
  certificate?: any; certificateMasterKeyring?: Record<string, string>; setupOutpoint?: string
  manifest: { value: typeof coverageManifest; sha256: string; requests: Array<{ method: string; path: string; servedAt: string; responseSha256: string }> }
  transactions: Array<{ role: string; txid: string; atomicBeef: number[] }>
  submissions: Array<{ txid: string; verdict: string; beefHex: string }>
  submissionWindow: { startIndex: number; endIndex: number }
  errors: string[]; cleanup: { pagesClosed: boolean; settingsClosed: boolean; routeUnregistered: boolean }
  assertions: Array<{ id: string; result: 'PASS' | 'FAIL'; detail: string }>; result: 'PASS' | 'FAIL'
  remainingCoverage: typeof permissionCoveragePolicy.remainingCoverage; completeBRC100Conformance: false
}
