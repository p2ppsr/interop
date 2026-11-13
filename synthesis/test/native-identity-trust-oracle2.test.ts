import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { gunzipSync } from 'node:zlib'
import { expect, it } from 'vitest'
import { PublicSettingsTrust } from '../src/wallet-lab/native/identity-trust.js'
import { getIdentityTrustOracle2Policy, identityTrustOracle2Id } from '../src/wallet-lab/native/identity-trust-oracle2.js'
import { verifyNativeTrust } from '../src/wallet-lab/native/verify-identity-trust.js'

const root = path.resolve(import.meta.dirname, '../..'), directory = path.join(root, 'fixtures/native-identity-trust/43157433977')
const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'))
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const original: Record<string, any> = {}
for (const item of manifest.files) {
  const stored = fs.readFileSync(path.join(directory, item.path)), raw = gunzipSync(stored)
  assert.equal(stored.length, item.bytes); assert.equal(sha(stored), item.sha256)
  assert.equal(raw.length, item.rawBytes); assert.equal(sha(raw), item.rawSha256)
  original[item.path.replace('.gz', '')] = JSON.parse(raw.toString())
}
const options = { oracle: identityTrustOracle2Id }
function sample() {
  const report = structuredClone(original['identity-trust.json']), boundary = structuredClone(original['boundary.json'])
  report.oracle = identityTrustOracle2Id; report.oraclePolicySha256 = getIdentityTrustOracle2Policy().policySha256
  return { report, boundary }
}
const discoveries = (boundary: any) => boundary.trace.filter((r: any) => ['discoverByIdentityKey', 'discoverByAttributes'].includes(r.method))
const proof = (boundary: any) => boundary.trace.find((r: any) => r.method === 'proveCertificate' && r.args.verifier === getIdentityTrustOracle2Policy().policy.binding.verifier)
const synchronize = (report: any, boundary: any) => { report.positiveDiscovery = structuredClone(discoveries(boundary)) }

it('retains the original legacy rejection and independently verifies only an explicitly derived oracle2 sample', async () => {
  await expect(verifyNativeTrust(original['identity-trust.json'], original['boundary.json'])).rejects.toThrow('identity-trust.positive-discovery')
  const { report, boundary } = sample(), result = await verifyNativeTrust(report, boundary, options)
  expect(result.result).toBe('PASS'); expect(result.assertions).toHaveLength(8)
  expect(result.oracle).toBe(identityTrustOracle2Id)
  expect(original['identity-trust.json'].oracle).toBeUndefined()
})

it('requires exact producer and parent oracle selection with a lazy policy hash', async () => {
  const legacy = new PublicSettingsTrust({}).report
  expect(legacy.oracle).toBeUndefined(); expect(legacy.oraclePolicySha256).toBeUndefined()
  const next = new PublicSettingsTrust({}, options).report
  expect(next.oracle).toBe(identityTrustOracle2Id); expect(next.oraclePolicySha256).toBe(getIdentityTrustOracle2Policy().policySha256)
  const { report, boundary } = sample()
  await expect(verifyNativeTrust(report, boundary)).rejects.toThrow('explicit parent selection')
  await expect(verifyNativeTrust(original['identity-trust.json'], boundary, options)).rejects.toThrow('explicit parent selection')
  report.oraclePolicySha256 = '0'.repeat(64)
  await expect(verifyNativeTrust(report, boundary, options)).rejects.toThrow('policy binding')
  expect(() => getIdentityTrustOracle2Policy('unsupported')).toThrow('Unsupported native trust oracle')
})

it('scores a corrupt keyring or contradictory discovery as a producer FAIL without replacing the SUT return', async () => {
  for (const corrupted of ['none', 'keyring', 'error']) {
    const { report, boundary } = sample(), helper = new PublicSettingsTrust({}, options)
    // Isolated producer self-test; these private helper fixtures are never native evidence.
    ;(helper as any).observation.certificate = structuredClone(report.certificate)
    if (corrupted === 'keyring') discoveries(boundary)[0].result.certificates[0].publiclyRevealedKeyring.name = Buffer.from('corrupt key').toString('base64')
    if (corrupted === 'error') discoveries(boundary)[0].error = { message: 'discovery failed' }
    await helper.finish(boundary)
    expect(helper.report.assertions.find((a: any) => a.id === 'identity-trust.positive-discovery').result).toBe(corrupted === 'none' ? 'PASS' : 'FAIL')
    expect(helper.report.positiveDiscovery[0].result).toEqual(discoveries(boundary)[0].result)
  }
})

