import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { LockingScript, PrivateKey, ProtoWallet, Transaction, UnlockingScript } from '@bsv/sdk'
import { beforeAll, expect, it } from 'vitest'
import { canonicalJson } from '../src/determinism.js'
import { coverageExtensionIds, coverageExtensionPolicy, privilegedMethods, reasonVariants, type CoverageExtensionReport } from '../src/wallet-lab/native/coverage-extension-model.js'
import { deriveCoverageExtensionOutcomes, verifyCoverageExtensionDiscoveryAnchor, verifyCoverageExtensionParentBindings, verifyNativeCoverageExtension } from '../src/wallet-lab/native/coverage-extension-verifier.js'
import { getIdentityTrustOracle2Policy, identityTrustOracle2Id } from '../src/wallet-lab/native/identity-trust-oracle2.js'

const root = path.resolve(import.meta.dirname, '../..'), directory = path.join(root, 'programs/ISI-4/profiles/native-coverage-extension-1.0.0/reference')
const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'))
const packed = fs.readFileSync(path.join(directory, manifest.file.path)), raw = gunzipSync(packed), sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')
assert.equal(sha(packed), manifest.file.sha256); assert.equal(packed.length, manifest.file.bytes); assert.equal(sha(raw), manifest.file.rawSha256); assert.equal(raw.length, manifest.file.rawBytes)
const original: CoverageExtensionReport = JSON.parse(raw.toString())
const sample = () => structuredClone(original)
const row = (r: CoverageExtensionReport, id: string) => r.trace.find(x => x.id === id)!
const prefix = (id: string) => `coverage-extension.${id}`
const reevaluate = async (r: CoverageExtensionReport) => { r.assertions = await deriveCoverageExtensionOutcomes(r); r.result = r.assertions.some(x => x.result === 'FAIL') ? 'FAIL' : r.assertions.some(x => x.result === 'BLOCKED') ? 'BLOCKED' : 'PASS'; return r }
const outcome = async (r: CoverageExtensionReport, id: string) => (await deriveCoverageExtensionOutcomes(r)).find(x => x.id === prefix(id))!.result
let baseline: Awaited<ReturnType<typeof verifyNativeCoverageExtension>>
beforeAll(async () => { baseline = await verifyNativeCoverageExtension(original) })

