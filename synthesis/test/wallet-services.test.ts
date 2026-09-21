import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import tls from 'node:tls'
import { afterEach, describe, expect, it } from 'vitest'
import {
  OverlayAdminTokenTemplate,
  HTTPSOverlayBroadcastFacilitator,
  HTTPSOverlayLookupFacilitator,
  LookupResolver,
  PrivateKey,
  ProtoWallet,
  PushDrop,
  SHIPBroadcaster,
  Transaction,
  Utils,
  type WalletInterface
} from '@bsv/sdk'
import { ControlledWalletServices, type TeranodeWalletFundingFixture } from '../src/wallet-lab/services.js'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true })
})

async function openControlledTunnel(proxyUrl: string): Promise<tls.TLSSocket> {
  const proxy = new URL(proxyUrl)
  const socket = net.connect(Number(proxy.port), proxy.hostname)
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve)
    socket.once('error', reject)
  })
  socket.write('CONNECT todo.itcve.test:443 HTTP/1.1\r\nHost: todo.itcve.test:443\r\n\r\n')
  await new Promise<void>((resolve, reject) => {
    let response = ''
    const onData = (chunk: Buffer): void => {
      response += chunk.toString('latin1')
      if (!response.includes('\r\n\r\n')) return
      socket.off('data', onData)
      if (!response.startsWith('HTTP/1.1 200')) reject(new Error(`CONNECT failed: ${response}`))
      else resolve()
    }
    socket.on('data', onData)
    socket.once('error', reject)
  })
  const secure = tls.connect({ socket, servername: 'todo.itcve.test', rejectUnauthorized: false })
  secure.on('error', () => undefined)
  await new Promise<void>((resolve, reject) => {
    secure.once('secureConnect', resolve)
    secure.once('error', reject)
  })
  secure.write('GET / HTTP/1.1\r\nHost: todo.itcve.test\r\nConnection: keep-alive\r\n\r\n')
  await new Promise<void>((resolve, reject) => {
    secure.once('data', () => resolve())
    secure.once('error', reject)
  })
  return secure
}

