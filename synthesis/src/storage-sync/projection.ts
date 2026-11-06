import { Transaction } from '@bsv/sdk'
import { canonicalJson } from '../determinism.js'

export const entities = ['provenTxs', 'provenTxReqs', 'outputBaskets', 'txLabels', 'outputTags', 'transactions', 'txLabelMaps', 'commissions', 'outputs', 'outputTagMaps', 'certificates', 'certificateFields'] as const
export type Entity = typeof entities[number]
export type Row = Record<string, unknown>
export type Dataset = { user?: Row } & Partial<Record<Entity, Row[]>>
const identifiers: Partial<Record<Entity, string>> = { provenTxs: 'provenTxId', provenTxReqs: 'provenTxReqId', outputBaskets: 'basketId', txLabels: 'txLabelId', outputTags: 'outputTagId', transactions: 'transactionId', outputs: 'outputId', certificates: 'certificateId', commissions: 'commissionId' }
const relations: Record<string, Entity | 'user'> = { userId: 'user', transactionId: 'transactions', provenTxId: 'provenTxs', basketId: 'outputBaskets', txLabelId: 'txLabels', outputTagId: 'outputTags', outputId: 'outputs', certificateId: 'certificates', spentBy: 'transactions' }

/** Preserve bytes and logical relationships; exclude only local IDs and clocks. */
export function projectDataset(dataset: Dataset): Record<string, unknown> {
  dataset = structuredClone(dataset)
  const bytesByTxid = new Map<string, number[]>()
  for (const row of [...(dataset.provenTxs ?? []), ...(dataset.provenTxReqs ?? []), ...(dataset.transactions ?? [])]) {
    if (!Array.isArray(row.rawTx) || row.rawTx.length === 0) continue
    const raw = row.rawTx as number[], txid = Transaction.fromBinary(raw).id('hex')
    if (txid !== row.txid) throw new Error('Raw transaction hash differs from logical identity')
    const prior = bytesByTxid.get(txid)
    if (prior !== undefined && canonicalJson(prior) !== canonicalJson(raw)) throw new Error('Conflicting transaction bytes')
    bytesByTxid.set(txid, raw)
  }
  for (const row of dataset.transactions ?? []) {
    const raw = bytesByTxid.get(String(row.txid))
    if (row.txid !== undefined && raw === undefined) throw new Error('Transaction bytes unavailable in complete portable dataset')
    if (raw !== undefined) row.rawTx = raw
    if (Array.isArray(row.inputBEEF) && row.inputBEEF.length === 0) delete row.inputBEEF
  }
  for (const row of dataset.provenTxReqs ?? []) {
    row.rebroadcastAttempts ??= 0
    row.wasBroadcast ??= false
    if (typeof row.history === 'string') row.history = JSON.parse(row.history)
  }
  // SQL byte offsets are derivable, but any supplied value must be truthful.
  for (const row of dataset.outputs ?? []) {
    const raw = bytesByTxid.get(String(row.txid))
    if (raw === undefined) throw new Error('Output parent transaction bytes unavailable')
    const location = outputLocation(Buffer.from(raw), Number(row.vout))
    for (const name of ['scriptOffset', 'scriptLength'] as const) {
      if (row[name] !== undefined && row[name] !== location[name]) throw new Error(`Incorrect ${name}`)
      row[name] = location[name]
    }
    if (Array.isArray(row.lockingScript) && canonicalJson(row.lockingScript) !== canonicalJson(location.script)) throw new Error('Stored output script differs from transaction bytes')
    row.lockingScript = location.script
  }
  const indexes = new Map<string, Map<unknown, string>>()
  indexes.set('user', new Map([[dataset.user?.userId, String(dataset.user?.identityKey)]]))
  const relation = (kind: Entity | 'user', id: unknown): string | undefined => {
    if (id === undefined || id === null) return undefined
    const key = indexes.get(kind)?.get(id)
    if (key === undefined) throw new Error(`Dangling ${kind} relationship: ${String(id)}`)
    return key
  }
  const key = (kind: Entity, row: Row): string => {
    switch (kind) {
      case 'provenTxs': case 'provenTxReqs': return String(row.txid)
      case 'outputBaskets': return String(row.name)
      case 'txLabels': return String(row.label)
      case 'outputTags': return String(row.tag)
      case 'transactions': return String(row.txid ?? `reference:${String(row.reference)}`)
      case 'outputs': return `${relation('transactions', row.transactionId)}:${String(row.vout)}`
      case 'certificates': return canonicalJson([row.type, row.serialNumber, row.certifier, row.subject])
      case 'certificateFields': return `${relation('certificates', row.certificateId)}:${String(row.fieldName)}`
      case 'txLabelMaps': return `${relation('transactions', row.transactionId)}:${relation('txLabels', row.txLabelId)}`
      case 'outputTagMaps': return `${relation('outputs', row.outputId)}:${relation('outputTags', row.outputTagId)}`
      case 'commissions': return `${relation('transactions', row.transactionId)}:${String(row.keyOffset)}`
    }
  }
  // Build parent indexes before links, regardless of the wire dependency order.
  for (const kind of ['provenTxs', 'provenTxReqs', 'outputBaskets', 'txLabels', 'outputTags', 'transactions', 'outputs', 'certificates', 'commissions'] as Entity[]) {
    const index = new Map<unknown, string>(), seen = new Set<string>()
    for (const row of dataset[kind] ?? []) {
      const logical = key(kind, row)
      if (seen.has(logical)) throw new Error(`Duplicate ${kind} logical identity: ${logical}`)
      seen.add(logical); index.set(row[identifiers[kind]!], logical)
    }
    indexes.set(kind, index)
  }
  const result: Record<string, unknown> = { identityKey: dataset.user?.identityKey }
  for (const kind of entities) {
    result[kind] = (dataset[kind] ?? []).map(row => {
      const item: Row = { key: key(kind, row) }
      for (const [name, value] of Object.entries(row)) {
        if (['created_at', 'updated_at', identifiers[kind]].includes(name) || value === null || value === undefined) continue
        if (name in relations) item[name.replace(/Id$/, 'Key')] = relation(relations[name]!, value)
        else if (name === 'notify') {
          const notification = typeof value === 'string' ? JSON.parse(value) as Row : value as Row
          item[name] = { ...notification, transactionIds: Array.isArray(notification.transactionIds) ? notification.transactionIds.map(id => relation('transactions', id)).sort() : [] }
        } else item[name] = value
      }
      return item
    }).sort((a, b) => String(a.key).localeCompare(String(b.key)))
  }
  return result
}

function outputLocation(raw: Buffer, outputIndex: number): { scriptOffset: number; scriptLength: number; script: number[] } {
  let position = 4
  const take = (length: number): number => { const start = position; position += length; if (position > raw.length) throw new Error('Truncated transaction'); return start }
  const varint = (): number => {
    const prefix = raw[take(1)]!
    if (prefix < 253) return prefix
    if (prefix === 253) return raw.readUInt16LE(take(2))
    if (prefix === 254) return raw.readUInt32LE(take(4))
    const value = raw.readBigUInt64LE(take(8))
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Oversized transaction count')
    return Number(value)
  }
  const inputs = varint()
  for (let i = 0; i < inputs; i++) { take(36); take(varint()); take(4) }
  const outputs = varint()
  if (!Number.isInteger(outputIndex) || outputIndex < 0 || outputIndex >= outputs) throw new Error('Invalid output index')
  for (let i = 0; i < outputs; i++) {
    take(8); const scriptLength = varint(), scriptOffset = take(scriptLength)
    if (i === outputIndex) return { scriptLength, scriptOffset, script: [...raw.subarray(scriptOffset, scriptOffset + scriptLength)] }
  }
  throw new Error('Output absent')
}
