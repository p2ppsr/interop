import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { MasterCertificate, P2PKH, PrivateKey, ProtoWallet, PushDrop, Utils, type WalletInterface } from '@bsv/sdk'
import { StorageClient, type Wallet } from '@bsv/wallet-toolbox'
import type { RequestSyncChunkArgs, SyncChunk } from '@bsv/wallet-toolbox/out/src/sdk'
import { ControlledWalletServices, type TeranodeWalletFundingFixture } from '../wallet-lab/services.js'
import { canonicalJson } from '../determinism.js'
import { canonicalSyncChunk, goSyncChunk } from './compatibility.js'
import { createFixtureWallet } from './fixture-wallet.js'
import { entities, projectDataset, type Dataset, type Row } from './projection.js'

export type Implementation = 'typescript' | 'go'
export interface Assertion { id: string; result: 'PASS' | 'FAIL' | 'BLOCKED'; detail: string }
export interface Transcript { provider: string; method: string; request: unknown; response?: unknown; error?: string; committedResponseLost?: boolean; wireRequest?: unknown; canonicalResponse?: unknown }
const digest = (value: unknown): string => createHash('sha256').update(canonicalJson(value)).digest('hex')
const identityKey = PrivateKey.fromHex('77'.repeat(32)).toPublicKey().toString()
const fixturePath = path.resolve(import.meta.dirname, '../../../fixtures/teranode/wab-funding-v1.json')

/** Fault injection never edits the chunk or response: it loses one committed reply. */
export class ObservedStorageClient extends StorageClient {
  loseNextCommit = false
  constructor(wallet: WalletInterface, endpoint: string, readonly provider: string, readonly transcript: Transcript[], readonly implementation: Implementation = 'typescript') { super(wallet, endpoint) }
  protected override async rpcCall<T>(method: string, params: unknown[]): Promise<T> {
    const entry: Transcript = { provider: this.provider, method, request: structuredClone(params) }
    this.transcript.push(entry)
    try {
      const wireParams = method === 'processSyncChunk' && this.implementation === 'go' ? [params[0], goSyncChunk(params[1])] : params
      if (wireParams !== params) entry.wireRequest = structuredClone(wireParams)
      const response = await super.rpcCall<T>(method, wireParams)
      entry.response = structuredClone(response)
      if (method === 'processSyncChunk' && this.loseNextCommit) {
        this.loseNextCommit = false; entry.committedResponseLost = true
        throw new Error('TPNIL injected loss of committed processSyncChunk reply')
      }
      if (method === 'getSyncChunk') {
        const canonical = canonicalSyncChunk(response, this.implementation)
        entry.canonicalResponse = structuredClone(canonical)
        return canonical
      }
      return response
    } catch (error) { entry.error = error instanceof Error ? error.message : String(error); throw error }
  }
}

export async function readDataset(client: StorageClient, userIdentity = identityKey): Promise<Dataset> {
  const settings = await client.makeAvailable()
  const result: Dataset = Object.fromEntries(entities.map(name => [name, []]))
  const args: RequestSyncChunkArgs = {
    identityKey: userIdentity, fromStorageIdentityKey: settings.storageIdentityKey,
    toStorageIdentityKey: settings.storageIdentityKey, maxItems: 1000, maxRoughSize: 10_000_000,
    offsets: ['provenTx', 'outputBasket', 'outputTag', 'txLabel', 'transaction', 'output', 'txLabelMap', 'outputTagMap', 'certificate', 'certificateField', 'commission', 'provenTxReq'].map(name => ({ name, offset: 0 }))
  }
  for (let page = 0; page < 100; page++) {
    const chunk = await client.getSyncChunk(args)
    if (chunk.userIdentityKey !== userIdentity || chunk.fromStorageIdentityKey !== settings.storageIdentityKey) throw new Error('Wrong sync reader identity')
    if (chunk.user !== undefined) result.user = chunk.user as unknown as Row
    let count = 0
    for (const name of entities) {
      const rows = chunk[name] as unknown as Row[] | undefined
      if (rows !== undefined) { result[name]!.push(...rows); args.offsets.find(offset => offset.name === name.slice(0, -1))!.offset += rows.length; count += rows.length }
    }
    if (count === 0 && entities.every(name => Array.isArray(chunk[name]))) return result
  }
  throw new Error('Sync reader exceeded bounded page count')
}

