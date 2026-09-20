import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { once } from 'node:events'
import { canonicalJson } from './determinism.js'
import {
  ReferenceBoardOverlay,
  type OverlayEvent,
  type OverlaySubmission,
  type SubmissionResult
} from './overlay.js'

const MAX_REQUEST_BYTES = 4 * 1024 * 1024

export interface OverlayHttpService {
  origin: string
  close(): Promise<void>
}

export async function startOverlayHttpService(
  overlay: ReferenceBoardOverlay,
  hostname = '127.0.0.1'
): Promise<OverlayHttpService> {
  const server = createServer((request, response) => {
    route(overlay, request, response).catch(error => {
      const message = error instanceof Error ? error.message : 'Unknown overlay error'
      sendJson(response, 400, { accepted: false, error: message })
    })
  })
  server.listen(0, hostname)
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Overlay service did not bind a TCP address')
  return {
    origin: `http://${hostname}:${address.port}`,
    close: () => closeServer(server)
  }
}

export class OverlayHttpClient {
  constructor(readonly origin: string) {}

  async submit(input: OverlaySubmission): Promise<SubmissionResult> {
    return this.request('/v1/submit', { method: 'POST', body: canonicalJson(input) })
  }

  async lookup(key: string): Promise<OverlayEvent | undefined> {
    const response = await fetch(`${this.origin}/v1/lookup?key=${encodeURIComponent(key)}`)
    if (response.status === 404) return undefined
    return readResponse(response)
  }

  async journal(): Promise<OverlayEvent[]> {
    return this.request('/v1/journal')
  }

  async state(): Promise<{ digest: string; events: number }> {
    return this.request('/v1/state')
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = init?.body === undefined ? undefined : { 'content-type': 'application/json' }
    return readResponse(await fetch(`${this.origin}${path}`, { ...init, headers }))
  }
}

async function route(
  overlay: ReferenceBoardOverlay,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://overlay.invalid')
  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' })
    return
  }
  if (request.method === 'POST' && url.pathname === '/v1/submit') {
    if (request.headers['content-type']?.split(';')[0] !== 'application/json')
      throw new Error('Content-Type must be application/json')
    const input = JSON.parse(await readBody(request)) as OverlaySubmission
    sendJson(response, 200, await overlay.submit(input))
    return
  }
  if (request.method === 'GET' && url.pathname === '/v1/lookup') {
    const key = url.searchParams.get('key')
    if (key === null || key.length === 0) throw new Error('Lookup key is required')
    const event = overlay.lookup(key)
    sendJson(response, event === undefined ? 404 : 200, event ?? { found: false })
    return
  }
  if (request.method === 'GET' && url.pathname === '/v1/journal') {
    sendJson(response, 200, overlay.journal())
    return
  }
  if (request.method === 'GET' && url.pathname === '/v1/state') {
    sendJson(response, 200, { digest: overlay.stateDigest(), events: overlay.journal().length })
    return
  }
  sendJson(response, 404, { error: 'Route not found' })
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let length = 0
  for await (const value of request) {
    const chunk = Buffer.from(value)
    length += chunk.length
    if (length > MAX_REQUEST_BYTES) throw new Error('Request body exceeds the service limit')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  if (response.headersSent) return
  const body = canonicalJson(value)
  response.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body)
  })
  response.end(body)
}

async function readResponse<T>(response: Response): Promise<T> {
  const value = (await response.json()) as T & { error?: string }
  if (!response.ok) throw new Error(value.error ?? `Overlay HTTP ${response.status}`)
  return value
}

async function closeServer(server: Server): Promise<void> {
  server.close()
  await once(server, 'close')
}
