import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { toBase64Url, toHex } from '@bsv/lch'
import { P2PKH, PrivateKey, PushDrop, Transaction } from '@bsv/sdk'
import { canonicalJson, sha256Hex } from './determinism.js'
import { BOARD_PROTOCOL, decodeAndVerifyBoardToken, encodeBoardToken } from './board.js'
import { CHIRPContentStore, ReferenceCHIRPNetwork } from './content.js'
import { DeterministicBytes, DeterministicClock } from './determinism.js'
import { createFixtureWallet } from './lch-reference/fixtureWallet.js'
import { ReferenceLCHServer } from './lch-reference/referenceServer.js'
import { referenceImage } from './run.js'

interface RpcEnvelope<T> {
  result: T | null
  error: { code: number; message: string } | null
}

interface ChainInfo {
  bestblockhash: string
  blocks: number
  chain: string
}

const [runtimeArgument, outputArgument] = process.argv.slice(2)
if (runtimeArgument === undefined || outputArgument === undefined)
  throw new Error('Usage: tsx src/teranode-probe.ts <runtime-directory> <result.json>')

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

class RpcFailure extends Error {
  constructor(readonly code: number, message: string) {
    super(message)
  }
}

async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const response = await fetch(rpcOrigin, {
    method: 'POST',
    headers: { authorization: rpcAuthorization, 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '1.0', id: 'tpnil-teranode-probe', method, params })
  })
  if (!response.ok) throw new Error(`Teranode RPC HTTP ${response.status}`)
  const envelope = (await response.json()) as RpcEnvelope<T>
  if (envelope.error !== null) throw new RpcFailure(envelope.error.code, envelope.error.message)
  if (envelope.result === null) throw new Error(`Teranode RPC ${method} returned null`)
  return envelope.result
}

async function waitForRpc(timeoutMs = 180_000): Promise<ChainInfo> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      return await rpc<ChainInfo>('getblockchaininfo')
    } catch (error) {
      lastError = error
      await new Promise(resolve => setTimeout(resolve, 1_000))
    }
  }
  throw new Error(`Teranode RPC did not recover: ${String(lastError)}`)
}

async function waitForRecoveredChain(expected: ChainInfo, txid: string, hex: string, timeoutMs = 180_000): Promise<ChainInfo> {
  const deadline = Date.now() + timeoutMs
  let last = 'no response'
  while (Date.now() < deadline) {
    try {
      const chain = await rpc<ChainInfo>('getblockchaininfo')
      const transaction = await rpc<{ txid: string; hex: string }>('getrawtransaction', [txid, 1])
      last = `height=${chain.blocks}, hash=${chain.bestblockhash}, tx=${transaction.txid}`
      if (
        chain.blocks === expected.blocks &&
        chain.bestblockhash === expected.bestblockhash &&
        transaction.txid === txid &&
        transaction.hex === hex
      )
        return chain
    } catch (error) {
      last = String(error)
    }
    await new Promise(resolve => setTimeout(resolve, 1_000))
  }
  throw new Error(`Teranode chain did not recover before timeout: ${last}`)
}

async function waitForTip(expectedHash: string, timeoutMs = 60_000): Promise<ChainInfo> {
  const deadline = Date.now() + timeoutMs
  let last: ChainInfo | undefined
  while (Date.now() < deadline) {
    last = await rpc<ChainInfo>('getblockchaininfo')
    if (last.bestblockhash === expectedHash) return last
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`Teranode tip did not reach ${expectedHash}; current tip is ${last?.bestblockhash ?? 'unknown'}`)
}

