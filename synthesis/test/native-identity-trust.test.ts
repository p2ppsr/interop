import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'
import { Beef, LockingScript, Transaction } from '@bsv/sdk'
import { expect, it } from 'vitest'
import { verifyNativeTrust, verifySettingsTokenSignature } from '../src/wallet-lab/native/verify-identity-trust.js'
import { verifyBoundaryCorpus } from '../src/wallet-lab/verify-boundary.js'
import { EvidenceBundle } from '../src/wallet-lab/evidence.js'
import { PublicSettingsTrust } from '../src/wallet-lab/native/identity-trust.js'

it('serializes live optional wallet arguments without conflating undefined with null', async () => {
  const calls: any[] = []
  const returned = { totalOutputs: 0, outputs: [], optional: undefined, explicitNull: null, 'a~/b': undefined }
  const wallet = { listOutputs: async (...args: any[]) => { calls.push(args); return returned }, discoverByIdentityKey: async () => { throw new Error('Intentional stop before trust mutation') } }
  const helper = new PublicSettingsTrust(wallet)
  await helper.enable({ certifier: '03e7e9acacbdb43fc9fb71a8db1536c0f866caa78def49f666fa121a6f7954bb01', subject: 'fixture' })
  expect(calls[0]).toHaveLength(2); expect(calls[0][1]).toBeUndefined()
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-trust-raw-'))
  try {
    const evidence = new EvidenceBundle(temporary)
    evidence.addJson('identity-trust.json', helper.report); evidence.flush()
    const observed = JSON.parse(fs.readFileSync(path.join(temporary, 'evidence/identity-trust.json'), 'utf8'))
    expect(observed.trace[0].args).toHaveLength(2); expect(observed.trace[0].args[1]).toBeNull()
    expect(observed.serialization.undefinedPaths).toContain('/trace/0/args/1')
    expect(observed.serialization.undefinedPaths).toContain('/trace/0/result/optional')
    expect(observed.serialization.undefinedPaths).toContain('/trace/0/result/a~0~1b')
    expect(observed.serialization.undefinedPaths).not.toContain('/trace/0/result/explicitNull')
    expect(observed.trace[0].result.explicitNull).toBeNull()
    expect(observed.trace[1].args).toHaveLength(1)
    expect(observed.serialization.undefinedPaths).not.toContain('/trace/1/args/1')
    const detached = helper.report; detached.trace[0].result.totalOutputs = 99
    expect(helper.report.trace[0].result.totalOutputs).toBe(0)
    expect(returned.optional).toBeUndefined(); expect(returned.totalOutputs).toBe(0)
  } finally { fs.rmSync(temporary, { recursive: true, force: true }) }
})

it('replays canonical files written directly from both live settings helpers', async () => {
  const directory = path.resolve(import.meta.dirname, '../../journals/native-identity-trust-reference/2026-11-06/undefined-evidence-fix')
  const summary = JSON.parse(fs.readFileSync(path.join(directory, 'summary.json'), 'utf8'))
  const bytes = fs.readFileSync(path.join(directory, summary.archive.path))
  const sha = (value: Buffer) => createHash('sha256').update(value).digest('hex')
  assert.equal(bytes.length, summary.archive.size); assert.equal(sha(bytes), summary.archive.sha256)
  const archive = JSON.parse(gunzipSync(bytes, { maxOutputLength: 16 * 1024 * 1024 }).toString())
  const files = new Map<string, string>()
  for (const row of archive.files) {
    const bytes = Buffer.from(row.content); assert.equal(bytes.length, row.size); assert.equal(sha(bytes), row.sha256)
    assert.ok(!files.has(row.path)); files.set(row.path, row.content)
  }
  for (const run of summary.runs) {
    const prefix = `${run.directory}/native-format/evidence/integrated/`
    const reportText = files.get(`${prefix}identity-trust.json`)!
    const report = JSON.parse(reportText), boundary = JSON.parse(files.get(`${prefix}boundary.json`)!)
    const receipt = JSON.parse(files.get(`${run.directory}/direct-trust-write.json`)!)
    assert.equal(receipt.noIntermediateJsonSerialization, true)
    assert.equal(receipt.files.length, 1); assert.equal(receipt.files[0].sha256, sha(Buffer.from(reportText)))
    assert.equal(report.serialization.encoding, 'null-with-undefined-json-pointers@1')
    assert.ok(report.serialization.undefinedPaths.some((pointer: string) => /^\/trace\/[0-9]+\/args\/1$/.test(pointer)))
    expect((await verifyNativeTrust(report, boundary)).result).toBe('PASS')
    expect((await verifyBoundaryCorpus(boundary, JSON.parse(files.get(`${prefix}boundary-publication.json`)!))).outcome).toBe('PASS')
  }
})

