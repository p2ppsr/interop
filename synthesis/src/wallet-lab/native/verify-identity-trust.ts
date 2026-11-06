import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { Beef, PushDrop, Signature, Transaction, type LockingScript } from '@bsv/sdk'
import { canonicalJson } from '../../determinism.js'
import { trustAssertionIds } from './identity-trust.js'

const root = path.resolve(import.meta.dirname, '../../../..')
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/teranode/wab-funding-v1.json'), 'utf8'))
const tracker = { currentHeight: async () => 900100, isValidRootForHeight: async (root: string, height: number) => root === fixture.merkleRoot && height === fixture.fundingHeight }
const match = (row: any, cert: any) => row.certifier === cert.certifier && row.serialNumber === cert.serialNumber && row.subject === cert.subject
const certificateFields = ['type', 'serialNumber', 'subject', 'certifier', 'revocationOutpoint', 'fields', 'signature', 'keyring']
const settingsContext = (args: any) => canonicalJson(args?.protocolID) === canonicalJson([2, 'wallet settings']) && args?.keyID === 'settings'
export function verifySettingsTokenSignature(script: LockingScript) {
  const decoded = PushDrop.decode(script)
  assert.equal(decoded.fields.length, 2, 'Settings token must contain ciphertext and its signature')
  assert.ok(Signature.fromDER(decoded.fields[1]!).verify(decoded.fields[0]!, decoded.lockingPublicKey), 'Settings token data signature invalid')
  return decoded
}
export async function verifyNativeTrust(report: any, boundary: any) {
  assert.equal(report.schema, 'tpnil-native-identity-trust@1')
  assert.equal(report.profile, 'native-public-settings-token@1.0.0')
  assert.deepEqual(report.assertions.map((r: any) => r.id).sort(), [...trustAssertionIds].sort())
  const cert = report.certificate
  const trace = report.trace as any[]
  if (cert) {
    assert.equal(cert.certifier, '03e7e9acacbdb43fc9fb71a8db1536c0f866caa78def49f666fa121a6f7954bb01')
    assert.equal(cert.subject, boundary.trace.find((r: any) => r.method === 'getPublicKey' && r.args.identityKey)?.result.publicKey)
    const acquired = boundary.trace.find((r: any) => r.method === 'acquireCertificate')?.args
    for (const field of ['type', 'serialNumber', 'subject', 'certifier', 'revocationOutpoint', 'fields', 'signature']) assert.deepEqual(cert[field], acquired?.[field])
  }
  const findTrace = (method: string, result: any) => trace.find(r => r.method === method && canonicalJson(r.result) === canonicalJson(result))
  const findOutputs = (outputs: any) => {
    const row = findTrace('listOutputs', outputs)
    assert.ok(row); assert.equal(row.args[0].basket, 'wallet settings'); assert.deepEqual(row.args[0].tags, ['settings'])
  }
  const verifyToken = async (outputs: any, settings: any, capturedWrite = false) => {
    findOutputs(outputs); assert.equal(outputs.totalOutputs, 1); assert.equal(outputs.outputs.length, 1)
    const [txid, vout] = outputs.outputs[0].outpoint.split('.')
    const tx = Transaction.fromAtomicBEEF(Beef.fromBinary(outputs.BEEF).toBinaryAtomic(txid))
    assert.equal(tx.id('hex'), txid); assert.ok(await tx.verify(tracker))
    const { fields, lockingPublicKey } = verifySettingsTokenSignature(tx.outputs[Number(vout)]!.lockingScript)
    const readback = trace.find(r => {
      if (r.method !== 'decrypt' || canonicalJson(r.args[0].ciphertext) !== canonicalJson(fields[0]) || !settingsContext(r.args[0])) return false
      try { return canonicalJson(JSON.parse(Buffer.from(r.result?.plaintext ?? []).toString())) === canonicalJson(settings) } catch { return false }
    })
    assert.ok(readback, 'No public decryption binds the signed token to these settings')
    let write: any
    if (capturedWrite) {
      write = trace.find(r => ['createAction', 'signAction'].includes(r.method) && r.result?.txid === txid && r.result?.tx && Transaction.fromAtomicBEEF(r.result.tx).toHex() === tx.toHex())
      assert.ok(write, 'Signed settings transaction absent from public wallet trace')
      const signature = trace.find(r => r.method === 'createSignature' && settingsContext(r.args[0]) && r.args[0].counterparty === 'self' && canonicalJson(r.args[0].data) === canonicalJson(fields[0]) && canonicalJson(r.result?.signature) === canonicalJson(fields[1]))
      assert.ok(signature, 'Settings token signature not bound to the public signing protocol and bytes')
      const key = trace.find(r => r.method === 'getPublicKey' && settingsContext(r.args[0]) && r.args[0].counterparty === 'self' && r.args[0].forSelf === false && r.result?.publicKey === lockingPublicKey.toString() && trace.indexOf(r) < trace.indexOf(signature))
      assert.ok(key, 'Settings token public key not bound to the public derivation request')
      assert.ok(trace.indexOf(signature) < trace.indexOf(write) && trace.indexOf(write) < trace.indexOf(readback))
    }
    return { tx, readback, write }
  }
  const predicates: Record<string, () => Promise<void> | void> = {
    'identity-trust.initial-exclusion': () => {
      assert.ok(cert)
      assert.ok(!report.originalSettings.trustSettings.trustedCertifiers.some((r: any) => r.identityKey === cert.certifier))
      for (const [method, response] of [['discoverByIdentityKey', report.initialIdentity], ['discoverByAttributes', report.initialAttributes]]) {
        const row = findTrace(method, response); assert.ok(row)
        assert.deepEqual(row.args[0], method === 'discoverByIdentityKey' ? { identityKey: cert.subject, forceRefresh: true } : { attributes: { name: 'TPNIL boundary identity' }, forceRefresh: true })
        assert.ok(Array.isArray(response.certificates)); assert.ok(!response.certificates.some((r: any) => match(r, cert)))
      }
    },
    'identity-trust.public-settings-token': async () => {
      const expected = structuredClone(report.originalSettings)
      expected.trustSettings.trustedCertifiers.push({ identityKey: cert.certifier, name: 'TPNIL scoped fixture issuer', description: 'Temporary qualification-only trust', trust: 4 })
      assert.deepEqual(report.temporarySettings, expected); assert.deepEqual(report.temporaryReadback, expected)
      await verifyToken(report.temporaryOutputs, expected, true)
    },
    'identity-trust.cache-expiry': async () => {
      assert.equal(report.wait.requiredMs, 120000)
      const begin = Date.parse(report.wait.startedAt), end = Date.parse(report.wait.endedAt)
      assert.ok(Number.isFinite(begin) && Number.isFinite(end) && end - begin >= 120000)
      assert.ok(Number.isSafeInteger(report.wait.monotonicElapsedMs) && report.wait.monotonicElapsedMs >= 120000)
      assert.ok(Math.abs(end - begin - report.wait.monotonicElapsedMs) <= 1000, 'Wall and monotonic cache waits disagree')
      const exclusions = trace.filter(r => ['discoverByIdentityKey', 'discoverByAttributes'].includes(r.method))
      assert.ok(exclusions.length === 2 && exclusions.every(r => Date.parse(r.endedAt) <= begin))
      const { write, readback } = await verifyToken(report.temporaryOutputs, report.temporarySettings, true)
      assert.ok(Date.parse(write.endedAt) <= begin && Date.parse(readback.endedAt) <= begin)
      const restoration = trace.slice(trace.indexOf(readback) + 1)
      assert.ok(restoration.length > 0 && restoration.every(r => Date.parse(r.startedAt) >= end), 'Cache wait must finish before restoration begins')
    },
    'identity-trust.positive-discovery': () => {
      assert.equal(boundary.discoveryExpectation, 'published')
      const expected = ['discoverByIdentityKey', 'discoverByAttributes'].map(method => boundary.trace.find((r: any) => r.method === method))
      assert.equal(boundary.trace.filter((r: any) => ['discoverByIdentityKey', 'discoverByAttributes'].includes(r.method)).length, 2)
      assert.deepEqual(report.positiveDiscovery, expected)
      const proofIndex = boundary.trace.findIndex((r: any) => r.method === 'proveCertificate' && r.args?.verifier === '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798')
      const retirementIndex = boundary.trace.findIndex((r: any) => r.method === 'relinquishCertificate')
      assert.ok(proofIndex >= 0 && retirementIndex > proofIndex)
      assert.ok(boundary.trace.indexOf(expected[0]) < boundary.trace.indexOf(expected[1]), 'Identity and attribute discovery must retain source order')
      for (const response of expected) {
        assert.deepEqual(response?.args, response?.method === 'discoverByIdentityKey' ? { identityKey: cert.subject, seekPermission: true } : { attributes: { name: 'TPNIL boundary identity' }, seekPermission: true })
        const index = boundary.trace.indexOf(response)
        assert.ok(index > proofIndex && index < retirementIndex, 'Discovery must follow publication preparation and precede certificate retirement')
        const found = response?.result?.certificates.find((r: any) => match(r, cert)); assert.ok(found)
        for (const field of certificateFields) assert.deepEqual(found[field], cert[field], `Discovered certificate differs: ${field}`)
        assert.deepEqual(found.decryptedFields, { name: 'TPNIL boundary identity' })
      }
    },
    'identity-trust.settings-restored': async () => {
      assert.deepEqual(report.restoredSettings, report.originalSettings)
      findOutputs(report.originalOutputs); findOutputs(report.restoredOutputs)
      assert.ok([0, 1].includes(report.originalOutputs.totalOutputs)); assert.equal(report.restoredOutputs.totalOutputs, report.originalOutputs.totalOutputs)
      if (report.originalOutputs.totalOutputs === 1) await verifyToken(report.originalOutputs, report.originalSettings)
      if (report.restoredOutputs.totalOutputs === 1) await verifyToken(report.restoredOutputs, report.originalSettings, true)
      else assert.deepEqual(report.restoredOutputs.outputs, [])
    },
    'identity-trust.temporary-token-spent': async () => {
      const outpoint = report.temporaryOutputs.outputs[0].outpoint, [txid, vout] = outpoint.split('.')
      const receipt = report.retirementTransaction, tx = Transaction.fromAtomicBEEF(receipt.beef)
      assert.equal(tx.id('hex'), receipt.txid); assert.equal(tx.toHex(), receipt.raw); assert.ok(await tx.verify(tracker))
      assert.ok(tx.inputs.some(i => i.sourceTXID === txid && i.sourceOutputIndex === Number(vout)))
      assert.ok(!report.restoredOutputs.outputs.some((r: any) => r.outpoint === outpoint))
      assert.ok(trace.some(r => ['createAction', 'signAction'].includes(r.method) && r.result?.txid === receipt.txid && r.result?.tx && Transaction.fromAtomicBEEF(r.result.tx).toHex() === receipt.raw))
    },
    'identity-trust.public-boundary-only': () => {
      const allowed = ['getPublicKey', 'createAction', 'signAction', 'listOutputs', 'encrypt', 'decrypt', 'createSignature', 'discoverByIdentityKey', 'discoverByAttributes']
      assert.ok(trace.length > 0 && trace.every(r => allowed.includes(r.method)))
      for (const [index, row] of trace.entries()) {
        assert.ok(Date.parse(row.startedAt) <= Date.parse(row.endedAt))
        if (index > 0) assert.ok(Date.parse(trace[index - 1].endedAt) <= Date.parse(row.startedAt), 'Public settings calls must preserve recorded sequential order')
      }
    },
    'identity-trust.cleanup': async () => {
      assert.equal(report.cleanup.attempted, true); assert.equal(report.cleanup.restored, true)
      await predicates['identity-trust.settings-restored']!(); await predicates['identity-trust.temporary-token-spent']!()
    }
  }
  const assertions = []
  for (const observation of report.assertions) {
    let result = 'PASS'
    try { await predicates[observation.id]!() } catch { result = 'FAIL' }
    assert.equal(observation.result, result, `Independent native trust predicate differs: ${observation.id}`)
    assertions.push({ id: observation.id, result })
  }
  const expectedTransactions = new Set(trace.filter(r => ['createAction', 'signAction'].includes(r.method) && r.result?.tx).map(r => Transaction.fromAtomicBEEF(r.result.tx).id('hex')))
  for (const state of [report.temporaryOutputs, report.restoredOutputs]) for (const output of state?.outputs ?? []) expectedTransactions.add(output.outpoint.split('.')[0])
  assert.deepEqual((report.transactions ?? []).map((r: any) => r.txid).sort(), [...expectedTransactions].sort())
  for (const receipt of report.transactions ?? []) {
    const tx = Transaction.fromAtomicBEEF([...Buffer.from(receipt.beefHex, 'hex')])
    assert.equal(tx.id('hex'), receipt.txid); assert.equal(tx.toHex(), receipt.rawHex); assert.ok(await tx.verify(tracker))
  }
  const result = assertions.every(r => r.result === 'PASS') ? 'PASS' : 'FAIL'
  assert.equal(report.result, result)
  return { verified: true, result, assertions, transactions: report.transactions?.length ?? 0, claim: 'ENGINEERING_OBSERVATION_ONLY' }
}
if (process.argv[1] === import.meta.filename) {
  const directory = path.resolve(process.argv[2]!)
  const report = JSON.parse(fs.readFileSync(path.join(directory, 'identity-trust.json'), 'utf8'))
  const boundary = JSON.parse(fs.readFileSync(path.join(directory, 'boundary.json'), 'utf8'))
  const result = await verifyNativeTrust(report, boundary)
  const tamperRejections = []
  if (report.assertions.find((r: any) => r.id === 'identity-trust.cache-expiry')?.result === 'PASS') {
    const tampered = structuredClone(report)
    tampered.wait.endedAt = tampered.wait.startedAt
    await assert.rejects(verifyNativeTrust(tampered, boundary), /Independent native trust predicate differs/)
    tamperRejections.push('missing-real-cache-expiry')
  }
  if (report.assertions.find((r: any) => r.id === 'identity-trust.settings-restored')?.result === 'PASS') {
    const tampered = structuredClone(report)
    tampered.restoredSettings.currency = 'ALTERED'
    await assert.rejects(verifyNativeTrust(tampered, boundary), /Independent native trust predicate differs/)
    tamperRejections.push('changed-original-settings-restoration')
  }
  if (report.assertions.find((r: any) => r.id === 'identity-trust.temporary-token-spent')?.result === 'PASS') {
    const tampered = structuredClone(report)
    const txid = report.temporaryOutputs.outputs[0].outpoint.split('.')[0]
    const written = report.transactions.find((r: any) => r.txid === txid)
    tampered.retirementTransaction = { txid: written.txid, raw: written.rawHex, beef: [...Buffer.from(written.beefHex, 'hex')] }
    await assert.rejects(verifyNativeTrust(tampered, boundary), /Independent native trust predicate differs/)
    tamperRejections.push('valid-transaction-that-does-not-spend-temporary-token')
  }
  console.log(JSON.stringify({ ...result, tamperRejections }))
}
