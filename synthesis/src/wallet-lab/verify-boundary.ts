import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { BigNumber, Point, PrivateKey, ProtoWallet, PublicKey, Schnorr, Signature, Transaction, Utils, VerifiableCertificate } from '@bsv/sdk'
import { verifyIdentityPublication } from './native/verify-identity-publication.js'
import { getControlledHeaderFixture, type ControlledHeaderFixture } from './native/controlled-header-fixture.js'
const root = path.resolve(import.meta.dirname, '../../..')
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'))
const profile = read(path.join(root, 'programs/ISI-4/profiles/brc100-boundary-1.0.0/profile.json'))
const digest = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const fixture = read(path.join(root, 'fixtures/teranode/wab-funding-v1.json'))
const tracker = { currentHeight: async () => 900100, isValidRootForHeight: async (root: string, height: number) => root === fixture.merkleRoot && height === fixture.fundingHeight }

/** Recompute method predicates from returned bytes, public responses and errors. */
export async function verifyBoundaryCorpus(c: any, publication: any, expectedHeaderFixture?: ControlledHeaderFixture) {
  assert.equal(c.schema, 'tpnil-brc100-boundary-corpus@1.0.0')
  assert.equal(c.claim, 'ENGINEERING_OBSERVATION_ONLY')
  assert.ok(c.fixtureRevision === undefined || c.fixtureRevision === 2, 'Unsupported boundary fixture revision')
  if (expectedHeaderFixture !== undefined) assert.equal(c.headerFixture, expectedHeaderFixture, 'Boundary header fixture differs from parent selection')
  const controlledHeader = c.headerFixture === undefined ? undefined : getControlledHeaderFixture(c.headerFixture)
  assert.equal(c.headerFixturePolicySha256, controlledHeader?.policySha256)
  assert.equal(c.headerFundingFixtureSha256, controlledHeader?.fixtureSha256)
  const assertionIds = profile.assertions.map((id: string) => controlledHeader && id === 'getHeaderForHeight.genesis' ? controlledHeader.assertionId : id)
  assert.deepEqual(c.assertions.map((x: any) => x.id).sort(), [...assertionIds].sort())
  const trace = c.trace as any[]
  const first = (method: string) => trace.find(t => t.method === method)
  const all = (method: string) => trace.filter(t => t.method === method)
  if (controlledHeader) {
    const calls = all('getHeaderForHeight')
    assert.equal(calls.length, 2, 'Expected one positive controlled header call and one negative control')
    assert.deepEqual(calls[0].args, { height: controlledHeader.height }, 'Controlled header request differs from pinned funding height')
    assert.deepEqual(calls[1].args, { height: -1 }, 'Controlled header negative request differs')
    for (const call of calls) assert.notEqual(Object.hasOwn(call, 'result'), Object.hasOwn(call, 'error'), 'Header call must contain one result or error')
  }
  if (c.fixtureRevision === 2) {
    for (const [description, index, inputDescription] of [['TPNIL boundary abort reservation', 1, 'Abort fixture token'], ['TPNIL boundary staged signature', 0, 'Signing fixture token']] as const) {
      const prepared = trace.filter(t => t.method === 'createAction' && t.args?.description === description)
      const creation = trace.find(t => t.method === 'createAction' && t.args?.description === 'TPNIL boundary token pair')?.result
      if (!creation?.txid) { assert.equal(prepared.length, 0); continue }
      assert.equal(prepared.length, 1, 'One exact staged fixture required')
      assert.deepEqual(prepared[0].args, {
        description, inputBEEF: creation.tx, inputs: [{ outpoint: `${creation.txid}.${index}`, unlockingScriptLength: 1, inputDescription }],
        outputs: [{ satoshis: 1, lockingScript: '51', outputDescription: index === 1 ? 'Aborted fixture output' : 'Signed fixture output' }],
        options: index === 1 ? { randomizeOutputs: false, noSend: true } : { randomizeOutputs: false, acceptDelayedBroadcast: false }
      })
    }
    const prepared = trace.find(t => t.method === 'createAction' && t.args?.description === 'TPNIL boundary staged signature')
    if (prepared?.result?.signableTransaction?.reference) {
      const signed = all('signAction')[0]
      assert.deepEqual(signed?.args, { reference: prepared.result.signableTransaction.reference, spends: { '0': { unlockingScript: '51' } }, options: { acceptDelayedBroadcast: false } })
      if (signed.result?.tx) {
        const tx = Transaction.fromAtomicBEEF(signed.result.tx)
        assert.equal(tx.inputs[0]?.unlockingScript?.toHex(), '51')
      }
    }
  }
  const identity = first('getPublicKey')?.result?.publicKey
  const message = Utils.toArray('TPNIL BRC100 boundary corpus v1', 'utf8')
  const verifier = new ProtoWallet(PrivateKey.fromHex('35'.repeat(32)))
  const issuer = PrivateKey.fromHex('36'.repeat(32)).toPublicKey().toString()
  const created = first('createAction')?.result
  const cert = first('acquireCertificate')?.args
  const rows = (method: string) => first(method)?.result
  const same = (a: unknown, b: unknown) => assert.deepEqual(a, b)
  const predicates: Record<string, () => unknown | Promise<unknown>> = {
    'getPublicKey.identity': () => assert.match(identity, /^(02|03)[a-f0-9]{64}$/),
    'getNetwork.mainnet': () => same(rows('getNetwork').network, 'mainnet'),
    'getVersion.nonempty': () => assert.ok(rows('getVersion').version?.length > 0),
    'isAuthenticated.true': () => same(rows('isAuthenticated').authenticated, true),
    'waitForAuthentication.true': () => same(rows('waitForAuthentication').authenticated, true),
    'getHeight.controlled': () => same(rows('getHeight').height, 900100),
    'getHeaderForHeight.genesis': () => same(rows('getHeaderForHeight').header, `01000000${'00'.repeat(32)}3ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a29ab5f49ffff001d1dac2b7c`),
    'encrypt.bytes': () => assert.ok(Array.isArray(rows('encrypt').ciphertext) && rows('encrypt').ciphertext.length > message.length),
    'decrypt.roundtrip': () => { same(first('decrypt').args.ciphertext, rows('encrypt').ciphertext); same(rows('decrypt').plaintext, message) },
    'createSignature.independent-verification': () => { const pub = all('getPublicKey').find(t => t.args.counterparty === 'anyone')?.result.publicKey; assert.ok(Signature.fromDER(rows('createSignature').signature).verify(message, PublicKey.fromString(pub))) },
    'verifySignature.valid': () => same(rows('verifySignature').valid, true),
    'createHmac.length': () => same(rows('createHmac').hmac.length, 32),
    'verifyHmac.valid': () => same(rows('verifyHmac').valid, true),
    'revealCounterpartyKeyLinkage.independent-secret': async () => {
      const r = rows('revealCounterpartyKeyLinkage'), peer = PrivateKey.fromHex('34'.repeat(32))
      same(r.prover, identity); same(r.counterparty, peer.toPublicKey().toString()); same(r.verifier, (await verifier.getPublicKey({ identityKey: true })).publicKey)
      const args = { protocolID: [2, 'counterparty linkage revelation'] as [2, string], keyID: r.revelationTime, counterparty: identity }
      const clear = (await verifier.decrypt({ ...args, ciphertext: r.encryptedLinkage })).plaintext
      same(clear, PublicKey.fromString(identity).mul(peer).encode(true))
      const proof = (await verifier.decrypt({ ...args, ciphertext: r.encryptedLinkageProof })).plaintext
      same(proof.length, 98); assert.ok(new Schnorr().verifyProof(PublicKey.fromString(identity), peer.toPublicKey(), Point.fromDER(clear), { R: Point.fromDER(proof.slice(0, 33)), SPrime: Point.fromDER(proof.slice(33, 66)), z: new BigNumber(proof.slice(66)) }))
    },
    'revealSpecificKeyLinkage.independent-secret': async () => {
      const r = rows('revealSpecificKeyLinkage'); same(r.prover, identity); same(r.proofType, 0)
      const clear = (await verifier.decrypt({ protocolID: [2, 'specific linkage revelation 0 tpnil boundary corpus'], keyID: '1', counterparty: identity, ciphertext: r.encryptedLinkage })).plaintext
      same(clear, new ProtoWallet(PrivateKey.fromHex('34'.repeat(32))).keyDeriver!.revealSpecificSecret(identity, [0, 'tpnil boundary corpus'], '1'))
    },
    'internalizeAction.mined-descendant-payment': async () => { same(rows('internalizeAction').accepted, true); const tx = Transaction.fromAtomicBEEF(first('internalizeAction').args.tx); same(tx.outputs[0]!.satoshis, 1000); assert.ok(tx.inputs.length > 0); assert.ok(await tx.verify(tracker)) },
    'createAction.serialized-outputs': async () => { const tx = Transaction.fromAtomicBEEF(created.tx); same(tx.id('hex'), created.txid); for (const o of tx.outputs.slice(0, 2)) { same(o.satoshis, 7); same(o.lockingScript.toHex(), c.fixtureRevision === 2 ? '7551' : '51') }; assert.ok(await tx.verify(tracker)) },
    'listActions.metadata': () => assert.ok(rows('listActions').actions.some((a: any) => a.txid === created.txid && a.description === 'TPNIL boundary token pair')),
    'listOutputs.metadata': () => { same(rows('listOutputs').totalOutputs, 2); same(rows('listOutputs').outputs.map((r: any) => r.outpoint).sort(), [`${created.txid}.0`, `${created.txid}.1`]) },
    'abortAction.releases-reservation': () => { same(rows('abortAction').aborted, true); assert.ok(all('listOutputs')[1]?.result.outputs.some((r: any) => r.outpoint === `${created.txid}.1`)) },
    'signAction.serialized-spend': async () => { const r = rows('signAction'), tx = Transaction.fromAtomicBEEF(r.tx); same(tx.id('hex'), r.txid); assert.ok(tx.inputs.some(i => i.sourceTXID === created.txid && i.sourceOutputIndex === 0)); same(all('listOutputs')[2]?.result.outputs.some((r: any) => r.outpoint === `${created.txid}.0`), false); assert.ok(await tx.verify(tracker)) },
    'relinquishOutput.removes-basket-membership': () => { same(rows('relinquishOutput').relinquished, true); same(all('listOutputs')[3]?.result.totalOutputs, 0) },
    'acquireCertificate.signed-fields': async () => { same(rows('acquireCertificate').subject, identity); same(rows('acquireCertificate').signature, cert.signature); assert.ok(await VerifiableCertificate.fromCertificate(cert, {}).verify()) },
    'listCertificates.issuer-scope': () => { same(rows('listCertificates').totalCertificates, 1); same(rows('listCertificates').certificates[0].serialNumber, cert.serialNumber) },
    'proveCertificate.selective-disclosure': async () => { const proof = rows('proveCertificate'); same(Object.keys(proof.keyringForVerifier), ['name']); const vc = VerifiableCertificate.fromCertificate(cert, proof.keyringForVerifier); assert.ok(await vc.verify()); same(await vc.decryptFields(verifier), { name: 'TPNIL boundary identity' }); assert.ok(all('proveCertificate')[1]?.result?.keyringForVerifier) },
    'identity-service.publish': async () => { if (c.fixtureRevision === 2) await verifyIdentityPublication(publication, cert, identity, tracker); assert.ok(publication?.txid); const tx = Transaction.fromAtomicBEEF(publication.beef); same(tx.id('hex'), publication.txid); same(tx.toHex(), publication.raw); assert.ok(publication.answer.outputs.some((r: any) => Transaction.fromBEEF(r.beef).id('hex') === publication.txid)) },
    'relinquishCertificate.tombstone': () => { same(rows('relinquishCertificate').relinquished, true); same(all('listCertificates')[1]?.result.totalCertificates, 0) }
  }
  if (controlledHeader) {
    delete predicates['getHeaderForHeight.genesis']
    predicates[controlledHeader.assertionId] = () => same(rows('getHeaderForHeight').header, controlledHeader.header)
  }
  for (const method of ['discoverByIdentityKey', 'discoverByAttributes']) predicates[`${method}.identity-service`] = () => {
    const found = rows(method).certificates.some((r: any) => r.serialNumber === cert.serialNumber && r.certifier === issuer && r.subject === identity)
    same(found, c.discoveryExpectation === 'published')
  }
  for (const id of profile.assertions.filter((id: string) => id.endsWith('.specified-rejection'))) predicates[id] = () => {
    const row = all(id.split('.')[0]).at(-1); assert.ok(row)
    assert.ok(row.result?.valid === false || (row.error && !/network error|timed out|exceeded|unsupported|not implemented|fetch failed/i.test(row.error.message ?? String(row.error))))
  }
  const outcomes = []
  for (const observation of c.assertions) {
    assert.equal(typeof observation.detail, 'string'); assert.ok(predicates[observation.id], 'Unregistered assertion')
    let result = 'PASS'
    try { await predicates[observation.id]!() } catch { result = 'FAIL' }
    // Native omissions are observations, never accepted as a successful conformance result.
    assert.equal(observation.result, result, `Independent boundary predicate differs: ${observation.id}`)
    outcomes.push({ id: observation.id, result })
  }
  assert.deepEqual(c.coverage.map((r: any) => r.method).sort(), [...profile.methods].sort())
  for (const row of c.coverage) {
    same(row.calls, all(row.method).length)
    same(row.positiveAssertions, c.assertions.filter((r: any) => r.id.startsWith(`${row.method}.`) && !r.id.endsWith('.specified-rejection')))
    same(row.negativeAssertions, c.assertions.filter((r: any) => r.id === `${row.method}.specified-rejection`))
  }
  const outcome = outcomes.every(r => r.result === 'PASS') ? 'PASS' : 'FAIL'
  same(c.result, outcome)
  return { verified: true, outcome, assertions: outcomes, methodCalls: c.coverage.map(({ method, calls }: any) => ({ method, calls })), completeBRC100Conformance: false }
}

