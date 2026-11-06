import fs from 'node:fs/promises'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import OverlayExpress from '@bsv/overlay-express'
import { Transaction, PushDrop } from '@bsv/sdk'
import { GASP } from '@bsv/gasp'
import { OverlayGASPRemote } from '@bsv/overlay/GASP/OverlayGASPRemote.ts'
import { LabOverlayGASPStorage } from './gasp-storage.js'
import IdentityTopicManager from '../vendor/identity/IdentityTopicManager.js'
import identityLookup from '../vendor/identity/IdentityLookupServiceFactory.js'

/** Explicit laboratory application policy; the engine, storage, HTTP and discovery implementations are upstream. */
export class PayloadTopicManager {
  async identifyAdmissibleOutputs(beef: number[]) {
    const tx = Transaction.fromBEEF(beef), outputsToAdmit: number[] = []
    tx.outputs.forEach((out, index) => { try { if (PushDrop.decode(out.lockingScript).fields.length) outputsToAdmit.push(index) } catch {} })
    return { outputsToAdmit, coinsToRetain: [] }
  }
  async getDocumentation() { return 'ITCVE laboratory PushDrop payload topic; no native-wallet conformance claim.' }
  async getMetaData() { return { name: 'TPNIL payload', shortDescription: 'Controlled application policy' } }
}
class PayloadLookup {
  admissionMode = 'locking-script' as const
  spendNotificationMode = 'none' as const
  constructor(readonly getEngine: () => any) {}
  async outputAdmittedByTopic() {}
  async outputSpent() {}
  async outputEvicted() {}
  async lookup() { return (await this.getEngine().storage.findUTXOsForTopic('tm_tpnil', undefined, 1000, true)).map((o: any) => ({ txid: o.txid, outputIndex: o.outputIndex })) }
  async getDocumentation() { return 'Returns current payload topic outpoints.' }
  async getMetaData() { return { name: 'TPNIL lookup', shortDescription: 'Controlled application lookup' } }
}
export async function startOverlayNode(options: { directory: string; name: string; mongoUri: string; tracker: any; log?: (...args: unknown[]) => void; controlledTopics?: string[]; configure?: (node: any) => Promise<void> | void }): Promise<any> {
  await fs.mkdir(options.directory, { recursive: true })
  const node = new OverlayExpress(options.name, '31'.repeat(32), `${options.name}.itcve.test`, randomBytes(32).toString('hex'))
  const log = options.log ?? (() => {})
  node.configureLogger({ ...console, log, error: log, warn: log, info: log, debug: log })
  // OverlayExpress has no bind-host setting. Constrain its existing Express listener to loopback.
  const originalListen = node.app.listen.bind(node.app)
  node.app.listen = ((port: number, callback: () => void) => originalListen(port, '127.0.0.1', callback)) as any
  node.port = 0
  try {
    await node.configureKnex({ client: 'better-sqlite3', connection: { filename: path.join(options.directory, 'overlay.sqlite') }, useNullAsDefault: true })
    await node.configureMongo(options.mongoUri)
    node.configureTopicManager('tm_tpnil', new PayloadTopicManager())
    node.configureLookupService('ls_tpnil', new PayloadLookup(() => node.engine))
    node.configureTopicManager('tm_identity', new IdentityTopicManager())
    node.configureLookupService('ls_identity', identityLookup(node.mongoDb!))
    await options.configure?.(node)
    node.configureEnableGASPSync(true)
    node.configureEnableBASMSync(false)
    node.configureEngineParams({ chainTracker: options.tracker, shipTrackers: [], slapTrackers: [], syncConfiguration: { tm_tpnil: false, tm_identity: false, tm_ship: false, tm_slap: false, ...Object.fromEntries((options.controlledTopics ?? []).map(topic => [topic, false])) }, topicAnchorHeaderResolver: async height => {
      const h = await options.tracker.findHeaderForHeight(height)
      return h ? { blockHash: h.hash, blockHeight: h.height, merkleRoot: h.merkleRoot } : undefined
    } })
    await node.configureEngine(true)
    // The laboratory supplies and submits signed advertisements explicitly.
    // The default advertiser is tied to public wallet storage and is not a lab dependency.
    node.engine!.advertiser = undefined
    await node.start()
    const server = (node as any).server
    if (!server.listening) await once(server, 'listening')
    const origin = `http://127.0.0.1:${server.address().port}`
    let closed = false
    return { node, origin, async close() { if (closed) return; closed = true; server.closeAllConnections(); await node.close() } }
  } catch (error) { await node.close(); throw error }
}
export async function submit(origin: string, transaction: Transaction, topics: string[]): Promise<any> {
  const response = await fetch(`${origin}/submit`, { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-topics': JSON.stringify(topics) }, body: Buffer.from(transaction.toAtomicBEEF()), signal: AbortSignal.timeout(15000) })
  const body = await response.json()
  if (!response.ok) throw new Error(`Submit HTTP ${response.status}: ${JSON.stringify(body)}`)
  return body
}
export async function lookup(origin: string, service: string, query: unknown): Promise<any> {
  const response = await fetch(`${origin}/lookup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ service, query }), signal: AbortSignal.timeout(15000) })
  const body = await response.json()
  if (!response.ok) throw new Error(`Lookup HTTP ${response.status}: ${JSON.stringify(body)}`)
  return body
}

/** Injected transport maps one logical peer to one loopback node; no public egress or TLS claim. */
export async function syncPeer(destination: any, sourceOrigin: string, topic = 'tm_tpnil'): Promise<void> {
  const source = new URL(sourceOrigin)
  if (source.protocol !== 'http:' || source.hostname !== '127.0.0.1') throw new Error('GASP source must be a loopback HTTP node')
  const endpoint = 'https://peer.itcve.test'
  const transport: typeof fetch = async (request, options) => {
    const url = new URL(String(request))
    if (url.origin !== endpoint || !['/requestSyncResponse', '/requestForeignGASPNode'].includes(url.pathname)) throw new Error('Unexpected GASP destination')
    return fetch(`${sourceOrigin}${url.pathname}`, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) })
  }
  const engine = destination.node.engine
  const previous = await engine.storage.getLastInteraction(sourceOrigin, topic)
  const gasp = new GASP(new LabOverlayGASPStorage(topic, engine), new OverlayGASPRemote(endpoint, topic, transport), previous, '[TPNIL GASP]', true, true)
  await gasp.sync(endpoint, 1000)
  if (gasp.lastInteraction > previous) await engine.storage.updateLastInteraction(sourceOrigin, topic, gasp.lastInteraction)
}
