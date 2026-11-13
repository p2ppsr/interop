import { AsyncLocalStorage } from 'node:async_hooks'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Certificate, MasterCertificate, Peer, PrivateKey, ProtoWallet, Utils, createNonce, verifyNonce, type AuthMessage } from '@bsv/sdk'

export const coverageIssuerKey = '81'.repeat(32)
export const conditionalIssuanceModes = ['valid', 'bad-signature', 'bad-server-nonce', 'bad-serial', 'bad-type', 'bad-subject', 'bad-certifier', 'bad-fields', 'missing-certificate', 'missing-server-nonce'] as const
export type ConditionalIssuanceMode = typeof conditionalIssuanceModes[number]
export interface ConditionalIssuanceReceipt {
  authenticatedSubject: string; requestId: string; request: any; response: any
  decryptedFields: Record<string, string>; mode: ConditionalIssuanceMode
}

/** Controlled external certifier. HTTP authentication is verified by SDK Peer;
 * the native wallet performs its own issuance protocol. This never calls into
 * the native wallet's private state or manufactures its responses. */
export function createCoverageCertificateIssuer(transportKey = coverageIssuerKey) {
  const wallet = new ProtoWallet(PrivateKey.fromHex(coverageIssuerKey))
  const transportWallet = new ProtoWallet(PrivateKey.fromHex(transportKey))
  const transportIdentity = PrivateKey.fromHex(transportKey).toPublicKey().toString()
  const identity = PrivateKey.fromHex(coverageIssuerKey).toPublicKey().toString()
  const receipts: ConditionalIssuanceReceipt[] = []
  const authMessages: Array<{ direction: 'incoming' | 'outgoing'; message: AuthMessage }> = []
  const exchanges: Array<{ method: string; path: string; authenticated: boolean; error?: string }> = []
  const current = new AsyncLocalStorage<{ response: ServerResponse; requestId?: string }>()
  let receive: (message: AuthMessage) => Promise<void>
  let revocationOutpoint: string | undefined
  let mode: ConditionalIssuanceMode = 'valid'
  const transport = {
    async onData(callback: (message: AuthMessage) => Promise<void>) { receive = callback },
    async send(message: AuthMessage) {
      authMessages.push({ direction: 'outgoing', message: structuredClone(message) })
      const context = current.getStore()
      if (!context || context.response.writableEnded) throw Error('Certifier response has no live HTTP request')
      if (message.messageType !== 'general') {
        context.response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(message))
        return
      }
      const reader = new Utils.Reader(message.payload!)
      const requestId = Utils.toBase64(reader.read(32)), status = reader.readVarIntNum()
      if (requestId !== context.requestId || reader.readVarIntNum() !== 0) throw Error('Certifier response binding differs')
      const body = Buffer.from(reader.read(reader.readVarIntNum()))
      context.response.writeHead(status, {
        'content-type': 'application/json', 'content-length': String(body.length),
        'x-bsv-auth-version': message.version,
        'x-bsv-auth-identity-key': message.identityKey,
        'x-bsv-auth-nonce': message.nonce ?? '',
        'x-bsv-auth-your-nonce': message.yourNonce ?? '',
        'x-bsv-auth-signature': Utils.toHex(message.signature!),
        'x-bsv-auth-request-id': requestId
      }).end(body)
    }
  }
  const peer = new Peer(transportWallet as any, transport)
  peer.listenForGeneralMessages(async (subject, payload) => {
    const reader = new Utils.Reader(payload)
    const requestId = Utils.toBase64(reader.read(32))
    const readText = () => { const length = reader.readVarIntNum(); return length > 0 ? Utils.toUTF8(reader.read(length)) : '' }
    const method = readText(), pathname = readText(), query = readText()
    const headerCount = reader.readVarIntNum()
    for (let i = 0; i < headerCount; i++) { readText(); readText() }
    const request = JSON.parse(readText())
    if (method !== 'POST' || pathname !== '/certificate-coverage/signCertificate' || query) throw Error('Unexpected authenticated certifier route')
    if (!revocationOutpoint) throw Error('Certifier has no ancestry-bound revocation fixture')
    if (!(await verifyNonce(request.clientNonce, wallet as any, subject))) throw Error('Invalid issuance client nonce')
    const decryptedFields = await MasterCertificate.decryptFields(wallet as any, request.masterKeyring, request.fields, subject)
    const serverNonce = mode === 'bad-server-nonce' ? Buffer.alloc(48, 1).toString('base64') : await createNonce(wallet as any, subject)
    const serial = await wallet.createHmac({
      protocolID: [2, 'certificate issuance'], keyID: serverNonce + request.clientNonce,
      data: Utils.toArray(request.clientNonce + serverNonce, 'base64'), counterparty: subject
    })
    const certificate = new Certificate(
      mode === 'bad-type' ? Buffer.alloc(32, 73).toString('base64') : request.type,
      mode === 'bad-serial' ? Buffer.alloc(32, 0).toString('base64') : Utils.toBase64(serial.hmac),
      mode === 'bad-subject' ? PrivateKey.fromHex('72'.repeat(32)).toPublicKey().toString() : subject,
      identity, revocationOutpoint,
      mode === 'bad-fields' ? { ...request.fields, name: request.fields.private } : request.fields)
    await certificate.sign(mode === 'bad-certifier' ? new ProtoWallet(PrivateKey.fromHex('71'.repeat(32))) as any : wallet as any)
    const response: any = { certificate: JSON.parse(JSON.stringify(certificate)), serverNonce }
    if (mode === 'bad-signature') response.certificate.signature = '00'.repeat(70)
    if (mode === 'missing-certificate') delete response.certificate
    if (mode === 'missing-server-nonce') delete response.serverNonce
    receipts.push({ authenticatedSubject: subject, requestId, request: structuredClone(request), response: structuredClone(response), decryptedFields, mode })
    const body = Utils.toArray(JSON.stringify(response), 'utf8')
    const writer = new Utils.Writer().write(Utils.toArray(requestId, 'base64')).writeVarIntNum(200).writeVarIntNum(0).writeVarIntNum(body.length).write(body)
    await peer.toPeer(writer.toArray(), subject)
  })
  async function handle(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? '/', 'https://certifier.itcve.test')
    const event: typeof exchanges[number] = { method: request.method ?? 'GET', path: url.pathname, authenticated: false }
    exchanges.push(event)
    try {
      await peer.ready
      const chunks: Buffer[] = []; let size = 0
      for await (const chunk of request) { size += chunk.length; if (size > 1_048_576) throw Error('Certifier body exceeds bound'); chunks.push(Buffer.from(chunk)) }
      const body = Buffer.concat(chunks)
      await current.run({ response }, async () => {
        if (url.pathname === '/.well-known/auth') {
          if (request.method !== 'POST') throw Error('Authentication requires POST')
          const message = JSON.parse(body.toString('utf8'))
          authMessages.push({ direction: 'incoming', message: structuredClone(message) })
          await receive(message)
          event.authenticated = true
          return
        }
        const header = (name: string) => { const value = request.headers[name]; if (typeof value !== 'string' || !value) throw Error(`Missing ${name}`); return value }
        const requestId = header('x-bsv-auth-request-id')
        if (Buffer.from(requestId, 'base64').length !== 32) throw Error('Invalid authenticated request id')
        current.getStore()!.requestId = requestId
        const writer = new Utils.Writer().write(Utils.toArray(requestId, 'base64'))
        const text = (value: string) => { const bytes = Utils.toArray(value, 'utf8'); writer.writeVarIntNum(bytes.length || -1); if (bytes.length) writer.write(bytes) }
        text(request.method ?? 'GET'); text(url.pathname); text(url.search)
        const headers = Object.entries(request.headers).filter(([name]) => name === 'content-type' || name === 'authorization' || name.startsWith('x-bsv-') && !name.startsWith('x-bsv-auth')).sort(([a], [b]) => a.localeCompare(b))
        writer.writeVarIntNum(headers.length)
        for (const [name, raw] of headers) { text(name); text(name === 'content-type' ? String(raw).split(';')[0]!.trim() : String(raw)) }
        writer.writeVarIntNum(body.length || -1); if (body.length) writer.write([...body])
        const message: AuthMessage = { messageType: 'general', version: header('x-bsv-auth-version'), identityKey: header('x-bsv-auth-identity-key'), nonce: header('x-bsv-auth-nonce'), yourNonce: header('x-bsv-auth-your-nonce'), signature: Utils.toArray(header('x-bsv-auth-signature'), 'hex'), payload: writer.toArray() }
        authMessages.push({ direction: 'incoming', message: structuredClone(message) })
        await receive(message)
        event.authenticated = true
      })
      if (!response.writableEnded) throw Error('Authenticated certifier did not produce a response')
    } catch (error) {
      event.error = error instanceof Error ? error.message : String(error)
      if (!response.writableEnded) response.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ error: event.error }))
    }
  }
  return { wallet, identity, transportIdentity, receipts, exchanges, authMessages, handle,
    setRevocationOutpoint(value: string) { if (!/^[0-9a-f]{64}\.\d+$/.test(value)) throw Error('Invalid certifier revocation outpoint'); revocationOutpoint = value },
    setMode(value: ConditionalIssuanceMode) { mode = value }
  }
}
