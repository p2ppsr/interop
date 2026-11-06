import assert from 'node:assert/strict'
import http from 'node:http'
import path from 'node:path'
import express from 'express'
import { Beef, Transaction } from '@bsv/sdk'
import { createPaymentMiddleware } from '@bsv/402-pay/server'
import { constructPaymentHeaders, create402Fetch } from '@bsv/402-pay/client'
import { SQLitePaymentReplayStore } from './replay-store.mjs'
import { listen, closeServer } from './relay.mjs'

/** Real published payment client/middleware. Both wallet arguments must be
 * funded, isolated BRC-100 wallets; this module never invents wallet verdicts. */
export async function qualifyPaidHttp({ payer, payee, directory }) {
  const assertions = [], trace = [], transactions = [], httpEvents = []
  const filename = path.join(directory, 'payment-replay.sqlite')
  let store, server, origin, delivered = 0
  const start = async () => {
    store = new SQLitePaymentReplayStore(filename)
    const app = express()
    app.use((req, response, next) => {
      const event = { method: req.method, path: req.path, headers: { ...req.headers } }
      response.once('finish', () => { httpEvents.push({ ...event, status: response.statusCode }) })
      if (req.headers['x-bsv-beef']) {
        const beefHex = Buffer.from(req.headers['x-bsv-beef'], 'base64').toString('hex')
        try {
          const beef = Beef.fromBinaryStrict([...Buffer.from(beefHex, 'hex')])
          const txid = beef.atomicTxid
          transactions.push({ txid, beefHex, rawHex: beef.findTxid(txid).tx.toHex(), senderIdentity: req.headers['x-bsv-sender'] })
        } catch { /* Retain malformed HTTP separately. */ }
      }
      next()
    })
    app.use(createPaymentMiddleware({ wallet: payee, calculatePrice: () => 7, replayStore: store }))
    app.get('/task', (_req, res) => { delivered++; res.json({ task: 'retrieve encrypted laboratory content', deliveries: delivered }) })
    server = http.createServer(app); origin = await listen(server)
  }
  const stop = async () => { await closeServer(server); store.close() }
  const get = async headers => {
    const response = await fetch(`${origin}/task`, { headers })
    const body = await response.text()
    trace.push({ status: response.status, body, suppliedPayment: Boolean(headers?.['x-bsv-beef']) })
    return { status: response.status, body, headers: Object.fromEntries(response.headers) }
  }
  const check = async (id, fn) => {
    try { assertions.push({ id, result: 'PASS', detail: await fn() }) }
    catch (e) { assertions.push({ id, result: 'FAIL', detail: e.message }) }
  }
  await start()
  try {
    const serverIdentity = (await payee.getPublicKey({ identityKey: true })).publicKey
    await check('402.challenge', async () => {
      const result = await get()
      assert.equal(result.status, 402); assert.equal(result.headers['x-bsv-sats'], '7'); assert.equal(result.headers['x-bsv-server'], serverIdentity)
      assert.equal(delivered, 0); return 'Unpaid request receives exact price and server identity; no content'
    })
    await check('402.malformed-payment', async () => {
      const result = await get({ 'x-bsv-beef': 'malformed' })
      assert.equal(result.status, 402); assert.equal(delivered, 0); return 'Malformed payment cannot retrieve content'
    })
    await check('402.insufficient-value', async () => {
      const headers = await constructPaymentHeaders(payer, `${origin}/task`, 1, serverIdentity)
      const result = await get(headers)
      assert.equal(result.status, 402); assert.equal(delivered, 0); return 'Valid one-satoshi payment cannot satisfy seven-satoshi price'
    })
    let acceptedHeaders
    await check('402.real-wallet-payment', async () => {
      acceptedHeaders = await constructPaymentHeaders(payer, `${origin}/task`, 7, serverIdentity)
      const result = await get(acceptedHeaders)
      assert.equal(result.status, 200); assert.equal(delivered, 1)
      return 'Real wallet constructs BRC-29 output; recipient wallet internalizes the exact Atomic BEEF'
    })
    await check('402.duplicate-rejected', async () => {
      assert.ok(acceptedHeaders, 'Payment prerequisite missing')
      const result = await get(acceptedHeaders)
      assert.notEqual(result.status, 200); assert.equal(delivered, 1); return 'Repeated payment does not deliver content twice'
    })
    await check('402.restart-replay', async () => {
      assert.ok(acceptedHeaders, 'Payment prerequisite missing')
      await stop(); await start()
      const result = await get(acceptedHeaders)
      assert.notEqual(result.status, 200); assert.equal(delivered, 1); return 'Persistent replay claims survive complete HTTP middleware restart'
    })
    await check('402.automatic-retry', async () => {
      const paidFetch = create402Fetch({ wallet: payer })
      const result = await paidFetch(`${origin}/task`)
      assert.equal(result.status, 200); assert.equal(delivered, 2)
      assert.equal((await result.json()).task, 'retrieve encrypted laboratory content')
      return 'Published fetch client handles challenge, creates one payment and retries successfully'
    })
    await check('402.freshness', async () => {
      assert.ok(acceptedHeaders, 'Payment prerequisite missing')
      const result = await get({ ...acceptedHeaders, 'x-bsv-time': '0' })
      assert.equal(result.status, 402); assert.equal(delivered, 2); return 'Expired timestamp rejected without another delivery'
    })
    await check('402.transaction-identities', async () => {
      assert.ok(transactions.length >= 3)
      for (const tx of transactions) assert.equal(Transaction.fromHex(tx.rawHex).id('hex'), tx.txid)
      return 'Raw transactions and Atomic BEEF subjects agree for every retained payment'
    })
  } finally { await stop() }
  const recipientOutputs = await payee.listOutputs({ basket: 'default', include: 'locking scripts' })
  const recipientActions = await payee.listActions({ labels: [], limit: 100 })
  return { assertions, trace, transactions, httpEvents, delivered, recipientOutputs, recipientActions, cleanup: { httpClosed: !server.listening, replayStoreClosed: true },
    fidelity: 'Published HTTP client/middleware and real remote storage-backed wallets with retained mined funding; no native UI claim' }
}
