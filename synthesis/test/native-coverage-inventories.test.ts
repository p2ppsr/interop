import { expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { PrivateKey } from '@bsv/sdk'
import { assertCertificateInventoryIdentity, validateNativeCertificateInventory } from '../src/wallet-lab/native-certificate-inventory.js'
import { assertTransactionKnowledgeProvider, validateNativeTransactionKnowledgeInventory } from '../src/wallet-lab/native-transaction-knowledge-inventory.js'
const identity = PrivateKey.fromHex('78'.repeat(32)).toPublicKey().toString(), provider = PrivateKey.fromHex('11'.repeat(32)).toPublicKey().toString()
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const certificates = () => ({ schema: 'tpnil-native-certificate-inventory@1.0.0', identityKey: identity, providerIdentityKey: provider,
  certificates: [{ id: 1, userId: 2, createdAt: null, updatedAt: 'raw timestamp', deletedAt: 'deleted', type: 'malformed retained', serialNumber: null, certifier: 'wrong-certifier', subject: 'wrong-subject', verifier: null, revocationOutpoint: null, signature: 'malformed' }],
  fields: [{ certificateId: 1, userId: 2, createdAt: null, updatedAt: null, fieldName: 'name', fieldValue: null, masterKeySha256: digest(Buffer.from('raw fixture key bytes')) }] })
const blob = (hex: string | null) => hex === null ? { present: false, bytes: 0, sha256: null, hex: null } : { present: true, bytes: hex.length / 2, sha256: digest(Buffer.from(hex, 'hex')), hex }
const knowledge = () => ({ schema: 'tpnil-native-transaction-knowledge-inventory@1.0.0', scope: 'PROVIDER_GLOBAL_ALL_STATUSES_ALL_USERS_INCLUDING_DELETED', providerIdentityKey: provider, knownCount: 1, transactionCount: 2,
  known: [{ txid: '12'.repeat(32), status: 'failed', createdAt: null, updatedAt: null, rawTx: blob(null), inputBEEF: blob('') }],
  transactions: [{ id: 1, userId: 2, txid: null, status: 'unsigned', deletedAt: 'deleted', inputBEEF: blob('00') }, { id: 2, userId: 3, txid: '12'.repeat(32), status: null, deletedAt: null, inputBEEF: blob(null) }] })
it('retains malformed/deleted certificate rows and raw-key hashes without inventing certificate validity', () => {
  const value = certificates(); expect(validateNativeCertificateInventory(value)).toBe(value)
  expect(() => assertCertificateInventoryIdentity(validateNativeCertificateInventory(value), identity, provider)).not.toThrow()
  expect(value.certificates[0]!.subject).toBe('wrong-subject')
})
it('retains provider-global NULL/empty bytes, deleted rows, unsigned IDs and other owners', () => {
  const value = knowledge(); expect(validateNativeTransactionKnowledgeInventory(value)).toBe(value)
  expect(() => assertTransactionKnowledgeProvider(validateNativeTransactionKnowledgeInventory(value), provider)).not.toThrow()
  expect(value.known[0]!.rawTx).not.toEqual(value.known[0]!.inputBEEF)
})
it('requires requested owner and provider identity separately from well-formed snapshots', () => {
  expect(() => assertCertificateInventoryIdentity(validateNativeCertificateInventory(certificates()), provider, provider)).toThrow()
  expect(() => assertCertificateInventoryIdentity(validateNativeCertificateInventory(certificates()), identity, identity)).toThrow()
  expect(() => assertTransactionKnowledgeProvider(validateNativeTransactionKnowledgeInventory(knowledge()), identity)).toThrow()
})
const certificateChanges: Record<string, (v: any) => void> = {
  schema: v => { v.schema += 'x' }, extra: v => { v.extra = true }, 'missing column': v => { delete v.certificates[0].deletedAt },
  'noncanonical owner': v => { v.identityKey = identity.toUpperCase() }, 'noncurve provider': v => { v.providerIdentityKey = '02' + 'ff'.repeat(32) },
  'duplicate certificate': v => { v.certificates.push(v.certificates[0]) }, 'mixed owner': v => { v.certificates.push({ ...v.certificates[0], id: 2, userId: 4 }) },
  orphan: v => { v.fields[0].certificateId = 3 }, 'cross-owner field': v => { v.fields[0].userId++ },
  'duplicate field': v => { v.fields.push(v.fields[0]) }, 'raw key exposure': v => { v.fields[0].masterKey = 'forbidden' },
  'missing field name': v => { v.fields[0].fieldName = null }, 'invalid UTF8': v => { v.fields[0].fieldValue = '\ud800' },
  'wrong key digest': v => { v.fields[0].masterKeySha256 = 'wrong' }, 'oversized text': v => { v.certificates[0].type = 'x'.repeat((1 << 20) + 1) },
  'row limit': v => { v.certificates = Array.from({ length: 2049 }, (_, i) => ({ ...v.certificates[0], id: i + 1 })) }
}
for (const [name, mutate] of Object.entries(certificateChanges)) it(`rejects certificate inventory ${name}`, () => { const value = certificates(); mutate(value); expect(() => validateNativeCertificateInventory(value)).toThrow() })
const knowledgeChanges: Record<string, (v: any) => void> = {
  scope: v => { v.scope = 'OWNER_ONLY' }, schema: v => { v.schema += 'x' }, 'count omission': v => { v.knownCount = 0 }, 'action omission': v => { v.transactions.pop() },
  'raw-NULL contradiction': v => { v.known[0].rawTx.hex = '' }, 'empty digest mismatch': v => { v.known[0].inputBEEF.sha256 = '00'.repeat(32) },
  'blob bytes mismatch': v => { v.transactions[0].inputBEEF.bytes++ }, 'uppercase bytes': v => { v.transactions[0].inputBEEF = blob('aa'); v.transactions[0].inputBEEF.hex = 'AA' },
  'duplicate known identity': v => { v.known.push(v.known[0]); v.knownCount++ }, 'duplicate row ID': v => { v.transactions[1].id = 1 },
  'missing owner': v => { v.transactions[0].userId = 0 }, 'malformed TXID': v => { v.transactions[1].txid = 'wrong' },
  'missing raw-NULL observation': v => { delete v.known[0].rawTx }, 'unsafe count': v => { v.knownCount = NaN },
  'extra row column': v => { v.transactions[0].hidden = true }, 'oversized blob': v => { v.transactions[0].inputBEEF = blob('00'.repeat((2 << 20) + 1)) },
  'aggregate text': v => { v.transactions = Array.from({ length: 5 }, (_, i) => ({ ...v.transactions[0], id: i + 1, status: 'x'.repeat(1 << 20) })); v.transactionCount = 5 }
}
for (const [name, mutate] of Object.entries(knowledgeChanges)) it(`rejects transaction knowledge ${name}`, () => { const value = knowledge(); mutate(value); expect(() => validateNativeTransactionKnowledgeInventory(value)).toThrow() })