it('retains the actual73-call Go-backed reference including all43 failures and2 missing-trust blocks', () => {
  expect(manifest.claim).toBe('LAB_SELF_TEST_ONLY_REAL_TYPESCRIPT_TO_GO_NOT_NATIVE_QUALIFICATION')
  expect(manifest.sourceStable).toBe(true); expect(original.trace).toHaveLength(73); expect(baseline.counts).toEqual({ PASS: 16, FAIL: 43, BLOCKED: 2 })
  expect(baseline.transactions).toHaveLength(7); expect(baseline.finalLedgerRequired).toBe(true); expect(baseline.assertions.map(x => x.id)).toEqual(coverageExtensionIds)
  expect(coverageExtensionPolicy.variantRows).toHaveLength(19)
  expect(coverageExtensionPolicy.variantRows.flatMap((r: any) => r.predicates).sort()).toEqual([...coverageExtensionIds].sort())
})
it('replays canonical evidence without rewriting error verdicts or details', async () => {
  expect(await verifyNativeCoverageExtension(JSON.parse(canonicalJson(original)))).toEqual(baseline)
})
it('does not mistake missing privileged-key-manager errors for reason validation', () => {
  for (const method of privilegedMethods) for (const reason of reasonVariants) expect(baseline.assertions.find(x => x.id === prefix(`privileged.${reason}.${method}`))!.result).toBe('FAIL')
})
// Synthetic errors below are an explicitly adversarial oracle control over real
// ordinary method results. They never replace the immutable reference capture.
function namedReasonControl() { const r = sample(); for (const method of privilegedMethods) for (const reason of reasonVariants) row(r, `privileged.${reason}.${method}`).error = { name: 'WERR_INVALID_PARAMETER', code: 6, parameter: 'privilegedReason', message: reason === 'missing-reason' ? 'privilegedReason is required' : 'privilegedReason must be between5 and50 characters' }; return r }
it('authenticates all nine actual ordinary controls before accepting any named reason-validation control', async () => {
  const outcomes = await deriveCoverageExtensionOutcomes(namedReasonControl())
  for (const method of privilegedMethods) for (const reason of reasonVariants) expect(outcomes.find(x => x.id === prefix(`privileged.${reason}.${method}`))!.result).toBe('PASS')
})
const ordinaryMutations: Record<string, (value: any) => void> = {
  getPublicKey: value => { value.publicKey = original.identity },
  revealCounterpartyKeyLinkage: value => { value.encryptedLinkageProof[10] ^= 1 },
  revealSpecificKeyLinkage: value => { value.encryptedLinkage[10] ^= 1 },
  encrypt: value => { value.ciphertext[value.ciphertext.length - 1] ^= 1 },
  decrypt: value => { value.plaintext[0] ^= 1 },
  createHmac: value => { value.hmac[0] ^= 1 },
  verifyHmac: value => { value.valid = false },
  createSignature: value => { value.signature[value.signature.length - 1] ^= 1 },
  verifySignature: value => { value.valid = false }
}
for (const method of privilegedMethods) it(`rejects corrupt actual ${method} control despite named privilegedReason errors`, async () => {
  const r = namedReasonControl(); ordinaryMutations[method]!(row(r, `ordinary.${method}`).result)
  if (method === 'createSignature') row(r, 'crypto.default-negative').args.signature = structuredClone(row(r, 'ordinary.createSignature').result.signature)
  expect(await outcome(r, `privileged.missing-reason.${method}`)).toBe('FAIL')
})
it.each(['network timeout', 'Privileged operations require a privileged key manager', 'Permission denied for privilegedReason', 'The operation failed'])('rejects unrelated privileged failure: %s', async message => {
  const r = namedReasonControl(); row(r, 'privileged.missing-reason.encrypt').error.message = message
  expect(await outcome(r, 'privileged.missing-reason.encrypt')).toBe('FAIL')
})
it('rejects result plus reason error and a short reason substituted into the missing branch', async () => {
  const r = namedReasonControl(); row(r, 'privileged.missing-reason.encrypt').result = row(r, 'ordinary.encrypt').result
  expect(await outcome(r, 'privileged.missing-reason.encrypt')).toBe('FAIL')
  row(r, 'privileged.missing-reason.encrypt').args.privilegedReason = 'abcd'
  await expect(deriveCoverageExtensionOutcomes(r)).rejects.toThrow('whole arguments')
})
it('rejects omitted, duplicated and reordered public calls independently of outcomes', async () => {
  for (const mutation of [(r: CoverageExtensionReport) => { r.trace.splice(2, 1) }, (r: CoverageExtensionReport) => { r.trace[2] = structuredClone(r.trace[1]!) }, (r: CoverageExtensionReport) => { [r.trace[1], r.trace[2]] = [r.trace[2]!, r.trace[1]!] }]) { const r = sample(); mutation(r); await expect(deriveCoverageExtensionOutcomes(r)).rejects.toThrow() }
})
for (const [name, id, mutate] of [
  ['hash-only valid:false', 'crypto.hash-only', (r: CoverageExtensionReport) => { r.anchors.clauses.trace.find((x: any) => x.id === 'control.input.verifySignature.hashToDirectlyVerify.0').result.valid = false }],
  ['changed precomputed hash', 'crypto.hash-only', (r: CoverageExtensionReport) => { r.anchors.clauses.trace.find((x: any) => x.id === 'control.input.verifySignature.hashToDirectlyVerify.0').args.hashToDirectlyVerify[0] ^= 1 }],
  ['changed explicit forSelf', 'crypto.forSelf-true', (r: CoverageExtensionReport) => { r.anchors.boundary.trace.find((x: any) => x.method === 'verifySignature').args.forSelf = false }],
  ['wrong identity override', 'crypto.identityKey-override', (r: CoverageExtensionReport) => { row(r, 'crypto.identity-true').result = structuredClone(row(r, 'crypto.identity-false').result) }],
  ['accepted wrong-direction signature', 'crypto.forSelf-false-default', (r: CoverageExtensionReport) => { delete row(r, 'crypto.default-negative').error; row(r, 'crypto.default-negative').result = { valid: true } }],
  ['generic missing-data failure', 'crypto.neither-data-nor-hash', (r: CoverageExtensionReport) => { row(r, 'crypto.missing-create').error = { name: 'Error', message: 'Network error for data or hash' } }],
  ['contradictory positive result', 'crypto.data-only', (r: CoverageExtensionReport) => { r.anchors.boundary.trace.find((x: any) => x.method === 'createSignature').error = { name: 'Error', message: 'Signature failure' } }]
] as Array<[string, string, (r: CoverageExtensionReport) => void]>) it(`rejects ${name}`, async () => { expect(await outcome(original, id)).toBe('PASS'); const r = sample(); mutate(r); expect(await outcome(r, id)).toBe('FAIL') })
it('rejects congruently substituted native signature and native public key using independent derivation', async () => {
  const r = sample(), fake = new ProtoWallet(PrivateKey.fromHex('53'.repeat(32))), signed = r.anchors.boundary.trace.find((x: any) => x.method === 'createSignature')
  signed.result = await fake.createSignature(signed.args)
  const key = r.anchors.boundary.trace.find((x: any) => x.method === 'getPublicKey' && x.args.counterparty === 'anyone'); key.result = await fake.getPublicKey(key.args)
  for (const verify of r.anchors.boundary.trace.filter((x: any) => x.method === 'verifySignature')) verify.args.signature = signed.result.signature
  expect(await outcome(r, 'crypto.anyone-counterparty')).toBe('FAIL')
})
// Four complete cryptographic replays exceeded the default five-second unit
// budget on the shared Linux runner. Keep every replay and its strict verdict.
it('retains lookup-not-found as a basket failure, never a namespace-validation pass', { timeout: 30_000 }, async () => {
  for (const variant of ['bytes-4', 'uppercase', 'double-space', 'trailing-basket']) expect(await outcome(original, `basket.${variant}.relinquishOutput`)).toBe('FAIL')
})
it('accepts valid internalization with additional ordinary result metadata', async () => {
  expect(row(original, 'basket.bytes-5.internalizeAction').result).toHaveProperty('isMerge')
  expect(await outcome(original, 'basket.bytes-5.internalizeAction')).toBe('PASS')
})
it.each(['satoshis', 'lockingScript', 'tags', 'customInstructions'])('rejects substituted valid basket metadata %s', async field => {
  const r = sample(), current = row(r, 'basket.bytes-5.listOutputs'); current.result.outputs[0][field] = field === 'satoshis' ? 99 : field === 'tags' ? ['forged'] : 'forged'
  expect(await outcome(r, 'basket.bytes-5.listOutputs')).toBe('FAIL')
})
it('rejects duplicated basket outpoints and stale removed membership', async () => {
  const r = sample(); row(r, 'basket.bytes-5.listOutputs').result.outputs[1] = structuredClone(row(r, 'basket.bytes-5.listOutputs').result.outputs[0])
  expect(await outcome(r, 'basket.bytes-5.listOutputs')).toBe('FAIL')
  const s = sample(); row(s, 'basket.after-relinquish').result = structuredClone(row(s, 'basket.after-internalize').result)
  expect(await outcome(s, 'basket.bytes-5.relinquishOutput')).toBe('FAIL')
})
it('cannot hide an unknown valid-shaped TXID behind a malformed rejected return', async () => {
  const r = sample(); row(r, 'basket.bytes-0.createAction').result = { txid: 'ab'.repeat(32), tx: [1, 2] }; await reevaluate(r)
  await expect(verifyNativeCoverageExtension(r)).rejects.toThrow('unbound TXID')
})
it('recovers actual stored body behind malformed returned bytes without upgrading its failed predicate', async () => {
  const r = sample(), actual = row(r, 'fixture-native').result; row(r, 'basket.bytes-0.createAction').result = { txid: actual.txid, tx: [1, 2] }; await reevaluate(r)
  const result = await verifyNativeCoverageExtension(r)
  expect(result.assertions.find(x => x.id === prefix('basket.bytes-0.createAction'))!.result).toBe('FAIL')
  expect(result.transactions.find(x => x.callId === 'basket.bytes-0.createAction')?.rawHex).toBe(Transaction.fromAtomicBEEF(actual.tx).toHex())
})

