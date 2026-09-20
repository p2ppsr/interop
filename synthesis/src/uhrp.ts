import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { once } from 'node:events'
import {
  LockingScript,
  ProtoWallet,
  PushDrop,
  StorageUtils,
  Transaction,
  Utils,
  type WalletInterface
} from '@bsv/sdk'
import { canonicalJson, sha256Hex, utf8 } from './determinism.js'

export const UHRP_TOPIC = 'tm_uhrp'
export const UHRP_LOOKUP = 'ls_uhrp'
export const UHRP_PROTOCOL = [2, 'uhrp advertisement'] as [2, string]

export interface UHRPAdvertisement {
  hostIdentityKey: string
  uhrpUrl: string
  contentHash: string
  hostedFileLocation: string
  expiryTime: number
  fileSize: number
}

export interface EncodedUHRPAdvertisement {
  record: UHRPAdvertisement
  lockingScript: LockingScript
  lockingScriptHex: string
}

export async function encodeUHRPAdvertisement(
  wallet: WalletInterface,
  input: Omit<UHRPAdvertisement, 'hostIdentityKey' | 'uhrpUrl' | 'contentHash'> & { uhrpUrl: string }
): Promise<EncodedUHRPAdvertisement> {
  const uhrpUrl = input.uhrpUrl.replace(/^chirp:/iu, 'uhrp:')
  const hash = StorageUtils.getHashFromURL(uhrpUrl)
  const identity = (await wallet.getPublicKey({ identityKey: true })).publicKey
  const location = new URL(input.hostedFileLocation)
  if (location.protocol !== 'https:') throw new TypeError('UHRP location must use HTTPS')
  if (!Number.isSafeInteger(input.expiryTime) || input.expiryTime < 1) throw new TypeError('UHRP expiry is invalid')
  if (!Number.isSafeInteger(input.fileSize) || input.fileSize < 1) throw new TypeError('UHRP file size is invalid')
  const expiry = new Utils.Writer().writeVarIntNum(input.expiryTime).toArray()
  const size = new Utils.Writer().writeVarIntNum(input.fileSize).toArray()
  const fields = [
    Utils.toArray(identity, 'hex'),
    hash,
    Array.from(utf8(location.toString())),
    expiry,
    size
  ]
  const lockingScript = await new PushDrop(wallet).lock(fields, UHRP_PROTOCOL, '1', 'anyone', true, true)
  return {
    record: {
      hostIdentityKey: identity,
      uhrpUrl: `uhrp://${StorageUtils.normalizeURL(uhrpUrl)}`,
      contentHash: Utils.toHex(hash),
      hostedFileLocation: location.toString(),
      expiryTime: input.expiryTime,
      fileSize: input.fileSize
    },
    lockingScript,
    lockingScriptHex: lockingScript.toHex()
  }
}

