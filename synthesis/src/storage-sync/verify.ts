import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { MerklePath, Transaction } from '@bsv/sdk'
import { projectDataset } from './projection.js'

const digest = (filename: string) => createHash('sha256').update(fs.readFileSync(filename)).digest('hex')
const read = (filename: string) => JSON.parse(fs.readFileSync(filename, 'utf8'))
const fixture = read(path.resolve(import.meta.dirname, '../../../fixtures/teranode/wab-funding-v1.json'))

/** Recompute predicates from raw records; reported PASS labels are never an oracle. */
export function verifyStorageCase(directory: string) {
  const result = read(path.join(directory, 'result.json'))
  assert.equal(result.schema, 'tpnil-storage-sync-run@1.0.0')
  for (const item of result.evidence) {
    assert.ok(['observations.json', 'transcript.json'].includes(item.path))
    assert.equal(digest(path.join(directory, item.path)), item.sha256)
  }
  assert.equal(result.evidence.length, 2)
  const o = read(path.join(directory, 'observations.json')), trace = read(path.join(directory, 'transcript.json'))
  assert.ok(o.source.transactions.length >= 2 && o.source.outputs.length >= 2)
  assert.ok(o.source.txLabelMaps.length > 0)
  assert.equal(o.source.outputTagMaps.length, 2)
  assert.equal(o.source.certificates.length, 1)
  assert.equal(o.source.certificateFields.length, 2)
  assert.ok(trace.some((r: any) => r.method === 'processSyncChunk' && r.committedResponseLost === true && r.response && /injected loss/.test(r.error)))
  const source = projectDataset(o.source), destination = projectDataset(o.destination)
  assert.deepEqual(destination, source, 'Initial raw logical datasets differ')
  assert.deepEqual(o.sourceProjection, source)
  assert.deepEqual(o.destinationProjection, destination)
  assert.deepEqual(projectDataset(o.replay), destination, 'Replay altered logical state')
  assert.equal(o.foreignOutputs.totalOutputs, 0)
  assert.deepEqual(o.foreignOutputs.outputs, [])
  assert.ok(trace.some((r: any) => r.provider === 'foreign-identity' && r.method === 'getSyncChunk' && /unauthorized|identity|not auth|invalid/i.test(r.error ?? '')), 'No authenticated foreign-dataset denial')
  const updated = projectDataset(o.incremental.sourceRaw)
  assert.deepEqual(projectDataset(o.incremental.destinationRaw), updated, 'Incremental raw datasets differ')
  assert.deepEqual(o.incremental.source, updated)
  assert.deepEqual(o.incremental.destination, updated)
  assert.equal(o.incremental.sourceRaw.certificates.length, 1)
  assert.equal(o.incremental.sourceRaw.certificates[0].isDeleted, true)
  assert.equal(o.remainingCertificates.totalCertificates, 0)
  for (const dataset of [o.source, o.destination, o.replay, o.incremental.sourceRaw, o.incremental.destinationRaw]) {
    assert.equal(dataset.provenTxs.length, 1)
    const proof = dataset.provenTxs[0]
    assert.equal(proof.txid, fixture.txid)
    assert.equal(proof.height, fixture.fundingHeight)
    assert.equal(proof.blockHash, fixture.fundingBlockHash)
    assert.equal(proof.merkleRoot, fixture.merkleRoot)
    const merkle = MerklePath.fromBinary(proof.merklePath)
    assert.equal(merkle.blockHeight, proof.height)
    assert.equal(merkle.computeRoot(proof.txid), fixture.merkleRoot, 'Proof does not bind mined fixture')
  }
  assert.equal(o.replacementState.activeEnabled, true)
  assert.equal(o.replacementState.activeStore, o.replacementState.destination)
  const created = Transaction.fromAtomicBEEF(o.created.tx)
  assert.equal(created.id('hex'), o.created.txid)
  assert.equal(o.freshOutputs.totalOutputs, 1)
  assert.equal(o.freshOutputs.outputs[0].outpoint, `${created.id('hex')}.0`)
  assert.equal(Buffer.from(o.freshDecryption.plaintext).toString(), 'TPNIL portable task')
  assert.equal(Transaction.fromAtomicBEEF(o.postReplacement.tx).id('hex'), o.postReplacement.txid)
  assert.equal(result.cleanup, true)
  assert.deepEqual(o.cleanupErrors, [])
  const required = ['fixture-has-relationships', 'committed-response-loss-observed', 'mediated-initial-sync', 'replay-idempotence', 'identity-scoped-output-read', 'identity-scoped-sync-read', 'incremental-tombstone', 'active-provider-replacement', 'fresh-client-task-reconstruction', 'post-replacement-write', 'cleanup']
  assert.deepEqual(result.assertions.map((r: any) => r.id).sort(), required.sort())
  assert.ok(result.assertions.every((r: any) => r.result === 'PASS'))
  assert.equal(result.result, 'PASS')
  return { components: result.components, assertions: result.assertions.map(({ id, result }: any) => ({ id, result })).sort((a: any, b: any) => a.id.localeCompare(b.id)) }
}

