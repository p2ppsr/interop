import fs from 'node:fs'
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { Beef, Curve, P2PKH, PrivateKey, PublicKey, PushDrop, Random, RPuzzle, Transaction, Utils } from '@bsv/sdk'
import { KnexSessionManager, Services, Setup, StorageServer, Wallet } from '@bsv/wallet-toolbox'
import { Proxy } from 'http-mitm-proxy'
import { GoServices, selectComponents, type ComponentSelection, type GoServiceOptions } from './go-services.js'
import type { RouteObservation } from './model.js'
import { ControlledOverlayServices, type OverlayObservation, type UmpRecord } from './overlay-services.js'
import { applyTypeScriptDescendantExport } from '../storage-sync/descendant-export.js'
import { SubmissionVerdicts, type SubmissionTarget } from './submission-verdicts.js'

export interface HeaderRecord {
  version: number
  previousHash: string
  merkleRoot: string
  time: number
  bits: number
  nonce: number
  height: number
  hash: string
}

export interface SubmittedTransaction {
  txid: string
  bytes: Uint8Array
  verdict: 'ACCEPTED_BY_NETWORK' | 'REJECTED'
}

export interface WalletBridgeObservation {
  name: string
  method?: string
  status?: string
  durationMs?: number
  queueWaitMs?: number
  userPromptWaitMs?: number
  pendingCalls?: number
  promptActive?: boolean
  stale?: boolean
  suppressResponse?: boolean
  tabChanged?: boolean
  navigationChanged?: boolean
}

export interface StorageRpcObservation {
  sequence: number
  /** Present only for an explicitly registered prospective storage counterpart. */
  host?: string
  method?: string
  status?: number
  durationMs?: number
  completed: boolean
}

export interface ControlledServicesOptions {
  webroot: string
  components?: ComponentSelection
  go?: GoServiceOptions
  /** Prospective, source-bound TypeScript sync export compatibility adapter. */
  typescriptDescendantExport?: boolean
  walletStorageRootKeyHex?: string
  submitVerdicts?: Array<'ACCEPTED_BY_NETWORK' | 'REJECTED'>
  wabPort?: number
}

export interface TeranodeWalletFundingFixture {
  schema: 'tpnil-teranode-wallet-funding@1.0.0'
  profile: string
  profileSha256: string
  chain: 'regtest'
  publicWalletNetwork: 'main'
  fundingHeight: number
  maturityDepth: number
  fundingBlockHash: string
  blockHeaderHex: string
  merkleRoot: string
  txid: string
  outputIndex: number
  satoshis: number
  rawHex: string
  rawSha256: string
  atomicBeefHex: string
  atomicBeefSha256: string
  payment: {
    publicKey: string
    address: string
    protocol: 'wallet payment'
    derivationPrefix: string
    derivationSuffix: string
    senderIdentityKey: string
  }
}

export interface TeranodeFundingObservation {
  txid: string
  outputIndex: number
  satoshis: number
  blockHeight: number
  blockHash: string
  merkleRoot: string
  profile: string
  profileSha256: string
  atomicBeefSha256: string
}

const genesisHeader: HeaderRecord = {
  version: 1,
  previousHash: '00'.repeat(32),
  merkleRoot: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
  time: 1_231_006_505,
  bits: 486_604_799,
  nonce: 2_083_236_893,
  height: 0,
  hash: '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f'
}

const genesisBytes = Buffer.from(
  `01000000${'00'.repeat(32)}3ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a29ab5f49ffff001d1dac2b7c`,
  'hex'
)

export function serializeHeader(header: Omit<HeaderRecord, 'hash'>): Buffer {
  const raw = Buffer.alloc(80)
  raw.writeInt32LE(header.version, 0)
  Buffer.from(header.previousHash, 'hex').reverse().copy(raw, 4)
  Buffer.from(header.merkleRoot, 'hex').reverse().copy(raw, 36)
  raw.writeUInt32LE(header.time, 68); raw.writeUInt32LE(header.bits, 72); raw.writeUInt32LE(header.nonce, 76)
  return raw
}

export function withHeaderHash(header: Omit<HeaderRecord, 'hash'>): HeaderRecord {
  const raw = Buffer.alloc(80)
  raw.writeInt32LE(header.version, 0)
  Buffer.from(header.previousHash, 'hex').reverse().copy(raw, 4)
  Buffer.from(header.merkleRoot, 'hex').reverse().copy(raw, 36)
  raw.writeUInt32LE(header.time, 68); raw.writeUInt32LE(header.bits, 72); raw.writeUInt32LE(header.nonce, 76)
  const hash = createHash('sha256').update(createHash('sha256').update(raw).digest()).digest().reverse().toString('hex')
  return { ...header, hash }
}

function listeningPort(server: http.Server | undefined): number {
  const address = server?.address()
  if (!server?.listening || address == null || typeof address === 'string' || address.port === 0) throw new Error('Controlled listener has no bound TCP port')
  return address.port
}

function hostOf(request: IncomingMessage): string {
  return String(request.headers.host ?? '').split(':')[0]!.toLowerCase()
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = Buffer.from(JSON.stringify(value))
  response
    .writeHead(status, {
      'access-control-allow-origin': '*',
      'content-length': String(body.length),
      'content-type': 'application/json'
    })
    .end(body)
}

export class ControlledWalletServices {
  readonly components: Required<ComponentSelection>
  private readonly goOptions?: GoServiceOptions
  private readonly typescriptDescendantExport: boolean
  private typescriptStorageAdapter?: Record<string, unknown>
  private goServices?: GoServices
  private goStorageServer?: http.Server
  readonly headers = new Map<number, HeaderRecord>([[0, genesisHeader]])
  readonly routes: RouteObservation[] = []
  private readonly ownSubmissions: SubmittedTransaction[] = []
  readonly walletBridgeObservations: WalletBridgeObservation[] = []
  readonly storageRpcObservations: StorageRpcObservation[] = []
  /** Exact public Go storage receipts; prospective terminal-rejection profile only. */
  readonly storageProcessActionReceipts: Array<{ sequence: number; requestIdentityKey: string; requestHex: string; responseHex: string; requestSha256: string; responseSha256: string; status: number }> = []
  readonly temporaryDirectory: string
  readonly identityKey: string
  readonly storageRootKeyHex: string
  readonly overlay = new ControlledOverlayServices()
  private readonly verdicts: SubmissionVerdicts
  private readonly webroot: string
  private readonly externalOverlayLookups = new Map<string, string>()
  private readonly externalStorageCounterparts = new Map<string, number>()
  private readonly controlledRoutes = new Map<string, (request: IncomingMessage, response: ServerResponse) => Promise<void>>()
  private readonly ownedStorageCounterparts = new Map<string, ControlledWalletServices>()
  readonly storageEndpointEvents: Array<{ available: boolean; at: string }> = []
  private readonly wabPort?: number
  private routeSequence = 0
  private servicePort = 0
  private storagePort = 0
  private proxyPort = 0
  private storageSetup?: Awaited<ReturnType<typeof Setup.createWalletSQLite>>
  private storageServer?: StorageServer
  private faucetWallet?: Wallet
  private faucetRootKeyHex?: string
  private readonly faucetPayments = new Map<string, { amount: number; txid: string; outputIndex: number; k: string; tx: number[] }>()
  private serviceServer?: http.Server
  private proxy?: Proxy
  private readonly storageRequests = new WeakMap<object, {
    observation: StorageRpcObservation; startedAt: number; chunks: Buffer[]; size: number
  }>()