const funding = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/teranode/wab-funding-v1.json'), 'utf8'))
function parentBinding(r = original) {
  const storage = new Map(r.storageTransactions.map(x => [x.txid, Transaction.fromHex(x.rawTxHex)]))
  const mined = Transaction.fromAtomicBEEF([...Buffer.from(funding.atomicBeefHex, 'hex')]); storage.set(mined.id('hex'), mined)
  const remember = (tx: Transaction) => { storage.set(tx.id('hex'), tx); if (tx.id('hex') !== funding.txid) for (const input of tx.inputs) if (input.sourceTransaction) remember(input.sourceTransaction) }
  for (const entry of [...r.submissionPrefix, ...r.submissions]) { try { remember(Transaction.fromAtomicBEEF([...Buffer.from(entry.beefHex, 'hex')])) } catch { remember(Transaction.fromHex(entry.beefHex)) } }
  const submissions = [...r.submissionPrefix, ...r.submissions]
  return { identity: r.identity, ...r.anchors, storage, submissions, finalSubmissions: [...submissions], graph: { resolvedTransactions: storage, requireResolvedAncestors: true, trustedMinedRoot: { txid: funding.txid, rawHex: mined.toHex() } } }
}
it('joins exact original anchors, storage and full final ledger while retaining every failed claim', async () => {
  const result = await verifyCoverageExtensionParentBindings(original, parentBinding())
  expect(result.verified).toBe(true); expect(result.unprovenClaims.length).toBeGreaterThan(0)
  expect(result.protectedClaims.some(x => x.predicateId === prefix('query.relinquished-excluded'))).toBe(true)
  expect(result.transactionOwnershipAndFundingStillRequired).toBe(true)
})
it.each(['identity', 'anchor', 'storage', 'prefix', 'ancestry'])('rejects substituted independent parent %s', async kind => {
  const binding = parentBinding()
  if (kind === 'identity') binding.identity = PrivateKey.fromHex('41'.repeat(32)).toPublicKey().toString()
  if (kind === 'anchor') binding.boundary = { ...binding.boundary, forged: true }
  if (kind === 'storage') binding.storage.delete(row(original, 'fixture-native').result.txid)
  if (kind === 'prefix') binding.finalSubmissions[0] = { ...binding.finalSubmissions[0]!, txid: 'ab'.repeat(32) }
  if (kind === 'ancestry') binding.graph.requireResolvedAncestors = false
  await expect(verifyCoverageExtensionParentBindings(original, binding)).rejects.toThrow()
})
it('rejects a valid delayed relinquished-output spend or hidden descendant, even as a rejected submission', async () => {
  const created = original.anchors.boundary.trace.find((x: any) => x.method === 'createAction' && x.args.description === 'TPNIL boundary token pair').result
  const source = Transaction.fromAtomicBEEF(created.tx)
  const spend = new Transaction(1, [{ sourceTransaction: source, sourceOutputIndex: 1, unlockingScript: UnlockingScript.fromHex('51'), sequence: 0xffffffff }], [{ satoshis: 6, lockingScript: LockingScript.fromHex('51') }], 0)
  const descendant = new Transaction(1, [{ sourceTransaction: spend, sourceOutputIndex: 0, unlockingScript: UnlockingScript.fromHex(''), sequence: 0xffffffff }], [{ satoshis: 5, lockingScript: LockingScript.fromHex('51') }], 0)
  const tracker = { currentHeight: async () => funding.fundingHeight + funding.maturityDepth, isValidRootForHeight: async (merkle: string, height: number) => merkle === funding.merkleRoot && height === funding.fundingHeight }
  expect(await descendant.verify(tracker)).toBe(true)
  for (const transaction of [spend, descendant]) for (const verdict of ['ACCEPTED_BY_NETWORK', 'REJECTED']) { const binding = parentBinding(); binding.finalSubmissions.push({ txid: transaction.id('hex'), beefHex: Buffer.from(transaction.toAtomicBEEF()).toString('hex'), verdict }); await expect(verifyCoverageExtensionParentBindings(original, binding)).rejects.toThrow('protected coverage-extension output') }
}, 30_000)