export async function decodeAndVerifyUHRPAdvertisement(
  script: LockingScript | string
): Promise<UHRPAdvertisement> {
  const lockingScript = typeof script === 'string' ? LockingScript.fromHex(script) : script
  const decoded = PushDrop.decode(lockingScript)
  if (decoded.fields.length !== 6) throw new Error('UHRP token must contain five fields and one signature')
  const [identityBytes, hash, locationBytes, expiryBytes, sizeBytes, signature] = decoded.fields
  if ([identityBytes, hash, locationBytes, expiryBytes, sizeBytes, signature].some(value => value === undefined))
    throw new Error('UHRP token is incomplete')
  if (hash!.length !== 32) throw new Error('UHRP hash must contain 32 bytes')
  const hostIdentityKey = Utils.toHex(identityBytes!)
  const hostedFileLocation = Utils.toUTF8(locationBytes!)
  if (new URL(hostedFileLocation).protocol !== 'https:') throw new Error('UHRP location must use HTTPS')
  const expiryTime = new Utils.Reader(expiryBytes!).readVarIntNum()
  const fileSize = new Utils.Reader(sizeBytes!).readVarIntNum()
  if (expiryTime < 1 || fileSize < 1) throw new Error('UHRP expiry or file size is invalid')
  const anyone = new ProtoWallet('anyone')
  const { valid } = await anyone.verifySignature({
    data: [...identityBytes!, ...hash!, ...locationBytes!, ...expiryBytes!, ...sizeBytes!],
    signature: signature!,
    counterparty: hostIdentityKey,
    protocolID: UHRP_PROTOCOL,
    keyID: '1'
  })
  if (!valid) throw new Error('UHRP signature is invalid')
  const expected = await anyone.getPublicKey({
    counterparty: hostIdentityKey,
    protocolID: UHRP_PROTOCOL,
    keyID: '1'
  })
  if (expected.publicKey !== decoded.lockingPublicKey.toString())
    throw new Error('UHRP locking key is not linked to the host identity')
  return {
    hostIdentityKey,
    uhrpUrl: `uhrp://${StorageUtils.getURLForHash(hash!)}`,
    contentHash: Utils.toHex(hash!),
    hostedFileLocation,
    expiryTime,
    fileSize
  }
}

export type UHRPEvent =
  | { sequence: number; type: 'advertise'; txid: string; outpoint: string; lockingScriptHex: string; record: UHRPAdvertisement }
  | { sequence: number; type: 'revoke'; outpoint: string }

export class ReferenceUHRPOverlay {
  private readonly events: UHRPEvent[] = []
  private readonly advertisements = new Map<string, Extract<UHRPEvent, { type: 'advertise' }>>()
  private readonly revoked = new Set<string>()

  async submit(lockingScriptHex: string): Promise<{ accepted: true; txid: string; outpoint: string; sequence: number }> {
    const record = await decodeAndVerifyUHRPAdvertisement(lockingScriptHex)
    const transaction = new Transaction(1, [], [{ satoshis: 1, lockingScript: LockingScript.fromHex(lockingScriptHex) }], 0)
    const txid = transaction.id('hex')
    const outpoint = `${txid}:0`
    if (this.advertisements.has(outpoint)) throw new Error(`Duplicate UHRP advertisement: ${outpoint}`)
    const event: Extract<UHRPEvent, { type: 'advertise' }> = {
      sequence: this.events.length + 1,
      type: 'advertise',
      txid,
      outpoint,
      lockingScriptHex,
      record
    }
    this.events.push(event)
    this.advertisements.set(outpoint, event)
    return { accepted: true, txid, outpoint, sequence: event.sequence }
  }

  revoke(outpoint: string): { revoked: true; sequence: number } {
    if (!this.advertisements.has(outpoint)) throw new Error(`Unknown UHRP outpoint: ${outpoint}`)
    if (this.revoked.has(outpoint)) throw new Error(`UHRP outpoint is already spent: ${outpoint}`)
    this.revoked.add(outpoint)
    const event: UHRPEvent = { sequence: this.events.length + 1, type: 'revoke', outpoint }
    this.events.push(event)
    return { revoked: true, sequence: event.sequence }
  }

  lookup(uhrpUrl: string, at: number): Extract<UHRPEvent, { type: 'advertise' }>[] {
    const normalized = `uhrp://${StorageUtils.normalizeURL(uhrpUrl)}`
    return [...this.advertisements.values()]
      .filter(event => !this.revoked.has(event.outpoint) && event.record.uhrpUrl === normalized && event.record.expiryTime > at)
      .sort((left, right) => left.outpoint.localeCompare(right.outpoint))
      .map(event => structuredClone(event))
  }

  journal(): UHRPEvent[] {
    return this.events.map(event => structuredClone(event))
  }

  stateDigest(): string {
    return sha256Hex(canonicalJson(this.journal()))
  }

