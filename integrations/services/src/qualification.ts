import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { Transaction, PrivateKey, PublicKey, ProtoWallet, PushDrop, MerklePath, OverlayAdminTokenTemplate, MasterCertificate, VerifiableCertificate, Utils, LockingScript } from '@bsv/sdk'
import { startChaintracks, genesis, mineHeader, headerHash } from './chaintracks.js'
import { startOverlayNode, submit, lookup, syncPeer } from './overlay.js'
import { startGoOverlay } from './go-peer.js'

const base = fileURLToPath(new URL('../', import.meta.url))
const directory = path.resolve(process.argv[2] ?? 'out/overlay-identity')
await fs.mkdir(directory, { recursive: true })
if ((await fs.readdir(directory)).length !== 0) throw new Error(`Evidence directory must be empty: ${directory}`)
const startedAt = new Date().toISOString()
const profileBytes = await fs.readFile(path.join(base, 'profile.json'))
const profile = JSON.parse(profileBytes.toString())
const assertions: any[] = [], events: any[] = []
const log = (...args: unknown[]) => { events.push({ sequence: events.length + 1, args: args.map(x => x instanceof Error ? x.message : x) }) }
const digest = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex')
async function check(id: string, expected: string, run: () => Promise<unknown>) {
  try { const actual = await run(); assertions.push({ id, expected, verdict: 'PASS', actual }); return actual }
  catch (error) { assertions.push({ id, expected, verdict: 'FAIL', error: error instanceof Error ? error.message : String(error) }); return undefined }
}
const sourceLock = JSON.parse(await fs.readFile(path.join(base, 'sources.json'), 'utf8'))
for (const source of sourceLock.files) assert.equal(digest(await fs.readFile(path.join(base, source.local))), source.sha256, `Vendored source identity ${source.local}`)
const fixtureWallet = new ProtoWallet(PrivateKey.fromHex('41'.repeat(32)))
const subject = new ProtoWallet(PrivateKey.fromHex('42'.repeat(32)))
const issuer = new ProtoWallet(PrivateKey.fromHex('43'.repeat(32)))
const anyone = new ProtoWallet('anyone')
const payload = new PushDrop(fixtureWallet as any)
const payloadTx = new Transaction(1, [], [{ satoshis: 1, lockingScript: await payload.lock([Utils.toArray('tpnil-live-overlay', 'utf8')], [2, 'tpnil integration'], '1', 'self') }], 0)
const secondPayloadTx = new Transaction(1, [], [{ satoshis: 1, lockingScript: await payload.lock([Utils.toArray('tpnil-go-only-payload', 'utf8')], [2, 'tpnil integration'], '1', 'self') }], 0)
const template = new OverlayAdminTokenTemplate(fixtureWallet as any)
const ship = new Transaction(1, [], [{ satoshis: 1, lockingScript: await template.lock('SHIP', 'https://overlay-a.itcve.test', 'tm_tpnil') }], 0)
const slap = new Transaction(1, [], [{ satoshis: 1, lockingScript: await template.lock('SLAP', 'https://overlay-a.itcve.test', 'ls_tpnil') }], 0)
const certificate = await MasterCertificate.issueCertificateForSubject(issuer as any, (await subject.getPublicKey({ identityKey: true })).publicKey, { userName: 'lab-alice', privateNote: 'not-public' }, Buffer.alloc(32, 1).toString('base64'), async () => `${'00'.repeat(32)}.0`, Buffer.alloc(32, 2).toString('base64'))
const keyring = await MasterCertificate.createKeyringForVerifier(subject as any, certificate.certifier, 'anyone', certificate.fields, ['userName'], certificate.masterKeyring, certificate.serialNumber)
const publicCertificate = new VerifiableCertificate(certificate.type, certificate.serialNumber, certificate.subject, certificate.certifier, certificate.revocationOutpoint, certificate.fields, keyring, certificate.signature)
const certificateMessage = Buffer.from(publicCertificate.toBinary(false)).toString('hex')
const publicAnyone = '00'.repeat(31) + '01', certificateInvoice = `2-certificate signature-${publicCertificate.type} ${publicCertificate.serialNumber}`
const certificateSigningKey = PublicKey.fromString(publicCertificate.certifier).deriveChild(PrivateKey.fromHex(publicAnyone), certificateInvoice).toString()
await fs.writeFile(path.join(directory, 'rust-certificate-vectors.json'), JSON.stringify({ schema: 'tpnil-rust-certificate-vectors@2', serialization: 'BSV Certificate.toBinary(false); BRC-52 publicly derived certificate-signature key; ECDSA hashes message once with SHA-256', cases: [
  { id: 'actual-identity-certificate-public-key-derivation', request: { op: 'derive-public', publicKey: publicCertificate.certifier, privateKey: publicAnyone, invoice: certificateInvoice }, expected: { publicKey: certificateSigningKey } },
  { id: 'actual-identity-certificate-signature', request: { op: 'signature', publicKey: certificateSigningKey, signature: publicCertificate.signature, message: certificateMessage }, expected: { valid: true } },
  { id: 'actual-identity-certificate-mutated-preimage', request: { op: 'signature', publicKey: certificateSigningKey, signature: publicCertificate.signature, message: `${certificateMessage}00` }, expected: { valid: false } }
] }, null, 2) + '\n')
const certScript = await new PushDrop(subject as any).lock([Utils.toArray(JSON.stringify(publicCertificate), 'utf8')], [1, 'identity'], '1', 'anyone')
const identityTx = new Transaction(1, [{ sourceTransaction: payloadTx, sourceOutputIndex: 0, unlockingScriptTemplate: payload.unlock([2, 'tpnil integration'], '1', 'self') }], [{ satoshis: 1, lockingScript: certScript }], 0)
await identityTx.sign()
const txs = [payloadTx, secondPayloadTx, ship, slap, identityTx]
const headers = [genesis]
for (const tx of txs) { const proof = new MerklePath(headers.length, [[{ offset: 0, hash: 'aa'.repeat(32) }, { offset: 1, hash: tx.id('hex'), txid: true }]]); const header = mineHeader(headers.at(-1)!, proof.computeRoot(tx.id('hex'))); headers.push(header); tx.merklePath = proof }
await fs.writeFile(path.join(directory, 'fixtures.json'), JSON.stringify({ claim: 'LAB_SELF_TEST_ONLY', funding: 'Synthetic no-input outputs anchored in locally mined regtest headers; not native wallet funding', headers, transactions: txs.map(t => ({ txid: t.id('hex'), beef: t.toAtomicBEEF(), raw: t.toHex() })), publicCertificate }, null, 2) + '\n')
let mongo: MongoMemoryReplSet | undefined, chain: any, a: any, b: any, go: any
const cleanup: any[] = []
const runtime: any = { platform: process.platform, architecture: process.arch, node: process.version, nodeSha256: digest(await fs.readFile(process.execPath)) }
try {
  const binaryOptions: any = { version: process.env.TPNIL_MONGO_VERSION ?? '8.0.16' }
  if (process.env.TPNIL_MONGOD) binaryOptions.systemBinary = process.env.TPNIL_MONGOD
  mongo = await MongoMemoryReplSet.create({ binary: binaryOptions, replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' } })
  const mongoProcess = (mongo.servers[0]?.instanceInfo as any)?.instance?.mongodProcess
  runtime.mongo = { version: binaryOptions.version, pid: mongoProcess?.pid, executable: mongoProcess?.spawnfile ?? binaryOptions.systemBinary }
  if (runtime.mongo.executable) runtime.mongo.sha256 = digest(await fs.readFile(runtime.mongo.executable))
  chain = await startChaintracks(path.join(directory, 'chaintracks'), headers, log)
  await check('CHAIN-001', 'Contiguous header ingestion begins at the canonical regtest genesis and selects height 5', async () => { assert.equal(headerHash(genesis), genesis.hash); const tip = await chain.tracker.findChainTipHeader(); assert.equal(tip.hash, headers.at(-1)!.hash); const res: any = await (await fetch(`${chain.origin}/chaintracks/v2/header/height/5`)).json(); assert.equal(res.value.hash, tip.hash); return tip })
  await check('CHAIN-002', 'Malformed header hash is rejected before storage mutation', async () => { await assert.rejects(chain.storage.insertHeader({ ...headers[1], hash: '11'.repeat(32) })); assert.equal((await chain.tracker.findChainTipHeader()).hash, headers[5].hash); return { rejected: true } })
  const prefix = `tpnil_${randomBytes(6).toString('hex')}`
  a = await startOverlayNode({ directory: path.join(directory, 'overlay-a'), name: `${prefix}_a`, mongoUri: mongo.getUri(), tracker: chain.tracker, log })
  b = await startOverlayNode({ directory: path.join(directory, 'overlay-b'), name: `${prefix}_b`, mongoUri: mongo.getUri(), tracker: chain.tracker, log })
  await check('OVERLAY-001', 'Actual TS OverlayExpress admits a proven payload through HTTP and returns the exact transaction', async () => { const receipt = await submit(a.origin, payloadTx, ['tm_tpnil']); const found = await lookup(a.origin, 'ls_tpnil', {}); assert.equal(found.outputs.length, 1); assert.equal(Transaction.fromBEEF(found.outputs[0].beef).id('hex'), payloadTx.id('hex')); return { receipt, found } })
  await check('OVERLAY-002', 'Duplicate submission leaves one live output', async () => { await submit(a.origin, payloadTx, ['tm_tpnil']); const found = await lookup(a.origin, 'ls_tpnil', {}); assert.equal(found.outputs.length, 1); return found })
  await check('DISCOVERY-001', 'Actual SHIP admission and Mongo lookup resolve the advertised topic', async () => { await submit(a.origin, ship, ['tm_ship']); const found = await lookup(a.origin, 'ls_ship', { topics: ['tm_tpnil'] }); assert.equal(found.outputs.length, 1); assert.equal(Transaction.fromBEEF(found.outputs[0].beef).id('hex'), ship.id('hex')); return found })
  await check('DISCOVERY-002', 'Actual SLAP admission and Mongo lookup resolve the advertised service', async () => { await submit(a.origin, slap, ['tm_slap']); const found = await lookup(a.origin, 'ls_slap', { service: 'ls_tpnil' }); assert.equal(found.outputs.length, 1); return found })
  await check('OVERLAY-003', 'GASP synchronizes from a separate HTTP node and survives a duplicate synchronization', async () => { await syncPeer(b, a.origin); await syncPeer(b, a.origin); const found = await lookup(b.origin, 'ls_tpnil', {}); assert.equal(found.outputs.length, 1); assert.equal(Transaction.fromBEEF(found.outputs[0].beef).id('hex'), payloadTx.id('hex')); return found })
  go = await startGoOverlay({ directory: path.join(directory, 'go'), mongoUri: mongo.getUri(), chaintracksOrigin: chain.origin, headers })
  await check('OVERLAY-GO-001', 'Go GASP pulls the TypeScript peer through actual HTTP and persists its exact payload outpoint', async () => { await go.sync(a.origin); const found = await lookup(go.origin, 'ls_tpnil', {}); assert.equal(found.outputs.length, 1); const beef = typeof found.outputs[0].beef === 'string' ? [...Buffer.from(found.outputs[0].beef, 'base64')] : found.outputs[0].beef; assert.equal(Transaction.fromBEEF(beef).id('hex'), payloadTx.id('hex')); return { found, identity: go.identity } })
  await check('OVERLAY-GO-002', 'TypeScript GASP pulls a new Go-only payload through the declared absent-field wire adapter', async () => { await submit(go.origin, secondPayloadTx, ['tm_tpnil']); await syncPeer(b, go.origin); const found = await lookup(b.origin, 'ls_tpnil', {}); assert.equal(found.outputs.length, 2); assert(found.outputs.some((o: any) => Transaction.fromBEEF(o.beef).id('hex') === secondPayloadTx.id('hex'))); return found })
  await check('IDENTITY-001', 'Issuer signature and selective disclosure validate; privateNote remains undisclosed', async () => { assert.equal(await publicCertificate.verify(), true); const revealed = await publicCertificate.decryptFields(anyone as any); assert.deepEqual({ ...revealed }, { userName: 'lab-alice' }); const tampered = new VerifiableCertificate(certificate.type, certificate.serialNumber, certificate.subject, certificate.certifier, certificate.revocationOutpoint, { ...certificate.fields, userName: Buffer.alloc(40, 0).toString('base64') }, keyring, certificate.signature); assert.equal(await tampered.verify(), false); return { revealed, signature: certificate.signature } })
  await check('IDENTITY-002', 'Actual Identity Services validates, stores and returns the certificate through OverlayExpress', async () => { const receipt = await submit(a.origin, identityTx, ['tm_identity']); const found = await lookup(a.origin, 'ls_identity', { identityKey: certificate.subject }); assert.equal(found.outputs.length, 1); assert.equal(Transaction.fromBEEF(found.outputs[0].beef).id('hex'), identityTx.id('hex')); const mismatch = await lookup(a.origin, 'ls_identity', { identityKey: certificate.subject, certifiers: [(await fixtureWallet.getPublicKey({ identityKey: true })).publicKey] }); assert.equal(mismatch.outputs.length, 0); return { receipt, found } })
  await check('OVERLAY-004', 'SQLite and Mongo state survive complete server object replacement', async () => { await a.close(); a = await startOverlayNode({ directory: path.join(directory, 'overlay-a'), name: `${prefix}_a`, mongoUri: mongo!.getUri(), tracker: chain.tracker, log }); const found = await lookup(a.origin, 'ls_tpnil', {}); const identities = await lookup(a.origin, 'ls_identity', { identityKey: certificate.subject }); assert.equal(found.outputs.length, 1); assert.equal(identities.outputs.length, 1); return { found, identities } })
  await check('IDENTITY-003', 'Spending the signed identity token removes its public lookup record', async () => {
    const revoke = new Transaction(1, [{ sourceTransaction: identityTx, sourceOutputIndex: 0, unlockingScriptTemplate: new PushDrop(anyone as any).unlock([1, 'identity'], '1', certificate.subject) }], [{ satoshis: 0, lockingScript: LockingScript.fromASM('OP_FALSE OP_RETURN') }], 0)
    await revoke.sign()
    assert.equal(await revoke.verify(chain.tracker), true)
    const receipt = await submit(a.origin, revoke, ['tm_identity'])
    const found = await lookup(a.origin, 'ls_identity', { identityKey: certificate.subject })
    assert.equal(found.outputs.length, 0)
    await fs.writeFile(path.join(directory, 'relinquishment.json'), JSON.stringify({ raw: revoke.toHex(), beef: revoke.toAtomicBEEF(), receipt, found }, null, 2) + '\n')
    return { txid: revoke.id('hex'), receipt, remaining: found.outputs.length }
  })
  await check('CHAIN-003', 'A higher-work competing branch replaces the active root and survives a SQLite restart', async () => { const fork = mineHeader(headers[1], '55'.repeat(32), 2); const branch = [fork]; while (branch.at(-1)!.height <= headers[5].height) branch.push(mineHeader(branch.at(-1)!, '56'.repeat(32))); for (const h of branch) { headers.push(h); await chain.tracker.addHeader({ version: h.version, previousHash: h.previousHash, merkleRoot: h.merkleRoot, time: h.time, bits: h.bits, nonce: h.nonce }) } const deadline = Date.now() + 15000; while ((await chain.tracker.findChainTipHeader()).hash !== branch.at(-1)!.hash) { if (Date.now() > deadline) throw new Error('Reorg deadline exceeded'); await new Promise(resolve => setTimeout(resolve, 50)) } assert.equal(await chain.tracker.isValidRootForHeight(headers[4].merkleRoot, 4), false); await a.close(); cleanup.push({ name: 'overlay-a', closed: true }); a = undefined; await b.close(); cleanup.push({ name: 'overlay-b', closed: true }); b = undefined; await chain.close(); chain = await startChaintracks(path.join(directory, 'chaintracks'), headers, log); assert.equal((await chain.tracker.findChainTipHeader()).hash, branch.at(-1)!.hash); return { newTip: await chain.tracker.findChainTipHeader() } })
} catch (error) {
  assertions.push({ id: 'ENVIRONMENT', verdict: 'BLOCKED', error: error instanceof Error ? error.stack : String(error) })
} finally {
  for (const [name, resource] of [['overlay-a', a], ['overlay-b', b], ['go-overlay', go], ['chaintracks', chain]] as const) if (resource) {
    try { await resource.close(); cleanup.push({ name, closed: true }) } catch (error) { cleanup.push({ name, closed: false, error: String(error) }) }
  }
  if (mongo) { try { await mongo.stop({ doCleanup: true, force: false }); cleanup.push({ name: 'mongo', closed: true }) } catch (error) { cleanup.push({ name: 'mongo', closed: false, error: String(error) }) } }
}
if (go) await fs.writeFile(path.join(directory, 'go-events.txt'), go.diagnostics())
await fs.writeFile(path.join(directory, 'events.json'), JSON.stringify(events, null, 2) + '\n')
const evidence = await Promise.all(['fixtures.json', 'events.json', 'rust-certificate-vectors.json', ...(go ? ['go-events.txt'] : []), ...(assertions.find(a => a.id === 'IDENTITY-003')?.verdict === 'PASS' ? ['relinquishment.json'] : [])].map(async file => ({ file, sha256: digest(await fs.readFile(path.join(directory, file))) })))
for (const criterion of profile.assertions) if (!assertions.some(a => a.id === criterion.id)) assertions.push({ id: criterion.id, verdict: 'BLOCKED', error: 'A prerequisite failed before this assertion executed' })
if (runtime.mongo?.pid) { try { process.kill(runtime.mongo.pid, 0); runtime.mongo.processExited = false } catch (e: any) { runtime.mongo.processExited = e.code === 'ESRCH' } }
const result = { schema: 'tpnil-overlay-identity-result@1.0.0', claim: 'LAB_SELF_TEST_ONLY', profile: profile.id, profileSha256: digest(profileBytes), runtime, startedAt, completedAt: new Date().toISOString(), components: ['typescript-overlay', 'overlay-express', 'typescript-chaintracks', 'ship', 'slap', 'gasp', 'identity-services', 'controlled-certificate-issuer'], packageLockSha256: digest(await fs.readFile(path.join(base, 'package-lock.json'))), sources: sourceLock, assertions, cleanup, evidence, result: assertions.some(a => a.verdict === 'BLOCKED') || cleanup.some(c => !c.closed) ? 'BLOCKED' : assertions.some(a => a.verdict === 'FAIL') ? 'FAIL' : 'PASS' }
await fs.writeFile(path.join(directory, 'result.json'), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify({ result: result.result, assertions: assertions.map(a => ({ id: a.id, verdict: a.verdict, error: a.error })), output: directory }))
if (result.result === 'BLOCKED') process.exitCode = 1
