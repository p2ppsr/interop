import assert from 'node:assert/strict'
import { createDecipheriv, createHash } from 'node:crypto'
import { Beef, BigNumber, Point, PrivateKey, ProtoWallet, PublicKey, Schnorr, Signature, Transaction, Utils } from '@bsv/sdk'
import fs from 'node:fs'
import path from 'node:path'
import { coverageExtensionIds as ids, coverageExtensionPolicy as policy, coverageExtensionPolicySha256, extensionConfig as c, privilegedMethods, reasonVariants, basketVariants, basketMethods, extensionFixtureArgs, type CoverageExtensionReport, type ExtensionCall, type ExtensionSubmission, type ExtensionOutcome } from './coverage-extension-model.js'
import { coverageExtensionRequests, extensionCryptoEnvironment, ordinaryExtensionArgs } from './coverage-extension-requests.js'
import { clauseCrypto, specifiedError } from './conformance-clauses-model.js'
import { verifyNativeTrust } from './verify-identity-trust.js'
import { identityTrustOracle2Id } from './identity-trust-oracle2.js'
import { observedSubmissionTransactions, type SubmissionGraphOptions } from './verify-transaction-state-bindings.js'
const fixture = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../../../fixtures/teranode/wab-funding-v1.json'), 'utf8'))
const tracker = { currentHeight: async () => fixture.fundingHeight + fixture.maturityDepth, isValidRootForHeight: async (root: string, height: number) => root === fixture.merkleRoot && height === fixture.fundingHeight }
class MissingAnchor extends Error {}
const clean = (value: any) => JSON.parse(JSON.stringify(value))
function bytes(value: any): number[] { assert.ok(Array.isArray(value) && value.length > 0); for (let i = 0; i < value.length; i++) assert.ok(Object.hasOwn(value, i) && Number.isInteger(value[i]) && value[i] >= 0 && value[i] <= 255); return value }
function atomic(value: any): Transaction { const raw = bytes(value), reader = new Utils.Reader(raw), graph = Beef.fromReader(reader); assert.ok(reader.eof(), 'Trailing Atomic BEEF'); const tx = Transaction.fromAtomicBEEF(raw); assert.equal(tx.id('hex'), graph.atomicTxid); return tx }
function result(row: any) { assert.ok(row); if (row.submissionStart !== undefined && row.method !== 'createAction') assert.equal(row.submissionEnd, row.submissionStart, 'Read-only/control operation emitted a submission'); assert.equal(row.error, undefined, 'Successful result must not coexist with an error'); assert.ok(row.result !== undefined); return row.result }
function one(trace: any[], predicate: (row: any) => boolean, label: string) { const matches = trace.filter(predicate); if (!matches.length) throw new MissingAnchor(`Missing preexisting ${label}`); assert.equal(matches.length, 1, `Ambiguous ${label}`); return matches[0] }
function reject(row: any, token: string, allowFalse = false) { assert.ok(row); if (row.submissionStart !== undefined) assert.equal(row.submissionEnd, row.submissionStart, 'Rejected operation emitted a submission'); if (allowFalse && row.error === undefined && row.result?.valid === false) return; assert.equal(row.result, undefined); assert.ok(specifiedError(row.error, token), `Explicit ${token} rejection required`); if (row.submissionStart !== undefined) assert.equal(row.submissionEnd, row.submissionStart) }
function inspect(report: CoverageExtensionReport) {
  assert.equal(report.schema, 'tpnil-native-coverage-extension@1.0.0'); assert.equal(report.oracle, policy.oracle); assert.equal(report.policySha256, coverageExtensionPolicySha256)
  assert.equal(report.claim, 'ENGINEERING_OBSERVATION_ONLY'); assert.equal(report.completeBRC100Conformance, false); assert.equal(report.finalLedgerRequired, true)
  assert.deepEqual(policy.assertionIds, ids); assert.equal(ids.length, 61); assert.equal(policy.variantRows.length, 19)
  assert.match(report.identity, /^(02|03)[a-f0-9]{64}$/); assert.deepEqual(report.errors, [])
  assert.equal(new Set(report.trace.map(r => r.id)).size, report.trace.length, 'Duplicate extension call')
  assert.deepEqual(clean(report.trace.map(({ id, actor, method, args }) => ({ id, actor, method, args }))), clean(coverageExtensionRequests(report)), 'Exact extension calls, order and whole arguments required')
  assert.ok(report.trace.length <= policy.bounds.maximumPublicCalls)
  assert.ok(Number.isSafeInteger(report.submissionStart) && report.submissionStart >= 0 && Number.isSafeInteger(report.submissionEnd) && report.submissionEnd >= report.submissionStart)
  assert.equal(report.submissionPrefix.length, report.submissionStart); assert.equal(report.submissions.length, report.submissionEnd - report.submissionStart)
  let index = report.submissionStart
  for (const row of report.trace) { assert.ok(Number.isSafeInteger(row.submissionStart) && row.submissionStart >= index && Number.isSafeInteger(row.submissionEnd) && row.submissionEnd >= row.submissionStart && row.submissionEnd <= report.submissionEnd); index = row.submissionEnd }
  const stored = new Map<string, Transaction>()
  assert.ok(report.storageTransactions.length <= 2048)
  for (const row of report.storageTransactions) { assert.deepEqual(Object.keys(row).sort(), ['rawTxHex', 'txid']); assert.match(row.txid, /^[a-f0-9]{64}$/); assert.match(row.rawTxHex, /^(?:[a-f0-9]{2})+$/); const tx = Transaction.fromHex(row.rawTxHex); assert.equal(tx.toHex(), row.rawTxHex); assert.equal(tx.id('hex'), row.txid); assert.ok(!stored.has(row.txid)); stored.set(row.txid, tx) }
  for (const submission of report.submissions) { const graph = observedSubmissionTransactions(submission, { trustedMinedRoot: { txid: fixture.txid, rawHex: Transaction.fromAtomicBEEF([...Buffer.from(fixture.atomicBeefHex, 'hex')]).toHex() } }); assert.equal(stored.get(submission.txid)?.toHex(), graph[0]?.transaction.toHex(), 'Submission must bind independent storage') }
  const trace = new Map(report.trace.map(row => [row.id, row]))
  const row = (id: string) => { const found = trace.get(id); assert.ok(found, `Missing required extension call ${id}`); return found }
  return { row, stored }
}