const mutations: Array<[string, (report: any, boundary: any) => void]> = [
  ['legacy field cannot replace the required public field', (_r, b) => { for (const d of discoveries(b)) { const c = d.result.certificates[0]; c.keyring = c.publiclyRevealedKeyring; delete c.publiclyRevealedKeyring } }],
  ['discovery cannot substitute another keyring', (_r, b) => { discoveries(b)[0].result.certificates[0].publiclyRevealedKeyring.name = Buffer.from('unrelated key').toString('base64') }],
  ['proof cannot substitute another keyring', (_r, b) => { proof(b).result.keyringForVerifier.name = Buffer.from('unrelated key').toString('base64') }],
  ['the public proof must select exactly the disclosed field', (_r, b) => { proof(b).args.fieldsToReveal.push('secret') }],
  ['the public proof must target the acquired certificate', (_r, b) => { proof(b).args.certificate.serialNumber = Buffer.alloc(32, 99).toString('base64') }],
  ['the proof cannot contain both a result and an error', (_r, b) => { proof(b).error = { message: 'proof failed' } }],
  ['discovery cannot contain both a result and an error', (_r, b) => { discoveries(b)[0].error = { message: 'discovery failed' } }],
  ['duplicate anyone proof is ambiguous', (_r, b) => { b.trace.push(structuredClone(proof(b))) }],
  ['duplicate matching discovery is ambiguous', (_r, b) => { discoveries(b)[0].result.certificates.push(structuredClone(discoveries(b)[0].result.certificates[0])) }],
  ['reported plaintext cannot replace independent decryption', (_r, b) => { discoveries(b)[0].result.certificates[0].decryptedFields.name = 'forged plaintext' }],
  ['congruent forged signed fields still fail issuer authentication', (r, b) => {
    const fields = { name: Buffer.from('different signed ciphertext').toString('base64') }
    r.certificate.fields = fields; b.trace.find((x: any) => x.method === 'acquireCertificate').args.fields = structuredClone(fields)
    for (const d of discoveries(b)) d.result.certificates[0].fields = structuredClone(fields)
  }],
  ['congruent corrupt keyrings still fail independent public decryption', (r, b) => {
    const bytes = Buffer.from(r.certificate.keyring.name, 'base64'); bytes[bytes.length - 1]! ^= 1
    const keyring = { name: bytes.toString('base64') }; r.certificate.keyring = keyring; proof(b).result.keyringForVerifier = structuredClone(keyring)
    for (const d of discoveries(b)) d.result.certificates[0].publiclyRevealedKeyring = structuredClone(keyring)
  }],
  ['an extra undisclosed key cannot pass by matching all copies', (r, b) => {
    r.certificate.keyring.secret = r.certificate.keyring.name; proof(b).result.keyringForVerifier = structuredClone(r.certificate.keyring)
    for (const d of discoveries(b)) d.result.certificates[0].publiclyRevealedKeyring = structuredClone(r.certificate.keyring)
  }]
]
for (const [name, mutate] of mutations) it(name, async () => {
  const { report, boundary } = sample(); mutate(report, boundary); synchronize(report, boundary)
  await expect(verifyNativeTrust(report, boundary, options)).rejects.toThrow('identity-trust.positive-discovery')
})

it('passes the explicit oracle through the actual CLI and all retained settings tamper controls', () => {
  const { report, boundary } = sample(), temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-trust2-')))
  try {
    fs.writeFileSync(path.join(temporary, 'identity-trust.json'), JSON.stringify(report)); fs.writeFileSync(path.join(temporary, 'boundary.json'), JSON.stringify(boundary))
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/verify-native-trust.mjs'), temporary, '--oracle-2'], { encoding: 'utf8', timeout: 60_000 })
    expect(result.status, result.stderr).toBe(0)
    const value = JSON.parse(result.stdout.slice(result.stdout.lastIndexOf('\n{') + 1).trim())
    expect(value.verified).toBe(true); expect(value.oracle).toBe(identityTrustOracle2Id); expect(value.assertions).toHaveLength(8); expect(value.tamperRejections).toHaveLength(3)
  } finally { fs.rmSync(temporary, { recursive: true, force: true }) }
}, 65_000)
