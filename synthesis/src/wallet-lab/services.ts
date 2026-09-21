import fs from 'node:fs'
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { Beef, PrivateKey } from '@bsv/sdk'
import { KnexSessionManager, Setup, StorageServer } from '@bsv/wallet-toolbox'
import { Proxy } from 'http-mitm-proxy'
import type { RouteObservation } from './model.js'

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

export interface ControlledServicesOptions {
  webroot: string
  walletStorageRootKeyHex?: string
  submitVerdicts?: Array<'ACCEPTED_BY_NETWORK' | 'REJECTED'>
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

async function freePort(): Promise<number> {
  const server = net.createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Unable to allocate a loopback port')
  const port = address.port
  await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())))
  return port
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
  readonly headers = new Map<number, HeaderRecord>([[0, genesisHeader]])
  readonly routes: RouteObservation[] = []
  readonly submissions: SubmittedTransaction[] = []
  readonly temporaryDirectory: string
  readonly identityKey: string
  readonly storageRootKeyHex: string
  private readonly verdicts: Array<'ACCEPTED_BY_NETWORK' | 'REJECTED'>
  private readonly webroot: string
  private routeSequence = 0
  private servicePort = 0
  private storagePort = 0
  private proxyPort = 0
  private storageSetup?: Awaited<ReturnType<typeof Setup.createWalletSQLite>>
  private storageServer?: StorageServer
  private serviceServer?: http.Server
  private proxy?: Proxy

  constructor(options: ControlledServicesOptions) {
    this.webroot = path.resolve(options.webroot)
    this.storageRootKeyHex = options.walletStorageRootKeyHex ?? '11'.repeat(32)
    this.identityKey = PrivateKey.fromHex(this.storageRootKeyHex).toPublicKey().toString()
    this.verdicts = [...(options.submitVerdicts ?? [])]
    this.temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-wallet-services-'))
  }

  get proxyUrl(): string {
    if (this.proxyPort === 0) throw new Error('Controlled services are not started')
    return `http://127.0.0.1:${this.proxyPort}`
  }

  get caDirectory(): string {
    return path.join(this.temporaryDirectory, 'ca')
  }

  registerHeader(header: HeaderRecord): void {
    this.headers.set(header.height, { ...header })
  }

  enqueueVerdict(verdict: 'ACCEPTED_BY_NETWORK' | 'REJECTED'): void {
    this.verdicts.push(verdict)
  }

  discardQueuedVerdict(verdict: 'ACCEPTED_BY_NETWORK' | 'REJECTED'): boolean {
    const index = this.verdicts.indexOf(verdict)
    if (index < 0) return false
    this.verdicts.splice(index, 1)
    return true
  }

  async start(): Promise<void> {
    this.storagePort = await freePort()
    this.servicePort = await freePort()
    this.proxyPort = await freePort()
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
    this.storageSetup.services.postBeef = (async (beef: { toBinaryAtomic: (txid: string) => number[] }, txids: string[]) =>
      txids.map(txid => {
        const bytes = Uint8Array.from(beef.toBinaryAtomic(txid))
        const verdict = this.verdicts.shift() ?? 'ACCEPTED_BY_NETWORK'
        this.submissions.push({ txid, bytes, verdict })
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
    this.serviceServer = http.createServer((request, response) => void this.handleRequest(request, response))
    await new Promise<void>((resolve, reject) => {
      this.serviceServer!.once('error', reject)
      this.serviceServer!.listen(this.servicePort, '127.0.0.1', resolve)
    })
    this.proxy = new Proxy()
    this.proxy.onRequest((context, callback) => {
      const host = String(context.clientToProxyRequest.headers.host ?? '').split(':')[0]!.toLowerCase()
      const target = context.proxyToServerRequestOptions
      if (target === undefined) return callback(new Error('Proxy target options are absent'))
      const disposition = host === 'wallet.1sat.app'
        ? 'controlled-wallet-storage'
        : host === 'todo.itcve.test' || host === 'alternate.itcve.test' || host === 'deny.itcve.test'
          ? 'controlled-application'
          : host === 'api.1sat.app' || host === 'messagebox.1sat.app'
            ? 'controlled-service'
            : 'blocked-egress'
      this.routes.push({
        sequence: ++this.routeSequence,
        method: context.clientToProxyRequest.method ?? 'GET',
        host,
        pathname: new URL(context.clientToProxyRequest.url ?? '/', 'http://redacted.invalid').pathname,
        disposition
      })
      context.isSSL = false
      target.agent = this.proxy!.httpAgent
      target.host = '127.0.0.1'
      target.port = host === 'wallet.1sat.app' ? this.storagePort : this.servicePort
      target.headers.host = host
      callback()
    })
    await new Promise<void>((resolve, reject) => {
      this.proxy!.listen({ port: this.proxyPort, host: '127.0.0.1', sslCaDir: this.caDirectory }, error =>
        error ? reject(error) : resolve()
      )
    })
  }

  async close(): Promise<void> {
    this.proxy?.close()
    if (this.serviceServer !== undefined)
      await new Promise<void>(resolve => this.serviceServer!.close(() => resolve()))
    await this.storageServer?.close()
    await this.storageSetup?.wallet.destroy()
    await this.storageSetup?.activeStorage.destroy()
    fs.rmSync(this.temporaryDirectory, { recursive: true, force: true })
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const host = hostOf(request)
    const url = new URL(request.url ?? '/', 'http://controlled.invalid')
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
    if (host === 'api.1sat.app') return this.handleOneSat(request, response, url)
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

  private async handleOneSat(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
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
        const verdict = this.verdicts.shift() ?? 'ACCEPTED_BY_NETWORK'
        this.submissions.push({ txid, bytes, verdict })
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
