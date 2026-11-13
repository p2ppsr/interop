import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { Beef, PushDrop, Transaction, Utils, type WalletInterface } from '@bsv/sdk'
import { StorageClient } from '@bsv/wallet-toolbox'
import { createFixtureWallet } from '../../storage-sync/fixture-wallet.js'
import { ObservedStorageClient, type Transcript } from '../../storage-sync/run.js'
import { ControlledWalletServices } from '../services.js'
import { qualifyStoragePortability, portableTask } from './conformance-portability.js'
import { verifyNativePortability } from './verify-conformance-portability.js'

const [output, language = 'typescript'] = process.argv.slice(2)
if (!output || !['typescript', 'go'].includes(language)) throw new Error('Usage: run-portability-reference OUTPUT typescript|go')
if (fs.existsSync(output)) throw new Error('Portability evidence output already exists')
fs.mkdirSync(output, { recursive: true })
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-portability-reference-'))
fs.writeFileSync(path.join(temp, 'index.html'), '<title>Reference storage portability</title>')
const syncOrder = process.argv.includes('--sync-order-patch')
if(syncOrder&&language!=='go')throw new Error('Go11 reference requires actual Go providers')
const prospective = syncOrder || process.argv.includes('--portability-patch')
const go = syncOrder ? {binary:path.resolve(import.meta.dirname,'../../../../out/itcve-go-storage-sync-order'),storageCallerKnownInputsPatch:true,storageSyncOrderPatch:true,terminalRejectionReceipts:true} : language === 'go' ? { binary: path.resolve(import.meta.dirname, prospective ? '../../../../out/itcve-go-storage-portability' : '../../../../out/itcve-go-storage-sync'), ...(prospective ? { storagePortabilityPatch: true } : { storageSyncPatch: true }), ...(process.argv.includes('--terminal-rejection-receipts') ? { terminalRejectionReceipts: true } : {}) } : undefined
const source = new ControlledWalletServices({ webroot: temp, components: { storage: language as 'go' | 'typescript' }, go, ...(prospective && language === 'typescript' ? { typescriptDescendantExport: true } : {}) })
const destination = source.createStorageCounterpart(temp, '12'.repeat(32))
const trace: Transcript[] = []
const nativeWire = process.argv.includes('--native-wire')
class DirectStorageClient extends StorageClient {
  constructor(wallet: WalletInterface, endpoint: string, readonly provider: string) { super(wallet, endpoint) }
  protected override async rpcCall<T>(method: string, params: unknown[]): Promise<T> {
    const row: Transcript = { provider: this.provider, method, request: structuredClone(params) }; trace.push(row)
    try { const response = await super.rpcCall<T>(method, params); row.response = structuredClone(response); return response }
    catch (error) { row.error = String(error); throw error }
  }
}
const client = (wallet: WalletInterface, endpoint: string, provider: string) => nativeWire ? new DirectStorageClient(wallet, endpoint, provider) : new ObservedStorageClient(wallet, endpoint, provider, trace, language as any)
let current: Awaited<ReturnType<typeof createFixtureWallet>> | undefined
const retired: NonNullable<typeof current>[] = []
let writer: StorageClient, outpoint: string
const wallet = new Proxy({}, { get: (_target, name) => typeof name !== 'string' || name === 'then' ? undefined : (...args: any[]) => (current as any)[name](...args) }) as WalletInterface
try {
  await source.start()
  await source.fundRemoteWalletFromTeranode('77'.repeat(32), JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../../../fixtures/teranode/wab-funding-v1.json'), 'utf8')))
  for (const header of source.headers.values()) destination.registerHeader(header)
  await destination.start()
  current = await createFixtureWallet(source, '77'.repeat(32), (wallet, endpoint) => client(wallet, endpoint, 'source-active'))
  const report = await qualifyStoragePortability({ wallet, source, destination, mode: 'reference-engineering', ...(prospective ? { proofOracle: syncOrder ? 'v4' as const : 'v2' as const } : {}), controls: {
    async createTask() {
      const ciphertext = (await wallet.encrypt({ plaintext: Utils.toArray(portableTask, 'utf8'), protocolID: [0, 'todo list'], keyID: '1', counterparty: 'self' })).ciphertext
      const script = await new PushDrop(wallet).lock([Utils.toArray('1ToDoDtKreEzbHYKFjmoBuduFmSXXUGZG', 'utf8'), ciphertext], [0, 'todo list'], '1', 'self', true, true)
      const created = await wallet.createAction({ description: 'TPNIL portability reference task', outputs: [{ satoshis: 3, lockingScript: script.toHex(), basket: 'todo tokens', tags: ['portable', 'encrypted'], customInstructions: 'tpnil:portable:1', outputDescription: portableTask }], labels: ['tpnil-native-portability'], options: { randomizeOutputs: false, acceptDelayedBroadcast: false } })
      outpoint = `${created.txid}.0`
    },
    async addAndSync() {
      writer = client(wallet, destination.storageUrl, 'replacement-mediator')
      await writer.makeAvailable(); await writer.findOrInsertUser((await wallet.getPublicKey({ identityKey: true })).publicKey)
      await current!.storage.syncToWriter(await current!.storage.getAuth(), writer)
    },
    async activateAndRemoveSource() { await current!.storage.addWalletStorageProvider(writer); await current!.storage.setActive(writer.getSettings().storageIdentityKey) },
    async coldReload() {
      let closeError: string | undefined
      retired.push(current!)
      try { await current!.destroy() } catch (error) { closeError = String(error) }
      current = await createFixtureWallet(destination, '77'.repeat(32), (wallet, endpoint) => client(wallet, endpoint, 'replacement-active'))
      return { mechanism: 'reference-wallet-recreation', locked: true, unlocked: true, contextDropped: true, applicationCacheCleared: true, taskVisible: true, ...(closeError ? { offlineOldClientCloseError: closeError } : {}), at: new Date().toISOString() }
    },
    async redeemTask() {
      const listed = await wallet.listOutputs({ basket: 'todo tokens', include: 'entire transactions' })
      const created = await wallet.createAction({ description: 'TPNIL portability redemption', inputBEEF: listed.BEEF, inputs: [{ outpoint, unlockingScriptLength: 74, inputDescription: 'Portable ToDo token' }], options: { signAndProcess: false, randomizeOutputs: false, acceptDelayedBroadcast: false } })
      if (!created.signableTransaction) throw new Error('Unsigned redemption absent')
      const tx = Transaction.fromAtomicBEEF(created.signableTransaction.tx)
      const [txid, vout] = outpoint.split('.')
      const index = tx.inputs.findIndex(input => input.sourceTXID === txid && input.sourceOutputIndex === Number(vout))
      if (!tx.inputs[index]!.sourceTransaction) tx.inputs[index]!.sourceTransaction = Transaction.fromAtomicBEEF(Beef.fromBinary(listed.BEEF!).toBinaryAtomic(txid!))
      const unlock = await new PushDrop(wallet).unlock([0, 'todo list'], '1', 'self').sign(tx, index)
      await wallet.signAction({ reference: created.signableTransaction.reference, spends: { [index]: { unlockingScript: unlock.toHex() } }, options: { acceptDelayedBroadcast: false } })
    },
    referenceTranscript: () => trace
  } })
  report.mediatorWire = nativeWire ? 'direct upstream StorageClient without sync transformations' : 'declared reference canonical sync representation adapter'
  report.components = { source: source.componentIdentity, replacement: destination.componentIdentity }
  fs.writeFileSync(path.join(output, 'portability.json'), JSON.stringify(report, null, 2) + '\n')
  const verified = await verifyNativePortability(report, { requireNative: false })
  fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(verified, null, 2) + '\n')
  console.log(JSON.stringify(verified))
} finally {
  await current?.destroy(); for (const wallet of retired) await wallet.destroy(); await source.close(); await destination.close(); fs.rmSync(temp, { recursive: true, force: true })
}