export async function deriveCoverageExtensionOutcomes(report: CoverageExtensionReport): Promise<ExtensionOutcome[]> {
  const { row, stored } = inspect(report), e = extensionCryptoEnvironment(report.identity)
  const tests: Record<string, () => void | Promise<void>> = {}
  const key = (part: string) => `coverage-extension.${part}`
  const control = async (method: string) => {
    const current = row(`ordinary.${method}`), value = result(current)
    assert.equal(current.submissionEnd, current.submissionStart)
    assert.deepEqual(current.args, ordinaryExtensionArgs(report)[method])
    if (method === 'getPublicKey') assert.equal(value.publicKey, e.ownChild.toString())
    if (method === 'encrypt') { const data = Buffer.from(bytes(value.ciphertext)); assert.ok(data.length >= 48); const decrypt = createDecipheriv('aes-256-gcm', e.key, data.subarray(0, 32)); decrypt.setAuthTag(data.subarray(-16)); assert.deepEqual([...Buffer.concat([decrypt.update(data.subarray(32, -16)), decrypt.final()])], c.data) }
    if (method === 'decrypt') assert.deepEqual(bytes(value.plaintext), c.data)
    if (method === 'createHmac') assert.deepEqual(bytes(value.hmac), e.hmac)
    if (method === 'verifyHmac') assert.equal(value.valid, true)
    if (method === 'createSignature') assert.ok(Signature.fromDER(bytes(value.signature)).verify(c.data, e.ownChild))
    if (method === 'verifySignature') { assert.ok(Signature.fromDER(bytes(report.peerSignature)).verify(c.data, e.peerChild)); assert.equal(value.valid, true) }
    if (method.startsWith('reveal')) {
      assert.equal(value.prover, report.identity); assert.equal(value.verifier, e.verifierIdentity); assert.equal(value.counterparty, e.peerIdentity)
      if (method === 'revealCounterpartyKeyLinkage') {
        assert.equal(typeof value.revelationTime, 'string'); assert.ok(value.revelationTime.length > 0)
        const context = { protocolID: [2, 'counterparty linkage revelation'] as [2, string], keyID: value.revelationTime, counterparty: report.identity }
        const clear = (await e.verifier.decrypt({ ...context, ciphertext: bytes(value.encryptedLinkage) })).plaintext
        assert.deepEqual(clear, PublicKey.fromString(report.identity).mul(PrivateKey.fromHex(c.peerKey)).encode(true))
        const proof = (await e.verifier.decrypt({ ...context, ciphertext: bytes(value.encryptedLinkageProof) })).plaintext
        assert.equal(proof.length, 98); assert.ok(new Schnorr().verifyProof(PublicKey.fromString(report.identity), PrivateKey.fromHex(c.peerKey).toPublicKey(), Point.fromDER(clear), { R: Point.fromDER(proof.slice(0, 33)), SPrime: Point.fromDER(proof.slice(33, 66)), z: new BigNumber(proof.slice(66)) }))
      } else {
        assert.equal(value.proofType, 0)
        const clear = (await e.verifier.decrypt({ protocolID: [2, `specific linkage revelation ${c.protocolID[0]} ${c.protocolID[1]}`], keyID: c.keyID, counterparty: report.identity, ciphertext: bytes(value.encryptedLinkage) })).plaintext
        assert.deepEqual(clear, e.peer.keyDeriver!.revealSpecificSecret(report.identity, c.protocolID, c.keyID))
      }
    }
  }
  for (const reason of reasonVariants) for (const method of privilegedMethods) tests[key(`privileged.${reason}.${method}`)] = async () => {
    await control(method); const current = row(`privileged.${reason}.${method}`); reject(current, 'privilegedReason')
    if (current.error.parameter !== undefined) assert.equal(current.error.parameter, 'privilegedReason'); const message = String(current.error.message).toLowerCase(); assert.ok(reason === 'missing-reason' ? /required|must|provide|missing/.test(message) : /length|characters|bytes|between|5|50/.test(message), 'Error must attribute the missing or bounded reason')
  }
  const boundary = report.anchors.boundary, bt = boundary?.trace ?? []
  const boundarySignature = () => {
    if (!Array.isArray(bt) || !bt.length) throw new MissingAnchor('Missing boundary trace')
    const identity = one(bt, r => r.method === 'getPublicKey' && r.args?.identityKey === true, 'boundary identity'); assert.equal(result(identity).publicKey, report.identity)
    const context = { protocolID: [0, 'tpnil boundary corpus'], keyID: '1', counterparty: 'anyone' }, data = [...Buffer.from('TPNIL BRC100 boundary corpus v1')]
    const signed = one(bt, r => r.method === 'createSignature', 'boundary signing'), signature = bytes(result(signed).signature)
    assert.deepEqual(signed.args, { ...context, data })
    const peer = new ProtoWallet('anyone'), publicKey = peer.keyDeriver!.derivePublicKey(context.protocolID as [0, string], context.keyID, report.identity, false)
    assert.ok(Signature.fromDER(signature).verify(data, publicKey))
    const derived = one(bt, r => r.method === 'getPublicKey' && r.args?.counterparty === 'anyone', 'boundary child'); assert.deepEqual(derived.args, { ...context, forSelf: true }); assert.equal(result(derived).publicKey, publicKey.toString())
    const valid = one(bt, r => r.method === 'verifySignature' && JSON.stringify(r.args?.data) === JSON.stringify(data), 'boundary verification'); assert.deepEqual(valid.args, { ...context, data, signature, forSelf: true }); assert.equal(result(valid).valid, true)
    const negative = one(bt, r => r.method === 'verifySignature' && JSON.stringify(r.args?.data) === JSON.stringify([...data, 0]), 'altered boundary data'); assert.deepEqual(negative.args, { ...context, data: [...data, 0], signature, forSelf: true }); reject(negative, 'signature', true)
    return { context, data, signature, publicKey }
  }
  for (const suffix of ['data-only', 'forSelf-true', 'anyone-counterparty']) tests[key(`crypto.${suffix}`)] = () => { boundarySignature() }
  tests[key('crypto.hash-only')] = () => {
    const b = boundarySignature(), clauses = report.anchors.clauses
    if (!clauses?.trace) throw new MissingAnchor('Missing clause hash trace')
    assert.equal(clauses.identity, report.identity)
    const peer = new ProtoWallet(PrivateKey.fromHex(clauseCrypto.peerKey)), context = { protocolID: clauseCrypto.protocolID, keyID: clauseCrypto.keyID, counterparty: PrivateKey.fromHex(clauseCrypto.peerKey).toPublicKey().toString() }
    const sign = one(clauses.trace, r => r.id === 'crypto.ecdsa.direct-hash', 'direct hash signing'); assert.equal(sign.method, 'createSignature'); assert.deepEqual(sign.args, { ...context, hashToDirectlySign: [...createHash('sha256').update(Buffer.from(clauseCrypto.data)).digest()] })
    assert.ok(Signature.fromDER(bytes(result(sign).signature)).verify(clauseCrypto.data, peer.keyDeriver!.derivePublicKey(clauseCrypto.protocolID, clauseCrypto.keyID, report.identity, false)))
    const verify = one(clauses.trace, r => r.id === 'control.input.verifySignature.hashToDirectlyVerify.0', 'hash-only verification'); assert.equal(verify.method, 'verifySignature'); assert.deepEqual(verify.args, { ...b.context, forSelf: true, signature: b.signature, hashToDirectlyVerify: [...createHash('sha256').update(Buffer.from(b.data)).digest()] }); assert.equal(result(verify).valid, true)
  }
  tests[key('crypto.forSelf-false-default')] = async () => { await control('verifySignature'); await control('createSignature'); assert.equal(result(row('crypto.default-positive')).valid, true); assert.notEqual(e.ownChild.toString(), e.peerChild.toString()); reject(row('crypto.default-negative'), 'signature', true) }
  tests[key('crypto.neither-data-nor-hash')] = async () => { await control('createSignature'); await control('verifySignature'); for (const id of ['crypto.missing-create', 'crypto.missing-verify']) { const r = row(id); reject(r, 'data'); assert.ok(/hash/i.test(r.error.message), 'Rejection must identify the data/hash alternative') } }
  tests[key('crypto.identityKey-override')] = async () => { await control('getPublicKey'); assert.equal(result(row('crypto.identity-true')).publicKey, report.identity); assert.equal(result(row('crypto.identity-false')).publicKey, e.ownChild.toString()); assert.notEqual(e.ownChild.toString(), report.identity) }
  const fixtureCache = new Map<string, Promise<Transaction>>()
  const verifyFixture = async (actor: 'wallet' | 'funder') => {
    const current = row(actor === 'wallet' ? 'fixture-native' : 'fixture-external'), value = result(current), tx = atomic(value.tx)
    assert.equal(tx.id('hex'), value.txid); assert.equal(value.signableTransaction, undefined); assert.equal(stored.get(value.txid)?.toHex(), tx.toHex()); assert.ok(await tx.verify(tracker), 'Fixture must reach admitted mined root')
    const expected = extensionFixtureArgs(actor).outputs
    assert.ok(tx.outputs.length >= expected.length)
    for (const [i, output] of expected.entries()) { assert.equal(tx.outputs[i]?.satoshis, output.satoshis); assert.equal(tx.outputs[i]?.lockingScript.toHex(), output.lockingScript) }
    assert.ok(report.submissions.slice(current.submissionStart - report.submissionStart, current.submissionEnd - report.submissionStart).some(s => s.txid === value.txid && s.verdict === 'ACCEPTED_BY_NETWORK'))
    return tx
  }
  const nativeFixture = (actor: 'wallet' | 'funder'): Promise<Transaction> => { if (!fixtureCache.has(actor)) fixtureCache.set(actor, verifyFixture(actor)); return fixtureCache.get(actor)! }
  const verifyCreated = async () => {
    const source = await nativeFixture('wallet'), current = row('basket.bytes-5.createAction'), value = result(current), tx = atomic(value.tx)
    assert.equal(tx.id('hex'), value.txid); assert.equal(value.signableTransaction, undefined); assert.equal(stored.get(value.txid)?.toHex(), tx.toHex()); assert.ok(await tx.verify(tracker))
    assert.equal(tx.inputs.length, 1); assert.equal(tx.inputs[0]?.sourceTXID ?? tx.inputs[0]?.sourceTransaction?.id('hex'), source.id('hex')); assert.equal(tx.inputs[0]?.sourceOutputIndex, 2); assert.equal(tx.inputs[0]?.unlockingScript?.toHex(), '51')
    assert.equal(tx.outputs[0]?.satoshis, 2); assert.equal(tx.outputs[0]?.lockingScript.toHex(), '51')
    for (const output of tx.outputs.slice(1)) assert.match(output.lockingScript.toHex(), /^76a914[0-9a-f]{40}88ac$/)
    assert.ok(report.submissions.slice(current.submissionStart - report.submissionStart, current.submissionEnd - report.submissionStart).some(s => s.txid === value.txid && s.verdict === 'ACCEPTED_BY_NETWORK'))
    return tx
  }
  let createdCache: Promise<Transaction> | undefined
  const created = () => createdCache ??= verifyCreated()
  type ExpectedOutput = { outpoint: string; satoshis: number; lockingScript: string; tags: string[]; customInstructions: string }
  const membership = async (stage: 'before' | 'after-create' | 'after-internalize' | 'after-relinquish') => {
    const native = await nativeFixture('wallet'), expected: ExpectedOutput[] = Array.from({ length: 6 }, (_, i) => ({ outpoint: `${native.id('hex')}.${i + 6}`, satoshis: c.membershipSatoshis, lockingScript: c.lockingScript, tags: [`coverage ${i + 6}`], customInstructions: `coverage:${i + 6}` }))
    if (stage !== 'before') expected.push({ outpoint: `${(await created()).id('hex')}.0`, satoshis: 2, lockingScript: '51', tags: ['coverage created'], customInstructions: 'coverage:created' })
    if (['after-internalize', 'after-relinquish'].includes(stage)) expected.push({ outpoint: `${(await nativeFixture('funder')).id('hex')}.2`, satoshis: c.membershipSatoshis, lockingScript: c.lockingScript, tags: ['coverage inserted 2'], customInstructions: 'coverage:inserted:2' })
    return stage === 'after-relinquish' ? expected.filter(r => r.outpoint !== `${native.id('hex')}.8`) : expected
  }
  const listing = (current: ExtensionCall, expected: ExpectedOutput[]) => { const value = result(current); assert.equal(current.submissionEnd, current.submissionStart); assert.equal(value.totalOutputs, expected.length); assert.ok(Array.isArray(value.outputs)); assert.equal(value.outputs.length, expected.length); assert.equal(new Set(value.outputs.map((r: any) => r.outpoint)).size, expected.length); for (const output of expected) { const found = value.outputs.find((r: any) => r.outpoint === output.outpoint); assert.ok(found); for (const property of ['outpoint', 'satoshis', 'lockingScript', 'tags', 'customInstructions'] as const) assert.deepEqual(found[property], output[property]) } }
  const noScopedSpend = (outpoint: string) => { for (const submission of report.submissions) for (const entry of observedSubmissionTransactions(submission, { trustedMinedRoot: { txid: fixture.txid, rawHex: Transaction.fromAtomicBEEF([...Buffer.from(fixture.atomicBeefHex, 'hex')]).toHex() } })) assert.ok(!entry.transaction.inputs.some(i => `${i.sourceTXID ?? i.sourceTransaction?.id('hex')}.${i.sourceOutputIndex}` === outpoint), 'Protected output appeared in submitted ancestry') }
  for (const [index, variant] of basketVariants.entries()) for (const method of basketMethods) tests[key(`basket.${variant.id}.${method}`)] = async () => {
    const native = await nativeFixture('wallet'), external = await nativeFixture('funder'), current = row(`basket.${variant.id}.${method}`)
    listing(row('basket.before'), await membership('before'))
    if (variant.id !== 'bytes-5') {
      reject(current, 'basket')
      if (current.error.parameter !== undefined) assert.equal(current.error.parameter, 'basket')
      assert.ok(!/not found|failed to unlink|no output|storage|database/i.test(current.error.message), 'Wrong-basket lookup failure is not namespace validation')
      assert.ok(/invalid|must|required|length|lowercase|consecutive|suffix|cannot|characters|not allowed/i.test(current.error.message), 'Named basket validation required')
      if (method === 'createAction') { const source = result(row('basket.sources-after')).outputs.find((o: any) => o.outpoint === `${native.id('hex')}.${index}`); assert.ok(source); assert.equal(source.satoshis, c.sourceSatoshis); assert.equal(source.lockingScript, c.lockingScript); assert.equal(source.spendable, true); noScopedSpend(source.outpoint) }
      if (method === 'relinquishOutput') { const expected = (await membership('after-relinquish')).find(o => o.outpoint === `${native.id('hex')}.${6 + index}`)!; const source = result(row('basket.after-relinquish')).outputs.find((o: any) => o.outpoint === expected.outpoint); assert.ok(source); for (const property of ['outpoint', 'satoshis', 'lockingScript', 'tags', 'customInstructions'] as const) assert.deepEqual(source[property], expected[property]); noScopedSpend(expected.outpoint) }
      if (method === 'internalizeAction') noScopedSpend(`${external.id('hex')}.${index}`)
    } else if (method === 'createAction') { await created(); listing(row('basket.after-create'), await membership('after-create')) }
    else if (method === 'internalizeAction') { assert.equal(result(current).accepted, true); assert.equal(current.submissionEnd, current.submissionStart); listing(row('basket.after-internalize'), await membership('after-internalize')); noScopedSpend(`${external.id('hex')}.2`) }
    else if (method === 'listOutputs') listing(current, await membership('after-internalize'))
    else { assert.deepEqual(result(current), { relinquished: true }); assert.equal(current.submissionEnd, current.submissionStart); listing(row('basket.after-relinquish'), await membership('after-relinquish')); noScopedSpend(`${native.id('hex')}.8`) }
  }
  for (const [suffix, method] of [['identity-match', 'discoverByIdentityKey'], ['attribute-match', 'discoverByAttributes']] as const) tests[key(`discovery.${suffix}`)] = () => verifyCoverageExtensionDiscoveryAnchor(report.identity, boundary, report.anchors.trust, method)
  tests[key('query.relinquished-excluded')] = () => {
    const creation = one(bt, r => r.method === 'createAction' && r.args?.description === 'TPNIL boundary token pair', 'original token pair'), tx = atomic(result(creation).tx)
    assert.equal(tx.id('hex'), creation.result.txid); const target = `${tx.id('hex')}.1`
    const before = one(bt, r => r.method === 'listOutputs' && r.args?.includeTags === true && r.args?.basket === 'tpnil boundary tokens', 'original membership')
    assert.ok(result(before).outputs.some((r: any) => r.outpoint === target && r.satoshis === tx.outputs[1]?.satoshis))
    const relinquish = one(bt, r => r.method === 'relinquishOutput', 'original relinquishment'); assert.deepEqual(relinquish.args, { basket: 'tpnil boundary tokens', output: target }); assert.deepEqual(result(relinquish), { relinquished: true })
    const after = bt[bt.indexOf(relinquish) + 1]; assert.equal(after.method, 'listOutputs'); assert.deepEqual(after.args, { basket: 'tpnil boundary tokens' }); assert.deepEqual(result(after).outputs, []); assert.equal(after.result.totalOutputs, 0)
    assert.ok(bt.indexOf(before) < bt.indexOf(relinquish)); noScopedSpend(target)
  }
  const outcomes: ExtensionOutcome[] = []
  for (const id of ids) { try { await tests[id]!(); outcomes.push({ id, result: 'PASS', detail: 'Exact public observations and independent prospective predicate agree; final ledger join remains mandatory.' }) } catch (error) { outcomes.push({ id, result: error instanceof MissingAnchor ? 'BLOCKED' : 'FAIL', detail: error instanceof MissingAnchor ? error.message : `Independent predicate ${id} did not hold.` }) } }
  return outcomes
}

