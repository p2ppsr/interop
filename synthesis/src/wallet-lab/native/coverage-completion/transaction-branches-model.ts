// SPDX-License-Identifier: Apache-2.0
export const bounds = { walletCalls: 96, externalFunderCalls: 6, signedTransactions: 24, observationCuts: 32, restarts: 0, ownedValueCeiling: 100000, feeBudget: 5000 } as const
export const rows = ['transaction.defaults/noSend-omitted-false','transaction.proof-trust/known-wallet-trustSelf','transaction.proof-trust/explicit-knownTxids','transaction.proof-trust/truncated-proof','transaction.nosend-change/valid-full','transaction.nosend-change/empty-return-unexercised','transaction.nosend-change/unsigned-stale-txid','transaction.batch-send/returnTXIDOnly'] as const
export interface Source { outpoint: string; satoshis: number; lockingScript: string; rawTxHex: string }
export interface ProviderCut { sequence: number; startedAt: number; endedAt: number; identity: string; providers: Array<{ id: string; identityKey: string; outputs: Source[]; allKnownTxids: string[]; proofCacheDigests: string[] }>; routes: any[] }
export interface Ports {
  wallet: Record<string,(args:any)=>Promise<any>>
  /** Separate owned provider, public wallet only; held source is not broadcast,
   * registered on native getRawTx routes or shared via a backend known cache. */
  externalFunder: Record<string,(args:any)=>Promise<any>>
  observeAllOwnedProviders(identity:string): Promise<ProviderCut>
  observeExternalFunder(): Promise<ProviderCut>
  submissions(): readonly any[]
  finalSubmissions(): Promise<readonly any[]>
}
export interface FixtureStatus { status: 'BLOCKED'|'FAIL'; detail: string }
export const missingNativeParent = 'No native qualification: production profile integration and complete native source/cache/route/funding/final-ledger/context admission are absent. These public library observations never substitute for native execution.'