  static async replay(events: readonly UHRPEvent[]): Promise<ReferenceUHRPOverlay> {
    const overlay = new ReferenceUHRPOverlay()
    for (const event of events) {
      if (event.sequence !== overlay.events.length + 1) throw new Error('UHRP journal sequence diverged')
      if (event.type === 'advertise') {
        const result = await overlay.submit(event.lockingScriptHex)
        if (result.txid !== event.txid || result.outpoint !== event.outpoint) throw new Error('UHRP replay diverged')
      } else overlay.revoke(event.outpoint)
    }
    return overlay
  }
}

export interface UHRPHttpService {
  origin: string
  close(): Promise<void>
}

export async function startUHRPHttpService(overlay: ReferenceUHRPOverlay): Promise<UHRPHttpService> {
  const server = createServer((request, response) => route(overlay, request, response).catch(error => {
    sendJson(response, 400, { error: error instanceof Error ? error.message : 'Unknown UHRP error' })
  }))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('UHRP service did not bind')
  return { origin: `http://127.0.0.1:${address.port}`, close: () => closeServer(server) }
}

export class UHRPHttpClient {
  constructor(readonly origin: string) {}

  async submit(lockingScriptHex: string) {
    return this.request<{ accepted: true; txid: string; outpoint: string; sequence: number }>('/v1/submit', {
      method: 'POST', body: canonicalJson({ topic: UHRP_TOPIC, lockingScriptHex })
    })
  }

  async revoke(outpoint: string) {
    return this.request<{ revoked: true; sequence: number }>('/v1/revoke', {
      method: 'POST', body: canonicalJson({ outpoint })
    })
  }

  async lookup(uhrpUrl: string, at: number) {
    return this.request<Extract<UHRPEvent, { type: 'advertise' }>[]>(`/v1/lookup?uhrpUrl=${encodeURIComponent(uhrpUrl)}&at=${at}`)
  }

  async journal() { return this.request<UHRPEvent[]>('/v1/journal') }

  private async request<T>(route: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.origin}${route}`, {
      ...init,
      headers: init?.body === undefined ? undefined : { 'content-type': 'application/json' }
    })
    const value = (await response.json()) as T & { error?: string }
    if (!response.ok) throw new Error(value.error ?? `UHRP HTTP ${response.status}`)
    return value
  }
}

async function route(overlay: ReferenceUHRPOverlay, request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? '/', 'http://uhrp.invalid')
  if (request.method === 'POST' && url.pathname === '/v1/submit') {
    const input = JSON.parse(await readBody(request)) as { topic: string; lockingScriptHex: string }
    if (input.topic !== UHRP_TOPIC) throw new Error('Unsupported UHRP topic')
    sendJson(response, 200, await overlay.submit(input.lockingScriptHex)); return
  }
  if (request.method === 'POST' && url.pathname === '/v1/revoke') {
    const input = JSON.parse(await readBody(request)) as { outpoint: string }
    sendJson(response, 200, overlay.revoke(input.outpoint)); return
  }
  if (request.method === 'GET' && url.pathname === '/v1/lookup') {
    const uhrpUrl = url.searchParams.get('uhrpUrl')
    const at = Number(url.searchParams.get('at'))
    if (uhrpUrl === null || !Number.isSafeInteger(at)) throw new Error('UHRP lookup parameters are invalid')
    sendJson(response, 200, overlay.lookup(uhrpUrl, at)); return
  }
  if (request.method === 'GET' && url.pathname === '/v1/journal') {
    sendJson(response, 200, overlay.journal()); return
  }
  sendJson(response, 404, { error: 'Route not found' })
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let length = 0
  for await (const value of request) {
    const chunk = Buffer.from(value); length += chunk.length
    if (length > 4 * 1024 * 1024) throw new Error('UHRP request body exceeds the service limit')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function sendJson(response: ServerResponse, status: number, value: unknown) {
  const body = canonicalJson(value)
  response.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) })
  response.end(body)
}

async function closeServer(server: Server) {
  server.close(); await once(server, 'close')
}