export async function verifyCoverageExtensionDiscoveryAnchor(identity: string, boundary: any, trust: any, method: 'discoverByIdentityKey' | 'discoverByAttributes'): Promise<void> {
  if (!trust) throw new MissingAnchor('Missing completed identity-trust2 anchor')
  const verified = await verifyNativeTrust(trust, boundary, { oracle: identityTrustOracle2Id })
  for (const id of ['identity-trust.public-settings-token', 'identity-trust.positive-discovery']) assert.equal(verified.assertions.find(a => a.id === id)?.result, 'PASS')
  const identityRow = one(boundary.trace, r => r.method === 'getPublicKey' && r.args?.identityKey === true, 'discovery identity'); assert.equal(result(identityRow).publicKey, identity)
  const entry = one(boundary.trace, r => r.method === method, `discovery ${method}`), cert = trust.certificate
  const found = one(result(entry).certificates, r => r.certifier === cert.certifier && r.serialNumber === cert.serialNumber && r.subject === identity, 'discovery certificate')
  const trusted = one(trust.temporarySettings.trustSettings.trustedCertifiers, r => r.identityKey === found.certifier, 'signed trust entry')
  for (const field of ['name', 'description', 'trust']) assert.deepEqual(found.certifierInfo?.[field], trusted[field])
  assert.ok(Number.isFinite(found.certifierInfo.trust)); const icon = new URL(found.certifierInfo.iconUrl); assert.equal(icon.protocol, 'https:'); assert.ok(icon.hostname)
}