async function controlledPost(
  proxyUrl: string,
  host: string,
  pathname: string,
  body: Buffer,
  headers: Record<string, string>
): Promise<{ status: number; body: Buffer }> {
  const proxy = new URL(proxyUrl)
  const socket = net.connect(Number(proxy.port), proxy.hostname)
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve)
    socket.once('error', reject)
  })
  socket.write(`CONNECT ${host}:443 HTTP/1.1\r\nHost: ${host}:443\r\n\r\n`)
  let connectResponse = ''
  await new Promise<void>((resolve, reject) => {
    const receive = (chunk: Buffer): void => {
      connectResponse += chunk.toString('latin1')
      if (!connectResponse.includes('\r\n\r\n')) return
      socket.off('data', receive)
      connectResponse.startsWith('HTTP/1.1 200') ? resolve() : reject(new Error(connectResponse))
    }
    socket.on('data', receive)
    socket.once('error', reject)
  })
  const secure = tls.connect({ socket, servername: host, rejectUnauthorized: false })
  await new Promise<void>((resolve, reject) => {
    secure.once('secureConnect', resolve)
    secure.once('error', reject)
  })
  secure.write([
    `POST ${pathname} HTTP/1.1`,
    `Host: ${host}`,
    `Content-Length: ${body.length}`,
    'Connection: close',
    ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`),
    '',
    ''
  ].join('\r\n'))
  secure.write(body)
  const chunks: Buffer[] = []
  for await (const chunk of secure) chunks.push(Buffer.from(chunk))
  const raw = Buffer.concat(chunks)
  const headerEnd = raw.indexOf('\r\n\r\n')
  if (headerEnd < 0) throw new Error('HTTP response did not include headers')
  const status = Number(raw.subarray(0, headerEnd).toString('latin1').split(' ')[1])
  return { status, body: raw.subarray(headerEnd + 4) }
}

function controlledFetch(proxyUrl: string): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
    const requestHeaders = new Headers(init?.headers)
    const headers = Object.fromEntries(requestHeaders.entries())
    const source = init?.body
    const body = source === undefined || source === null
      ? Buffer.alloc(0)
      : typeof source === 'string'
        ? Buffer.from(source)
        : source instanceof Uint8Array
          ? Buffer.from(source)
          : Buffer.from(await new Response(source).arrayBuffer())
    const result = await controlledPost(proxyUrl, url.hostname, url.pathname, body, headers)
    return new Response(Uint8Array.from(result.body), {
      status: result.status,
      headers: { 'content-type': 'application/json' }
    })
  }) as typeof fetch
}

describe('controlled wallet services', () => {
  it('funds the WAB from a mature Teranode coinbase and spends through the controlled faucet', async () => {
    const webroot = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-controlled-webroot-'))
    temporaryDirectories.push(webroot)
    fs.writeFileSync(path.join(webroot, 'index.html'), '<!doctype html><title>fixture</title>')
    const fixture = JSON.parse(fs.readFileSync(
      path.resolve(import.meta.dirname, '../../fixtures/teranode/wab-funding-v1.json'),
      'utf8'
    )) as TeranodeWalletFundingFixture
    const services = new ControlledWalletServices({ webroot })
    await services.start()
    try {
      await expect(services.fundRemoteWalletFromTeranode('77'.repeat(32), fixture)).resolves.toMatchObject({
        txid: fixture.txid,
        blockHeight: fixture.fundingHeight,
        blockHash: fixture.fundingBlockHash,
        atomicBeefSha256: fixture.atomicBeefSha256
      })
      const faucet = await controlledPost(
        services.proxyUrl,
        'wab.itcve.test',
        '/demo/faucet/request',
        Buffer.from(JSON.stringify({ presentationKey: '88'.repeat(32) })),
        { 'Content-Type': 'application/json' }
      )
      expect(faucet.status).toBe(200)
      expect(JSON.parse(faucet.body.toString('utf8'))).toMatchObject({
        success: true,
        paymentData: { amount: 1_000, outputIndex: 0 }
      })
      expect(services.submissions).toHaveLength(1)
      expect(services.submissions[0]?.verdict).toBe('ACCEPTED_BY_NETWORK')
    } finally {
      await services.close()
    }
  }, 20_000)

  it('forcibly releases generated MITM listeners and active tunnels', async () => {
    const webroot = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-controlled-webroot-'))
    temporaryDirectories.push(webroot)
    fs.writeFileSync(path.join(webroot, 'index.html'), '<!doctype html><title>fixture</title>')
    const services = new ControlledWalletServices({ webroot })
    await services.start()
    const tunnel = await openControlledTunnel(services.proxyUrl)
    await services.close()
    await Promise.race([
      new Promise<void>(resolve => tunnel.once('close', () => resolve())),
      new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('proxy tunnel remained open')), 2_000))
    ])
    expect(tunnel.destroyed).toBe(true)
  }, 15_000)

  it('provides root SLAP, SHIP submission and UMP lookup as one controlled boundary', async () => {
    const webroot = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-controlled-webroot-'))
    temporaryDirectories.push(webroot)
    fs.writeFileSync(path.join(webroot, 'index.html'), '<!doctype html><title>fixture</title>')
    const services = new ControlledWalletServices({ webroot })
    await services.start()
    try {
      const slapResponse = await controlledPost(
        services.proxyUrl,
        'overlay-us-1.bsvb.tech',
        '/lookup',
        Buffer.from(JSON.stringify({ service: 'ls_slap', query: { service: 'ls_users' } })),
        { 'Content-Type': 'application/json', 'X-Aggregation': 'yes' }
      )
      expect(slapResponse.status).toBe(200)
      const slap = JSON.parse(slapResponse.body.toString('utf8')) as {
        outputs: Array<{ beef: number[]; outputIndex: number }>
      }
      const slapTransaction = Transaction.fromBEEF(slap.outputs[0]!.beef)
      expect(OverlayAdminTokenTemplate.decode(slapTransaction.outputs[0]!.lockingScript)).toMatchObject({
        protocol: 'SLAP',
        domain: 'https://overlay.itcve.test',
        topicOrService: 'ls_users'
      })

      const wallet = new ProtoWallet(PrivateKey.fromHex('44'.repeat(32)))
      const presentationHash = '55'.repeat(32)
      const recoveryHash = '66'.repeat(32)
      const fields = Array.from({ length: 11 }, (_, index) => [index + 1])
      fields[6] = Utils.toArray(presentationHash, 'hex')
      fields[7] = Utils.toArray(recoveryHash, 'hex')
      const lockingScript = await new PushDrop(wallet as unknown as WalletInterface).lock(
        fields,
        [2, 'admin user management token'],
        '1',
        'self',
        true,
        true
      )
      const ump = new Transaction(1, [], [{ satoshis: 1, lockingScript }], 0)
      const laboratoryFetch = controlledFetch(services.proxyUrl)
      const resolver = new LookupResolver({
        networkPreset: 'mainnet',
        slapTrackers: ['https://overlay-us-1.bsvb.tech'],
        facilitator: new HTTPSOverlayLookupFacilitator(laboratoryFetch)
      })
      const broadcaster = new SHIPBroadcaster(['tm_users'], {
        networkPreset: 'mainnet',
        resolver,
        facilitator: new HTTPSOverlayBroadcastFacilitator(laboratoryFetch)
      })
      await expect(broadcaster.broadcast(ump)).resolves.toMatchObject({ status: 'success', txid: ump.id('hex') })
      const lookupAnswer = await resolver.query({ service: 'ls_users', query: { presentationHash } })
      expect(lookupAnswer.type).toBe('output-list')
      if (lookupAnswer.type !== 'output-list') throw new Error('Expected an output list')
      expect(lookupAnswer.outputs).toHaveLength(1)
      expect(services.umpRecords[0]).toMatchObject({ presentationHash, recoveryHash })
      expect(services.overlayObservations.some(observation =>
        observation.operation === 'submit' && observation.admittedOutputs?.[0] === 0
      )).toBe(true)
      expect(services.overlayObservations.filter(observation => observation.service === 'ls_slap').length).toBeGreaterThanOrEqual(3)
      expect(services.overlayObservations.some(observation =>
        observation.service === 'ls_users' && observation.resultCount === 1
      )).toBe(true)
    } finally {
      await services.close()
    }
  }, 20_000)
})
