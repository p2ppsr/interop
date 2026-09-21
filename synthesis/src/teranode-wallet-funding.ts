import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { KeyDeriver, MerklePath, P2PKH, PrivateKey, Transaction, Utils } from '@bsv/sdk'

interface RpcEnvelope<T> {
  result: T | null
  error: { code: number; message: string } | null
}

interface ChainInfo {
  bestblockhash: string
  blocks: number
  chain: string
}

const wabRootKeyHex = '77'.repeat(32)
const senderKey = PrivateKey.fromHex('22'.repeat(32))
const senderIdentityKey = senderKey.toPublicKey().toString()
const derivationPrefix = Buffer.from('tpnil-wallet-lab').toString('base64')
const derivationSuffix = Buffer.from('wab-funding-001').toString('base64')
const keyID = `${derivationPrefix} ${derivationSuffix}`
const [runtimeArgument, outputArgument] = process.argv.slice(2)
if (runtimeArgument === undefined || outputArgument === undefined)
  throw new Error('Usage: teranode-wallet-funding <runtime-directory> <fixture.json>')

const runtime = fs.realpathSync(runtimeArgument)
const output = path.resolve(outputArgument)
const manifest = JSON.parse(fs.readFileSync(path.join(runtime, 'tpnil-runtime.json'), 'utf8')) as {
  profile: string
  profileSha256: string
  source: { repository: string; commit: string }
  image: { reference: string; indexDigest: string }
}
const rpcOrigin = 'http://127.0.0.1:9292/'
const rpcAuthorization = `Basic ${Buffer.from('tpnil:tpnil-regtest-only').toString('base64')}`

async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const response = await fetch(rpcOrigin, {
    method: 'POST',
    headers: { authorization: rpcAuthorization, 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '1.0', id: 'tpnil-wallet-funding', method, params })
  })
  if (!response.ok) throw new Error(`Teranode RPC HTTP ${response.status}`)
  const envelope = await response.json() as RpcEnvelope<T>
  if (envelope.error !== null) throw new Error(`Teranode RPC ${method}: ${envelope.error.message}`)
  if (envelope.result === null) throw new Error(`Teranode RPC ${method} returned null`)
  return envelope.result
}

async function waitForRpc(): Promise<ChainInfo> {
  let lastError: unknown
  for (let attempt = 0; attempt < 180; attempt += 1) {
    try {
      return await rpc<ChainInfo>('getblockchaininfo')
    } catch (error) {
      lastError = error
      await new Promise(resolve => setTimeout(resolve, 1_000))
    }
  }
  throw new Error(`Teranode RPC did not become ready: ${String(lastError)}`)
}

function readCompactSize(bytes: Uint8Array, offset: number): { value: number; next: number } {
  const prefix = bytes[offset]
  if (prefix === undefined) throw new Error('Truncated CompactSize')
  if (prefix < 0xfd) return { value: prefix, next: offset + 1 }
  const length = prefix === 0xfd ? 2 : prefix === 0xfe ? 4 : 8
  if (length === 8 || offset + 1 + length > bytes.length) throw new Error('Unsupported CompactSize')
  return { value: Buffer.from(bytes).readUIntLE(offset + 1, length), next: offset + 1 + length }
}

function transactionLength(bytes: Uint8Array, offset: number): number {
  let cursor = offset + 4
  const inputs = readCompactSize(bytes, cursor)
  cursor = inputs.next
  for (let index = 0; index < inputs.value; index += 1) {
    cursor += 36
    const script = readCompactSize(bytes, cursor)
    cursor = script.next + script.value + 4
  }
  const outputs = readCompactSize(bytes, cursor)
  cursor = outputs.next
  for (let index = 0; index < outputs.value; index += 1) {
    cursor += 8
    const script = readCompactSize(bytes, cursor)
    cursor = script.next + script.value
  }
  cursor += 4
  if (cursor > bytes.length) throw new Error('Truncated transaction in Teranode block')
  return cursor - offset
}

