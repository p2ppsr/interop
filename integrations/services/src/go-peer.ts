import fs from 'node:fs/promises'
import http from 'node:http'
import { once } from 'node:events'
import { GoServices } from '../../../synthesis/src/wallet-lab/go-services.js'
import type { Header } from './chaintracks.js'

/** Mount the existing pinned Go service host alongside the real TypeScript peer. */
export async function startGoOverlay(options: { directory: string; mongoUri: string; chaintracksOrigin: string; headers: Header[]; binary?: string }): Promise<any> {
  await fs.mkdir(options.directory, { recursive: true })
  const fixture = http.createServer(async (request, response) => {
    try {
      if (request.method !== 'GET' || !/^\/chaintracks\/v2\/(?:height|tip|header\/height\/\d+)$/.test(request.url ?? '')) { response.writeHead(404).end(); return }
      const upstream = await fetch(`${options.chaintracksOrigin}${request.url}`, { signal: AbortSignal.timeout(10000), redirect: 'error' })
      const value = await upstream.json() as any
      // TS ChainTracks V2 uses the success envelope; the Go fixture port consumes the header body.
      response.writeHead(upstream.status, { 'content-type': 'application/json' }).end(JSON.stringify(value.value ?? value))
    } catch (error) { response.writeHead(502).end(String(error)) }
  })
  fixture.listen(0, '127.0.0.1'); await once(fixture, 'listening')
  const services = new GoServices(options.directory, { overlay: 'go', chaintracks: 'go', storage: 'typescript' }, { binary: options.binary, mongoUri: options.mongoUri })
  let proxy: http.Server | undefined
  try {
    await services.start(`http://127.0.0.1:${(fixture.address() as any).port}`, '45'.repeat(32))
    await services.syncHeaders(options.headers)
    proxy = http.createServer((request, response) => {
      if (!['/submit', '/lookup', '/requestSyncResponse', '/requestForeignGASPNode'].includes(request.url ?? '')) { response.writeHead(404).end(); return }
      services.forward(request, response, `/overlay${request.url}`).catch(error => { if (!response.headersSent) response.writeHead(502); response.end(String(error)) })
    })
    proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening')
    let closed = false
    return { origin: `http://127.0.0.1:${(proxy.address() as any).port}`, identity: services.identity, sync: (peer: string) => services.synchronizeOverlay(peer), diagnostics: () => services.diagnostics, async close() { if (closed) return; closed = true; proxy!.closeAllConnections(); await new Promise<void>(resolve => proxy!.close(() => resolve())); try { await services.dispose() } finally { fixture.closeAllConnections(); await new Promise<void>(resolve => fixture.close(() => resolve())) } } }
  } catch (error) { proxy?.closeAllConnections(); proxy?.close(); await services.dispose(); fixture.closeAllConnections(); await new Promise<void>(resolve => fixture.close(() => resolve())); throw error }
}
