import assert from 'node:assert/strict'
import { BigNumber, P2PKH, Point, Schnorr, PrivateKey, ProtoWallet, PublicKey, Signature, Transaction, Utils, VerifiableCertificate } from '@bsv/sdk'
import { issueFixtureCertificateForSubject } from './certificate-fixture.js'
import { getControlledHeaderFixture, type ControlledHeaderFixture } from './native/controlled-header-fixture.js'

export interface BoundaryWallet { [method: string]: (args: any) => Promise<any> }
export interface BoundaryCorpusOptions {
  wallet: BoundaryWallet
  funder: BoundaryWallet
  /** Publish the supplied certificate to the profile's real Identity Services. */
  prepareDiscovery?: (certificate: Record<string, unknown>) => Promise<void>
  discoveryExpectation?: 'published' | 'untrusted-excluded'
  fixtureRevision?: 1 | 2
  headerFixture?: ControlledHeaderFixture
}
const requiredMethods = ['createAction', 'signAction', 'abortAction', 'listActions', 'internalizeAction', 'listOutputs', 'relinquishOutput', 'getPublicKey', 'revealCounterpartyKeyLinkage', 'revealSpecificKeyLinkage', 'encrypt', 'decrypt', 'createHmac', 'verifyHmac', 'createSignature', 'verifySignature', 'acquireCertificate', 'listCertificates', 'proveCertificate', 'relinquishCertificate', 'discoverByIdentityKey', 'discoverByAttributes', 'isAuthenticated', 'waitForAuthentication', 'getHeight', 'getHeaderForHeight', 'getNetwork', 'getVersion']

/** Prospective BRC-100 method corpus. All SUT operations use its public boundary.
 * A failed native method remains a failed observation; reference behavior cannot replace it. */
