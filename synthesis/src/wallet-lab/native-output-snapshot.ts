import assert from 'node:assert/strict'
import { Curve, PublicKey, Transaction } from '@bsv/sdk'

export interface NativeOutputRow {
  outputId: number; transactionId: number; outpoint: string | null; txid: string | null; rawTx: string | null
  vout: number; satoshis: number; lockingScript: string; spendable: boolean
  basketName: string | null; tags: string[]; customInstructions: string | null
}
export interface NativeOutputSnapshot {
  schema: 'tpnil-native-output-snapshot@2.0.0'; identityKey: string; providerIdentityKey: string; outputs: NativeOutputRow[]
}
export interface OwnedNativeOutputSnapshots {
  schema: 'tpnil-native-owned-output-snapshots@1.0.0'; identityKey: string
  providers: Array<{ id: string; componentIdentity: Record<string, unknown>; snapshot: NativeOutputSnapshot }>
}
export interface NativeOutputSnapshotObservation {
  sequence: number; identityKey: string; startedAt: string; endedAt: string
  snapshots?: OwnedNativeOutputSnapshots; error?: { name: string; message: string }
}
export type NativeOutputProviderRegistry = Array<{ id: string; identityKey: string; componentIdentity: Record<string, unknown> }>
export function assertSnapshotIdentity(value: string): void {
  assert.match(value, /^(02|03)[0-9a-f]{64}$/)
  assert.ok(BigInt(`0x${value.slice(2)}`) < BigInt(`0x${new Curve().p.toString(16)}`))
  assert.ok(PublicKey.fromString(value).validate())
}
function text(value: unknown, nullable = false): void {
  if (nullable && value === null) return
  assert.equal(typeof value, 'string')
  assert.ok(Buffer.byteLength(value as string) <= 4 * 1024 * 1024)
  assert.equal(Buffer.from(value as string).toString(), value, 'Invalid UTF8 metadata')
}
function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): void {
  assert.ok(Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max)
}
/** Observational metadata is never treated as proof of funding or signature.
 * The parent separately joins exact transactions to owned mined ancestry. */
export function validateNativeOutputSnapshot(value: unknown, identity: string, provider?: string): asserts value is NativeOutputSnapshot {
  assertSnapshotIdentity(identity)
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value))
  const snapshot = value as NativeOutputSnapshot
  assert.deepEqual(Object.keys(snapshot).sort(), ['identityKey', 'outputs', 'providerIdentityKey', 'schema'])
  assert.equal(snapshot.schema, 'tpnil-native-output-snapshot@2.0.0')
  assert.equal(snapshot.identityKey, identity); assertSnapshotIdentity(snapshot.providerIdentityKey)
  if (provider !== undefined) assert.equal(snapshot.providerIdentityKey, provider, 'Snapshot provider differs from owned service identity')
  assert.ok(Array.isArray(snapshot.outputs) && snapshot.outputs.length <= 2048)
  const outpoints = new Set<string>(), outputs = new Set<number>()
  let last = 0, bytes = 0
  for (const row of snapshot.outputs) {
    assert.ok(row && typeof row === 'object' && !Array.isArray(row))
    assert.deepEqual(Object.keys(row).sort(), ['basketName', 'customInstructions', 'lockingScript', 'outpoint', 'outputId', 'rawTx', 'satoshis', 'spendable', 'tags', 'transactionId', 'txid', 'vout'])
    integer(row.outputId, 1); integer(row.transactionId, 1); integer(row.vout, 0, 0xffffffff); integer(row.satoshis, 0)
    assert.ok(row.outputId > last && !outputs.has(row.outputId)); last = row.outputId; outputs.add(row.outputId)
    assert.equal(typeof row.spendable, 'boolean'); assert.match(row.lockingScript, /^(?:[0-9a-f]{2})*$/)
    assert.ok(row.lockingScript.length <= 4 * 1024 * 1024)
    text(row.basketName, true); text(row.customInstructions, true)
    assert.ok(Array.isArray(row.tags) && row.tags.length <= 256)
    let prior: string | undefined
    for (const tag of row.tags) {
      text(tag); assert.ok(Buffer.byteLength(tag) <= 4096)
      if (prior !== undefined) assert.ok(Buffer.compare(Buffer.from(prior), Buffer.from(tag)) < 0, 'Duplicate or unsorted tags')
      prior = tag
    }
    if (row.txid === null) {
      assert.equal(row.rawTx, null); assert.equal(row.outpoint, null)
    } else {
      assert.match(row.txid, /^[0-9a-f]{64}$/); assert.equal(typeof row.rawTx, 'string')
      assert.match(row.rawTx!, /^(?:[0-9a-f]{2})+$/); assert.ok(row.rawTx!.length <= 32 * 1024 * 1024)
      const transaction = Transaction.fromHex(row.rawTx!)
      assert.equal(transaction.toHex(), row.rawTx, 'Trailing transaction bytes')
      assert.equal(transaction.id('hex'), row.txid)
      assert.equal(row.outpoint, `${row.txid}.${row.vout}`); assert.ok(!outpoints.has(row.outpoint!)); outpoints.add(row.outpoint!)
      const output = transaction.outputs[row.vout]
      assert.ok(output); assert.equal(output.satoshis, row.satoshis); assert.equal(output.lockingScript.toHex(), row.lockingScript)
    }
    bytes += Buffer.byteLength(JSON.stringify(row))
    assert.ok(bytes <= 68 * 1024 * 1024, 'Snapshot byte budget exceeded')
  }
}