export function coverageExtensionTransactionPredicate(callId: string): string {
  if (callId === 'fixture-native') return 'coverage-extension.basket.bytes-5.createAction'
  if (callId === 'fixture-external') return 'coverage-extension.basket.bytes-5.internalizeAction'
  assert.ok(/^basket\.(bytes-0|bytes-4|bytes-5|uppercase|double-space|trailing-basket)\.createAction$/.test(callId), 'Unexpected extension transaction role')
  return `coverage-extension.${callId}`
}
export async function verifyNativeCoverageExtension(report: CoverageExtensionReport) {
  const assertions = await deriveCoverageExtensionOutcomes(report)
  assert.deepEqual(report.assertions, assertions); assert.equal(report.result, assertions.some(r => r.result === 'FAIL') ? 'FAIL' : assertions.some(r => r.result === 'BLOCKED') ? 'BLOCKED' : 'PASS')
  const transactions: Array<{ callId: string; actor: string; predicateId: string; txid: string; rawHex: string; originalResult: any }> = []
  const malformedNativeResponses: Array<{ callId: string; actor: string; predicateId: string; result: any }> = []
  for (const row of report.trace) {
    if (row.method !== 'createAction' || !row.result || (!Object.hasOwn(row.result, 'tx') && !Object.hasOwn(row.result, 'txid'))) continue
    const predicateId = coverageExtensionTransactionPredicate(row.id); let tx: Transaction | undefined
    if (Array.isArray(row.result.tx)) {
      let length = 0; while (length < row.result.tx.length && Object.hasOwn(row.result.tx, length) && Number.isInteger(row.result.tx[length]) && row.result.tx[length] >= 0 && row.result.tx[length] <= 255) length++
      const prefix = row.result.tx.slice(0, length)
      try { tx = Transaction.fromAtomicBEEF(prefix) } catch { try { const graph = Beef.fromReader(new Utils.Reader(prefix)); if (graph.atomicTxid) tx = graph.findTxid(graph.atomicTxid)?.tx } catch { /* Mapped predicate failure required below. */ } }
    } else if (typeof row.result.txid === 'string' && /^[a-f0-9]{64}$/.test(row.result.txid)) {
      const stored = report.storageTransactions.find(r => r.txid === row.result.txid); assert.ok(stored, 'Valid-shaped TXID return must have independent stored bytes'); tx = Transaction.fromHex(stored.rawTxHex)
      assert.equal(assertions.find(r => r.id === predicateId)?.result, 'FAIL', 'No extension request permits TXID-only return')
    }
    if (!tx && typeof row.result.txid === 'string' && /^[a-f0-9]{64}$/.test(row.result.txid)) { const stored = report.storageTransactions.find(r => r.txid === row.result.txid); assert.ok(stored, 'Unrecoverable body cannot hide a valid-shaped unbound TXID'); tx = Transaction.fromHex(stored.rawTxHex) }
    if (tx) transactions.push({ callId: row.id, actor: row.actor, predicateId, txid: tx.id('hex'), rawHex: tx.toHex(), originalResult: row.result })
    else { assert.equal(assertions.find(r => r.id === predicateId)?.result, 'FAIL', 'Unrecoverable return requires exact mapped predicate failure'); malformedNativeResponses.push({ callId: row.id, actor: row.actor, predicateId, result: row.result }) }
  }
  return { verified: true as const, assertions, assertionCount: assertions.length, counts: Object.fromEntries(['PASS', 'FAIL', 'BLOCKED'].map(value => [value, assertions.filter(a => a.result === value).length])), transactions, malformedNativeResponses, finalLedgerRequired: true, completeBRC100Conformance: false }
}