function coinbaseFromTeranodeBlock(bytes: Uint8Array): Transaction {
  let cursor = 80
  const transactions = readCompactSize(bytes, cursor)
  cursor = transactions.next
  if (transactions.value !== 1) throw new Error(`Funding block contains ${transactions.value} transactions; expected one`)
  const size = readCompactSize(bytes, cursor)
  cursor = size.next
  const subtrees = readCompactSize(bytes, cursor)
  cursor = subtrees.next + subtrees.value * 32
  const length = transactionLength(bytes, cursor)
  return Transaction.fromBinary(bytes.slice(cursor, cursor + length))
}

function hash256(bytes: Uint8Array): Buffer {
  return createHash('sha256').update(createHash('sha256').update(bytes).digest()).digest()
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function docker(...args: string[]): string {
  return execFileSync('docker', args, { cwd: runtime, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim()
}

const state = docker('exec', 'blockchain', 'teranode-cli', 'getfsmstate')
if (!state.includes('RUNNING')) docker('exec', 'blockchain', 'teranode-cli', 'setfsmstate', '--fsmstate', 'RUNNING')
const before = await waitForRpc()
if (before.chain !== 'regtest') throw new Error(`Expected regtest, received ${before.chain}`)

const wabRootKey = PrivateKey.fromHex(wabRootKeyHex)
const publicKey = new KeyDeriver(wabRootKey).derivePublicKey(
  [2, '3241645161d8'],
  keyID,
  senderIdentityKey,
  true
)
const address = publicKey.toAddress('testnet')
const fundingHeight = before.blocks + 1
const blockHashes = await rpc<string[]>('generatetoaddress', [101, address])
const fundingBlockHash = blockHashes[0]
if (fundingBlockHash === undefined) throw new Error('Teranode did not return the funding block hash')
const blockHex = await rpc<string>('getblockbyheight', [fundingHeight, 0])
const blockBytes = Uint8Array.from(Buffer.from(blockHex, 'hex'))
const header = blockBytes.slice(0, 80)
const computedBlockHash = Buffer.from(hash256(header)).reverse().toString('hex')
if (computedBlockHash !== fundingBlockHash) throw new Error('Funding block hash does not match its header')
const merkleRoot = Buffer.from(header.slice(36, 68)).reverse().toString('hex')
const coinbase = coinbaseFromTeranodeBlock(blockBytes)
const txid = coinbase.id('hex')
if (coinbase.outputs[0]?.lockingScript.toHex() !== new P2PKH().lock(address).toHex())
  throw new Error('Teranode coinbase did not pay the declared WAB funding key')
if (merkleRoot !== txid) throw new Error('Coinbase-only funding block has an unexpected Merkle root')
coinbase.merklePath = new MerklePath(fundingHeight, [[{ offset: 0, hash: txid, txid: true }]])
if (!await coinbase.merklePath.verify(txid, {
  currentHeight: async () => fundingHeight + 100,
  isValidRootForHeight: async (root, height) => root === merkleRoot && height === fundingHeight
}))
  throw new Error('Funding Merkle proof did not verify against the mined block header')
const atomicBeef = Uint8Array.from(coinbase.toAtomicBEEF())
const fixture = {
  schema: 'tpnil-teranode-wallet-funding@1.0.0',
  generatedAt: new Date().toISOString(),
  profile: manifest.profile,
  profileSha256: manifest.profileSha256,
  source: manifest.source,
  image: manifest.image,
  chain: 'regtest',
  publicWalletNetwork: 'main',
  startingHeight: before.blocks,
  fundingHeight,
  maturityDepth: 100,
  fundingBlockHash,
  blockHeaderHex: Buffer.from(header).toString('hex'),
  merkleRoot,
  txid,
  outputIndex: 0,
  satoshis: coinbase.outputs[0]!.satoshis,
  rawHex: coinbase.toHex(),
  rawSha256: sha256Hex(coinbase.toUint8Array()),
  atomicBeefHex: Utils.toHex(atomicBeef),
  atomicBeefSha256: sha256Hex(atomicBeef),
  payment: {
    publicKey: publicKey.toString(),
    address,
    protocol: 'wallet payment',
    derivationPrefix,
    derivationSuffix,
    senderIdentityKey
  }
}
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, `${JSON.stringify(fixture, null, 2)}\n`)
process.stdout.write(`${JSON.stringify({ output, fundingHeight, fundingBlockHash, txid, satoshis: fixture.satoshis })}\n`)