export function verifyStorageMatrix(directory: string) {
  const matrix = read(path.join(directory, 'result.json'))
  assert.equal(matrix.schema, 'tpnil-storage-sync-matrix@1.0.0')
  assert.equal(matrix.runs.length, 8)
  const seen = new Set<string>()
  for (const source of ['typescript', 'go']) for (const destination of ['typescript', 'go']) {
    let previous: unknown
    for (let repetition = 1; repetition <= 2; repetition++) {
      const name = `${source}-to-${destination}-${repetition}`
      assert.ok(!seen.has(name)); seen.add(name)
      const stored = matrix.runs.filter((r: any) => r.name === name)
      assert.equal(stored.length, 1)
      const actual = verifyStorageCase(path.join(directory, name))
      assert.equal(actual.components.source, source); assert.equal(actual.components.destination, destination)
      assert.deepEqual(stored[0].assertions.map(({ id, result }: any) => ({ id, result })).sort((a: any, b: any) => a.id.localeCompare(b.id)), actual.assertions)
      if (previous) assert.deepEqual(actual, previous, 'Repeatability differs')
      previous = actual
    }
  }
  assert.equal(matrix.result, 'PASS')
  return { result: 'PASS', runs: 8, assertions: 88, oracle: 'raw logical projections, anchored proof, authenticated denial, replacement and cleanup' }
}
export function verifyStorageTamperRejection(directory: string) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-storage-oracle-'))
  const original = path.join(directory, 'typescript-to-go-1')
  try {
    for (const mutation of ['providedBy', 'proof']) {
      const copy = path.join(temporary, mutation); fs.mkdirSync(copy)
      for (const name of ['observations.json', 'transcript.json', 'result.json']) fs.copyFileSync(path.join(original, name), path.join(copy, name))
      const o = read(path.join(copy, 'observations.json'))
      if (mutation === 'providedBy') { o.destination.outputs[0].providedBy = 'tampered'; o.destinationProjection = projectDataset(o.destination) }
      else {
        // Change both equal projections, so source/destination equality alone cannot detect it.
        for (const dataset of [o.source, o.destination, o.replay, o.incremental.sourceRaw, o.incremental.destinationRaw]) dataset.provenTxs[0].merklePath[6] ^= 1
        o.sourceProjection = projectDataset(o.source); o.destinationProjection = projectDataset(o.destination)
        o.incremental.source = projectDataset(o.incremental.sourceRaw); o.incremental.destination = projectDataset(o.incremental.destinationRaw)
      }
      fs.writeFileSync(path.join(copy, 'observations.json'), JSON.stringify(o))
      const result = read(path.join(copy, 'result.json'))
      result.evidence.find((r: any) => r.path === 'observations.json').sha256 = digest(path.join(copy, 'observations.json'))
      fs.writeFileSync(path.join(copy, 'result.json'), JSON.stringify(result))
      assert.throws(() => verifyStorageCase(copy), `Rebound ${mutation} corruption escaped the independent oracle`)
    }
  } finally { fs.rmSync(temporary, { recursive: true, force: true }) }
  return { rejected: ['providedBy-with-rebound-digest', 'proof-with-rebound-digest'] }
}
if (process.argv[1] === import.meta.filename) {
  const directory = path.resolve(process.argv[2]!)
  console.log(JSON.stringify({ ...verifyStorageMatrix(directory), tamper: verifyStorageTamperRejection(directory) }))
}
