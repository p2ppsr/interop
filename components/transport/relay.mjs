import assert from 'node:assert/strict'
import http from 'node:http'
import express from 'express'
import { PrivateKey, ProtoWallet } from '@bsv/sdk'
import { WalletRelayService } from '@bsv/wallet-relay'
import { WalletPairingSession, parsePairingUri } from '@bsv/wallet-relay/client'

export async function listen(server) {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  return `http://127.0.0.1:${server.address().port}`
}
export async function closeServer(server) {
  await new Promise((resolve, reject) => { server.close(e => e ? reject(e) : resolve()); server.closeAllConnections() })
}
async function until(predicate, label) {
  const deadline = Date.now() + 10_000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${label}`)
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

/** Execute real HTTP and encrypted WebSocket pairing with the published relay
 * and pairing clients. The wallet runs in-process; this is protocol evidence. */
export async function qualifyRelay({ wallet = new ProtoWallet(PrivateKey.fromHex('31'.repeat(32))), onPaired } = {}) {
  const assertions = [], trace = [], controls = {}
  const app = express(); app.use(express.json())
  const server = http.createServer(app), origin = await listen(server)
  const relay = new WalletRelayService({ app, server, wallet: new ProtoWallet(PrivateKey.fromHex('32'.repeat(32))),
    origin, allowedOrigins: [origin], relayUrl: origin.replace('http:', 'ws:'), heartbeatIntervalMs: 1000 })
  const mobiles = []
  let cleaned = false, joined
  const check = async (id, run) => {
    try { const detail = await run(); assertions.push({ id, result: 'PASS', detail }) }
    catch (error) { assertions.push({ id, result: 'FAIL', detail: error.message }) }
  }
  const request = async (session, method, params, token = session.desktopToken) => {
    const response = await fetch(`${origin}/api/request/${session.sessionId}`, { method: 'POST',
      headers: { 'content-type': 'application/json', 'x-desktop-token': token }, body: JSON.stringify({ method, params }) })
    const text = await response.text(); let body; try { body = JSON.parse(text) } catch { body = text }
    trace.push({ method, status: response.status, body })
    return { status: response.status, body }
  }
  try {
    const response = await fetch(`${origin}/api/session`)
    assert.equal(response.status, 200)
    const session = await response.json()
    const parsed = parsePairingUri(session.pairingUri)
    assert.ok(parsed.params, JSON.stringify(parsed))
    const params = parsed.params
    await check('relay.origin-allowlist', async () => {
      try { await relay.createSession({ origin: 'https://alternate.invalid' }); throw new Error('Alternate origin accepted') } catch (error) { controls.origin = { origin: 'https://alternate.invalid', error: error.message }; assert.match(error.message, /allow/i) }
      return 'Alternate origin rejected before session creation'
    })
    await check('relay.signed-qr-tamper', async () => {
      const bad = new WalletPairingSession(wallet, { ...params, topic: '0'.repeat(32) }, { requireOriginBoundKey: true })
      try { await bad.resolveRelay(); throw new Error('Tampered topic accepted') } catch (error) { controls.tamper = { original: params, alteredTopic: '0'.repeat(32), error: error.message }; assert.notEqual(error.message, 'Tampered topic accepted') }
      return 'Altered signed topic rejected before connecting'
    })
    let approvals = 0, calls = 0
    const mobile = new WalletPairingSession(wallet, params, {
      requireOriginBoundKey: true,
      implementedMethods: new Set(['getPublicKey', 'createSignature', 'encrypt', 'decrypt', ...(onPaired ? ['createAction'] : [])]),
      autoApproveMethods: new Set(['getPublicKey', 'encrypt', 'decrypt', ...(onPaired ? ['createAction'] : [])]),
      onApprovalRequired: async () => { approvals++; return false }
    })
    mobiles.push(mobile)
    mobile.onRequest(async (method, args) => { calls++; return wallet[method](args, origin) })
    const errors = []; mobile.on('error', message => errors.push(message))
    await mobile.resolveRelay(); await mobile.connect()
    await until(() => relay.getSession(session.sessionId)?.status === 'connected', 'authenticated pairing')
    await check('relay.pairing-and-identity', async () => {
      const actual = await request(session, 'getPublicKey', { identityKey: true })
      assert.equal(actual.status, 200); assert.equal(actual.body.result.publicKey, (await wallet.getPublicKey({ identityKey: true })).publicKey)
      return 'Signed QR, origin-bound identity and encrypted mobile handshake accepted'
    })
    await check('relay.desktop-token', async () => {
      const before = calls
      const actual = await request(session, 'getPublicKey', { identityKey: true }, 'invalid')
      controls.desktopToken = { before, after: calls, status: actual.status }; assert.notEqual(actual.status, 200); assert.equal(calls, before)
      return 'Invalid desktop token rejected without invoking wallet'
    })
    await check('relay.permission-denial', async () => {
      const before = calls
      const actual = await request(session, 'createSignature', { data: [1,2,3], protocolID: [1, 'lab permission'], keyID: 'denied', counterparty: 'self' })
      controls.permission = { before, after: calls, approvals, code: actual.body.error.code }; assert.equal(actual.body.error.code, 4001); assert.equal(calls, before); assert.equal(approvals, 1)
      return 'Explicit user rejection returns 4001 without executing wallet method'
    })
    await check('relay.binary-roundtrip', async () => {
      const plaintext = Array.from({ length: 256 }, (_, i) => i)
      const crypto = { protocolID: [1, 'lab bytes'], keyID: 'all-bytes', counterparty: 'self' }
      const encrypted = await request(session, 'encrypt', { ...crypto, plaintext })
      assert.equal(encrypted.status, 200)
      const decrypted = await request(session, 'decrypt', { ...crypto, ciphertext: encrypted.body.result.ciphertext })
      assert.deepEqual(decrypted.body.result.plaintext, plaintext)
      return 'Every byte 0–255 survives HTTP JSON, encrypted WS and wallet normalization'
    })
    await check('relay.reconnect', async () => {
      const lastSeq = mobile.lastSeq
      mobile.disconnect()
      await until(() => relay.getSession(session.sessionId)?.status === 'disconnected', 'disconnect')
      await mobile.reconnect(lastSeq)
      await until(() => relay.getSession(session.sessionId)?.status === 'connected', 'reconnect')
      const result = await request(session, 'getPublicKey', { identityKey: true })
      controls.reconnect = { before: lastSeq, after: mobile.lastSeq, status: result.status }; assert.equal(result.status, 200); assert.ok(mobile.lastSeq > lastSeq)
      return 'Same authenticated mobile resumes with increasing sequence number'
    })
    if (onPaired) {
      const remoteWallet = Object.fromEntries(['getPublicKey', 'createAction', 'encrypt', 'decrypt'].map(method => [method, async params => {
        const result = await request(session, method, params)
        if (result.status !== 200 || result.body.error) throw new Error(`Relayed ${method}: ${JSON.stringify(result.body)}`)
        return result.body.result
      }]))
      joined = await onPaired(remoteWallet)
    }
    await check('relay.session-revocation', async () => {
      const response = await fetch(`${origin}/api/session/${session.sessionId}`, { method: 'DELETE', headers: { 'x-desktop-token': session.desktopToken } })
      assert.ok(response.ok)
      const result = await request(session, 'getPublicKey', { identityKey: true })
      assert.notEqual(result.status, 200)
      return 'Revoked session cannot invoke wallet'
    })
    trace.push({ mobileErrors: errors })
  } finally {
    for (const mobile of mobiles) mobile.disconnect()
    relay.stop()
    await closeServer(server); cleaned = !server.listening
  }
  return { assertions, trace, controls, joined, cleanup: { httpClosed: cleaned, websocketRelayDestroyed: true },
    fidelity: 'Real relay/pairing protocol clients; in-process wallet; no phone, camera or native-app claim' }
}
