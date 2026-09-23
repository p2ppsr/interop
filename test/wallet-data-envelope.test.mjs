import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { decryptEnvelope, encryptEnvelope, inspectHeader, archiveProjection } from '../src/portability/brc39.mjs'
const plaintext = fs.readFileSync(new URL('../fixtures/wallet-data/v1/all-categories.brc38.json', import.meta.url))
const password = 'LAB_SELF_TEST_ONLY-e\u0301-passphrase'
test('LAB_SELF_TEST_ONLY: independent BRC39 envelope, NFC, header bounds and authenticated tamper rejection', async () => {
  const file = await encryptEnvelope(plaintext, password)
  assert.equal(file.length, plaintext.length + 113)
  const decoded = await decryptEnvelope(file, password.normalize('NFC'))
  assert.deepEqual(decoded, plaintext)
  const projection = archiveProjection(decoded)
  assert.equal(Object.keys(projection.counts).length, 13)
  assert.equal(Object.values(projection.counts).reduce((a, b) => a + b, 0), 13)
  assert.equal(createHash('sha256').update(decoded).digest('hex'), createHash('sha256').update(plaintext).digest('hex'))
  await assert.rejects(decryptEnvelope(file, password + ' '))
  await assert.rejects(decryptEnvelope(file, 'wrong password'))
  for (const offset of [97, file.length - 1]) {
    const changed = Buffer.from(file); changed[offset] ^= 1
    await assert.rejects(decryptEnvelope(changed, password))
  }
  for (const offset of [0, 4, 5, 6, 7, 8, 9, 10, 20, 21, 32]) {
    const changed = Buffer.from(file); changed[offset] ^= 128
    assert.throws(() => inspectHeader(changed))
  }
  for (const [offset, value] of [[11, 0], [11, 15], [15, 262145]]) {
    const changed = Buffer.from(file); changed.writeUInt32BE(value, offset)
    assert.throws(() => inspectHeader(changed), /kdf-resources/)
  }
  assert.throws(() => inspectHeader(file.subarray(0, 112)), /file-size/)
  await assert.rejects(decryptEnvelope(file.subarray(0, -1), password))
})
