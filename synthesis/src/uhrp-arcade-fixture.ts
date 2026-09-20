import fs from 'node:fs'
import path from 'node:path'
import { toHex } from '@bsv/lch'
import { P2PKH, PrivateKey, Transaction } from '@bsv/sdk'
import { CHIRPContentStore, ReferenceCHIRPNetwork } from './content.js'
import { DeterministicBytes, DeterministicClock, canonicalJson, sha256Hex } from './determinism.js'
import { createFixtureWallet } from './lch-reference/fixtureWallet.js'
import { ReferenceLCHServer } from './lch-reference/referenceServer.js'
import { referenceImage } from './run.js'
import { decodeAndVerifyUHRPAdvertisement, encodeUHRPAdvertisement } from './uhrp.js'

const [fundingFixtureArgument, outputArgument] = process.argv.slice(2)
if (fundingFixtureArgument === undefined || outputArgument === undefined)
  throw new Error('Usage: tsx src/uhrp-arcade-fixture.ts <mined-board-fixture.json> <fixture.json>')
const fundingFixture = JSON.parse(fs.readFileSync(fundingFixtureArgument, 'utf8')) as {
  schema: string
  txid: string
  kind?: string
}
if (fundingFixture.schema !== 'tpnil-arcade-teranode-fixture@1.0.0' || fundingFixture.kind !== 'tpnil-synthesis-board-revision')
  throw new Error('Funding fixture is not the mined Synthesis Board revision')

const authorization = `Basic ${Buffer.from('tpnil:tpnil-regtest-only').toString('base64')}`
const response = await fetch('http://127.0.0.1:9292/', {
  method: 'POST',
  headers: { authorization, 'content-type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '1.0', id: 'tpnil-uhrp-fixture', method: 'getrawtransaction', params: [fundingFixture.txid, 0] })
})
const envelope = (await response.json()) as { result: string | null; error: { message: string } | null }
if (envelope.error !== null || envelope.result === null)
  throw new Error(`Unable to retrieve board transaction: ${envelope.error?.message ?? 'null response'}`)
const fundingSource = Transaction.fromHex(envelope.result)
const fundingOutput = fundingSource.outputs[1]
if (fundingOutput?.satoshis === undefined || fundingOutput.satoshis <= 1_000)
  throw new Error('Board transaction does not contain its expected fee output')

const clock = new DeterministicClock(1_800_000_000n)
const random = new DeterministicBytes('tpnil-teranode-synthesis')
const network = new ReferenceCHIRPNetwork()
const content = new CHIRPContentStore(network)
const server = await ReferenceLCHServer.create({
  issuerWallet: createFixtureWallet(201),
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
const publication = content.publications()[0]
if (publication === undefined || publication.locations[0] === undefined)
  throw new Error('LCH publication did not produce a CHIRP location')
const advertisement = await encodeUHRPAdvertisement(createFixtureWallet(205), {
  uhrpUrl: publication.chirpURL,
  hostedFileLocation: publication.locations[0],
  expiryTime: Number(clock.now() + 86_400n),
  fileSize: Number(publication.logicalLength)
})

const fundingKey = PrivateKey.fromHex('01'.padStart(64, '0'))
if (fundingOutput.lockingScript.toHex() !== new P2PKH().lock(fundingKey.toAddress('testnet')).toHex())
  throw new Error('Funding output belongs to a different key')
const transaction = new Transaction()
transaction.addInput({ sourceTransaction: fundingSource, sourceOutputIndex: 1, unlockingScriptTemplate: new P2PKH().unlock(fundingKey) })
transaction.addOutput({ satoshis: 1, lockingScript: advertisement.lockingScript })
transaction.addP2PKHOutput(fundingKey.toAddress('testnet'), fundingOutput.satoshis - 1_000)
await transaction.sign()
const decoded = await decodeAndVerifyUHRPAdvertisement(transaction.outputs[0]!.lockingScript)

const raw = Uint8Array.from(transaction.toBinary())
const ef = Uint8Array.from(transaction.toEF())
const fixture = {
  schema: 'tpnil-arcade-teranode-fixture@1.0.0',
  kind: 'tpnil-uhrp-advertisement',
  sourceTxid: fundingFixture.txid,
  sourceOutputIndex: 1,
  txid: transaction.id('hex'),
  rawHex: Buffer.from(raw).toString('hex'),
  rawSha256: sha256Hex(raw),
  efHex: Buffer.from(ef).toString('hex'),
  efSha256: sha256Hex(ef),
  feeSatoshis: transaction.getFee(),
  lchAssetId: toHex(published.assetId),
  advertisement: {
    ...decoded,
    lockingScriptSha256: sha256Hex(Uint8Array.from(transaction.outputs[0]!.lockingScript.toBinary()))
  }
}
const output = path.resolve(outputArgument)
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, `${canonicalJson(fixture)}\n`)
process.stdout.write(`${canonicalJson({ prepared: true, output, txid: fixture.txid, lchAssetId: fixture.lchAssetId, advertisement: fixture.advertisement })}\n`)
