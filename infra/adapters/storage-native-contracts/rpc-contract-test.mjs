import assert from 'node:assert/strict'
import { AuthFetch, PrivateKey, ProtoWallet } from '../../../synthesis/node_modules/@bsv/sdk/dist/esm/mod.js'
// Public, disposable Go test fixture. This never opens a native/personal wallet.
const [url, fixtureKey, encoded] = process.argv.slice(2)
assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/)
const fixture = JSON.parse(encoded), wallet = new ProtoWallet(PrivateKey.fromHex(fixtureKey)), peer = new AuthFetch(wallet)
assert.equal((await wallet.getPublicKey({ identityKey: true })).publicKey, fixture.auth.identityKey)
let id = 0
async function rpc(method, args) {
 const response = await peer.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params: [fixture.auth, args] }) })
 assert.equal(response.status, 200)
 const body = await response.json(); assert.equal(body.id, id); return body
}
const certificateQuery = partial => ({ partial, certifiers: [], types: [], limit: 10, offset: 0 })
const exactCertificate = await rpc('listCertificates', certificateQuery(fixture.certificatePartial))
assert.equal(exactCertificate.error, undefined); assert.equal(exactCertificate.result.totalCertificates, 1)
assert.equal(exactCertificate.result.certificates[0].subject, fixture.auth.identityKey)
for (const [field, value] of Object.entries({ type: Buffer.from('different type').toString('base64'), certifier: fixture.otherIdentity,
 serialNumber: Buffer.from('different serial').toString('base64'), subject: fixture.otherIdentity, revocationOutpoint: `${'01'.repeat(32)}.1`, signature: '00' })) {
 const changed = await rpc('listCertificates', certificateQuery({ ...fixture.certificatePartial, [field]: value }))
 assert.equal(changed.error, undefined); assert.equal(changed.result.totalCertificates, 0, `Wrong partial ${field} matched`); assert.deepEqual(changed.result.certificates, [])
}
for (const filters of [{ certifiers: [fixture.otherIdentity] }, { types: [Buffer.from('different type').toString('base64')] }]) {
 const conflict = await rpc('listCertificates', { ...certificateQuery(fixture.certificatePartial), ...filters })
 assert.equal(conflict.error, undefined); assert.equal(conflict.result.totalCertificates, 0)
}
for (const [method, args] of [['relinquishOutput', fixture.output], ['relinquishCertificate', fixture.certificate]]) {
 const first = await rpc(method, args); assert.equal(first.error, undefined); assert.equal(first.result, 1)
 const second = await rpc(method, args); assert.ok(second.error); assert.notEqual(second.result, 1)
}
const outputs = await rpc('listOutputs', { basket: fixture.output.basket, limit: 10, offset: -1 }); assert.equal(outputs.error, undefined); assert.equal(outputs.result.totalOutputs, 0); assert.deepEqual(outputs.result.outputs, [])
const certificates = await rpc('listCertificates', { certifiers: [], types: [], limit: 10, offset: 0 }); assert.equal(certificates.error, undefined); assert.equal(certificates.result.totalCertificates, 0); assert.deepEqual(certificates.result.certificates, [])
console.log(JSON.stringify({ schema: 'tpnil-ts-go-native-storage-rpc-test@1', claim: 'LAB_SELF_TEST_ONLY', verified: true, certificateTupleFields: 6, certificateFilterIntersections: 2, authenticatedMutationContracts: 2, repeatedMutationsRejected: 2, removedOutputAndCertificateIndependentlyQueried: true }))
