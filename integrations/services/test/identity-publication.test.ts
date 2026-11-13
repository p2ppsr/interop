import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import test from 'node:test'
import { once } from 'node:events'
import { KeyDeriver, LockingScript, MasterCertificate, P2PKH, PrivateKey, ProtoWallet, Transaction } from '@bsv/sdk'
import { publishIdentityCertificate } from '../src/identity.ts'
import { issueFixtureCertificateForSubject } from '../../../synthesis/src/wallet-lab/certificate-fixture.ts'
import { verifyIdentityPublication } from '../../../synthesis/src/wallet-lab/native/verify-identity-publication.ts'

// LAB_SELF_TEST_ONLY: actual publisher, SDK crypto and signed mined-root bytes;
// loopback HTTP receipts are test controls, never native qualification evidence.
test('fixture2 publishes subject-owned signed identity token and rejects altered identity/origin', { timeout: 30000 }, async () => {
  const funding = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../../fixtures/teranode/wab-funding-v1.json'), 'utf8'))
  const source = Transaction.fromAtomicBEEF([...Buffer.from(funding.atomicBeefHex, 'hex')])
  const fundingKey = new KeyDeriver(PrivateKey.fromHex('77'.repeat(32))).derivePrivateKey([2, '3241645161d8'], `${funding.payment.derivationPrefix} ${funding.payment.derivationSuffix}`, funding.payment.senderIdentityKey)
  const wallet = new ProtoWallet(PrivateKey.fromHex('79'.repeat(32))) as any
  wallet.createAction = async (args: any) => {
    const tx = new Transaction(); tx.addInput({ sourceTransaction: source, sourceOutputIndex: 0, unlockingScriptTemplate: new P2PKH().unlock(fundingKey) })
    for (const output of args.outputs) tx.addOutput({ satoshis: output.satoshis, lockingScript: LockingScript.fromHex(output.lockingScript) })
    tx.addOutput({ satoshis: source.outputs[0]!.satoshis! - args.outputs.reduce((n: number, output: any) => n + output.satoshis, 0) - 1, lockingScript: new P2PKH().lock(fundingKey.toPublicKey().toAddress()) })
    await tx.sign(); return { txid: tx.id('hex'), tx: tx.toAtomicBEEF() }
  }
  const identity = (await wallet.getPublicKey({ identityKey: true })).publicKey
  const cert = await issueFixtureCertificateForSubject(new ProtoWallet(PrivateKey.fromHex('36'.repeat(32))) as any, identity, { name: 'TPNIL boundary identity', private: 'Undisclosed' }, Buffer.alloc(32,17).toString('base64'), async () => `${source.id('hex')}.0`, Buffer.alloc(32,18).toString('base64'))
  const anyone = (await new ProtoWallet('anyone').getPublicKey({ identityKey: true })).publicKey
  const keyring = await MasterCertificate.createKeyringForVerifier(wallet, cert.certifier, anyone, cert.fields, ['name'], cert.masterKeyring, cert.serialNumber)
  const { masterKeyring: _master, ...publicCert } = JSON.parse(JSON.stringify(cert)), certificate = { ...publicCert, keyring }
  let published: number[] = []
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(chunk)
    const body = Buffer.concat(chunks); response.setHeader('content-type','application/json')
    if (request.url === '/submit') { published = [...body]; response.end(JSON.stringify({ tm_identity: { outputsToAdmit: [0] }, tm_slap: { outputsToAdmit: [1] } })) }
    else if (request.url === '/lookup') { const query = JSON.parse(body.toString()); assert.equal(query.service,'ls_identity'); assert.equal(query.query.identityKey, identity); response.end(JSON.stringify({ type: 'output-list', outputs: [{ beef: published, outputIndex: 0 }] })) }
    else { response.statusCode=404;response.end('{}') }
  })
  server.listen(0,'127.0.0.1'); await once(server,'listening')
  const origin = `http://127.0.0.1:${(server.address() as any).port}`, tracker = { currentHeight: async () => funding.fundingHeight + funding.maturityDepth, isValidRootForHeight: async (root: string, height: number) => root === funding.merkleRoot && height === funding.fundingHeight }
  try {
    const legacy = await publishIdentityCertificate({ wallet, origin, certificate })
    await assert.rejects(verifyIdentityPublication(legacy, certificate, identity, tracker), /subject-derived key/)
    const publication = await publishIdentityCertificate({ wallet, origin, certificate, fixtureRevision: 2 })
    assert.equal((await verifyIdentityPublication(publication, certificate, identity, tracker)).verified, true)
    const otherOrigin = await publishIdentityCertificate({ wallet, origin, certificate, fixtureRevision: 2, domain: 'https://other.itcve.test' })
    await assert.rejects(verifyIdentityPublication(otherOrigin, certificate, identity, tracker))
    const wrongIdentity = PrivateKey.fromHex('78'.repeat(32)).toPublicKey().toString()
    await assert.rejects(verifyIdentityPublication(publication, certificate, wrongIdentity, tracker))
    const changed = structuredClone(publication); changed.answer.outputs[0].outputIndex = 1
    await assert.rejects(verifyIdentityPublication(changed, certificate, identity, tracker))
    await assert.rejects(publishIdentityCertificate({ wallet, origin, certificate, fixtureRevision: 3 as any }), /revision/)
  } finally { server.close(); await once(server,'close') }
})
