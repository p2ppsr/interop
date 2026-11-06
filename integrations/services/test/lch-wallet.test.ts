import test from 'node:test'
import assert from 'node:assert/strict'
import { PrivateKey, ProtoWallet, type WalletInterface } from '@bsv/sdk'
import { lchWalletBoundary } from '../../../synthesis/src/wallet-lab/native/lch-wallet.js'

test('LCH boundary derives the same real BRC-29 key on both sides and canonicalizes remittance', async () => {
  const a = new ProtoWallet(PrivateKey.fromHex('61'.repeat(32))), b = new ProtoWallet(PrivateKey.fromHex('62'.repeat(32)))
  let remittance: any
  const recipient = new Proxy(b, { get(target, name) { if (name === 'internalizeAction') return async (args: any) => { remittance = args.outputs[0].paymentRemittance; return { accepted: true } }; const value = Reflect.get(target, name); return typeof value === 'function' ? value.bind(target) : value } })
  const payer = lchWalletBoundary(a as unknown as WalletInterface), payee = lchWalletBoundary(recipient as unknown as WalletInterface)
  const prefix = Buffer.alloc(32, 251), suffix = Buffer.alloc(32, 255)
  const args = { protocolID: [2, '3241645161d8'] as [2, string], keyID: `${prefix.toString('base64url')} ${suffix.toString('base64url')}` }
  const senderIdentity = (await a.getPublicKey({ identityKey: true })).publicKey
  const keyA = await payer.getPublicKey({ ...args, counterparty: (await b.getPublicKey({ identityKey: true })).publicKey })
  const keyB = await payee.getPublicKey({ ...args, counterparty: senderIdentity, forSelf: true })
  assert.equal(keyA.publicKey, keyB.publicKey)
  await payee.internalizeAction({ tx: [], description: 'Boundary serialization test', outputs: [{ outputIndex: 0, protocol: 'wallet payment', paymentRemittance: { derivationPrefix: prefix.toString('base64url'), derivationSuffix: suffix.toString('base64url'), senderIdentityKey: senderIdentity } }] })
  assert.equal(remittance.derivationPrefix, prefix.toString('base64')); assert.equal(remittance.derivationSuffix, suffix.toString('base64'))
  const direct = await b.getPublicKey({ ...args, keyID: `${remittance.derivationPrefix} ${remittance.derivationSuffix}`, counterparty: senderIdentity, forSelf: true })
  assert.equal(direct.publicKey, keyA.publicKey)
  await assert.rejects(async () => payer.getPublicKey({ ...args, keyID: 'invalid invalid', counterparty: senderIdentity }))
})
