import { Transaction } from '@bsv/sdk'
import { OverlayGASPStorage } from '@bsv/overlay/GASP/OverlayGASPStorage.ts'

/** Overlay 2.7.0 traverses outpoint nodes but emits one historical transaction
 * per node. Two referenced outputs of one transaction consequently make its
 * single input look double-spent. Keep graph traversal and every validation in
 * upstream; only admit the identical transaction once. Distinct transactions
 * spending the same outpoint remain present and are rejected by upstream.
 */
export function uniqueHistoricalTransactions(beefs: number[][]): number[][] {
  const seen = new Set<string>()
  return beefs.filter(beef => { const txid = Transaction.fromBEEF(beef).id('hex'); if (seen.has(txid)) return false; seen.add(txid); return true })
}
export class LabOverlayGASPStorage extends OverlayGASPStorage {
  override computeOrderedBEEFsForGraph(graphID: string): number[][] {
    return uniqueHistoricalTransactions(super.computeOrderedBEEFsForGraph(graphID))
  }
}