// Unchanged retained native observations exercise only the discovery metadata
// helper. These derived self-test samples are not new native sessions.
function nativeTrust() {
  const dir = path.join(root, 'fixtures/native-identity-trust/43157433977'), metadata = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')), values: Record<string, any> = {}
  for (const file of metadata.files) { const stored = fs.readFileSync(path.join(dir, file.path)), raw = gunzipSync(stored); assert.equal(sha(stored), file.sha256); assert.equal(sha(raw), file.rawSha256); values[file.path] = JSON.parse(raw.toString()) }
  const trust = values['identity-trust.json.gz'], boundary = values['boundary.json.gz']; trust.oracle = identityTrustOracle2Id; trust.oraclePolicySha256 = getIdentityTrustOracle2Policy().policySha256
  return { trust, boundary, identity: trust.certificate.subject }
}
it('independently validates both exact discovery metadata records against signed settings', async () => {
  const { trust, boundary, identity } = nativeTrust()
  for (const method of ['discoverByIdentityKey', 'discoverByAttributes'] as const) await expect(verifyCoverageExtensionDiscoveryAnchor(identity, boundary, trust, method)).resolves.toBeUndefined()
})
it.each(['name', 'description', 'trust', 'iconUrl'])('rejects corrupted discovered certifierInfo.%s even if signed certificate/keyring stay valid', async field => {
  const { trust, boundary, identity } = nativeTrust()
  const target = boundary.trace.find((r: any) => r.method === 'discoverByIdentityKey').result.certificates[0]
  target.certifierInfo[field] = field === 'trust' ? 99 : field === 'iconUrl' ? 'javascript:alert(1)' : 'forged metadata'
  trust.positiveDiscovery = structuredClone(boundary.trace.filter((r: any) => ['discoverByIdentityKey', 'discoverByAttributes'].includes(r.method)))
  await expect(verifyCoverageExtensionDiscoveryAnchor(identity, boundary, trust, 'discoverByIdentityKey')).rejects.toThrow()
})
it('rejects congruent unsigned trust-setting substitution and unrelated native identity', async () => {
  const { trust, boundary, identity } = nativeTrust(), entry = trust.temporarySettings.trustSettings.trustedCertifiers.find((x: any) => x.identityKey === trust.certificate.certifier)
  entry.trust = 99; trust.temporaryReadback = structuredClone(trust.temporarySettings)
  await expect(verifyCoverageExtensionDiscoveryAnchor(identity, boundary, trust, 'discoverByAttributes')).rejects.toThrow()
  const fresh = nativeTrust(); await expect(verifyCoverageExtensionDiscoveryAnchor(original.identity, fresh.boundary, fresh.trust, 'discoverByIdentityKey')).rejects.toThrow()
})
