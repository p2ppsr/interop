import { LockingScript, PrivateKey, ProtoWallet, PushDrop, type WalletInterface } from '@bsv/sdk'
import { canonicalJson, utf8 } from './determinism.js'

export const BOARD_TOPIC = 'tm_tpnil_synthesis_board'
export const BOARD_PROTOCOL = [2, 'TPNIL synthesis board'] as [2, string]
const MAGIC = 'TPNIL_BOARD_V1'
const MAX_FIELD_BYTES = 480

export interface BoardAttachment {
  assetId: string
  lch: string
  mediaType: string
  plaintextSha256: string
}

export interface BoardRecord {
  schema: 'tpnil-board-record@1.0.0'
  id: string
  key: string
  revision: number
  previous: string | null
  author: string
  signingKey: string
  createdAt: number
  body: string
  attachment: BoardAttachment
}

export interface EncodedBoardToken {
  record: BoardRecord
  lockingScript: LockingScript
  lockingScriptHex: string
}

export function fixtureWallet(privateKey: number): ProtoWallet {
  return new ProtoWallet(new PrivateKey(privateKey))
}

export async function encodeBoardToken(
  wallet: WalletInterface,
  input: Omit<BoardRecord, 'schema' | 'author' | 'signingKey'>
): Promise<EncodedBoardToken> {
  const author = (await wallet.getPublicKey({ identityKey: true })).publicKey
  const signingKey = (
    await wallet.getPublicKey({
      protocolID: BOARD_PROTOCOL,
      keyID: input.id,
      counterparty: 'anyone',
      forSelf: true
    })
  ).publicKey
  const record: BoardRecord = {
    schema: 'tpnil-board-record@1.0.0',
    ...input,
    author,
    signingKey
  }
  validateRecord(record)
  const recordBytes = utf8(canonicalJson(record))
  const recordFields: number[][] = []
  for (let offset = 0; offset < recordBytes.length; offset += MAX_FIELD_BYTES)
    recordFields.push(Array.from(recordBytes.slice(offset, offset + MAX_FIELD_BYTES)))
  const fields = [Array.from(utf8(MAGIC)), ...recordFields]
  const lockingScript = await new PushDrop(wallet).lock(
    fields,
    BOARD_PROTOCOL,
    record.id,
    'anyone',
    true,
    true
  )
  return { record, lockingScript, lockingScriptHex: lockingScript.toHex() }
}

export async function decodeAndVerifyBoardToken(script: LockingScript | string): Promise<BoardRecord> {
  const lockingScript = typeof script === 'string' ? LockingScript.fromHex(script) : script
  const decoded = PushDrop.decode(lockingScript)
  if (decoded.fields.length < 3) throw new Error('Board token must contain record fields and one signature')
  const magicBytes = decoded.fields[0]!
  const signature = decoded.fields.at(-1)!
  const recordBytes = decoded.fields.slice(1, -1).flat()
  if (new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(magicBytes!)) !== MAGIC)
    throw new Error('Board token magic is invalid')
  const text = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(recordBytes!))
  const parsed: unknown = JSON.parse(text)
  validateRecord(parsed)
  if (canonicalJson(parsed) !== text) throw new Error('Board record is not canonically encoded')
  const record = parsed as BoardRecord
  const lockingKey = decoded.lockingPublicKey.toString()
  if (lockingKey !== record.signingKey) throw new Error('Board signing key does not match the token lock')
  await new ProtoWallet('anyone').verifySignature({
    protocolID: BOARD_PROTOCOL,
    keyID: record.id,
    counterparty: record.author,
    data: [...magicBytes, ...recordBytes],
    signature
  })
  return record
}

export function validateRecord(value: unknown): asserts value is BoardRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Board record must be an object')
  const record = value as Record<string, unknown>
  const expected = [
    'attachment',
    'author',
    'body',
    'createdAt',
    'id',
    'key',
    'previous',
    'revision',
    'schema',
    'signingKey'
  ]
  if (Object.keys(record).sort().join('\n') !== expected.join('\n'))
    throw new TypeError('Board record contains missing or unknown fields')
  if (record.schema !== 'tpnil-board-record@1.0.0') throw new TypeError('Unknown board schema')
  for (const key of ['id', 'key', 'author', 'signingKey', 'body'] as const) {
    if (typeof record[key] !== 'string' || record[key].length === 0)
      throw new TypeError(`Board field ${key} is invalid`)
  }
  if (!/^[0-9a-f]{64}$/u.test(record.id as string)) throw new TypeError('Board ID must be SHA-256 hex')
  if (!/^[0-9a-f]{66}$/u.test(record.author as string)) throw new TypeError('Board author key is invalid')
  if (!/^[0-9a-f]{66}$/u.test(record.signingKey as string)) throw new TypeError('Board signing key is invalid')
  if (!Number.isSafeInteger(record.createdAt) || (record.createdAt as number) < 0)
    throw new TypeError('Board creation time is invalid')
  if (!Number.isSafeInteger(record.revision) || (record.revision as number) < 1)
    throw new TypeError('Board revision is invalid')
  if (record.previous !== null && !/^[0-9a-f]{64}:[0-9]+$/u.test(String(record.previous)))
    throw new TypeError('Board previous outpoint is invalid')
  const attachment = record.attachment
  if (attachment === null || typeof attachment !== 'object' || Array.isArray(attachment))
    throw new TypeError('Board attachment is invalid')
  const item = attachment as Record<string, unknown>
  if (
    Object.keys(item).sort().join('\n') !==
    ['assetId', 'lch', 'mediaType', 'plaintextSha256'].join('\n')
  )
    throw new TypeError('Board attachment contains missing or unknown fields')
  if (!/^[0-9a-f]{64}$/u.test(String(item.assetId))) throw new TypeError('LCH Asset ID is invalid')
  if (!/^[0-9a-f]{64}$/u.test(String(item.plaintextSha256)))
    throw new TypeError('Attachment digest is invalid')
  if (typeof item.lch !== 'string' || item.lch.length === 0) throw new TypeError('LCH header is absent')
  if (typeof item.mediaType !== 'string' || item.mediaType.length === 0)
    throw new TypeError('Attachment media type is absent')
}
