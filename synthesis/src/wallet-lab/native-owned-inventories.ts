import type { NativeActionQueryCuts, NativeActionQueryFinalLedger, NativeActionQueryFailureBundle } from './native-action-query-ledger.js'
import type { NativeCertificateInventory } from './native-certificate-inventory.js'
import type { NativeTransactionKnowledgeInventory } from './native-transaction-knowledge-inventory.js'
import type { NativeOutputProviderRegistry } from './native-output-snapshot.js'

export interface OwnedNativeCertificateInventories {
  schema: 'tpnil-native-owned-certificate-inventories@1.0.0'
  identityKey: string
  providers: Array<{ id: string; componentIdentity: Record<string, unknown>; snapshot: NativeCertificateInventory }>
}
export interface OwnedNativeTransactionKnowledgeInventories {
  schema: 'tpnil-native-owned-transaction-knowledge-inventories@1.0.0'
  providers: Array<{ id: string; componentIdentity: Record<string, unknown>; snapshot: NativeTransactionKnowledgeInventory }>
}
export interface NativeInventoryObservation<T> {
  sequence: number
  startedAt: string
  endedAt: string
  identityKey?: string
  registry: NativeOutputProviderRegistry
  snapshots?: T
  error?: { name: string; message: string }
}

export interface OwnedNativeActionQueryCuts {
  schema: 'tpnil-native-owned-action-query-cuts@1.0.0'
  identityKey: string
  providers: Array<{ id: string; componentIdentity: Record<string, unknown>; snapshot: NativeActionQueryCuts }>
}
export interface OwnedNativeFinalActionQueryLedger {
  id: string
  componentIdentity: Record<string, unknown>
  providerIdentityKey: string
  ledger?: NativeActionQueryFinalLedger
  rawFailure?: NativeActionQueryFailureBundle
  error?: { name: string; message: string }
}
