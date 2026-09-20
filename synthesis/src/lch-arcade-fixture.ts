import fs from 'node:fs'
import path from 'node:path'
import { objectId, toHex } from '@bsv/lch'
import { P2PKH, PrivateKey, Transaction } from '@bsv/sdk'
import { CHIRPContentStore, ReferenceCHIRPNetwork } from './content.js'
import { DeterministicBytes, DeterministicClock, canonicalJson, sha256Hex } from './determinism.js'
import { createFixtureWallet } from './lch-reference/fixtureWallet.js'
import { ReferenceLCHClient } from './lch-reference/referenceClient.js'
import { ReferenceLCHServer } from './lch-reference/referenceServer.js'
import { referenceImage } from './run.js'

const [fundingFixtureArgument, outputArgument] = process.argv.slice(2)
if (fundingFixtureArgument === undefined || outputArgument === undefined)
  throw new Error('Usage: tsx src/lch-arcade-fixture.ts <mined-uhrp-fixture.json> <fixture.json>')
const fundingFixture = JSON.parse(fs.readFileSync(fundingFixtureArgument, 'utf8')) as {
  schema: string
  txid: string
  kind?: string
}
if (fundingFixture.schema !== 'tpnil-arcade-teranode-fixture@1.0.0' || fundingFixture.kind !== 'tpnil-uhrp-advertisement')
  throw new Error('Funding fixture is not the mined UHRP advertisement')

const authorization = `Basic ${Buffer.from('tpnil:tpnil-regtest-only').toString('base64')}`
const response = await fetch('http://127.0.0.1:9292/', {
  method: 'POST',
  headers: { authorization, 'content-type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '1.0', id: 'tpnil-lch-fixture', method: 'getrawtransaction', params: [fundingFixture.txid, 0] })
})
const envelope = (await response.json()) as { result: string | null; error: { message: string } | null }
if (envelope.error !== null || envelope.result === null)
  throw new Error(`Unable to retrieve UHRP transaction: ${envelope.error?.message ?? 'null response'}`)
const fundingSource = Transaction.fromHex(envelope.result)
const fundingOutput = fundingSource.outputs[1]
const fundingKey = PrivateKey.fromHex('01'.padStart(64, '0'))
if (fundingOutput?.satoshis === undefined ||
    fundingOutput.lockingScript.toHex() !== new P2PKH().lock(fundingKey.toAddress('testnet')).toHex())
  throw new Error('UHRP transaction does not contain its expected fee output')

const clock = new DeterministicClock(1_800_000_000n)
const random = new DeterministicBytes('tpnil-teranode-synthesis')
const network = new ReferenceCHIRPNetwork()
const content = new CHIRPContentStore(network)
const issuer = createFixtureWallet(201)
const server = await ReferenceLCHServer.create({
  issuerWallet: issuer,
  publicBaseUrl: 'https://lch.tpnil.test',
  now: clock.now,
  random: length => random.take(length),
  content,
  payees: [
    { wallet: createFixtureWallet(202), satoshis: 3, dutyUid: 'urn:tpnil:duty:content-availability', interest: 'content-availability', label: 'content availability operator' },
    { wallet: createFixtureWallet(203), satoshis: 5, dutyUid: 'urn:tpnil:duty:creator', interest: 'creator', label: 'post creator' }
  ]
})
const published = await server.publish({ bytes: referenceImage(), mediaType: 'image/png', name: 'tpnil-synthesis.png' })
const buyer = createFixtureWallet(204, {
  sourceTransaction: fundingSource,
  sourceOutputIndex: 1,
  key: fundingKey,
  feeSatoshis: 1_000
})
const client = new ReferenceLCHClient(buyer, content, {
  now: clock.now,
  endpointPolicy: {
    allowLocalOrigins: ['https://lch.tpnil.test'],
    connect: async (url, init) => server.http.handle(new Request(url, init))
  }
})
const acquired = await client.acquire(await client.prepare(published.lch))
if (acquired.receipts.length !== 2 || sha256Hex(acquired.plaintext) !== sha256Hex(referenceImage()))
  throw new Error('LCH acquisition did not produce the expected receipts and plaintext')
const transaction = Transaction.fromAtomicBEEF(acquired.atomicBeef)
if (transaction.id('hex') !== acquired.transactionId) throw new Error('LCH payment transaction identity diverged')

const raw = Uint8Array.from(transaction.toBinary())
const ef = Uint8Array.from(transaction.toEF())
const fixture = {
  schema: 'tpnil-arcade-teranode-fixture@1.0.0',
  kind: 'tpnil-lch-multipay-settlement',
  sourceTxid: fundingFixture.txid,
  sourceOutputIndex: 1,
  txid: transaction.id('hex'),
  rawHex: Buffer.from(raw).toString('hex'),
  rawSha256: sha256Hex(raw),
  efHex: Buffer.from(ef).toString('hex'),
  efSha256: sha256Hex(ef),
  feeSatoshis: transaction.getFee(),
  lch: {
    assetId: toHex(published.assetId),
    licenseId: toHex(acquired.licenseId),
    transactionState: acquired.transactionState,
    receiptIds: await Promise.all(acquired.receipts.map(receipt => objectId('payment-receipt', receipt.body).then(toHex))),
    plaintextSha256: sha256Hex(acquired.plaintext)
  }
}
const output = path.resolve(outputArgument)
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, `${canonicalJson(fixture)}\n`)
process.stdout.write(`${canonicalJson({ prepared: true, output, txid: fixture.txid, lch: fixture.lch })}\n`)
