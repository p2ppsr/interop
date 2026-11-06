import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { Transaction, VerifiableCertificate, PublicKey, PrivateKey } from '@bsv/sdk'
import { headerHash, genesis } from './chaintracks.js'
const root = fileURLToPath(new URL('../', import.meta.url))
const sha256 = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex')
export async function verifyServicesResult(directory: string): Promise<any> {
  const result = JSON.parse(await fs.readFile(path.join(directory, 'result.json'), 'utf8'))
  assert.equal(result.schema, 'tpnil-overlay-identity-result@1.0.0')
  assert.equal(result.claim, 'LAB_SELF_TEST_ONLY')
  const profileBytes = await fs.readFile(path.join(root, 'profile.json'))
  const profile = JSON.parse(profileBytes.toString())
  assert.equal(result.profileSha256, sha256(profileBytes))
  assert.equal(result.packageLockSha256, sha256(await fs.readFile(path.join(root, 'package-lock.json'))))
  assert.equal(result.profile, profile.id)
  for (const criterion of profile.assertions) {
    const matches = result.assertions.filter((a: any) => a.id === criterion.id)
    assert.equal(matches.length, 1, `Exactly one ${criterion.id} is required`)
    assert(['PASS', 'FAIL', 'BLOCKED'].includes(matches[0].verdict))
  }
  assert.deepEqual(result.sources, JSON.parse(await fs.readFile(path.join(root, 'sources.json'), 'utf8')))
  for (const source of result.sources.files) assert.equal(sha256(await fs.readFile(path.join(root, source.local))), source.sha256)
  const files = new Set<string>()
  for (const item of result.evidence) {
    assert(/^[a-z0-9-]+\.(json|txt)$/.test(item.file), 'Evidence path must be a local basename')
    assert(!files.has(item.file)); files.add(item.file)
    assert.equal(sha256(await fs.readFile(path.join(directory, item.file))), item.sha256, item.file)
  }
  assert(files.has('fixtures.json') && files.has('events.json'))
  const fixture = JSON.parse(await fs.readFile(path.join(directory, 'fixtures.json'), 'utf8'))
  assert.equal(fixture.headers[0].hash, genesis.hash)
  for (const [i, header] of fixture.headers.entries()) {
    assert.equal(headerHash(header), header.hash)
    assert.equal(header.height, i)
    if (i) assert.equal(header.previousHash, fixture.headers[i - 1].hash)
    assert(BigInt(`0x${header.hash}`) <= 0x7fffffn << 232n)
  }
  const tracker = { currentHeight: async () => 1000, isValidRootForHeight: async (root: string, height: number) => fixture.headers[height]?.merkleRoot === root }
  for (const item of fixture.transactions) {
    const tx = Transaction.fromAtomicBEEF(item.beef)
    assert.equal(tx.id('hex'), item.txid)
    assert.equal(tx.toHex(), item.raw)
    assert(tx.merklePath)
    assert.equal(await tx.merklePath!.verify(item.txid, tracker), true)
  }
  // Recompute the exact outpoint sets from returned wire evidence. A claimed
  // success or even a rebound file digest cannot replace the expected payload.
  function checkOutputs(id: string, answer: (actual: any) => any, indices: number[]) {
    const assertion = result.assertions.find((entry: any) => entry.id === id)
    if (assertion.verdict !== 'PASS') return
    const actual = answer(assertion.actual)
    assert.equal(actual.type, 'output-list', id)
    const outpoints = actual.outputs.map((entry: any) => {
      const beef = typeof entry.beef === 'string' ? [...Buffer.from(entry.beef, 'base64')] : entry.beef
      return `${Transaction.fromBEEF(beef).id('hex')}.${entry.outputIndex}`
    }).sort()
    assert.deepEqual(outpoints, indices.map(index => `${fixture.transactions[index].txid}.0`).sort(), id)
  }
  checkOutputs('OVERLAY-001', actual => actual.found, [0])
  checkOutputs('OVERLAY-002', actual => actual, [0])
  checkOutputs('OVERLAY-003', actual => actual, [0])
  checkOutputs('OVERLAY-GO-001', actual => actual.found, [0])
  checkOutputs('OVERLAY-GO-002', actual => actual, [0, 1])
  checkOutputs('DISCOVERY-001', actual => actual, [2])
  checkOutputs('DISCOVERY-002', actual => actual, [3])
  checkOutputs('IDENTITY-002', actual => actual.found, [4])
  checkOutputs('OVERLAY-004', actual => actual.found, [0])
  checkOutputs('OVERLAY-004', actual => actual.identities, [4])
  const cert = fixture.publicCertificate
  const certificate = new VerifiableCertificate(cert.type, cert.serialNumber, cert.subject, cert.certifier, cert.revocationOutpoint, cert.fields, cert.keyring, cert.signature)
  assert.equal(await certificate.verify(), true)
  if (files.has('rust-certificate-vectors.json')) {
    const vectors = JSON.parse(await fs.readFile(path.join(directory, 'rust-certificate-vectors.json'), 'utf8'))
    assert(['tpnil-rust-certificate-vectors@1', 'tpnil-rust-certificate-vectors@2'].includes(vectors.schema))
    const version2 = vectors.schema.endsWith('@2')
    assert.equal(vectors.cases.length, version2 ? 3 : 2)
    const message = Buffer.from(certificate.toBinary(false)).toString('hex')
    let publicKey = certificate.certifier
    if (version2) {
      const privateKey = '00'.repeat(31) + '01', invoice = `2-certificate signature-${certificate.type} ${certificate.serialNumber}`
      publicKey = PublicKey.fromString(certificate.certifier).deriveChild(PrivateKey.fromHex(privateKey), invoice).toString()
      assert.deepEqual(vectors.cases[0].request, { op: 'derive-public', publicKey: certificate.certifier, privateKey, invoice })
      assert.deepEqual(vectors.cases[0].expected, { publicKey })
    }
    for (const [index, entry] of vectors.cases.slice(version2 ? 1 : 0).entries()) {
      assert.deepEqual(entry.request, { op: 'signature', publicKey, signature: certificate.signature, message: index === 0 ? message : `${message}00` })
      assert.deepEqual(entry.expected, { valid: index === 0 })
    }
  }
  if (files.has('relinquishment.json')) {
    const record = JSON.parse(await fs.readFile(path.join(directory, 'relinquishment.json'), 'utf8'))
    const tx = Transaction.fromAtomicBEEF(record.beef)
    assert.equal(tx.toHex(), record.raw)
    assert.equal(await tx.verify(tracker), true)
    assert.equal(record.found.outputs.length, 0)
    assert(tx.inputs.some(input => input.sourceTXID === fixture.transactions.at(-1).txid))
  }
  const outcome = result.assertions.some((a: any) => a.verdict === 'BLOCKED') || result.cleanup.some((c: any) => !c.closed) ? 'BLOCKED' : result.assertions.some((a: any) => a.verdict === 'FAIL') ? 'FAIL' : 'PASS'
  assert.equal(result.result, outcome)
  assert(result.cleanup.length >= 1)
  if (result.result === 'PASS') {
    assert.equal(result.runtime.mongo.processExited, true)
    for (const name of ['overlay-a', 'overlay-b', 'go-overlay', 'chaintracks', 'mongo']) assert(result.cleanup.some((c: any) => c.name === name && c.closed))
  }
  return { verified: true, result: outcome, assertions: result.assertions.length }
}