  constructor(options: ControlledServicesOptions) {
    this.components = selectComponents(options.components)
    this.goOptions = options.go
    this.typescriptDescendantExport = options.typescriptDescendantExport === true
    this.webroot = path.resolve(options.webroot)
    this.storageRootKeyHex = options.walletStorageRootKeyHex ?? '11'.repeat(32)
    this.identityKey = PrivateKey.fromHex(this.storageRootKeyHex).toPublicKey().toString()
    this.verdicts = new SubmissionVerdicts([...(options.submitVerdicts ?? [])])
    this.wabPort = options.wabPort
    this.temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-wallet-services-'))
  }

  /** Prospective native replacement route; authentication remains end to end. */
  createStorageCounterpart(webroot: string, walletStorageRootKeyHex: string): ControlledWalletServices {
    return new ControlledWalletServices({ webroot, walletStorageRootKeyHex, components: { storage: this.components.storage }, ...(this.goOptions ? { go: { ...this.goOptions } } : {}), ...(this.typescriptDescendantExport ? { typescriptDescendantExport: true } : {}) })
  }

  registerStorageCounterpart(host: string, endpoint: string, owner?: ControlledWalletServices): void {
    if (!/^[a-z0-9-]+\.itcve\.test$/.test(host) || this.externalStorageCounterparts.has(host) || this.controlledRoutes.has(host)) throw new Error('Invalid or duplicate storage counterpart hostname')
    const url = new URL(endpoint)
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('Storage counterpart must be an isolated loopback endpoint')
    if (owner && (owner === this || owner.storageUrl !== endpoint || [...this.ownedStorageCounterparts.values()].includes(owner))) throw new Error('Storage counterpart ownership differs from endpoint or is duplicated')
    this.externalStorageCounterparts.set(host, Number(url.port))
    if (owner) this.ownedStorageCounterparts.set(host, owner)
  }

  unregisterStorageCounterpart(host: string): void { this.externalStorageCounterparts.delete(host) }

  /** Optional, isolated native-coverage fixtures. Registration cannot redirect a
   * production hostname or replace an existing storage/application service. */
  registerControlledRoute(host: string, handler: (request: IncomingMessage, response: ServerResponse) => Promise<void>): () => void {
    if (!['certifier.itcve.test', 'allowance.itcve.test'].includes(host) || this.controlledRoutes.has(host) || this.externalStorageCounterparts.has(host) || typeof handler !== 'function') throw new Error('Invalid or duplicate controlled coverage route')
    this.controlledRoutes.set(host, handler)
    let registered = true
    return () => {
      if (!registered) return
      registered = false
      if (this.controlledRoutes.get(host) === handler) this.controlledRoutes.delete(host)
    }
  }

  get submissions(): SubmittedTransaction[] { return this.ownedStorageCounterparts.size === 0 ? this.ownSubmissions : [...this.ownSubmissions, ...[...this.ownedStorageCounterparts.values()].flatMap(service => service.submissions)] }

  /** Read-only prospective observer. Retained provider references survive close()
   * clearing ownership maps; each provider's actual receipt order is preserved. */
  observeSubmissionClosure() {
    const providers: Array<{ id: string; rows: SubmittedTransaction[] }> = []
    const collect = (service: ControlledWalletServices, id: string) => {
      providers.push({ id, rows: service.ownSubmissions })
      for (const [host, counterpart] of service.ownedStorageCounterparts) collect(counterpart, `${id}/${host}`)
    }
    collect(this, 'source')
    const snapshot = (row: SubmittedTransaction) => ({ txid: row.txid, verdict: row.verdict, beefHex: Buffer.from(row.bytes).toString('hex') })
    const initialProviders = providers.map(provider => ({ id: provider.id, submissions: provider.rows.map(snapshot) }))
    return {
      initialProviders,
      initialSubmissions: initialProviders.flatMap(provider => provider.submissions),
      readFinalProviders: () => providers.map(provider => ({ id: provider.id, submissions: provider.rows.map(snapshot) }))
    }
  }

  recordSubmission(submission: SubmittedTransaction): void { this.ownSubmissions.push(submission) }

  get storageCounterpartIdentities(): Record<string, unknown> {
    return Object.fromEntries([...this.ownedStorageCounterparts].map(([host, service]) => [host, service.componentIdentity]))
  }

