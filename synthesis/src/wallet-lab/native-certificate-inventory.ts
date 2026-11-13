import assert from 'node:assert/strict'
import { assertSnapshotIdentity } from './native-output-snapshot.js'
export const nativeCertificateInventoryResponseByteLimit = 128 * 1024 * 1024

export interface NativeCertificateInventoryRow {
  id: number; userId: number; createdAt: string | null; updatedAt: string | null; deletedAt: string | null
  type: string | null; serialNumber: string | null; certifier: string | null; subject: string | null
  verifier: string | null; revocationOutpoint: string | null; signature: string | null
}
export interface NativeCertificateInventoryField {
  certificateId: number; userId: number; createdAt: string | null; updatedAt: string | null
  fieldName: string; fieldValue: string | null; masterKeySha256: string | null
}
export interface NativeCertificateInventory {
  schema: 'tpnil-native-certificate-inventory@1.0.0'; identityKey: string; providerIdentityKey: string
  certificates: NativeCertificateInventoryRow[]; fields: NativeCertificateInventoryField[]
}
const record = (value: any, keys: string[]) => { assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value)); assert.deepEqual(Object.keys(value).sort(), keys.sort()) }
const id = (value: unknown) => assert.ok(Number.isSafeInteger(value) && Number(value) > 0)
/** An inventory preserves malformed certificate contents and deleted records.
 * It proves neither certificate validity nor authorization; parent evidence must
 * bind this complete control response to the independently owned provider. */
export function validateNativeCertificateInventory(value: unknown): NativeCertificateInventory {
  record(value, ['schema', 'identityKey', 'providerIdentityKey', 'certificates', 'fields'])
  const snapshot = value as NativeCertificateInventory
  assert.equal(snapshot.schema, 'tpnil-native-certificate-inventory@1.0.0')
  assertSnapshotIdentity(snapshot.identityKey); assertSnapshotIdentity(snapshot.providerIdentityKey)
  assert.ok(Array.isArray(snapshot.certificates) && snapshot.certificates.length <= 2048)
  assert.ok(Array.isArray(snapshot.fields) && snapshot.fields.length <= 16384)
  let bytes = 0, prior = 0, owner: number | undefined
  const text = (value: unknown, nullable = true) => {
    if (value === null && nullable) return
    assert.equal(typeof value, 'string'); assert.equal(Buffer.from(value as string).toString(), value, 'Invalid UTF8 inventory text')
    const length = Buffer.byteLength(value as string); assert.ok(length <= 1 << 20); bytes += length; assert.ok(bytes <= 16 << 20)
  }
  const certificates = new Set<number>()
  for (const row of snapshot.certificates) {
    record(row, ['id', 'userId', 'createdAt', 'updatedAt', 'deletedAt', 'type', 'serialNumber', 'certifier', 'subject', 'verifier', 'revocationOutpoint', 'signature'])
    id(row.id); id(row.userId); assert.ok(row.id > prior); prior = row.id
    if (owner === undefined) owner = row.userId; else assert.equal(row.userId, owner, 'Mixed certificate owners')
    certificates.add(row.id)
    for (const [key, item] of Object.entries(row)) if (!['id', 'userId'].includes(key)) text(item)
  }
  let priorField: NativeCertificateInventoryField | undefined
  for (const row of snapshot.fields) {
    record(row, ['certificateId', 'userId', 'createdAt', 'updatedAt', 'fieldName', 'fieldValue', 'masterKeySha256'])
    id(row.certificateId); id(row.userId); assert.ok(certificates.has(row.certificateId), 'Orphan certificate field'); assert.equal(row.userId, owner, 'Cross-owner certificate field')
    text(row.createdAt); text(row.updatedAt); text(row.fieldName, false); text(row.fieldValue)
    if (row.masterKeySha256 !== null) assert.match(row.masterKeySha256, /^[0-9a-f]{64}$/)
    if (priorField) assert.ok(row.certificateId > priorField.certificateId || (row.certificateId === priorField.certificateId && Buffer.compare(Buffer.from(row.fieldName), Buffer.from(priorField.fieldName)) > 0), 'Duplicate or unsorted certificate fields')
    priorField = row
  }
  return snapshot
}
export function assertCertificateInventoryIdentity(snapshot: NativeCertificateInventory, identityKey: string, providerIdentityKey: string): void {
  validateNativeCertificateInventory(snapshot); assertSnapshotIdentity(identityKey); assertSnapshotIdentity(providerIdentityKey)
  assert.equal(snapshot.identityKey, identityKey); assert.equal(snapshot.providerIdentityKey, providerIdentityKey)
}