if (process.argv[1] === import.meta.filename) {
  const integrated = process.argv.includes('--integrated'), directory = path.resolve(process.argv[2]!)
  let corpus: any, publication: any
  if (integrated) { corpus = read(path.join(directory, 'boundary.json')); publication = read(path.join(directory, 'boundary-publication.json')) }
  else {
    const report = read(path.join(directory, 'result.json')), o = read(path.join(directory, 'observations.json'))
    assert.equal(report.schema, 'tpnil-wallet-boundary-run@1.0.0')
    for (const item of report.evidence) { assert.ok(['observations.json', 'coverage.json'].includes(item.path)); sameDigest(item.sha256, digest(path.join(directory, item.path))) }
    assert.ok(report.cleanup.every((x: any) => x.closed)); corpus = o.corpus; publication = o.publication
    assert.deepEqual(report.assertions.filter((x: any) => x.id !== 'cleanup'), corpus.assertions)
    assert.equal(digest(path.join(directory, 'coverage.json')), digest(path.join(root, 'programs/ISI-4/profiles/brc100-boundary-1.0.0/coverage.json')))
  }
  const verified = await verifyBoundaryCorpus(corpus, publication)
  const changed = structuredClone(corpus)
  const height = changed.trace.find((r: any) => r.method === 'getHeight' && r.result)
  if (height && changed.assertions.find((r: any) => r.id === 'getHeight.controlled')?.result === 'PASS') {
    height.result.height++
    await assert.rejects(verifyBoundaryCorpus(changed, publication), /Independent boundary predicate differs/)
  }
  console.log(JSON.stringify({ ...verified, tamper: { changedReturnedHeightRejected: Boolean(height) } }))
}
function sameDigest(actual: string, expected: string) { assert.equal(actual, expected) }