/** This explicit join is mandatory after shutdown provenance is verified. It
 * accepts no source/body inference from child PASS flags or MerklePath presence.
 * Returned transaction ownership/funding is separately required of the parent. */
export async function verifyCoverageExtensionParentBindings(report: CoverageExtensionReport, binding: {
  identity: string; boundary: any; clauses: any; trust?: any; storage: ReadonlyMap<string, Transaction>;
  submissions: ExtensionSubmission[]; finalSubmissions: ExtensionSubmission[]; graph: SubmissionGraphOptions
}) {
  const child = await verifyNativeCoverageExtension(report)
  assert.equal(report.identity, binding.identity); assert.deepEqual(report.anchors, clean({ boundary: binding.boundary, clauses: binding.clauses, ...(binding.trust === undefined ? {} : { trust: binding.trust }) }))
  assert.ok(binding.finalSubmissions.length >= binding.submissions.length); assert.deepEqual(binding.finalSubmissions.slice(0, binding.submissions.length), binding.submissions, 'Final ledger must retain exact preclose prefix')
  assert.deepEqual(report.submissionPrefix, binding.submissions.slice(0, report.submissionStart)); assert.deepEqual(report.submissions, binding.submissions.slice(report.submissionStart, report.submissionEnd))
  assert.ok(report.submissionEnd <= binding.submissions.length)
  for (const row of report.storageTransactions) assert.equal(binding.storage.get(row.txid)?.toHex(), row.rawTxHex, 'Extension snapshot differs from independent final storage')
  for (const row of child.transactions) assert.equal(binding.storage.get(row.txid)?.toHex(), row.rawHex, 'Returned extension body differs from independent final storage')
  assert.equal(binding.graph.requireResolvedAncestors, true, 'Final extension guard requires complete ancestry')
  assert.ok(binding.graph.trustedMinedRoot); assert.equal(binding.graph.trustedMinedRoot.txid, fixture.txid); assert.equal(binding.graph.trustedMinedRoot.rawHex, Transaction.fromAtomicBEEF([...Buffer.from(fixture.atomicBeefHex, 'hex')]).toHex())
  const claims: Array<{ predicateId: string; outpoint: string }> = [], unprovenClaims: Array<{ predicateId: string; result: string }> = []
  const add = (predicateId: string, outpoint: () => string) => { const outcome = child.assertions.find(r => r.id === predicateId)!; if (outcome.result === 'PASS') claims.push({ predicateId, outpoint: outpoint() }); else unprovenClaims.push({ predicateId, result: outcome.result }) }
  const native = () => atomic(report.trace.find(r => r.id === 'fixture-native')?.result?.tx).id('hex'), external = () => atomic(report.trace.find(r => r.id === 'fixture-external')?.result?.tx).id('hex')
  for (const [index, variant] of basketVariants.entries()) {
    if (variant.id !== 'bytes-5') add(`coverage-extension.basket.${variant.id}.createAction`, () => `${native()}.${index}`)
    add(`coverage-extension.basket.${variant.id}.internalizeAction`, () => `${external()}.${index}`)
    add(`coverage-extension.basket.${variant.id}.relinquishOutput`, () => `${native()}.${6 + index}`)
  }
  add('coverage-extension.query.relinquished-excluded', () => `${atomic(binding.boundary.trace.find((r: any) => r.method === 'createAction' && r.args?.description === 'TPNIL boundary token pair').result.tx).id('hex')}.1`)
  for (const submission of binding.finalSubmissions) for (const entry of observedSubmissionTransactions(submission, binding.graph)) for (const input of entry.transaction.inputs) {
    const outpoint = `${input.sourceTXID ?? input.sourceTransaction?.id('hex')}.${input.sourceOutputIndex}`
    assert.ok(!claims.some(c => c.outpoint === outpoint), `Final ledger spent protected coverage-extension output ${outpoint}`)
  }
  return { verified: true as const, protectedClaims: claims, unprovenClaims, returnedTransactions: child.transactions, malformedNativeResponses: child.malformedNativeResponses, transactionOwnershipAndFundingStillRequired: true }
}