export async function runStorageSyncCase(source: Implementation, destination: Implementation, output: string): Promise<Record<string, unknown>> {
  fs.mkdirSync(output, { recursive: true })
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-storage-sync-'))
  fs.writeFileSync(path.join(root, 'index.html'), '<title>TPNIL storage synchronization</title>')
  const a = new ControlledWalletServices({ webroot: root, components: { storage: source }, walletStorageRootKeyHex: '11'.repeat(32), ...(process.env.TPNIL_STORAGE_SYNC_PATCH === '1' ? { go: { binary: path.resolve(import.meta.dirname, '../../../out/itcve-go-storage-sync'), storageSyncPatch: true } } : {}) })
  const b = new ControlledWalletServices({ webroot: root, components: { storage: destination }, walletStorageRootKeyHex: '12'.repeat(32), ...(process.env.TPNIL_STORAGE_SYNC_PATCH === '1' ? { go: { binary: path.resolve(import.meta.dirname, '../../../out/itcve-go-storage-sync'), storageSyncPatch: true } } : {}) })
  const assertions: Assertion[] = [], transcript: Transcript[] = [], observations: Record<string, unknown> = {}
  const wallets: Wallet[] = []
  const checks = (id: string, pass: boolean, detail: string): boolean => { assertions.push({ id, result: pass ? 'PASS' : 'FAIL', detail }); return pass }
  let cleanup = false
  const startedAt = new Date().toISOString()
  try {
    await a.start(); await b.start()
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as TeranodeWalletFundingFixture
    observations.funding = await a.fundRemoteWalletFromTeranode('77'.repeat(32), fixture)
    for (const header of a.headers.values()) b.registerHeader(header)
    const wallet = await createFixtureWallet(a, '77'.repeat(32), (wallet, endpoint) => new ObservedStorageClient(wallet, endpoint, 'source', transcript, source)); wallets.push(wallet)
    // A real encrypted PushDrop task, metadata and signed certificate form the portable dataset.
    const ciphertext = (await wallet.encrypt({ plaintext: Utils.toArray('TPNIL portable task', 'utf8'), protocolID: [2, 'tpnil portability'], keyID: 'task', counterparty: 'self' })).ciphertext
    const script = await new PushDrop(wallet).lock([ciphertext], [2, 'tpnil portability'], 'task', 'self', true, true)
    const created = await wallet.createAction({ description: 'TPNIL portable task creation', outputs: [{ satoshis: 7, lockingScript: script.toHex(), basket: 'tpnil portable tasks', tags: ['portable', 'encrypted'], customInstructions: 'tpnil:task:1', outputDescription: 'Encrypted portable task' }], labels: ['tpnil-portability'], options: { randomizeOutputs: false, acceptDelayedBroadcast: false } })
    if (!created.txid || !created.tx) throw new Error('Source did not serialize the portable task')
    observations.created = created
    const issuer = new ProtoWallet(PrivateKey.fromHex('44'.repeat(32)))
    const certificate = await MasterCertificate.issueCertificateForSubject(issuer, identityKey, { name: 'TPNIL portable identity', private: 'selective disclosure fixture' }, Buffer.alloc(32, 5).toString('base64'), async () => `${fixture.txid}.${fixture.outputIndex}`, Buffer.alloc(32, 6).toString('base64'))
    await wallet.acquireCertificate({ ...certificate, acquisitionProtocol: 'direct', keyringRevealer: 'certifier', keyringForSubject: certificate.masterKeyring, signature: certificate.signature! })
    const reader = wallet.storage.getActive() as ObservedStorageClient
    const writer = new ObservedStorageClient(wallet, b.storageUrl, 'destination', transcript, destination)
    await reader.makeAvailable(); await writer.makeAvailable()
    await writer.findOrInsertUser(identityKey)
    const sourceBefore = await readDataset(reader)
    const sourceProjection = projectDataset(sourceBefore)
    observations.source = sourceBefore; observations.sourceProjection = sourceProjection
    checks('fixture-has-relationships', (sourceBefore.transactions?.length ?? 0) >= 2 && (sourceBefore.outputs?.length ?? 0) >= 2 && (sourceBefore.txLabelMaps?.length ?? 0) > 0 && (sourceBefore.outputTagMaps?.length ?? 0) === 2 && (sourceBefore.certificates?.length ?? 0) === 1 && (sourceBefore.certificateFields?.length ?? 0) === 2, 'Mined funding, task, metadata links and signed certificate are present before synchronization.')
    // The multi-remote wallet itself drives every getSyncChunk/processSyncChunk call.
    writer.loseNextCommit = true
    let interrupted = false
    try { await wallet.storage.syncToWriter(await wallet.storage.getAuth(), writer) }
    catch (error) { interrupted = String(error).includes('injected loss'); observations.interruption = String(error) }
    checks('committed-response-loss-observed', interrupted && transcript.some(row => row.committedResponseLost), 'The destination committed a chunk before the simulated connection loss.')
    await b.restartStorage()
    // Re-authenticate after process restart; the wallet learns progress through public methods.
    const resumedWriter = new ObservedStorageClient(wallet, b.storageUrl, 'destination-resumed', transcript, destination)
    for (let attempt = 0; ; attempt++) {
      try { await resumedWriter.makeAvailable(); break } catch (error) {
        if (attempt >= 2 || !String(error).includes('Network error')) throw error
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    }
    const resumed = await wallet.storage.syncToWriter(await wallet.storage.getAuth(), resumedWriter)
    observations.resumed = resumed
    const destinationAfter = await readDataset(resumedWriter)
    observations.destination = destinationAfter; observations.destinationProjection = projectDataset(destinationAfter)
    checks('mediated-initial-sync', canonicalJson(sourceProjection) === canonicalJson(observations.destinationProjection), `Logical projection source ${digest(sourceProjection)} / destination ${digest(observations.destinationProjection)}.`)
    await wallet.storage.syncToWriter(await wallet.storage.getAuth(), resumedWriter)
    const replayRaw = await readDataset(resumedWriter)
    observations.replay = replayRaw
    const replay = projectDataset(replayRaw)
    checks('replay-idempotence', canonicalJson(replay) === canonicalJson(observations.destinationProjection), 'A repeated sync retains exactly one copy of each logical entity and relationship.')
    const isolated = await createFixtureWallet(b, '88'.repeat(32)); wallets.push(isolated)
    observations.foreignOutputs = await isolated.listOutputs({ basket: 'tpnil portable tasks' })
    checks('identity-scoped-output-read', (observations.foreignOutputs as { totalOutputs: number }).totalOutputs === 0, 'An independently authenticated identity cannot list the owner task.')
    const foreign = new ObservedStorageClient(isolated, b.storageUrl, 'foreign-identity', transcript, destination)
    let denied = false
    try { await readDataset(foreign, identityKey) } catch { denied = true }
    checks('identity-scoped-sync-read', denied, 'A foreign identity cannot request the owner synchronization dataset.')
    // Relinquishment is an application write, never a direct database edit.
    await wallet.relinquishCertificate({ type: certificate.type, serialNumber: certificate.serialNumber, certifier: certificate.certifier })
    await wallet.storage.syncToWriter(await wallet.storage.getAuth(), resumedWriter)
    const updatedSourceRaw = await readDataset(reader), updatedDestinationRaw = await readDataset(resumedWriter)
    const updatedSource = projectDataset(updatedSourceRaw), updatedDestination = projectDataset(updatedDestinationRaw)
    observations.incremental = { source: updatedSource, destination: updatedDestination, sourceRaw: updatedSourceRaw, destinationRaw: updatedDestinationRaw }
    observations.remainingCertificates = await resumedWriter.listCertificates({ identityKey }, { certifiers: [certificate.certifier], types: [certificate.type], limit: 10, offset: 0, privileged: false })
    checks('incremental-tombstone', canonicalJson(updatedSource) === canonicalJson(updatedDestination) && (observations.remainingCertificates as { totalCertificates: number }).totalCertificates === 0, 'Certificate relinquishment and its deletion marker propagate through incremental synchronization.')
    await wallet.storage.addWalletStorageProvider(resumedWriter)
    observations.setActive = await wallet.storage.setActive(resumedWriter.getSettings().storageIdentityKey)
    observations.replacementState = { activeEnabled: wallet.storage.isActiveEnabled, activeStore: wallet.storage.getActiveStore(), destination: resumedWriter.getSettings().storageIdentityKey }
    checks('active-provider-replacement', wallet.storage.isActiveEnabled && wallet.storage.getActiveStore() === resumedWriter.getSettings().storageIdentityKey, 'The wallet selects the replacement through WalletStorageManager.setActive.')
    const fresh = await createFixtureWallet(b, '77'.repeat(32)); wallets.push(fresh)
    const outputs = await fresh.listOutputs({ basket: 'tpnil portable tasks', include: 'entire transactions', includeCustomInstructions: true, includeTags: true })
    observations.freshOutputs = outputs
    const outpoint = `${created.txid}.0`
    observations.freshDecryption = await fresh.decrypt({ ciphertext, protocolID: [2, 'tpnil portability'], keyID: 'task', counterparty: 'self' })
    checks('fresh-client-task-reconstruction', outputs.totalOutputs === 1 && outputs.outputs[0]?.outpoint === outpoint && Buffer.from((observations.freshDecryption as { plaintext: number[] }).plaintext).toString() === 'TPNIL portable task', 'A fresh wallet reconstructs the same encrypted task and outpoint without the prior client cache.')
    observations.postReplacement = await fresh.createAction({ description: 'TPNIL replacement provider action', outputs: [{ satoshis: 2, lockingScript: new P2PKH().lock(PrivateKey.fromHex('99'.repeat(32)).toPublicKey().toAddress()).toHex(), outputDescription: 'Provider replacement payment' }], labels: ['tpnil-replacement'], options: { randomizeOutputs: false, acceptDelayedBroadcast: false } })
    checks('post-replacement-write', Boolean((observations.postReplacement as { txid?: string }).txid), 'A freshly initialized wallet signs and submits a new action using the replacement provider.')
  } catch (error) {
    observations.error = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error)
    assertions.push({ id: 'execution', result: 'FAIL', detail: error instanceof Error ? error.message : String(error) })
  } finally {
    const failures: string[] = []
    for (const wallet of wallets.reverse()) { try { await wallet.destroy() } catch (error) { failures.push(String(error)) } }
    for (const service of [b, a]) { try { await service.close() } catch (error) { failures.push(String(error)) } }
    fs.rmSync(root, { recursive: true, force: true })
    cleanup = failures.length === 0
    observations.componentIdentity = { source: a.componentIdentity, destination: b.componentIdentity }
    observations.serviceDiagnostics = { source: a.componentDiagnostics, destination: b.componentDiagnostics }
    observations.cleanupErrors = failures
    checks('cleanup', cleanup, cleanup ? 'All clients, listening services and temporary databases were closed and removed.' : failures.join('\n'))
  }
  const required = ['fixture-has-relationships', 'committed-response-loss-observed', 'mediated-initial-sync', 'replay-idempotence', 'identity-scoped-output-read', 'identity-scoped-sync-read', 'incremental-tombstone', 'active-provider-replacement', 'fresh-client-task-reconstruction', 'post-replacement-write']
  for (const id of required) if (!assertions.some(assertion => assertion.id === id)) assertions.push({ id, result: 'BLOCKED', detail: 'A preceding execution failure prevented this observation.' })
  fs.writeFileSync(path.join(output, 'transcript.json'), JSON.stringify(transcript, null, 2) + '\n')
  fs.writeFileSync(path.join(output, 'observations.json'), JSON.stringify(observations, null, 2) + '\n')
  const evidence = ['transcript.json', 'observations.json'].map(name => ({ path: name, sha256: createHash('sha256').update(fs.readFileSync(path.join(output, name))).digest('hex') }))
  const result = { schema: 'tpnil-storage-sync-run@1.0.0', claim: 'INFRASTRUCTURE_QUALIFICATION_ONLY', components: { source, destination, wallet: '@bsv/wallet-toolbox@2.13.0' }, startedAt, endedAt: new Date().toISOString(), assertions, evidence, cleanup, result: assertions.every(assertion => assertion.result === 'PASS') ? 'PASS' : 'FAIL' }
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n')
  return result
}

if (process.argv[1] === import.meta.filename) {
  const [source, destination, output] = process.argv.slice(2)
  if (!['typescript', 'go'].includes(source ?? '') || !['typescript', 'go'].includes(destination ?? '') || !output) throw new Error('Usage: run.ts typescript|go typescript|go OUTPUT')
  console.log(JSON.stringify(await runStorageSyncCase(source as Implementation, destination as Implementation, output), null, 2))
}