  /** Stop/reopen only the storage listener, preserving other controlled services. */
  async setStorageEndpointAvailable(available: boolean): Promise<void> {
    const server = this.components.storage === 'go' ? this.goStorageServer : this.storageServer?.server as http.Server | undefined
    if (!server) throw new Error('Storage endpoint is not initialized')
    if (available && !server.listening) await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(this.storagePort, '127.0.0.1', () => { server.off('error', reject); resolve() })
    })
    if (!available && server.listening) {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
    this.storageEndpointEvents.push({ available: server.listening, at: new Date().toISOString() })
  }

  /** Add a real loopback lookup provider for a prospective joined profile. */
  registerOverlayLookup(origin: string, services: string[]): void {
    const url = new URL(origin)
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Overlay provider must be an exact loopback HTTP origin')
    for (const service of services) {
      if (!/^ls_[a-z0-9_]+$/.test(service)) throw new Error('Invalid overlay lookup service name')
      if (this.externalOverlayLookups.has(service) && this.externalOverlayLookups.get(service) !== url.origin) throw new Error('Overlay lookup provider already registered')
      this.externalOverlayLookups.set(service, url.origin)
    }
  }

  get componentDiagnostics(): string { return this.goServices?.diagnostics ?? '' }

  get componentIdentity(): Record<string, unknown> {
    return { components: this.components, ...(this.goServices === undefined ? {} : { go: this.goServices.identity }), ...(this.typescriptStorageAdapter === undefined ? {} : { typescriptStorageAdapter: this.typescriptStorageAdapter }) }
  }

  get proxyUrl(): string {
    if (this.proxyPort === 0) throw new Error('Controlled services are not started')
    return `http://127.0.0.1:${this.proxyPort}`
  }

  get emulatorProxyUrl(): string {
    if (this.proxyPort === 0) throw new Error('Controlled services are not started')
    return `http://10.0.2.2:${this.proxyPort}`
  }

  get caDirectory(): string {
    return path.join(this.temporaryDirectory, 'ca')
  }

  get serviceUrl(): string {
    if (this.servicePort === 0) throw new Error('Controlled services are not started')
    return `http://127.0.0.1:${this.servicePort}`
  }

  get storageUrl(): string {
    if (this.storagePort === 0) throw new Error('Controlled services are not started')
    return `http://127.0.0.1:${this.storagePort}`
  }

  get overlayObservations(): readonly OverlayObservation[] {
    return this.overlay.observations
  }

  get umpRecords(): readonly UmpRecord[] {
    return this.overlay.records
  }

  get faucetObservations(): ReadonlyArray<{ presentationHash: string; amount: number; txid: string; outputIndex: number }> {
    return [...this.faucetPayments.entries()].map(([presentationKey, payment]) => ({
      presentationHash: createHash('sha256').update(Buffer.from(presentationKey, 'hex')).digest('hex'),
      amount: payment.amount,
      txid: payment.txid,
      outputIndex: payment.outputIndex
    }))
  }

  registerSyntheticHeader(header: Omit<HeaderRecord, 'hash'>): void {
    this.registerHeader(Object.values(this.components).includes('go') ? withHeaderHash(header) : { ...header, hash: '01'.repeat(32) })
  }

  registerHeader(header: HeaderRecord): void {
    this.headers.set(header.height, { ...header })
  }

  enqueueVerdict(verdict: 'ACCEPTED_BY_NETWORK' | 'REJECTED', target?: SubmissionTarget): void {
    this.verdicts.enqueue(verdict, target, this.ownSubmissions.map(row => row.txid))
  }

  discardQueuedVerdict(verdict: 'ACCEPTED_BY_NETWORK' | 'REJECTED'): boolean {
    return this.verdicts.discard(verdict)
  }

  private async connectRemoteWallet(rootKeyHex: string): Promise<Wallet> {
    const wallet = await Setup.createWalletClientNoEnv({
      chain: 'main',
      rootKeyHex,
      storageUrl: this.storageUrl
    })
    if (wallet.services === undefined) throw new Error('Remote wallet services are absent')
    const remoteServices = wallet.services as Services
    remoteServices.options.chainTracker = {
      isValidRootForHeight: async (root: string, height: number) => this.headers.get(height)?.merkleRoot === root,
      currentHeight: async () => 900_100
    }
    remoteServices.postBeef = async (beef, txids) => txids.map(txid => {
      const bytes = Uint8Array.from(beef.toBinaryAtomic(txid))
      this.ownSubmissions.push({ txid, bytes, verdict: 'ACCEPTED_BY_NETWORK' })
      return {
        name: 'tpnil-controlled-submission',
        status: 'success' as const,
        txidResults: [{ txid, status: 'success' as const }]
      }
    })
    return wallet
  }

  async nativeActionReferences(identity: string): Promise<Array<{ txid: string; reference: string }>> {
    if (!/^(02|03)[0-9a-f]{64}$/.test(identity) || BigInt(`0x${identity.slice(2)}`) >= BigInt(`0x${new Curve().p.toString(16)}`) || !PublicKey.fromString(identity).validate()) throw new Error('Invalid action-reference identity')
    const unique = new Map<string, { txid: string; reference: string }>()
    const byReference = new Map<string, string>()
    const visited = new Set<ControlledWalletServices>()
    const collect = async (service: ControlledWalletServices): Promise<void> => {
      if (visited.has(service)) return
      visited.add(service)
      if (service.goServices === undefined || service.components.storage !== 'go') throw new Error('Native Go storage is absent')
      const rows: unknown = await service.goServices.actionReferences(identity)
      if (!Array.isArray(rows) || rows.length > 2048) throw new Error('Action-reference snapshot exceeded its row budget or is not an array')
      const local = new Set<string>()
      for (const row of rows) {
        if (row === null || typeof row !== 'object' || Object.keys(row).sort().join(',') !== 'reference,txid' ||
          typeof row.txid !== 'string' || !/^[0-9a-f]{64}$/.test(row.txid) || local.has(row.txid) ||
          typeof row.reference !== 'string' || row.reference.length === 0 || row.reference.length > 300 ||
          Buffer.from(row.reference, 'base64').toString('base64') !== row.reference) throw new Error('Invalid or ambiguous stored action reference')
        local.add(row.txid)
        if ((unique.has(row.txid) && unique.get(row.txid)!.reference !== row.reference) ||
          (byReference.has(row.reference) && byReference.get(row.reference) !== row.txid)) throw new Error('Counterparts disagree on action-reference identity')
        unique.set(row.txid, { txid: row.txid, reference: row.reference })
        byReference.set(row.reference, row.txid)
        if (unique.size > 2048) throw new Error('Combined action-reference snapshot exceeded its row budget')
      }
      // Include retained owners after route withdrawal: their storage remains
      // part of the run's evidence until the service is finally closed.
      for (const counterpart of service.ownedStorageCounterparts.values()) await collect(counterpart)
    }
    await collect(this)
    return [...unique.values()].sort((a, b) => a.txid < b.txid ? -1 : a.txid > b.txid ? 1 : 0)
  }

  async nativeTransactions(): Promise<Array<{ txid: string; rawTxHex: string }>> {
    if (this.goServices === undefined || this.components.storage !== 'go') throw new Error('Native Go storage is absent')
    const transactions = await this.goServices.transactions()
    for (const service of this.ownedStorageCounterparts.values()) transactions.push(...await service.nativeTransactions())
    const unique = new Map<string, { txid: string; rawTxHex: string }>()
    for (const transaction of transactions) {
      if (unique.has(transaction.txid) && unique.get(transaction.txid)!.rawTxHex !== transaction.rawTxHex) throw new Error('Counterparts disagree on transaction bytes')
      unique.set(transaction.txid, transaction)
    }
    return [...unique.values()]
  }

  async payNativeWallet(publicKey: string, satoshis: number): Promise<{ txid: string; tx: number[] }> {
    if (this.faucetWallet === undefined) throw new Error('Mined fixture funder is absent')
    const result = await this.faucetWallet.createAction({
      description: 'TPNIL mined native-wallet funding',
      outputs: [{ lockingScript: new P2PKH().lock(PublicKey.fromString(publicKey).toAddress()).toHex(), satoshis, outputDescription: 'Native wallet fixture payment' }],
      options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
    })
    if (result.txid === undefined || result.tx === undefined) throw new Error('Native fixture payment is incomplete')
    return { txid: result.txid, tx: [...result.tx] }
  }

  async fundRemoteWalletFromTeranode(
    rootKeyHex: string,
    fixture: TeranodeWalletFundingFixture
  ): Promise<TeranodeFundingObservation> {
    if (fixture.schema !== 'tpnil-teranode-wallet-funding@1.0.0' || fixture.chain !== 'regtest' ||
      fixture.publicWalletNetwork !== 'main' || fixture.maturityDepth < 100)
      throw new Error('Teranode wallet funding fixture is outside the admitted profile')
    const atomicBeef = Uint8Array.from(Utils.toArray(fixture.atomicBeefHex, 'hex'))
    const atomicBeefSha256 = createHash('sha256').update(atomicBeef).digest('hex')
    if (atomicBeefSha256 !== fixture.atomicBeefSha256)
      throw new Error('Teranode funding Atomic BEEF digest does not match its manifest')
    const funding = Transaction.fromAtomicBEEF(atomicBeef)
    if (funding.id('hex') !== fixture.txid || funding.toHex() !== fixture.rawHex ||
      createHash('sha256').update(funding.toUint8Array()).digest('hex') !== fixture.rawSha256)
      throw new Error('Teranode funding transaction does not match its manifest')
    if (funding.merklePath === undefined || funding.merklePath.blockHeight !== fixture.fundingHeight ||
      funding.merklePath.computeRoot(fixture.txid) !== fixture.merkleRoot)
      throw new Error('Teranode funding Merkle path does not match its block metadata')
    const header = Buffer.from(fixture.blockHeaderHex, 'hex')
    if (header.length !== 80 || Buffer.from(header.subarray(36, 68)).reverse().toString('hex') !== fixture.merkleRoot)
      throw new Error('Teranode funding block header does not commit to the declared Merkle root')
    this.registerHeader({
      version: header.readInt32LE(0),
      previousHash: Buffer.from(header.subarray(4, 36)).reverse().toString('hex'),
      merkleRoot: fixture.merkleRoot,
      time: header.readUInt32LE(68),
      bits: header.readUInt32LE(72),
      nonce: header.readUInt32LE(76),
      height: fixture.fundingHeight,
      hash: fixture.fundingBlockHash
    })
    if (!await funding.merklePath.verify(fixture.txid, {
      currentHeight: async () => fixture.fundingHeight + fixture.maturityDepth,
      isValidRootForHeight: async (root, height) => root === fixture.merkleRoot && height === fixture.fundingHeight
    })) throw new Error('Teranode funding proof is not valid and mature')
    const wallet = await this.connectRemoteWallet(rootKeyHex)
    try {
      const senderIdentityKey = fixture.payment.senderIdentityKey
      const derivationPrefix = fixture.payment.derivationPrefix
      const derivationSuffix = fixture.payment.derivationSuffix
      const keyID = `${derivationPrefix} ${derivationSuffix}`
      const { publicKey } = await wallet.getPublicKey({
        protocolID: [2, '3241645161d8'],
        keyID,
        counterparty: senderIdentityKey,
        forSelf: true
      })
      if (publicKey !== fixture.payment.publicKey ||
        funding.outputs[fixture.outputIndex]?.lockingScript.toHex() !==
          new P2PKH().lock(PublicKey.fromString(publicKey).toAddress()).toHex() ||
        funding.outputs[fixture.outputIndex]?.satoshis !== fixture.satoshis)
        throw new Error('Teranode funding output is not controlled by the declared WAB wallet key')
      await wallet.internalizeAction({
        tx: atomicBeef,
        outputs: [{
          outputIndex: fixture.outputIndex,
          protocol: 'wallet payment',
          paymentRemittance: { derivationPrefix, derivationSuffix, senderIdentityKey }
        }],
        description: 'TPNIL Teranode-mined WAB funding',
        labels: ['tpnil-fixture', 'wab-faucet', 'teranode-mined']
      })
      this.faucetWallet = wallet
      this.faucetRootKeyHex = rootKeyHex
      return {
        txid: fixture.txid,
        outputIndex: fixture.outputIndex,
        satoshis: fixture.satoshis,
        blockHeight: fixture.fundingHeight,
        blockHash: fixture.fundingBlockHash,
        merkleRoot: fixture.merkleRoot,
        profile: fixture.profile,
        profileSha256: fixture.profileSha256,
        atomicBeefSha256
      }
    } catch (error) {
      await wallet.destroy()
      throw error
    }
  }

  async start(): Promise<void> {
    try { await this.startServices() } catch (error) {
      try { await this.close() } catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Service startup and cleanup failed') }
      throw error
    }
  }

  private async startServices(): Promise<void> {
    await this.overlay.initialize()
    this.serviceServer = http.createServer((request, response) => {
      void this.handleRequest(request, response).catch(error => {
        if (!response.headersSent) sendJson(response, 502, { error: String(error) })
        else response.destroy(error as Error)
      })
    })
    await new Promise<void>((resolve, reject) => {
      this.serviceServer!.once('error', reject)
      this.serviceServer!.listen(0, '127.0.0.1', resolve)
    })
    this.servicePort = listeningPort(this.serviceServer)
    if (Object.values(this.components).includes('go')) {
      this.goServices = new GoServices(path.join(this.temporaryDirectory, 'go'), this.components, this.goOptions)
      await this.goServices.start(`http://127.0.0.1:${this.servicePort}`, this.storageRootKeyHex)
      await this.syncGoHeaders()
    }
    if (this.components.storage === 'typescript') {
      await this.startTypeScriptStorage()
    } else {
      this.goStorageServer = http.createServer((request, response) => {
        void this.forwardGo(request, response, `/storage${request.url ?? '/'}`).catch(error => {
          if (!response.headersSent) sendJson(response, 502, { error: String(error) })
          else response.destroy(error as Error)
        })
      })
      await new Promise<void>((resolve, reject) => {
        this.goStorageServer!.once('error', reject)
        this.goStorageServer!.listen(0, '127.0.0.1', resolve)
      })
      this.storagePort = listeningPort(this.goStorageServer)
    }
    this.proxy = new Proxy()
    this.proxy.onRequest((context, callback) => {
      const host = String(context.clientToProxyRequest.headers.host ?? '').split(':')[0]!.toLowerCase()
      const target = context.proxyToServerRequestOptions
      if (target === undefined) return callback(new Error('Proxy target options are absent'))
      const counterpartPort = this.externalStorageCounterparts.get(host)
      const disposition = host === 'wallet.1sat.app' || counterpartPort !== undefined
        ? 'controlled-wallet-storage'
        : host === 'wab.itcve.test' && this.wabPort !== undefined
          ? 'controlled-service'
        : host === 'usercom.babbage.systems' || host === 'overlay.itcve.test' || host === 'overlay-us-1.bsvb.tech' ||
          host === 'overlay-eu-1.bsvb.tech' || host === 'overlay-ap-1.bsvb.tech' || host === 'users.bapp.dev'
          ? 'controlled-service'
        : host === 'todo.itcve.test' || host === 'alternate.itcve.test' || host === 'deny.itcve.test' || host === 'allowance.itcve.test' && this.controlledRoutes.has(host)
          ? 'controlled-application'
          : host === 'api.1sat.app' || host === 'messagebox.1sat.app' || this.controlledRoutes.has(host)
            ? 'controlled-service'
            : 'blocked-egress'
      this.routes.push({
        sequence: ++this.routeSequence,
        method: context.clientToProxyRequest.method ?? 'GET',
        host,
        pathname: new URL(context.clientToProxyRequest.url ?? '/', 'http://redacted.invalid').pathname,
        disposition
      })
      if (host === 'wallet.1sat.app' || counterpartPort !== undefined) {
        const observation: StorageRpcObservation = {
          sequence: this.routeSequence, completed: false,
          ...(counterpartPort !== undefined ? { host } : {})
        }
        this.storageRpcObservations.push(observation)
        this.storageRequests.set(context, { observation, startedAt: Date.now(), chunks: [], size: 0 })
      }
      context.isSSL = false
      target.agent = this.proxy!.httpAgent
      target.host = '127.0.0.1'
      const pathname = new URL(context.clientToProxyRequest.url ?? '/', 'http://redacted.invalid').pathname
      target.port = counterpartPort ?? (host === 'wallet.1sat.app'
        ? this.storagePort
        : host === 'wab.itcve.test' && pathname === '/demo/faucet/request'
          ? this.servicePort
        : host === 'wab.itcve.test' && this.wabPort !== undefined
          ? this.wabPort
          : this.servicePort)
      target.headers.host = host
      callback()
    })
    this.proxy.onRequestData((context, chunk, callback) => {
      const request = this.storageRequests.get(context)
      // Prospective replacement sync chunks contain the full wallet dataset;
      // retain a bounded envelope until its RPC method can be observed. The
      // historical primary endpoint keeps its existing 64 KB capture bound.
      const limit = request?.observation.host === undefined ? 64_000 : 16 * 1024 * 1024
      if (request !== undefined && request.size + chunk.length <= limit) {
        request.chunks.push(Buffer.from(chunk))
        request.size += chunk.length
      }
      callback(null, chunk)
    })
    this.proxy.onRequestEnd((context, callback) => {
      const request = this.storageRequests.get(context)
      if (request !== undefined) {
        try {
          const body = JSON.parse(Buffer.concat(request.chunks).toString('utf8')) as { method?: unknown }
          if (typeof body.method === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(body.method))
            request.observation.method = body.method
        } catch { /* Binary and oversized RPC envelopes retain only their route and timing. */ }
        request.chunks = []
      }
      callback()
    })
    this.proxy.onResponseEnd((context, callback) => {
      const request = this.storageRequests.get(context)
      if (request !== undefined) {
        request.observation.status = context.serverToProxyResponse?.statusCode
        request.observation.durationMs = Date.now() - request.startedAt
        request.observation.completed = true
        this.storageRequests.delete(context)
      }
      callback()
    })
    await new Promise<void>((resolve, reject) => {
      this.proxy!.listen({ port: 0, host: '0.0.0.0', forceSNI: true, sslCaDir: this.caDirectory }, error =>
        error ? reject(error) : resolve()
      )
    })
    this.proxyPort = listeningPort(this.proxy.httpServer)
  }

  private async startTypeScriptStorage(): Promise<void> {
    const database = path.join(this.temporaryDirectory, 'storage.sqlite')
    const env = {
      chain: 'main' as const,
      identityKey: this.identityKey,
      identityKey2: this.identityKey,
      filePath: database,
      taalApiKey: 'controlled-fixture-no-key',
      devKeys: { [this.identityKey]: this.storageRootKeyHex },
      mySQLConnection: '{}'
    }
    this.storageSetup = await Setup.createWalletSQLite({
      env,
      rootKeyHex: this.storageRootKeyHex,
      filePath: database,
      databaseName: 'tpnil-wallet-lab'
    })
    this.storageSetup.services.options.chainTracker = {
      isValidRootForHeight: async (root: string, height: number) => this.headers.get(height)?.merkleRoot === root,
      currentHeight: async () => 900_100
    } as never
    this.storageSetup.services.getHeaderForHeight = async height => {
      const header = this.headers.get(height)
      if (header === undefined) throw new Error(`Controlled header unavailable: ${height}`)
      return [...serializeHeader(header)]
    }
    this.storageSetup.services.getHeight = async () => 900_100
    this.storageSetup.services.postBeef = (async (beef: { toBinaryAtomic: (txid: string) => number[] }, txids: string[]) =>
      txids.map(txid => {
        const bytes = Uint8Array.from(beef.toBinaryAtomic(txid))
        const verdict = this.verdicts.consume(txid, bytes)
        this.ownSubmissions.push({ txid, bytes, verdict })
        this.routes.push({
          sequence: ++this.routeSequence,
          method: 'POST',
          host: 'api.1sat.app',
          pathname: '/1sat/tx',
          disposition: 'controlled-service',
          status: verdict === 'REJECTED' ? 400 : 200
        })
        return verdict === 'ACCEPTED_BY_NETWORK'
          ? { name: 'tpnil-controlled-submission', status: 'success', txidResults: [{ txid, status: 'success' }] }
          : {
              name: 'tpnil-controlled-submission',
              status: 'error',
              error: new Error('controlled rejection'),
              txidResults: [{ txid, status: 'error', serviceError: false }]
            }
      })) as unknown as typeof this.storageSetup.services.postBeef
    if (this.typescriptDescendantExport) this.typescriptStorageAdapter = applyTypeScriptDescendantExport(this.storageSetup.activeStorage)
    this.storageServer = new StorageServer(this.storageSetup.activeStorage, {
      host: '127.0.0.1',
      port: this.storagePort,
      wallet: this.storageSetup.wallet,
      monetize: false,
      logRpcRequests: false,
      sessionManager: new KnexSessionManager(this.storageSetup.activeStorage.knex),
      maxRpcListLimit: 100_000,
      defaultRpcListLimit: 1_000
    })
    this.storageServer.start()
    await new Promise<void>((resolve, reject) => {
      this.storageServer!.server.once('listening', resolve)
      this.storageServer!.server.once('error', reject)
    })
    // Initial startup binds port zero atomically. A deliberate storage restart
    // keeps the already published endpoint, and fails if that port is occupied.
    this.storagePort = listeningPort(this.storageServer.server)
  }

  private async closeTypeScriptStorageServer(): Promise<void> {
    const server = this.storageServer?.server as http.Server | undefined
    if (server === undefined || !server.listening) return
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }

  /** Reopen the same provider state without recreating its identity or database. */
  async restartStorage(): Promise<void> {
    if (this.components.storage === 'go') return this.restartGoComponents()
    await this.faucetWallet?.destroy()
    this.faucetWallet = undefined
    await this.closeTypeScriptStorageServer()
    await this.storageSetup?.wallet.destroy()
    await this.storageSetup?.activeStorage.destroy()
    await this.startTypeScriptStorage()
    if (this.faucetRootKeyHex !== undefined) this.faucetWallet = await this.connectRemoteWallet(this.faucetRootKeyHex)
  }

  async restartGoComponents(): Promise<void> {
    if (this.goServices === undefined) throw new Error('No Go components selected')
    await this.faucetWallet?.destroy()
    this.faucetWallet = undefined
    await this.goServices.close()
    await this.goServices.start(this.serviceUrl, this.storageRootKeyHex)
    if (this.faucetRootKeyHex !== undefined) this.faucetWallet = await this.connectRemoteWallet(this.faucetRootKeyHex)
  }

  async close(): Promise<void> {
    if (this.proxy !== undefined) {
      for (const client of this.proxy.wsServer?.clients ?? []) client.terminate()
      for (const client of this.proxy.wssServer?.clients ?? []) client.terminate()
      this.proxy.httpAgent?.destroy()
      this.proxy.httpsAgent?.destroy()
      this.proxy.httpServer?.closeAllConnections()
      this.proxy.httpsServer?.closeAllConnections()
      for (const { server } of Object.values(this.proxy.sslServers ?? {})) {
        server?.closeAllConnections()
        server?.close()
      }
      this.proxy.close()
    }
    const failures: unknown[] = []
    const clean = async (operation: () => Promise<unknown>): Promise<void> => { try { await operation() } catch (error) { failures.push(error) } }
    for (const counterpart of this.ownedStorageCounterparts.values()) await clean(() => counterpart.close())
    this.ownedStorageCounterparts.clear()
    this.externalStorageCounterparts.clear()
    this.controlledRoutes.clear()
    await clean(async () => this.faucetWallet?.destroy())
    this.faucetWallet = undefined
    if (this.goStorageServer !== undefined) {
      this.goStorageServer.closeAllConnections()
      await clean(() => new Promise<void>(resolve => this.goStorageServer!.close(() => resolve())))
    }
    await clean(async () => this.goServices?.dispose())
    if (this.serviceServer !== undefined) {
      this.serviceServer.closeAllConnections()
      await clean(() => new Promise<void>(resolve => this.serviceServer!.close(() => resolve())))
    }
    await clean(async () => this.closeTypeScriptStorageServer())
    await clean(async () => this.storageSetup?.wallet.destroy())
    await clean(async () => this.storageSetup?.activeStorage.destroy())
    fs.rmSync(this.temporaryDirectory, { recursive: true, force: true })
    if (failures.length > 0) throw new AggregateError(failures, 'Controlled service cleanup failed')
  }

  private async syncGoHeaders(): Promise<void> {
    if (this.goServices === undefined) return
    const headers = [...this.headers.values()].sort((a, b) => a.height - b.height)
    const last = headers.at(-1)!
    // Explicit synthetic maturation checkpoint, matching the controlled fixture
    // height. The raw header hash remains exact; this is not a PoW/chain oracle.
    if (last.height < 900_100) headers.push(withHeaderHash({ ...last, previousHash: last.hash, merkleRoot: '00'.repeat(32), height: 900_100, time: last.time + 100, nonce: 0 }))
    await this.goServices.syncHeaders(headers)
  }

  private async forwardGo(request: IncomingMessage, response: ServerResponse, route: string, transform?: (body: Buffer, status: number) => Buffer) {
    if (this.goServices === undefined) throw new Error('Go services are absent')
    await this.syncGoHeaders()
    const observed = await this.goServices.forward(request, response, route, transform)
    if (this.goOptions?.terminalRejectionReceipts && route.startsWith('/storage')) {
      let method: unknown
      try { method = JSON.parse(observed.input.toString('utf8')).method } catch { /* Preserve normal forwarding for non-JSON/authentication envelopes. */ }
      if (method === 'processAction') this.storageProcessActionReceipts.push({ sequence: this.storageProcessActionReceipts.length,
        requestIdentityKey: String(request.headers['x-bsv-auth-identity-key'] ?? ''),
        requestHex: observed.input.toString('hex'), responseHex: observed.output.toString('hex'), status: observed.status,
        requestSha256: createHash('sha256').update(observed.input).digest('hex'), responseSha256: createHash('sha256').update(observed.output).digest('hex') })
    }
    return observed
  }

  private async handleGoOverlay(request: IncomingMessage, response: ServerResponse, pathname: string): Promise<void> {
    const native = await this.forwardGo(request, response, `/overlay${pathname}`, (body, status) => {
      if (status !== 200) return body
      const value = JSON.parse(body.toString()) as { STEAK?: unknown }
      if (value.STEAK === undefined) throw new Error('Go overlay response omitted STEAK')
      return Buffer.from(JSON.stringify(value.STEAK))
    })
    if (native === undefined) throw new Error('Go overlay response is absent')
    if (pathname === '/submit' && native.status === 200) {
      const result = (JSON.parse(native.output.toString()) as { STEAK?: { tm_users?: { outputsToAdmit?: number[] } } }).STEAK
      const tx = Transaction.fromBEEF([...native.input])
      const admitted = native.status === 200 ? result?.tm_users?.outputsToAdmit ?? [] : []
      this.overlay.observations.push({ sequence: this.overlay.observations.length + 1, operation: 'submit', topics: ['tm_users'], txid: tx.id('hex'), admittedOutputs: admitted })
      for (const outputIndex of admitted) {
        const fields = PushDrop.decode(tx.outputs[outputIndex]!.lockingScript).fields
        const txid = tx.id('hex')
        if (!this.overlay.records.some(record => record.txid === txid && record.outputIndex === outputIndex))
          this.overlay.records.push({ txid, outputIndex, outpoint: `${txid}.${outputIndex}`, presentationHash: Utils.toHex(fields[6]!), recoveryHash: Utils.toHex(fields[7]!), beef: [...native.input] })
      }
    }
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const host = hostOf(request)
    const url = new URL(request.url ?? '/', 'http://controlled.invalid')
    if (host === '127.0.0.1' && url.pathname === '/tpnil/submit' && request.method === 'POST') {
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of request) { size += chunk.length; if (size > 4 * 1024 * 1024) throw new Error('Submission exceeds limit'); chunks.push(Buffer.from(chunk)) }
      const tx = Transaction.fromHex(Buffer.concat(chunks).toString('utf8'))
      const verdict = this.verdicts.consume(tx.id('hex'), tx.toUint8Array())
      this.ownSubmissions.push({ txid: tx.id('hex'), bytes: tx.toUint8Array(), verdict })
      sendJson(response, verdict === 'REJECTED' ? 400 : 200, { txid: tx.id('hex'), verdict })
      return
    }
    if (request.method === 'OPTIONS') {
      response
        .writeHead(204, {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,POST,OPTIONS',
          'access-control-allow-headers': '*'
        })
        .end()
      return
    }
    const controlledRoute = this.controlledRoutes.get(host)
    if (controlledRoute) {
      response.setHeader('access-control-allow-origin', '*')
      response.setHeader('access-control-expose-headers', '*')
      return controlledRoute(request, response)
    }
    if (host === 'api.1sat.app') return this.handleOneSat(request, response, url)
    if (host === 'usercom.babbage.systems' && request.method === 'POST' && url.pathname === '/signals') {
      await this.handleWalletDiagnostics(request, response)
      return
    }
    if (host === 'wab.itcve.test' && request.method === 'POST' && url.pathname === '/demo/faucet/request') {
      await this.handleFaucet(request, response)
      return
    }
    if (host === 'overlay.itcve.test' || host === 'overlay-us-1.bsvb.tech' ||
      host === 'overlay-eu-1.bsvb.tech' || host === 'overlay-ap-1.bsvb.tech' || host === 'users.bapp.dev') {
      if (this.components.overlay === 'go' && url.pathname === '/submit') {
        await this.handleGoOverlay(request, response, url.pathname)
        return
      }
      if (url.pathname === '/lookup') {
        // Read the question once, then replay it to the selected service.
        const chunks: Buffer[] = []
        let size = 0
        for await (const chunk of request) { size += chunk.length; if (size > 4 * 1024 * 1024) throw new Error('Lookup exceeds limit'); chunks.push(Buffer.from(chunk)) }
        const body = Buffer.concat(chunks)
        const question = JSON.parse(body.toString()) as { service?: string; query?: { service?: string } }
        const lookupOrigin = this.externalOverlayLookups.get(question.service === 'ls_slap' ? question.query?.service ?? '' : question.service ?? '')
        if (lookupOrigin !== undefined) {
          const result = await fetch(`${lookupOrigin}/lookup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body, redirect: 'error', signal: AbortSignal.timeout(15_000) })
          const answer = await result.json()
          this.routes.push({ sequence: ++this.routeSequence, method: 'POST', host, pathname: url.pathname, disposition: 'controlled-service', status: result.status })
          sendJson(response, result.status, answer)
          return
        }
        const { Readable } = await import('node:stream')
        const replay = Object.assign(Readable.from([body]), { method: request.method, headers: request.headers, url: request.url }) as IncomingMessage
        if (this.components.overlay === 'go' && (question.service === 'ls_users' || question.service === 'ls_tpnil')) {
          const result = await this.forwardGo(replay, response, '/overlay/lookup')
          if (result !== undefined) {
            const answer = JSON.parse(result.output.toString()) as { outputs?: unknown[] }
            this.overlay.observations.push({ sequence: this.overlay.observations.length + 1, operation: 'lookup', service: question.service, resultCount: answer.outputs?.length ?? 0 })
          }
          return
        }
        await this.overlay.handle(replay, response, url.pathname)
        return
      }
      await this.overlay.handle(request, response, url.pathname)
      return
    }
    if (url.pathname === '/v1/tx' || url.pathname.startsWith('/v1/tx/')) {
      await this.handleArc(request, response, url)
      return
    }
    if (url.pathname.startsWith('/chaintracks/v2/')) {
      if (this.components.chaintracks === 'go') await this.forwardGo(request, response, `${url.pathname}${url.search}`)
      else this.handleGoChaintracks(response, url)
      return
    }
    if (url.pathname === '/getPresentHeight' || url.pathname === '/findChainTipHeaderHex' ||
      url.pathname === '/findChainTipHashHex' || url.pathname === '/getHeaders' ||
      url.pathname === '/findHeaderHexForHeight' || url.pathname === '/getInfo') {
      if (this.components.chaintracks === 'go' && url.pathname !== '/getInfo') await this.forwardGo(request, response, `${url.pathname}${url.search}`)
      else this.handleLegacyChaintracks(response, url)
      return
    }
    if (host === 'messagebox.1sat.app') {
      sendJson(response, 503, { error: 'message box is outside this vector profile' })
      return
    }
    if (host === 'todo.itcve.test') {
      this.serveApplication(response, url)
      return
    }
    if (host === 'alternate.itcve.test' || host === 'deny.itcve.test') {
      const body = Buffer.from('<!doctype html><html><body><h1>TPNIL boundary fixture</h1></body></html>')
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-length': String(body.length),
        'content-type': 'text/html; charset=utf-8'
      }).end(body)
      return
    }
    sendJson(response, 502, { error: 'undeclared egress blocked', host, path: url.pathname })
  }

  private async handleWalletDiagnostics(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of request) {
        size += chunk.length
        if (size > 1_000_000) throw new Error('Diagnostic batch exceeds controlled limit')
        chunks.push(Buffer.from(chunk))
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { events?: unknown }
      if (!Array.isArray(body.events) || body.events.length > 1_000)
        throw new Error('Diagnostic batch is invalid')
      for (const event of body.events) {
        if (event === null || typeof event !== 'object') continue
        const item = event as { source?: unknown; name?: unknown; context?: unknown }
        if (item.source !== 'metanet-explorer-mobile' || typeof item.name !== 'string' ||
          !/^wallet\.bridge\.[a-z.]{1,64}$/.test(item.name) ||
          item.context === null || typeof item.context !== 'object') continue
        const context = item.context as Record<string, unknown>
        const observation: WalletBridgeObservation = { name: item.name.replaceAll('.', '_') }
        for (const [field, key] of [
          ['method', 'method'], ['status', 'status'], ['durationMs', 'duration_ms'],
          ['queueWaitMs', 'queue_wait_ms'], ['userPromptWaitMs', 'user_prompt_wait_ms'],
          ['pendingCalls', 'pending_calls'], ['stale', 'stale'],
          ['promptActive', 'active'],
          ['suppressResponse', 'suppress_response'], ['tabChanged', 'tab_changed'],
          ['navigationChanged', 'navigation_changed']
        ] as const) {
          const value = context[key]
          const isText = (field === 'method' || field === 'status') &&
            typeof value === 'string' && value.length <= 80
          const isNumber = (field === 'durationMs' || field === 'queueWaitMs' ||
            field === 'userPromptWaitMs' || field === 'pendingCalls') &&
            typeof value === 'number' && Number.isFinite(value) && value >= 0
          const isBoolean = (field === 'stale' || field === 'promptActive' || field === 'suppressResponse' ||
            field === 'tabChanged' || field === 'navigationChanged') && typeof value === 'boolean'
          if (isText || isNumber || isBoolean)
            (observation as unknown as Record<string, unknown>)[field] = value
        }
        this.walletBridgeObservations.push(observation)
      }
      if (this.walletBridgeObservations.length > 1_000)
        this.walletBridgeObservations.splice(0, this.walletBridgeObservations.length - 1_000)
      sendJson(response, 200, { accepted: body.events.length })
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid diagnostic batch' })
    }
  }

  private async handleOneSat(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    if (this.components.chaintracks === 'go' && url.pathname.startsWith('/1sat/chaintracks/')) {
      await this.forwardGo(request, response, `/chaintracks/v2${url.pathname.slice('/1sat/chaintracks'.length)}${url.search}`)
      return
    }
    if (url.pathname === '/1sat/chaintracks/tip') {
      sendJson(response, 200, { ...genesisHeader, height: 900_100 })
      return
    }
    if (url.pathname === '/1sat/chaintracks/network') {
      sendJson(response, 200, { network: 'main' })
      return
    }
    if (url.pathname.startsWith('/1sat/chaintracks/header/height/')) {
      const height = Number(url.pathname.split('/').at(-1))
      const header = this.headers.get(height)
      sendJson(response, header === undefined ? 404 : 200, header ?? { error: 'unknown controlled height' })
      return
    }
    if (url.pathname === '/1sat/chaintracks/headers') {
      response.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': String(genesisBytes.length) })
      response.end(genesisBytes)
      return
    }
    if (url.pathname === '/capabilities') {
      sendJson(response, 200, {})
      return
    }
    if (url.pathname.startsWith('/1sat/owner/')) {
      sendJson(response, 200, { outputs: [], cursor: null })
      return
    }
    if (request.method === 'POST' && url.pathname === '/1sat/tx') {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      try {
        const bytes = Buffer.concat(chunks)
        const beef = Beef.fromBinary(bytes)
        const txid = beef.atomicTxid
        if (txid === undefined) throw new Error('Atomic transaction id is absent')
        const verdict = this.verdicts.consume(txid, bytes)
        this.ownSubmissions.push({ txid, bytes, verdict })
        sendJson(response, verdict === 'REJECTED' ? 400 : 200, {
          txid,
          txStatus: verdict,
          ...(verdict === 'REJECTED' ? { extraInfo: 'controlled rejection' } : {}),
          timestamp: '2026-09-20T00:00:00.000Z'
        })
      } catch (error) {
        sendJson(response, 400, {
          txid: '',
          txStatus: 'REJECTED',
          extraInfo: error instanceof Error ? error.message : String(error),
          timestamp: '2026-09-20T00:00:00.000Z'
        })
      }
      return
    }
    if (request.method === 'GET' && url.pathname.startsWith('/1sat/tx/')) {
      const txid = url.pathname.split('/').at(-1)
      const transaction = this.submissions.find(candidate => candidate.txid === txid)
      sendJson(response, transaction === undefined ? 404 : 200, transaction === undefined
        ? { error: 'unknown controlled transaction' }
        : { txid, txStatus: transaction.verdict, timestamp: '2026-09-20T00:00:00.000Z' })
      return
    }
    sendJson(response, 404, { error: 'controlled service route is not implemented', path: url.pathname })
  }

  private async handleArc(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    if (request.method === 'GET') {
      const txid = url.pathname.split('/').at(-1) ?? ''
      const transaction = this.submissions.find(candidate => candidate.txid === txid)
      sendJson(response, transaction === undefined ? 404 : 200, transaction === undefined
        ? { txid, txStatus: 'UNKNOWN', extraInfo: 'unknown controlled transaction' }
        : { txid, txStatus: transaction.verdict, extraInfo: '', timestamp: '2026-09-20T00:00:00.000Z' })
      return
    }
    try {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { rawTx?: unknown }
      if (typeof body.rawTx !== 'string') throw new Error('ARC rawTx is absent')
      const bytes = Uint8Array.from(Utils.toArray(body.rawTx, 'hex'))
      const beef = Beef.fromBinary(bytes)
      const txid = beef.atomicTxid ?? Transaction.fromBEEF(bytes).id('hex')
      const verdict = this.verdicts.consume(txid, bytes)
      this.ownSubmissions.push({ txid, bytes, verdict })
      sendJson(response, verdict === 'REJECTED' ? 400 : 200, {
        txid,
        txStatus: verdict,
        extraInfo: verdict === 'REJECTED' ? 'controlled rejection' : '',
        timestamp: '2026-09-20T00:00:00.000Z'
      })
    } catch (error) {
      sendJson(response, 400, {
        txid: '',
        txStatus: 'REJECTED',
        extraInfo: error instanceof Error ? error.message : String(error),
        timestamp: '2026-09-20T00:00:00.000Z'
      })
    }
  }

  private async handleFaucet(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      if (this.faucetWallet === undefined) throw new Error('Controlled faucet wallet is not provisioned')
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { presentationKey?: unknown }
      if (typeof body.presentationKey !== 'string' || !/^[0-9a-fA-F]{64}$/.test(body.presentationKey)) {
        sendJson(response, 400, { message: 'A 32-byte presentationKey is required.' })
        return
      }
      let payment = this.faucetPayments.get(body.presentationKey.toLowerCase())
      if (payment === undefined) {
        const k = Random(32)
        const curve = new Curve()
        let r = curve.g.mul(k).x?.umod(curve.n)?.toArray()
        if (r === undefined || r === null) throw new Error('Unable to derive controlled R-puzzle')
        r = r[0]! > 127 ? [0, ...r] : r
        const lockingScript = new RPuzzle('raw').lock(r)
        const result = await this.faucetWallet.createAction({
          description: 'TPNIL controlled WAB faucet payment',
          outputs: [{ lockingScript: lockingScript.toHex(), satoshis: 1_000, outputDescription: 'Faucet payment' }],
          options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
        })
        if (result.txid === undefined || result.tx === undefined) throw new Error('Controlled faucet action is incomplete')
        const createdPayment = {
          amount: 1_000,
          txid: result.txid,
          outputIndex: 0,
          k: Utils.toHex(k),
          tx: [...result.tx]
        }
        this.faucetPayments.set(body.presentationKey.toLowerCase(), createdPayment)
        payment = createdPayment
      }
      sendJson(response, 200, { success: true, paymentData: payment })
    } catch (error) {
      sendJson(response, 500, { message: error instanceof Error ? error.message : String(error) })
    }
  }

  private handleGoChaintracks(response: ServerResponse, url: URL): void {
    const route = url.pathname.slice('/chaintracks/v2'.length)
    if (route === '/height') return sendJson(response, 200, { height: 900_100 })
    if (route === '/network') return sendJson(response, 200, { network: 'main' })
    if (route === '/tip') return sendJson(response, 200, { ...(this.headers.get(0) ?? genesisHeader), height: 900_100 })
    if (route.startsWith('/header/height/')) {
      const header = this.headers.get(Number(route.split('/').at(-1)))
      return sendJson(response, header === undefined ? 404 : 200, header ?? { error: 'unknown controlled height' })
    }
    if (route === '/headers.bin') {
      response.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': String(genesisBytes.length) })
      response.end(genesisBytes)
      return
    }
    sendJson(response, 404, { error: 'controlled go-chaintracks route is not implemented', path: route })
  }

  private handleLegacyChaintracks(response: ServerResponse, url: URL): void {
    let value: unknown
    if (url.pathname === '/getPresentHeight') value = 900_100
    else if (url.pathname === '/findChainTipHashHex') value = genesisHeader.hash
    else if (url.pathname === '/findChainTipHeaderHex') value = { ...genesisHeader, height: 900_100 }
    else if (url.pathname === '/getInfo') value = { chain: 'main', heightBulk: 900_100, heightLive: 900_100 }
    else if (url.pathname === '/getHeaders') value = genesisBytes.toString('hex')
    else if (url.pathname === '/findHeaderHexForHeight') value = this.headers.get(Number(url.searchParams.get('height')))
    sendJson(response, value === undefined ? 404 : 200, value === undefined
      ? { status: 'error', code: 'ERR_NOT_FOUND' }
      : { status: 'success', value })
  }

  private serveApplication(response: ServerResponse, url: URL): void {
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1))
    const file = path.resolve(this.webroot, relative)
    if (!file.startsWith(`${this.webroot}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end()
      return
    }
    const body = fs.readFileSync(file)
    const extension = path.extname(file)
    const type = extension === '.html'
      ? 'text/html; charset=utf-8'
      : extension === '.js'
        ? 'text/javascript; charset=utf-8'
        : extension === '.css'
          ? 'text/css; charset=utf-8'
          : extension === '.json'
            ? 'application/json'
            : 'application/octet-stream'
    response
      .writeHead(200, { 'cache-control': 'no-store', 'content-length': String(body.length), 'content-type': type })
      .end(body)
  }
}
