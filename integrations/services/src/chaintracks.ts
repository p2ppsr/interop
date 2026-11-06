import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import express from 'express'
import knex from 'knex'
import { Chaintracks } from '@bsv/wallet-toolbox'
import v1Routes from '../vendor/chaintracks/v1-routes.js'
const { createV1Routes } = v1Routes
import v2Routes from '../vendor/chaintracks/v2-routes.js'
const { createV2Routes } = v2Routes
const require = createRequire(import.meta.url)
const { ChaintracksStorageKnex } = require('@bsv/wallet-toolbox/out/src/services/chaintracker/chaintracks/Storage/ChaintracksStorageKnex')
const { BulkIngestorBase } = require('@bsv/wallet-toolbox/out/src/services/chaintracker/chaintracks/Ingest/BulkIngestorBase')
const { BulkFileDataManager } = require('@bsv/wallet-toolbox/out/src/services/chaintracker/chaintracks/util/BulkFileDataManager')

export interface Header { version: number; previousHash: string; merkleRoot: string; time: number; bits: number; nonce: number; hash: string; height: number }
export function headerBytes(header: Omit<Header, 'hash' | 'height'>): Buffer {
  const bytes = Buffer.alloc(80)
  bytes.writeInt32LE(header.version, 0)
  Buffer.from(header.previousHash, 'hex').reverse().copy(bytes, 4)
  Buffer.from(header.merkleRoot, 'hex').reverse().copy(bytes, 36)
  bytes.writeUInt32LE(header.time, 68); bytes.writeUInt32LE(header.bits, 72); bytes.writeUInt32LE(header.nonce, 76)
  return bytes
}
export function headerHash(header: Omit<Header, 'hash' | 'height'>): string {
  return createHash('sha256').update(createHash('sha256').update(headerBytes(header)).digest()).digest().reverse().toString('hex')
}
export const genesis: Header = { version: 1, previousHash: '00'.repeat(32), merkleRoot: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b', time: 1296688602, bits: 0x207fffff, nonce: 2, height: 0, hash: '0f9188f13cb7b2c71f2a335e3a4fc328bf5beb436012afca590b1a11466e2206' }
export function mineHeader(previous: Header, merkleRoot: string, extraTime = 1): Header {
  const header: Header = { version: 1, previousHash: previous.hash, merkleRoot, time: previous.time + extraTime, bits: 0x207fffff, nonce: 0, height: previous.height + 1, hash: '' }
  while (true) {
    header.hash = headerHash(header)
    if (BigInt(`0x${header.hash}`) <= 0x7fffffn << 232n) return header
    header.nonce++
  }
}

/** The input feed is controlled; consensus selection, persistence and HTTP routes are upstream. */
class FixtureBulkIngestor extends BulkIngestorBase {
  constructor(readonly headers: Header[]) { super({ chain: 'regtest', jsonResource: 'controlled-headers.json' }) }
  async getPresentHeight(): Promise<number> { return this.headers.at(-1)!.height }
  async fetchHeaders(_before: unknown, fetchRange: any, bulkRange: any, prior: Header[]): Promise<Header[]> { return this.storage().addBulkHeaders(this.headers.filter(h => h.height >= fetchRange.minHeight && h.height <= fetchRange.maxHeight).map(h => ({ ...h })), bulkRange, prior) }
}
class FixtureLiveIngestor {
  private storageEngine: unknown
  private stopped?: () => void
  constructor(readonly headers: Header[]) {}
  async setStorage(storage: unknown): Promise<void> { this.storageEngine = storage }
  storage(): unknown { return this.storageEngine }
  async getHeaderByHash(hash: string): Promise<Header | undefined> { return this.headers.find(h => h.hash === hash) }
  async startListening(): Promise<void> { await new Promise<void>(resolve => { this.stopped = resolve }) }
  stopListening(): void { this.stopped?.() }
  async shutdown(): Promise<void> {}
}
export async function startChaintracks(directory: string, headers: Header[], log: (...args: unknown[]) => void = () => {}): Promise<any> {
  await fs.mkdir(directory, { recursive: true })
  const database = knex({ client: 'better-sqlite3', connection: { filename: path.join(directory, 'headers.sqlite') }, useNullAsDefault: true })
  const options = ChaintracksStorageKnex.createStorageKnexOptions('regtest', database)
  const bulkOptions = BulkFileDataManager.createDefaultOptions('regtest')
  // All mutable storage belongs to this run. The fixture never uses a public CDN.
  options.bulkFileDataManager = new BulkFileDataManager(bulkOptions)
  const storage = new ChaintracksStorageKnex(options)
  const tracker = new Chaintracks({ ...Chaintracks.createOptions('regtest'), storage, bulkIngestors: [new FixtureBulkIngestor(headers)], liveIngestors: [new FixtureLiveIngestor(headers)], logging: log })
  try {
    await tracker.makeAvailable()
    const app = express(); app.use(express.json({ limit: '1mb' }))
    app.use('/chaintracks/v1', createV1Routes({ chaintracks: tracker, chain: 'regtest' }))
    app.use('/chaintracks/v2', createV2Routes(tracker))
    const server = app.listen(0, '127.0.0.1')
    await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
    const origin = `http://127.0.0.1:${(server.address() as any).port}`
    let closed = false
    return { tracker, storage, origin, async close() { if (closed) return; closed = true; server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); await tracker.destroy(); await database.destroy() } }
  } catch (error) { await tracker.destroy(); await database.destroy(); throw error }
}
