import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { assertSnapshotIdentity } from './native-output-snapshot.js'
export const nativeTransactionKnowledgeResponseByteLimit = 192 * 1024 * 1024

export interface NativeKnowledgeBlob { present: boolean; bytes: number; sha256: string | null; hex: string | null }
export interface NativeKnownTransactionRow { txid: string; status: string | null; createdAt: string | null; updatedAt: string | null; rawTx: NativeKnowledgeBlob; inputBEEF: NativeKnowledgeBlob }
export interface NativeKnowledgeActionRow { id: number; userId: number; txid: string | null; status: string | null; deletedAt: string | null; inputBEEF: NativeKnowledgeBlob }
export interface NativeTransactionKnowledgeInventory {
  schema: 'tpnil-native-transaction-knowledge-inventory@1.0.0'; scope: 'PROVIDER_GLOBAL_ALL_STATUSES_ALL_USERS_INCLUDING_DELETED'; providerIdentityKey: string
  knownCount: number; transactionCount: number; known: NativeKnownTransactionRow[]; transactions: NativeKnowledgeActionRow[]
}
const record = (value: any, keys: string[]) => { assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value)); assert.deepEqual(Object.keys(value).sort(), keys.sort()) }
const integer = (value: unknown, minimum = 0) => assert.ok(Number.isSafeInteger(value) && Number(value) >= minimum)
/** Complete membership includes raw-NULL, deleted and other-user records. Blob
 * digests authenticate observed bytes; they do not establish valid transactions,
 * proof closure, chain acceptance, or browser cache absence. */
export function validateNativeTransactionKnowledgeInventory(value: unknown): NativeTransactionKnowledgeInventory {
  record(value, ['schema', 'scope', 'providerIdentityKey', 'knownCount', 'transactionCount', 'known', 'transactions'])
  const snapshot = value as NativeTransactionKnowledgeInventory
  assert.equal(snapshot.schema, 'tpnil-native-transaction-knowledge-inventory@1.0.0'); assert.equal(snapshot.scope, 'PROVIDER_GLOBAL_ALL_STATUSES_ALL_USERS_INCLUDING_DELETED'); assertSnapshotIdentity(snapshot.providerIdentityKey)
  integer(snapshot.knownCount); integer(snapshot.transactionCount)
  assert.ok(Array.isArray(snapshot.known) && snapshot.knownCount <= 4096 && snapshot.knownCount === snapshot.known.length)
  assert.ok(Array.isArray(snapshot.transactions) && snapshot.transactionCount <= 4096 && snapshot.transactionCount === snapshot.transactions.length)
  let bytes = 0, metadataBytes = 0
  const text = (value: unknown) => { if (value === null) return; assert.equal(typeof value, 'string'); assert.equal(Buffer.from(value as string).toString(), value); const size = Buffer.byteLength(value as string); assert.ok(size <= 1 << 20); metadataBytes += size; assert.ok(metadataBytes <= 4 << 20, 'Knowledge metadata byte budget exceeded') }
  const blob = (value: NativeKnowledgeBlob) => {
    record(value, ['present', 'bytes', 'sha256', 'hex']); assert.equal(typeof value.present, 'boolean'); integer(value.bytes); assert.ok(value.bytes <= 2 << 20)
    if (!value.present) { assert.equal(value.bytes, 0); assert.equal(value.sha256, null); assert.equal(value.hex, null); return }
    assert.equal(typeof value.hex, 'string'); assert.match(value.hex!, /^(?:[0-9a-f]{2})*$/); assert.equal(value.hex!.length, value.bytes * 2)
    assert.match(value.sha256!, /^[0-9a-f]{64}$/); assert.equal(createHash('sha256').update(Buffer.from(value.hex!, 'hex')).digest('hex'), value.sha256)
    bytes += value.bytes; assert.ok(bytes <= 64 << 20, 'Knowledge blob byte budget exceeded')
  }
  let previous = ''
  for (const row of snapshot.known) {
    record(row, ['txid', 'status', 'createdAt', 'updatedAt', 'rawTx', 'inputBEEF']); assert.match(row.txid, /^[0-9a-f]{64}$/); assert.ok(row.txid > previous); previous = row.txid
    text(row.status); text(row.createdAt); text(row.updatedAt); blob(row.rawTx); blob(row.inputBEEF)
  }
  let prior = 0
  for (const row of snapshot.transactions) {
    record(row, ['id', 'userId', 'txid', 'status', 'deletedAt', 'inputBEEF']); integer(row.id, 1); integer(row.userId, 1); assert.ok(row.id > prior); prior = row.id
    if (row.txid !== null) assert.match(row.txid, /^[0-9a-f]{64}$/)
    text(row.status); text(row.deletedAt); blob(row.inputBEEF)
  }
  return snapshot
}
export function assertTransactionKnowledgeProvider(snapshot: NativeTransactionKnowledgeInventory, providerIdentityKey: string): void {
  validateNativeTransactionKnowledgeInventory(snapshot); assertSnapshotIdentity(providerIdentityKey); assert.equal(snapshot.providerIdentityKey, providerIdentityKey)
}
