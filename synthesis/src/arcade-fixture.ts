import fs from 'node:fs'
import path from 'node:path'
import { P2PKH, PrivateKey, Transaction } from '@bsv/sdk'
import { canonicalJson, sha256Hex } from './determinism.js'

const [runtimeResultArgument, outputArgument] = process.argv.slice(2)
if (runtimeResultArgument === undefined || outputArgument === undefined)
  throw new Error('Usage: tsx src/arcade-fixture.ts <passing-teranode-result.json> <fixture.json>')

const runtimeResult = JSON.parse(fs.readFileSync(runtimeResultArgument, 'utf8')) as {
  outcome?: string
  txid?: string
  evidence?: { acceptedTxid: string }
}
const seedTxid = runtimeResult.evidence?.acceptedTxid ?? runtimeResult.txid
if (seedTxid === undefined) throw new Error('Seed record does not identify a transaction')
if (runtimeResult.outcome !== undefined && runtimeResult.outcome !== 'PASS')
  throw new Error('Teranode seed result is not passing')

const authorization = `Basic ${Buffer.from('tpnil:tpnil-regtest-only').toString('base64')}`
const response = await fetch('http://127.0.0.1:9292/', {
  method: 'POST',
  headers: { authorization, 'content-type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '1.0',
    id: 'tpnil-arcade-fixture',
    method: 'getrawtransaction',
    params: [seedTxid, 0]
  })
})
const envelope = (await response.json()) as { result: string | null; error: { message: string } | null }
if (envelope.error !== null || envelope.result === null)
  throw new Error(`Unable to retrieve seed transaction: ${envelope.error?.message ?? 'null response'}`)

const source = Transaction.fromHex(envelope.result)
const sourceOutputIndex = runtimeResult.evidence === undefined ? 0 : 1
const sourceOutput = source.outputs[sourceOutputIndex]
if (sourceOutput?.satoshis === undefined || sourceOutput.satoshis <= 1_000)
  throw new Error('Seed transaction does not contain a usable P2PKH change output')
const key = PrivateKey.fromHex('01'.padStart(64, '0'))
const expectedScript = new P2PKH().lock(key.toAddress('testnet')).toHex()
if (sourceOutput.lockingScript.toHex() !== expectedScript) throw new Error('Seed change output belongs to a different key')

const transaction = new Transaction()
transaction.addInput({
  sourceTransaction: source,
  sourceOutputIndex,
  unlockingScriptTemplate: new P2PKH().unlock(key)
})
transaction.addP2PKHOutput(key.toAddress('testnet'), sourceOutput.satoshis - 1_000)
await transaction.sign()
const raw = Uint8Array.from(transaction.toBinary())
const ef = Uint8Array.from(transaction.toEF())
const fixture = {
  schema: 'tpnil-arcade-teranode-fixture@1.0.0',
  sourceTxid: source.id('hex'),
  sourceOutputIndex,
  txid: transaction.id('hex'),
  rawHex: Buffer.from(raw).toString('hex'),
  rawSha256: sha256Hex(raw),
  efHex: Buffer.from(ef).toString('hex'),
  efSha256: sha256Hex(ef),
  feeSatoshis: transaction.getFee()
}
const output = path.resolve(outputArgument)
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, `${canonicalJson(fixture)}\n`)
process.stdout.write(`${canonicalJson({ prepared: true, output, txid: fixture.txid, feeSatoshis: fixture.feeSatoshis })}\n`)