export async function runWalletBoundaryCorpus({ wallet: implementation, funder, prepareDiscovery, discoveryExpectation = 'published', fixtureRevision = 1, headerFixture }: BoundaryCorpusOptions) {
  const controlledHeader = headerFixture === undefined ? undefined : getControlledHeaderFixture(headerFixture)
  const trace: Array<Record<string, unknown>> = [], assertions: Array<{ id: string; result: 'PASS' | 'FAIL' | 'BLOCKED'; detail: string }> = []
  const wallet = new Proxy({} as BoundaryWallet, { get: (_target, method) => async (args: unknown = {}) => {
    const entry: Record<string, unknown> = { method, args: structuredClone(args) }; trace.push(entry)
    try { const result = await implementation[String(method)]!(args); entry.result = structuredClone(result); return result }
    catch (error) { entry.error = error instanceof Error ? { name: error.name, message: error.message, ...(typeof (error as any).code === 'number' ? { code: (error as any).code } : {}) } : String(error); throw error }
  } })
  async function check<T>(id: string, operation: () => Promise<T>): Promise<T | undefined> {
    try { const result = await operation(); assertions.push({ id, result: 'PASS', detail: 'Executed public-boundary operation and its independent predicate.' }); return result }
    catch (error) { assertions.push({ id, result: 'FAIL', detail: error instanceof Error ? error.message : String(error) }); return undefined }
  }
  const message = Utils.toArray('TPNIL BRC100 boundary corpus v1', 'utf8')
  const protocolID: [0, string] = [0, 'tpnil boundary corpus']
  const context = { protocolID, keyID: '1', counterparty: 'self' }
  const identity = await check('getPublicKey.identity', async () => {
    const { publicKey } = await wallet.getPublicKey!({ identityKey: true }); assert.match(publicKey, /^(02|03)[a-f0-9]{64}$/); return publicKey as string
  })
  await check('getNetwork.mainnet', async () => assert.equal((await wallet.getNetwork!({})).network, 'mainnet'))
  await check('getVersion.nonempty', async () => assert.ok((await wallet.getVersion!({})).version?.length > 0))
  await check('isAuthenticated.true', async () => assert.equal((await wallet.isAuthenticated!({})).authenticated, true))
  await check('waitForAuthentication.true', async () => assert.equal((await wallet.waitForAuthentication!({})).authenticated, true))
  await check('getHeight.controlled', async () => assert.equal((await wallet.getHeight!({})).height, 900_100))
  await check(controlledHeader?.assertionId ?? 'getHeaderForHeight.genesis', async () => {
    const { header } = await wallet.getHeaderForHeight!({ height: controlledHeader?.height ?? 0 })
    assert.equal(header, controlledHeader?.header ?? `01000000${'00'.repeat(32)}3ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a29ab5f49ffff001d1dac2b7c`)
  })
  const encrypted = await check('encrypt.bytes', async () => {
    const { ciphertext } = await wallet.encrypt!({ ...context, plaintext: message }); assert.ok(Array.isArray(ciphertext) && ciphertext.length > message.length); return ciphertext
  })
  await check('decrypt.roundtrip', async () => { assert.ok(encrypted); assert.deepEqual((await wallet.decrypt!({ ...context, ciphertext: encrypted })).plaintext, message) })
  const signature = await check('createSignature.independent-verification', async () => {
    const result = await wallet.createSignature!({ ...context, counterparty: 'anyone', data: message })
    const derived = await wallet.getPublicKey!({ ...context, counterparty: 'anyone', forSelf: true })
    assert.ok(Signature.fromDER(result.signature).verify(message, PublicKey.fromString(derived.publicKey)))
    return result.signature
  })
  await check('verifySignature.valid', async () => { assert.ok(signature); assert.equal((await wallet.verifySignature!({ ...context, counterparty: 'anyone', forSelf: true, data: message, signature })).valid, true) })
  const mac = await check('createHmac.length', async () => { const { hmac } = await wallet.createHmac!({ ...context, data: message }); assert.equal(hmac.length, 32); return hmac })
  await check('verifyHmac.valid', async () => { assert.ok(mac); assert.equal((await wallet.verifyHmac!({ ...context, data: message, hmac: mac })).valid, true) })
  const peerKey = PrivateKey.fromHex('34'.repeat(32)), verifier = new ProtoWallet(PrivateKey.fromHex('35'.repeat(32)))
  const peerIdentity = peerKey.toPublicKey().toString(), verifierIdentity = (await verifier.getPublicKey({ identityKey: true })).publicKey
  await check('revealCounterpartyKeyLinkage.independent-secret', async () => {
    assert.ok(identity)
    const linkage = await wallet.revealCounterpartyKeyLinkage!({ counterparty: peerIdentity, verifier: verifierIdentity })
    assert.equal(linkage.prover, identity); assert.equal(linkage.verifier, verifierIdentity); assert.equal(linkage.counterparty, peerIdentity)
    const clear = await verifier.decrypt({ ciphertext: linkage.encryptedLinkage, protocolID: [2, 'counterparty linkage revelation'], keyID: linkage.revelationTime, counterparty: identity })
    assert.deepEqual(clear.plaintext, PublicKey.fromString(identity).mul(peerKey).encode(true))
    const proof = (await verifier.decrypt({ ciphertext: linkage.encryptedLinkageProof, protocolID: [2, 'counterparty linkage revelation'], keyID: linkage.revelationTime, counterparty: identity })).plaintext
    assert.equal(proof.length, 98)
    assert.ok(new Schnorr().verifyProof(PublicKey.fromString(identity), peerKey.toPublicKey(), Point.fromDER(clear.plaintext), { R: Point.fromDER(proof.slice(0, 33)), SPrime: Point.fromDER(proof.slice(33, 66)), z: new BigNumber(proof.slice(66)) }))
  })
  await check('revealSpecificKeyLinkage.independent-secret', async () => {
    assert.ok(identity)
    const linkage = await wallet.revealSpecificKeyLinkage!({ ...context, counterparty: peerIdentity, verifier: verifierIdentity })
    assert.equal(linkage.prover, identity); assert.equal(linkage.verifier, verifierIdentity); assert.equal(linkage.proofType, 0)
    const clear = await verifier.decrypt({ ciphertext: linkage.encryptedLinkage, protocolID: [2, `specific linkage revelation ${protocolID[0]} ${protocolID[1]}`], keyID: '1', counterparty: identity })
    const peer = new ProtoWallet(peerKey)
    assert.deepEqual(clear.plaintext, peer.keyDeriver!.revealSpecificSecret(identity, protocolID, '1'))
  })
  await check('internalizeAction.mined-descendant-payment', async () => {
    assert.ok(identity)
    const senderIdentityKey = (await funder.getPublicKey!({ identityKey: true })).publicKey
    const derivationPrefix = Buffer.from('tpnil boundary corpus').toString('base64'), derivationSuffix = Buffer.from('payment 1').toString('base64')
    const publicKey = (await funder.getPublicKey!({ protocolID: [2, '3241645161d8'], keyID: `${derivationPrefix} ${derivationSuffix}`, counterparty: identity })).publicKey
    const payment = await funder.createAction!({ description: 'TPNIL boundary fixture payment', outputs: [{ satoshis: 1000, lockingScript: new P2PKH().lock(PublicKey.fromString(publicKey).toAddress()).toHex(), outputDescription: 'Boundary fixture wallet payment' }], options: { randomizeOutputs: false, acceptDelayedBroadcast: false } })
    assert.ok(payment.tx)
    const parsed = Transaction.fromAtomicBEEF(payment.tx); assert.equal(parsed.id('hex'), payment.txid); assert.equal(parsed.outputs[0]!.satoshis, 1000)
    const result = await wallet.internalizeAction!({ tx: [...payment.tx], outputs: [{ outputIndex: 0, protocol: 'wallet payment', paymentRemittance: { senderIdentityKey, derivationPrefix, derivationSuffix } }], description: 'TPNIL boundary incoming payment' })
    assert.equal(result.accepted, true)
  })
  const creation = await check('createAction.serialized-outputs', async () => {
    const result = await wallet.createAction!({ description: 'TPNIL boundary token pair', outputs: [0, 1].map(index => ({ satoshis: 7, lockingScript: fixtureRevision === 2 ? '7551' : '51', basket: 'tpnil boundary tokens', outputDescription: `Boundary token ${index}`, tags: ['boundary'], customInstructions: `tpnil:${index}` })), labels: ['tpnil-boundary'], options: { randomizeOutputs: false, acceptDelayedBroadcast: false } })
    assert.ok(result.tx); const tx = Transaction.fromAtomicBEEF(result.tx); assert.equal(tx.id('hex'), result.txid)
    for (const output of tx.outputs.slice(0, 2)) { assert.equal(output.satoshis, 7); assert.equal(output.lockingScript.toHex(), fixtureRevision === 2 ? '7551' : '51') }
    return result
  })
  await check('listActions.metadata', async () => { assert.ok(creation); const result = await wallet.listActions!({ labels: ['tpnil-boundary'], includeOutputs: true }); assert.ok(result.actions.some((action: any) => action.txid === creation.txid && action.description === 'TPNIL boundary token pair')) })
  await check('listOutputs.metadata', async () => { assert.ok(creation); const result = await wallet.listOutputs!({ basket: 'tpnil boundary tokens', includeTags: true, includeCustomInstructions: true }); assert.equal(result.totalOutputs, 2); assert.deepEqual(result.outputs.map((row: any) => row.outpoint).sort(), [`${creation.txid}.0`, `${creation.txid}.1`]) })
  await check('abortAction.releases-reservation', async () => {
    assert.ok(creation)
    const prepared = await wallet.createAction!({ description: 'TPNIL boundary abort reservation', inputBEEF: [...creation.tx], inputs: [{ outpoint: `${creation.txid}.1`, unlockingScriptLength: fixtureRevision === 2 ? 1 : 0, inputDescription: 'Abort fixture token' }], outputs: [{ satoshis: 1, lockingScript: '51', outputDescription: 'Aborted fixture output' }], options: { randomizeOutputs: false, noSend: true } })
    assert.ok(prepared.signableTransaction?.reference)
    assert.equal((await wallet.abortAction!({ reference: prepared.signableTransaction.reference })).aborted, true)
    const after = await wallet.listOutputs!({ basket: 'tpnil boundary tokens' }); assert.ok(after.outputs.some((row: any) => row.outpoint === `${creation.txid}.1`))
  })
  await check('signAction.serialized-spend', async () => {
    assert.ok(creation)
    const prepared = await wallet.createAction!({ description: 'TPNIL boundary staged signature', inputBEEF: [...creation.tx], inputs: [{ outpoint: `${creation.txid}.0`, unlockingScriptLength: fixtureRevision === 2 ? 1 : 0, inputDescription: 'Signing fixture token' }], outputs: [{ satoshis: 1, lockingScript: '51', outputDescription: 'Signed fixture output' }], options: { randomizeOutputs: false, acceptDelayedBroadcast: false } })
    assert.ok(prepared.signableTransaction?.reference)
    const signed = await wallet.signAction!({ reference: prepared.signableTransaction.reference, spends: { '0': { unlockingScript: fixtureRevision === 2 ? '51' : '' } }, options: { acceptDelayedBroadcast: false } })
    assert.ok(signed.tx); const tx = Transaction.fromAtomicBEEF(signed.tx); assert.equal(tx.id('hex'), signed.txid)
    assert.ok(tx.inputs.some(input => input.sourceTXID === creation.txid && input.sourceOutputIndex === 0))
    assert.equal((await wallet.listOutputs!({ basket: 'tpnil boundary tokens' })).outputs.some((row: any) => row.outpoint === `${creation.txid}.0`), false)
  })
  await check('relinquishOutput.removes-basket-membership', async () => {
    assert.ok(creation); assert.equal((await wallet.relinquishOutput!({ basket: 'tpnil boundary tokens', output: `${creation.txid}.1` })).relinquished, true)
    assert.equal((await wallet.listOutputs!({ basket: 'tpnil boundary tokens' })).totalOutputs, 0)
  })
  const issuer = new ProtoWallet(PrivateKey.fromHex('36'.repeat(32)))
  const certificate = identity ? await issueFixtureCertificateForSubject(issuer, identity, { name: 'TPNIL boundary identity', private: 'Unrevealed fixture field' }, Buffer.alloc(32, 17).toString('base64'), async () => `${'00'.repeat(32)}.0`, Buffer.alloc(32, 18).toString('base64')) : undefined
  const key = certificate && { type: certificate.type, serialNumber: certificate.serialNumber, certifier: certificate.certifier }
  await check('acquireCertificate.signed-fields', async () => {
    assert.ok(certificate); assert.ok(await certificate.verify())
    const result = await wallet.acquireCertificate!({ ...certificate, acquisitionProtocol: 'direct', keyringRevealer: 'certifier', keyringForSubject: certificate.masterKeyring })
    assert.equal(result.subject, identity); assert.equal(result.signature, certificate.signature)
  })
  await check('listCertificates.issuer-scope', async () => { assert.ok(certificate); const result = await wallet.listCertificates!({ types: [certificate.type], certifiers: [certificate.certifier] }); assert.equal(result.totalCertificates, 1); assert.equal(result.certificates[0].serialNumber, certificate.serialNumber) })
  let disclosed: Record<string, unknown> | undefined
  await check('proveCertificate.selective-disclosure', async () => {
    assert.ok(certificate)
    const proof = await wallet.proveCertificate!({ certificate: key, fieldsToReveal: ['name'], verifier: verifierIdentity })
    assert.deepEqual(Object.keys(proof.keyringForVerifier), ['name'])
    const verifiable = VerifiableCertificate.fromCertificate(certificate as any, proof.keyringForVerifier)
    assert.ok(await verifiable.verify()); assert.deepEqual(await verifiable.decryptFields(verifier), { name: 'TPNIL boundary identity' })
    // Public lookup can verify and reveal name using an anyone-specific keyring.
    const publicProof = await wallet.proveCertificate!({ certificate: key, fieldsToReveal: ['name'], verifier: PrivateKey.fromHex('01'.padStart(64, '0')).toPublicKey().toString() })
    disclosed = { ...certificate, keyring: publicProof.keyringForVerifier }; delete disclosed.masterKeyring
  })
  if (prepareDiscovery) await check('identity-service.publish', async () => { assert.ok(disclosed, 'Selective public certificate proof unavailable'); await prepareDiscovery(disclosed) })
  for (const method of ['discoverByIdentityKey', 'discoverByAttributes']) {
    if (!prepareDiscovery) { assertions.push({ id: `${method}.identity-service`, result: 'BLOCKED', detail: 'Profile omitted the actual Identity Services publication adapter.' }); continue }
    await check(`${method}.identity-service`, async () => {
      assert.ok(certificate)
      const result = await wallet[method]!({ ...(method === 'discoverByIdentityKey' ? { identityKey: identity } : { attributes: { name: 'TPNIL boundary identity' } }), seekPermission: true })
      if (discoveryExpectation === 'published') assert.ok(result.certificates.some((row: any) => row.serialNumber === certificate.serialNumber && row.certifier === certificate.certifier && row.subject === identity))
      else assert.equal(result.certificates.some((row: any) => row.serialNumber === certificate.serialNumber && row.certifier === certificate.certifier), false)
    })
  }
  await check('relinquishCertificate.tombstone', async () => { assert.ok(certificate); assert.equal((await wallet.relinquishCertificate!(key)).relinquished, true); assert.equal((await wallet.listCertificates!({ certifiers: [certificate.certifier], types: [certificate.type] })).totalCertificates, 0) })
  const negatives: Array<[string, Record<string, unknown>]> = [
    ['getPublicKey', { protocolID: [8, 'invalid protocol'], keyID: '1', counterparty: 'self' }],
    ['decrypt', { ...context, ciphertext: [1, 2, 3] }],
    ['verifyHmac', { ...context, data: [...message, 0], hmac: mac ?? [] }],
    ['verifySignature', { ...context, counterparty: 'anyone', forSelf: true, data: [...message, 0], signature: signature ?? [] }],
    ['createAction', { description: 'TPNIL invalid negative amount', outputs: [{ lockingScript: '51', satoshis: -1, outputDescription: 'Invalid negative output' }] }],
    ['signAction', { reference: Buffer.from('missing action').toString('base64'), spends: {} }],
    ['listOutputs', { basket: 'tpnil boundary tokens', limit: -1 }],
    ['listActions', { labels: [], limit: -1 }],
    ['internalizeAction', { tx: [1, 2, 3], outputs: [], description: 'Malformed incoming transaction' }],
    ['getHeaderForHeight', { height: -1 }],
    ['acquireCertificate', { acquisitionProtocol: 'direct', ...(certificate ?? {}), signature: '00', keyringRevealer: 'certifier', keyringForSubject: certificate?.masterKeyring ?? {} }],
    ['proveCertificate', { certificate: key, fieldsToReveal: ['missing'], verifier: verifierIdentity }],
    ['listCertificates', { types: [], certifiers: [], limit: -1 }]
  ]
  for (const [method, args] of negatives) await check(`${method}.specified-rejection`, async () => {
    let rejected = false
    try { const value = await wallet[method]!(args); rejected = value?.valid === false }
    catch (error) { rejected = !/network error|timed out|exceeded|unsupported|not implemented|fetch failed/i.test(error instanceof Error ? error.message : String(error)) }
    assert.equal(rejected, true, `${method} accepted the invalid fixture`)
  })
  const coverage = requiredMethods.map(method => ({ method, calls: trace.filter(entry => entry.method === method).length, positiveAssertions: assertions.filter(entry => entry.id.startsWith(`${method}.`) && !entry.id.endsWith('.specified-rejection')), negativeAssertions: assertions.filter(entry => entry.id === `${method}.specified-rejection`) }))
  return { schema: 'tpnil-brc100-boundary-corpus@1.0.0', claim: 'ENGINEERING_OBSERVATION_ONLY', assertions, trace, coverage,
    result: assertions.some(item => item.result === 'FAIL') ? 'FAIL' : assertions.some(item => item.result === 'BLOCKED') ? 'BLOCKED' : 'PASS',
    discoveryExpectation, ...(fixtureRevision === 2 ? { fixtureRevision } : {}),
    ...(controlledHeader ? { headerFixture: controlledHeader.id, headerFixturePolicySha256: controlledHeader.policySha256, headerFundingFixtureSha256: controlledHeader.fixtureSha256 } : {}),
    boundary: 'Executable method corpus; full BRC-100 clause/substrate/permission coverage remains separate from method execution.' }
}
