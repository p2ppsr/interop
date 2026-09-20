import fs from 'node:fs'
import path from 'node:path'
import { P2PKH, PrivateKey, PushDrop, Transaction } from '@bsv/sdk'
import { BOARD_PROTOCOL, decodeAndVerifyBoardToken, encodeBoardToken } from './board.js'
import { canonicalJson, sha256Hex } from './determinism.js'
import { createFixtureWallet } from './lch-reference/fixtureWallet.js'

const [runtimeResultArgument, fundingFixtureArgument, outputArgument] = process.argv.slice(2)
if (runtimeResultArgument === undefined || fundingFixtureArgument === undefined || outputArgument === undefined)
  throw new Error('Usage: tsx src/board-arcade-fixture.ts <teranode-result.json> <mined-funding-fixture.json> <fixture.json>')

const runtimeResult = JSON.parse(fs.readFileSync(runtimeResultArgument, 'utf8')) as {
  outcome: string
  evidence: { updateTxid: string }
}
if (runtimeResult.outcome !== 'PASS') throw new Error('Teranode board result is not passing')
const fundingFixture = JSON.parse(fs.readFileSync(fundingFixtureArgument, 'utf8')) as {
  schema: string
  txid: string
}
if (fundingFixture.schema !== 'tpnil-arcade-teranode-fixture@1.0.0')
  throw new Error('Funding fixture has an unsupported schema')

const authorization = `Basic ${Buffer.from('tpnil:tpnil-regtest-only').toString('base64')}`
async function rawTransaction(txid: string): Promise<Transaction> {
  const response = await fetch('http://127.0.0.1:9292/', {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '1.0', id: 'tpnil-board-fixture', method: 'getrawtransaction', params: [txid, 0] })
  })
  const envelope = (await response.json()) as { result: string | null; error: { message: string } | null }
  if (envelope.error !== null || envelope.result === null)
    throw new Error(`Unable to retrieve ${txid}: ${envelope.error?.message ?? 'null response'}`)
  return Transaction.fromHex(envelope.result)
}

const boardSource = await rawTransaction(runtimeResult.evidence.updateTxid)
const fundingSource = await rawTransaction(fundingFixture.txid)
const priorScript = boardSource.outputs[0]?.lockingScript
const fundingOutput = fundingSource.outputs[0]
if (priorScript === undefined || boardSource.outputs[0]?.satoshis !== 1)
  throw new Error('Board source does not contain the expected one-satoshi token')
if (fundingOutput?.satoshis === undefined || fundingOutput.satoshis <= 1_000)
  throw new Error('Funding transaction does not contain a usable output')

const author = createFixtureWallet(204)
const prior = await decodeAndVerifyBoardToken(priorScript)
const revision = await encodeBoardToken(author, {
  ...prior,
  id: sha256Hex(`arcade-board-revision:${runtimeResult.evidence.updateTxid}`),
  revision: prior.revision + 1,
  previous: `${runtimeResult.evidence.updateTxid}:0`,
  createdAt: prior.createdAt + 1,
  body: 'TPNIL synthesis post (Arcade, Teranode, and Merkle verified)'
})

const fundingKey = PrivateKey.fromHex('01'.padStart(64, '0'))
const expectedFundingScript = new P2PKH().lock(fundingKey.toAddress('testnet')).toHex()
if (fundingOutput.lockingScript.toHex() !== expectedFundingScript)
  throw new Error('Funding output belongs to a different key')

const transaction = new Transaction()
transaction.addInput({
  sourceTransaction: boardSource,
  sourceOutputIndex: 0,
  unlockingScriptTemplate: new PushDrop(author).unlock(
    BOARD_PROTOCOL,
    prior.id,
    'anyone',
    'all',
    false,
    1,
    priorScript
  )
})
transaction.addInput({
  sourceTransaction: fundingSource,
  sourceOutputIndex: 0,
  unlockingScriptTemplate: new P2PKH().unlock(fundingKey)
})
transaction.addOutput({ satoshis: 1, lockingScript: revision.lockingScript })
transaction.addP2PKHOutput(fundingKey.toAddress('testnet'), fundingOutput.satoshis - 1_000)
await transaction.sign()

const decoded = await decodeAndVerifyBoardToken(transaction.outputs[0]!.lockingScript)
if (decoded.revision !== 3 || decoded.previous !== `${runtimeResult.evidence.updateTxid}:0`)
  throw new Error('Generated transaction did not preserve board revision semantics')

const raw = Uint8Array.from(transaction.toBinary())
const ef = Uint8Array.from(transaction.toEF())
const fixture = {
  schema: 'tpnil-arcade-teranode-fixture@1.0.0',
  kind: 'tpnil-synthesis-board-revision',
  sourceTxid: runtimeResult.evidence.updateTxid,
  fundingTxid: fundingFixture.txid,
  txid: transaction.id('hex'),
  rawHex: Buffer.from(raw).toString('hex'),
  rawSha256: sha256Hex(raw),
  efHex: Buffer.from(ef).toString('hex'),
  efSha256: sha256Hex(ef),
  feeSatoshis: transaction.getFee(),
  board: {
    key: decoded.key,
    revision: decoded.revision,
    previous: decoded.previous,
    lockingScriptSha256: sha256Hex(Uint8Array.from(transaction.outputs[0]!.lockingScript.toBinary()))
  }
}
const output = path.resolve(outputArgument)
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, `${canonicalJson(fixture)}\n`)
process.stdout.write(`${canonicalJson({ prepared: true, output, txid: fixture.txid, board: fixture.board })}\n`)
