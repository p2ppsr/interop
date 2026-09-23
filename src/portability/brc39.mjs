import { argon2, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// Independent file-envelope oracle. It does not import a wallet or Toolbox codec.
export const PROFILE = Object.freeze({ version: 1, passes: 7, memoryKiB: 131072, lanes: 1, saltBytes: 32, nonceBytes: 32, keyBytes: 32, tagBytes: 16 })
export const LIMITS = Object.freeze({ fileBytes: 64 * 1024 * 1024, passes: 14, memoryKiB: 262144, lanes: 4 })
function key(password, salt, passes, memoryKiB, lanes) {
  if (typeof password !== 'string') throw new TypeError('Passphrase must be a Unicode string')
  return new Promise((resolve, reject) => argon2('argon2id', { message: Buffer.from(password.normalize('NFC'), 'utf8'), nonce: salt, passes, memory: memoryKiB, parallelism: lanes, tagLength: 32 }, (error, bytes) => error ? reject(error) : resolve(bytes)))
}
export function inspectHeader(file) {
  if (!(file instanceof Uint8Array) || file.length < 113 || file.length > LIMITS.fileBytes) throw new Error('file-size')
  const bytes = Buffer.from(file.buffer, file.byteOffset, file.byteLength)
  if (!bytes.subarray(0, 4).equals(Buffer.from('WDAT'))) throw new Error('magic')
  if (!bytes.subarray(4, 11).equals(Buffer.from([1, 1, 38, 1, 0, 32, 32]))) throw new Error('unsupported-header')
  if (bytes[20] !== 32 || bytes.subarray(21, 33).some(byte => byte !== 0)) throw new Error('reserved-header')
  const passes = bytes.readUInt32BE(11), memoryKiB = bytes.readUInt32BE(15), lanes = bytes[19]
  if (passes < 1 || passes > LIMITS.passes || lanes < 1 || lanes > LIMITS.lanes || memoryKiB < 8 * lanes || memoryKiB > LIMITS.memoryKiB) throw new Error('kdf-resources')
  return { passes, memoryKiB, lanes, salt: bytes.subarray(33, 65), nonce: bytes.subarray(65, 97), ciphertext: bytes.subarray(97, -16), tag: bytes.subarray(-16) }
}
export async function decryptEnvelope(file, password) {
  const parsed = inspectHeader(file)
  const derived = await key(password, parsed.salt, parsed.passes, parsed.memoryKiB, parsed.lanes)
  try {
    const cipher = createDecipheriv('aes-256-gcm', derived, parsed.nonce, { authTagLength: 16 })
    cipher.setAuthTag(parsed.tag)
    return Buffer.concat([cipher.update(parsed.ciphertext), cipher.final()])
  } finally { derived.fill(0) }
}
export async function encryptEnvelope(plaintext, password, randomness = randomBytes) {
  if (!(plaintext instanceof Uint8Array) || plaintext.length + 113 > LIMITS.fileBytes) throw new Error('file-size')
  const salt = Buffer.from(randomness(32)), nonce = Buffer.from(randomness(32))
  if (salt.length !== 32 || nonce.length !== 32) throw new Error('randomness-size')
  const header = Buffer.alloc(97)
  header.write('WDAT'); header.set([1, 1, 38, 1, 0, 32, 32], 4)
  header.writeUInt32BE(PROFILE.passes, 11); header.writeUInt32BE(PROFILE.memoryKiB, 15)
  header[19] = PROFILE.lanes; header[20] = PROFILE.keyBytes; header.set(salt, 33); header.set(nonce, 65)
  const derived = await key(password, salt, PROFILE.passes, PROFILE.memoryKiB, PROFILE.lanes)
  try {
    const cipher = createCipheriv('aes-256-gcm', derived, nonce, { authTagLength: 16 })
    return Buffer.concat([header, cipher.update(plaintext), cipher.final(), cipher.getAuthTag()])
  } finally { derived.fill(0) }
}
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
}
export const categories = Object.freeze(['provenTxs', 'provenTxReqs', 'outputBaskets', 'transactions', 'commissions', 'outputs', 'outputTags', 'outputTagMaps', 'txLabels', 'txLabelMaps', 'certificates', 'certificateFields', 'syncStates'])
export function archiveProjection(bytes) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const document = JSON.parse(text)
  if (document.brc !== 38 || document.formatVersion !== 1 || !document.user?.identityKey || !document.sourceStorage?.chain) throw new Error('archive-profile')
  if (Object.keys(document.tables ?? {}).sort().join() !== [...categories].sort().join() || categories.some(name => !Array.isArray(document.tables[name]))) throw new Error('archive-categories')
  return { identity: document.user.identityKey, chain: document.sourceStorage.chain, counts: Object.fromEntries(categories.map(name => [name, document.tables[name].length])), canonical: canonicalJson(document) }
}