function docker(...args: string[]): string {
  return execFileSync('docker', args, { cwd: runtime, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim()
}

function transitionToRunning(): void {
  const state = docker('exec', 'blockchain', 'teranode-cli', 'getfsmstate')
  if (!state.includes('RUNNING')) docker('exec', 'blockchain', 'teranode-cli', 'setfsmstate', '--fsmstate', 'RUNNING')
}

function readCompactSize(bytes: Uint8Array, offset: number): { value: number; next: number } {
  const prefix = bytes[offset]
  if (prefix === undefined) throw new Error('Truncated CompactSize')
  if (prefix < 0xfd) return { value: prefix, next: offset + 1 }
  const length = prefix === 0xfd ? 2 : prefix === 0xfe ? 4 : 8
  if (length === 8) throw new Error('CompactSize exceeds the supported test fixture range')
  if (offset + 1 + length > bytes.length) throw new Error('Truncated CompactSize')
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

function coinbaseFromTeranodeBlock(hex: string): Transaction {
  const bytes = Uint8Array.from(Buffer.from(hex, 'hex'))
  let cursor = 80
  const transactions = readCompactSize(bytes, cursor)
  cursor = transactions.next
  if (transactions.value < 1) throw new Error('Mined block did not contain a coinbase')
  const size = readCompactSize(bytes, cursor)
  cursor = size.next
  const subtrees = readCompactSize(bytes, cursor)
  cursor = subtrees.next + subtrees.value * 32
  const length = transactionLength(bytes, cursor)
  return Transaction.fromBinary(bytes.slice(cursor, cursor + length))
}

function buildSpend(
  source: Transaction,
  key: PrivateKey,
  outputSatoshis: number,
  lockingScript?: ReturnType<P2PKH['lock']>
): Promise<Transaction> {
  const transaction = new Transaction()
  transaction.addInput({
    sourceTransaction: source,
    sourceOutputIndex: 0,
    unlockingScriptTemplate: new P2PKH().unlock(key)
  })
  if (lockingScript === undefined) transaction.addP2PKHOutput(key.toAddress('testnet'), outputSatoshis)
  else transaction.addOutput({ satoshis: outputSatoshis, lockingScript })
  return transaction.sign().then(() => transaction)
}

async function main(): Promise<void> {
  transitionToRunning()
  const before = await waitForRpc()
  if (before.chain !== 'regtest') throw new Error(`Expected regtest, received ${before.chain}`)

  const key = PrivateKey.fromHex('01'.padStart(64, '0'))
  const address = key.toAddress('testnet')
  const fundingHeight = before.blocks + 1
  await rpc<string[]>('generatetoaddress', [101, address])
  const fundingBlock = await rpc<string>('getblockbyheight', [fundingHeight, 0])
  const source = coinbaseFromTeranodeBlock(fundingBlock)
  const sourceSatoshis = source.outputs[0]?.satoshis
  if (sourceSatoshis === undefined || sourceSatoshis <= 200)
    throw new Error('Unexpected regtest coinbase value')

  const clock = new DeterministicClock(1_800_000_000n)
  const random = new DeterministicBytes('tpnil-teranode-synthesis')
  const contentNetwork = new ReferenceCHIRPNetwork()
  const content = new CHIRPContentStore(contentNetwork)
  const author = createFixtureWallet(204)
  const issuer = createFixtureWallet(201)
  const infrastructurePayee = createFixtureWallet(202)
  const creatorPayee = createFixtureWallet(203)
  const lchServer = await ReferenceLCHServer.create({
    issuerWallet: issuer,
    publicBaseUrl: 'https://lch.tpnil.test',
    now: clock.now,
    random: length => random.take(length),
    content,
    payees: [
      {
        wallet: infrastructurePayee,
        satoshis: 3,
        dutyUid: 'urn:tpnil:duty:content-availability',
        interest: 'content-availability',
        label: 'content availability operator'
      },
      {
        wallet: creatorPayee,
        satoshis: 5,
        dutyUid: 'urn:tpnil:duty:creator',
        interest: 'creator',
        label: 'post creator'
      }
    ]
  })
  const imageBytes = referenceImage()
  const published = await lchServer.publish({ bytes: imageBytes, mediaType: 'image/png', name: 'tpnil-synthesis.png' })
  const assetId = toHex(published.assetId)
  const boardKey = `board/${assetId}`
  const post = await encodeBoardToken(author, {
    id: sha256Hex(`teranode-post:${assetId}`),
    key: boardKey,
    revision: 1,
    previous: null,
    createdAt: Number(clock.now()),
    body: 'TPNIL synthesis post',
    attachment: {
      assetId,
      lch: toBase64Url(published.lch),
      mediaType: 'image/png',
      plaintextSha256: sha256Hex(imageBytes)
    }
  })

  const accepted = new Transaction()
  accepted.addInput({
    sourceTransaction: source,
    sourceOutputIndex: 0,
    unlockingScriptTemplate: new P2PKH().unlock(key)
  })
  accepted.addOutput({ satoshis: 1, lockingScript: post.lockingScript })
  accepted.addP2PKHOutput(address, sourceSatoshis - 1_001)
  await accepted.sign()
  const acceptedHex = Buffer.from(accepted.toBinary()).toString('hex')
  const acceptedTxid = await rpc<string>('sendrawtransaction', [acceptedHex])
  if (acceptedTxid !== accepted.id('hex')) throw new Error('Teranode returned a different transaction ID')

  const conflict = await buildSpend(source, key, sourceSatoshis - 2_000)
  let conflictRejection: { code: number; message: string } | undefined
  try {
    await rpc<string>('sendrawtransaction', [Buffer.from(conflict.toBinary()).toString('hex')])
  } catch (error) {
    if (error instanceof RpcFailure) conflictRejection = { code: error.code, message: error.message }
    else throw error
  }
  if (conflictRejection === undefined) throw new Error('Teranode accepted a conflicting spend')

  const mempool = await rpc<string[]>('getrawmempool')
  if (!mempool.includes(acceptedTxid)) throw new Error('Accepted transaction was absent from the mempool')
  const postBlock = (await rpc<string[]>('generate', [1]))[0]
  if (postBlock === undefined) throw new Error('Teranode did not return the post block hash')
  const mempoolAfterMining = await rpc<string[]>('getrawmempool')
  if (mempoolAfterMining.includes(acceptedTxid)) throw new Error('Mined transaction remained in the mempool')
  const mined = await rpc<{ txid: string; hex: string }>('getrawtransaction', [acceptedTxid, 1])
  if (mined.txid !== acceptedTxid || mined.hex !== acceptedHex) throw new Error('Mined transaction retrieval diverged')
  const decodedPost = await decodeAndVerifyBoardToken(Transaction.fromHex(mined.hex).outputs[0]!.lockingScript)
  if (decodedPost.key !== boardKey || decodedPost.attachment.assetId !== assetId)
    throw new Error('Mined board record did not match the submitted post')

  clock.advance(1n)
  const updateToken = await encodeBoardToken(author, {
    id: sha256Hex(`teranode-update:${acceptedTxid}`),
    key: boardKey,
    revision: 2,
    previous: `${acceptedTxid}:0`,
    createdAt: Number(clock.now()),
    body: 'TPNIL synthesis post (verified)',
    attachment: post.record.attachment
  })
  const update = new Transaction()
  update.addInput({
    sourceTransaction: accepted,
    sourceOutputIndex: 0,
    unlockingScriptTemplate: new PushDrop(author).unlock(
      BOARD_PROTOCOL,
      post.record.id,
      'anyone',
      'all',
      false,
      1,
      post.lockingScript
    )
  })
  update.addOutput({ satoshis: 1, lockingScript: updateToken.lockingScript })
  await update.sign()
  const updateHex = Buffer.from(update.toBinary()).toString('hex')
  const updateTxid = await rpc<string>('sendrawtransaction', [updateHex])
  if (updateTxid !== update.id('hex')) throw new Error('Teranode returned a different update transaction ID')
  const updateBlock = (await rpc<string[]>('generate', [1]))[0]
  if (updateBlock === undefined) throw new Error('Teranode did not return the update block hash')
  await waitForTip(updateBlock)
  const minedUpdate = await rpc<{ txid: string; hex: string }>('getrawtransaction', [updateTxid, 1])
  const decodedUpdate = await decodeAndVerifyBoardToken(Transaction.fromHex(minedUpdate.hex).outputs[0]!.lockingScript)
  if (decodedUpdate.revision !== 2 || decodedUpdate.previous !== `${acceptedTxid}:0`)
    throw new Error('Mined board update did not preserve token-spend semantics')

  let proofAcquisition: { available: true; proofSha256: string } | { available: false; rpcError: string }
  try {
    const proof = await rpc<string>('gettxoutproof', [[updateTxid], updateBlock])
    const proofTxids = await rpc<string[]>('verifytxoutproof', [proof])
    if (!proofTxids.includes(updateTxid)) throw new Error('Teranode did not verify its transaction proof')
    proofAcquisition = { available: true, proofSha256: sha256Hex(Buffer.from(proof, 'hex')) }
  } catch (error) {
    if (!(error instanceof RpcFailure) || error.message !== 'Command unimplemented') throw error
    proofAcquisition = { available: false, rpcError: error.message }
  }

  const beforeRestart = await waitForTip(updateBlock)
  docker('compose', 'restart')
  await waitForRpc()
  transitionToRunning()
  const afterRestart = await waitForRecoveredChain(beforeRestart, updateTxid, updateHex)

  const image = JSON.parse(docker('image', 'inspect', manifest.image.reference))[0] as {
    Id: string
    Architecture: string
    Os: string
    RepoDigests?: string[]
  }
  const result = {
    schema: 'tpnil-teranode-probe-result@1.0.0',
    claim: 'TERANODE_REGTEST_RUNTIME_QUALIFICATION',
    outcome: 'PASS',
    completedAt: new Date().toISOString(),
    profile: manifest.profile,
    profileSha256: manifest.profileSha256,
    source: manifest.source,
    image: {
      configuredReference: manifest.image.reference,
      configuredIndexDigest: manifest.image.indexDigest,
      localId: image.Id,
      localRepoDigests: image.RepoDigests ?? [],
      platform: `${image.Os}/${image.Architecture}`
    },
    assertions: {
      regtest_boundary: true,
      controlled_coinbase_matured: true,
      signed_p2pkh_spend_accepted: true,
      conflicting_spend_rejected: true,
      accepted_transaction_mined: true,
      accepted_transaction_removed_from_mempool: true,
      lch_linked_pushdrop_post_mined_and_verified: true,
      pushdrop_token_spent_by_revision_update: true,
      full_stack_restart_recovered_chain_and_transaction: true
    },
    evidence: {
      startingHeight: before.blocks,
      fundingHeight,
      sourceTxid: source.id('hex'),
      sourceSatoshis,
      acceptedTxid,
      acceptedTransactionSha256: sha256Hex(Buffer.from(acceptedHex, 'hex')),
      acceptedFeeSatoshis: accepted.getFee(),
      assetId,
      lchSha256: sha256Hex(published.lch),
      boardKey,
      postBlock,
      updateTxid,
      updateTransactionSha256: sha256Hex(Buffer.from(updateHex, 'hex')),
      updateBlock,
      conflictTxid: conflict.id('hex'),
      conflictRejection,
      proofAcquisition,
      finalHeight: afterRestart.blocks,
      finalBestBlockHash: afterRestart.bestblockhash
    }
  }
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${canonicalJson(result)}\n`)
  process.stdout.write(`${canonicalJson(result)}\n`)
}

await main()
