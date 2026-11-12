// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { P2PKH, PrivateKey } from '@bsv/sdk'
import type { NativeBrowserRestartReceipt } from '../yours-driver.js'
import type { CoveragePermissionCall } from './coverage-permissions-observer.js'
import { coverageCategoryCall, coverageManifest, coveragePeer, coverageVerifier, permissionCoverageConfig } from './conformance-permission-coverage-model.js'
export const permissionExtensionPolicyPath = 'programs/ISI-4/profiles/native-coverage-permissions-1.0.0/policy.json'
export function permissionExtensionPolicy() {
  const bytes = fs.readFileSync(path.resolve(import.meta.dirname, '../../../../', permissionExtensionPolicyPath))
  return { ...JSON.parse(bytes.toString()), sha256: createHash('sha256').update(bytes).digest('hex') }
}
export const coveragePaymentScript = new P2PKH().lock(PrivateKey.fromHex('6'.padStart(64, '0')).toPublicKey().toAddress()).toHex()
export const extensionCategories = ['protocol', 'basket', 'certificate'] as const
export const linkageDimensions = ['verifier', 'counterparty', 'protocol', 'level2-key'] as const
export const alternateLinkagePeer = PrivateKey.fromHex('4'.padStart(64, '0')).toPublicKey().toString()
export const alternateLinkageVerifier = PrivateKey.fromHex('5'.padStart(64, '0')).toPublicKey().toString()
export { coverageCategoryCall, coverageManifest, coveragePeer, coverageVerifier, permissionCoverageConfig }
export function extensionLinkageArgs(dimension?: typeof linkageDimensions[number]) {
  const args = coverageCategoryCall('specific-linkage').args as any
  if (dimension === 'verifier') args.verifier = alternateLinkageVerifier
  if (dimension === 'counterparty') args.counterparty = alternateLinkagePeer
  if (dimension === 'protocol') args.protocolID = [2, 'tpnil extended linkage']
  if (dimension === 'level2-key') args.keyID = 'tpnil extended linkage key'
  return args
}
export function extensionPaymentArgs(role: string, amount: number, options: Record<string, unknown> = {}) {
  return { description: `TPNIL extended permission ${role}`, outputs: [{ satoshis: amount, lockingScript: coveragePaymentScript, outputDescription: `Extended permission recipient ${role}` }], options: { randomizeOutputs: false, acceptDelayedBroadcast: false, ...options } }
}
export interface ExtensionImage { name: string; sha256: string; size: number }
export interface ExtensionControl {
  id: string; nonce: string; url: string; startedAt: string; endedAt: string
  before: ExtensionImage; after: ExtensionImage; beforeBody: string; afterBody: string
  dispatch: null | { nonce: string; url: string; text: string; parentText: string; tag: string; body: string; type: string; isTrusted: boolean; visible: boolean; disabled: boolean; button: number; eventPhase: number; dispatchedAt: string; receivedAt: string; expectedPage: boolean; expectedMainFrame: boolean }
  automation: { status: 'fulfilled' | 'rejected'; message?: string }
}
export interface ExtensionSettings {
  id: string; origin: string; pageUrl: string; at: string; body: string; cardBody: string; image: ExtensionImage
}
export type ExtensionStep = CoveragePermissionCall & { submissionStart: number; submissionEnd: number }
export interface NativePermissionExtensionReport {
  schema: 'tpnil-native-permission-extension@1.0.0'; oracle: string; policySha256: string
  claim: 'ENGINEERING_OBSERVATION_ONLY'; completeBRC100Conformance: false; identity: string; extensionId: string
  startedAt: string; endedAt: string; anchorSha256: string; steps: ExtensionStep[]; ui: ExtensionControl[]
  settings: ExtensionSettings[]; restarts: NativeBrowserRestartReceipt[]
  lock: { sameContext: boolean; beforePageUrl: string; afterPageUrl: string; passwordVisible: boolean; passwordHiddenAfterUnlock: boolean }
  manifests: Array<{ origin: string; value: unknown; sha256: string; requests: Array<{ at: string; sha256: string }> }>
  storageTransactions: Array<{ txid: string; rawTxHex: string }>; submissions: Array<{ txid: string; verdict: string; beefHex: string }>; submissionWindow: { startIndex: number; endIndex: number }
  concurrent: { startedAt: string; endedAt: string }; references: Record<string, string>; errors: string[]
  cleanup: { pagesClosed: boolean; routesUnregistered: boolean; settingsClosed: boolean; rejectedVerdictRemoved?: boolean }
  assertions: Array<{ id: string; result: 'PASS' | 'FAIL' | 'BLOCKED'; detail: string }>; result: 'PASS' | 'FAIL' | 'BLOCKED'
}

export const permissionExtensionStepIds = [
  'identity', ...extensionCategories.flatMap(c => [`${c}-grant`, `${c}-cached`, `${c}-alternate-deny`]),
  'before-lock-auth', 'locked-auth', 'unlocked-auth', ...extensionCategories.flatMap(c => [`${c}-after-lock`, `${c}-after-lock-alternate-deny`]),
  ...extensionCategories.map(c => `${c}-after-single-revoke`), 'restart-identity', ...extensionCategories.map(c => `${c}-after-single-revoke-restart`),
  'linkage-grant', 'linkage-cached', ...linkageDimensions.flatMap(d => [`linkage-${d}-deny`, `linkage-${d}-control`]),
  'subset-grant', ...extensionCategories.map(c => `${c}-subset`), 'subset-spend-deny',
  'unchecked-grant', ...extensionCategories.map(c => `${c}-unchecked`), 'unchecked-spend-deny',
  'overcap-grant', 'overcap-deny', 'concurrent-grant', 'concurrent-a', 'concurrent-b',
  'abort-grant', 'abort-stage', 'abort-close', 'abort-recovery',
  'rejection-grant', 'rejection-create', 'rejection-recovery',
  'nosend-grant', 'nosend-stage', 'nosend-sign', 'nosend-close', 'nosend-recovery'
]

/** Exact strings rendered by the retained candidate's GroupedPermissionRequest
 * component, from this source-bound manifest. No unknown checkbox is a grant. */
export function permissionExtensionManifestLabels() {
  const p = coverageManifest.metanet.groupPermissions, protocol = p.protocolPermissions[0]!, basket = p.basketAccess[0]!, cert = p.certificateAccess[0]!
  return {
    spending: `This app wants to spend up to ${(p.spendingAuthorization.amount / 1e8).toFixed(8)} BSV (${p.spendingAuthorization.amount} satoshis)App says: “${p.spendingAuthorization.description}”`,
    protocol: `${protocol.protocolID[1]} (level ${protocol.protocolID[0]}) — ${protocol.counterparty.slice(0, 10)}...${protocol.description}`,
    basket: `${basket.basket}${basket.description}`,
    certificate: `${cert.type}${cert.description} — fields: ${cert.fields.join(', ')}`
  }
}