it('replays both public settings retirement cases and rejects semantic tampering', async () => {
  const directory = path.resolve(import.meta.dirname, '../../journals/native-identity-trust-reference/2026-11-06')
  const summary = JSON.parse(fs.readFileSync(path.join(directory, 'summary.json'), 'utf8'))
  const bytes = fs.readFileSync(path.join(directory, summary.archive.path))
  const sha = (value: Buffer) => createHash('sha256').update(value).digest('hex')
  assert.equal(bytes.length, summary.archive.size); assert.equal(sha(bytes), summary.archive.sha256)
  const bundle = JSON.parse(gunzipSync(bytes, { maxOutputLength: 16 * 1024 * 1024 }).toString())
  assert.equal(bundle.nativeExecution, false); assert.equal(bundle.files.length, summary.archive.files)
  const files = new Map<string, string>()
  for (const row of bundle.files) {
    const data = Buffer.from(row.content)
    assert.equal(data.length, row.size); assert.equal(sha(data), row.sha256)
    assert.ok(!files.has(row.path)); files.set(row.path, row.content)
  }
  for (const run of summary.runs) {
    const report = JSON.parse(files.get(`${run.directory}/identity-trust.json`)!)
    const boundary = JSON.parse(files.get(`${run.directory}/boundary.json`)!)
    const verified = await verifyNativeTrust(report, boundary)
    expect(verified.result).toBe('PASS'); expect(verified.assertions).toHaveLength(8)
    expect(report.originalOutputs.totalOutputs).toBe(run.originalSettingsTokens)
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-trust-serialization-'))
    try {
      const bundle = new EvidenceBundle(temporary)
      const publication = JSON.parse(files.get(`${run.directory}/boundary-publication.json`)!)
      for (const [name, value] of [['identity-trust', report], ['boundary', boundary], ['boundary-publication', publication]]) bundle.addJson(`integrated/${name}.json`, value)
      bundle.flush()
      const read = (name: string) => JSON.parse(fs.readFileSync(path.join(temporary, `evidence/integrated/${name}.json`), 'utf8'))
      expect((await verifyNativeTrust(read('identity-trust'), read('boundary'))).result).toBe('PASS')
      expect((await verifyBoundaryCorpus(read('boundary'), read('boundary-publication'))).outcome).toBe('PASS')
    } finally { fs.rmSync(temporary, { recursive: true, force: true }) }
    const noWait = structuredClone(report); noWait.wait.endedAt = noWait.wait.startedAt
    await expect(verifyNativeTrust(noWait, boundary)).rejects.toThrow('Independent native trust predicate differs')
    const changedSettings = structuredClone(report); changedSettings.restoredSettings.currency = 'ALTERED'
    await expect(verifyNativeTrust(changedSettings, boundary)).rejects.toThrow('Independent native trust predicate differs')
    const unspent = structuredClone(report)
    const writeTx = report.transactions.find((tx: any) => tx.txid === report.temporaryOutputs.outputs[0].outpoint.split('.')[0])
    unspent.retirementTransaction = { txid: writeTx.txid, raw: writeTx.rawHex, beef: [...Buffer.from(writeTx.beefHex, 'hex')] }
    await expect(verifyNativeTrust(unspent, boundary)).rejects.toThrow('Independent native trust predicate differs')

    const mutations: Array<[string, (r: any, b: any) => void]> = [
      ['unrelated initial identity query', r => { r.trace.find((t: any) => t.method === 'discoverByIdentityKey').args[0].identityKey = '02' + '00'.repeat(32) }],
      ['unrelated initial attribute query', r => { r.trace.find((t: any) => t.method === 'discoverByAttributes').args[0].attributes.name = 'unrelated identity' }],
      ['missing initial refresh', r => { delete r.trace.find((t: any) => t.method === 'discoverByIdentityKey').args[0].forceRefresh }],
      ['wait after restoration', r => { const begin = Date.parse(r.wait.startedAt) + 86_400_000; r.wait.startedAt = new Date(begin).toISOString(); r.wait.endedAt = new Date(begin + r.wait.monotonicElapsedMs).toISOString() }],
      ['wait before temporary readback', r => { r.wait.startedAt = r.trace[0].startedAt; r.wait.monotonicElapsedMs = Date.parse(r.wait.endedAt) - Date.parse(r.wait.startedAt) }],
      ['infinite monotonic duration', r => { r.wait.monotonicElapsedMs = Infinity }],
      ['fractional monotonic duration', r => { r.wait.monotonicElapsedMs += 0.25 }],
      ['inconsistent monotonic duration', r => { r.wait.monotonicElapsedMs += 10_000 }],
      ['unrelated positive query', (r, b) => { b.trace.find((t: any) => t.method === 'discoverByAttributes').args.attributes.name = 'unrelated identity'; r.positiveDiscovery = ['discoverByIdentityKey', 'discoverByAttributes'].map(method => b.trace.find((t: any) => t.method === method)) }],
      ['changed discovered signed fields', (r, b) => { b.trace.find((t: any) => t.method === 'discoverByIdentityKey').result.certificates[0].fields.name = 'different ciphertext'; r.positiveDiscovery = ['discoverByIdentityKey', 'discoverByAttributes'].map(method => b.trace.find((t: any) => t.method === method)) }],
      ['wrong public signing protocol', r => { r.trace.filter((t: any) => t.method === 'createSignature').forEach((t: any) => { t.args[0].protocolID = [2, 'unrelated protocol'] }) }],
      ['wrong public signing data', r => { r.trace.filter((t: any) => t.method === 'createSignature').forEach((t: any) => { t.args[0].data = [0] }) }],
      ['wrong public derivation key', r => { r.trace.filter((t: any) => t.method === 'getPublicKey').forEach((t: any) => { t.args[0].keyID = 'unrelated key' }) }]
    ]
    for (const [name, mutate] of mutations) {
      const changed = structuredClone(report), changedBoundary = structuredClone(boundary)
      mutate(changed, changedBoundary)
      await expect(verifyNativeTrust(changed, changedBoundary), name).rejects.toThrow('Independent native trust predicate differs')
    }

    // Output data signatures are distinct from the signed spending transaction.
    // Altering ciphertext keeps the DER signature valid but invalidates its message.
    const [txid, vout] = report.temporaryOutputs.outputs[0].outpoint.split('.')
    const transaction = Transaction.fromAtomicBEEF(Beef.fromBinary(report.temporaryOutputs.BEEF).toBinaryAtomic(txid))
    const token = transaction.outputs[Number(vout)]!.lockingScript
    expect(() => verifySettingsTokenSignature(token)).not.toThrow()
    const changedToken = LockingScript.fromHex(token.toHex())
    changedToken.chunks[2]!.data![0]! ^= 1
    expect(() => verifySettingsTokenSignature(changedToken)).toThrow('Settings token data signature invalid')
    const extraField = new LockingScript([...token.chunks.slice(0, 4), { op: 1, data: [1] }, ...token.chunks.slice(4)])
    expect(() => verifySettingsTokenSignature(extraField)).toThrow('Settings token must contain ciphertext and its signature')

    const { verifyIntegratedWalletIdentity } = await import(pathToFileURL(path.resolve(import.meta.dirname, '../../scripts/verify-native-integrated.mjs')).href)
    const nativeIdentity = boundary.trace.find((t: any) => t.method === 'getPublicKey' && t.args.identityKey)?.result.publicKey
    expect(() => verifyIntegratedWalletIdentity(nativeIdentity, boundary, report)).not.toThrow()
    expect(() => verifyIntegratedWalletIdentity('02' + '00'.repeat(32), boundary, report)).toThrow('Boundary corpus belongs to a different native wallet')
    const foreignTrust = structuredClone(report); foreignTrust.certificate.subject = '02' + '00'.repeat(32)
    expect(() => verifyIntegratedWalletIdentity(nativeIdentity, boundary, foreignTrust)).toThrow('Trust certificate belongs to a different native wallet')
  }
})
