import type { Dataset, Row } from './projection.js'

const booleanColumns: Record<string, string[]> = {
  provenTxReqs: ['notified', 'wasBroadcast'], transactions: ['isOutgoing'],
  outputs: ['spendable', 'change'], outputBaskets: ['isDeleted'], outputTags: ['isDeleted'],
  txLabels: ['isDeleted'], outputTagMaps: ['isDeleted'], txLabelMaps: ['isDeleted'],
  certificates: ['isDeleted'], commissions: ['isRedeemed']
}

/** Versioned wire adapter: representation corrections preserve the logical value. */
export function canonicalSyncChunk<T>(input: T, implementation: 'typescript' | 'go'): T {
  const chunk = structuredClone(input) as Dataset
  for (const [entity, columns] of Object.entries(booleanColumns)) {
    for (const row of (chunk as Record<string, Row[]>)[entity] ?? []) {
      for (const column of columns) {
        if (row[column] === 0) row[column] = false
        else if (row[column] === 1) row[column] = true
        else if (row[column] !== undefined && row[column] !== null && typeof row[column] !== 'boolean') throw new Error(`Invalid boolean ${entity}.${column}`)
      }
    }
  }
  if (implementation === 'go') {
    for (const row of chunk.transactions ?? []) {
      if ('proveTxId' in row) {
        if ('provenTxId' in row && row.provenTxId !== row.proveTxId) throw new Error('Ambiguous Go proof foreign key')
        row.provenTxId = row.proveTxId; delete row.proveTxId
      }
    }
  }
  return chunk as T
}
export function goSyncChunk<T>(input: T): T {
  const chunk = canonicalSyncChunk(input, 'typescript') as Dataset
  for (const row of chunk.transactions ?? []) {
    if ('provenTxId' in row) { row.proveTxId = row.provenTxId; delete row.provenTxId }
  }
  return chunk as T
}
