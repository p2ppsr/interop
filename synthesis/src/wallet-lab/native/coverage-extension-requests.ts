import { createCipheriv, createHash, createHmac } from 'node:crypto'
import { PrivateKey, ProtoWallet } from '@bsv/sdk'
import { extensionConfig as c, privilegedMethods, reasonVariants, basketVariants, extensionFixtureArgs, selectedCoverageExtensionPolicy, normalizedExtensionBasket, type CoverageExtensionReport } from './coverage-extension-model.js'
export function extensionCryptoEnvironment(identity: string) {
  const peer = new ProtoWallet(PrivateKey.fromHex(c.peerKey)), verifier = new ProtoWallet(PrivateKey.fromHex(c.verifierKey))
  const peerIdentity = PrivateKey.fromHex(c.peerKey).toPublicKey().toString(), verifierIdentity = PrivateKey.fromHex(c.verifierKey).toPublicKey().toString()
  const context = { protocolID: c.protocolID, keyID: c.keyID, counterparty: peerIdentity }
  const key = Buffer.from(peer.keyDeriver!.deriveSymmetricKey(c.protocolID, c.keyID, identity).toArray('be', 32))
  const iv = Buffer.alloc(32, 47), cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = [...Buffer.concat([iv, cipher.update(Buffer.from(c.data)), cipher.final(), cipher.getAuthTag()])]
  return { peer, verifier, peerIdentity, verifierIdentity, context, key, ciphertext, hash: [...createHash('sha256').update(Buffer.from(c.data)).digest()], hmac: [...createHmac('sha256', key).update(Buffer.from(c.data)).digest()], ownChild: peer.keyDeriver!.derivePublicKey(c.protocolID, c.keyID, identity, false), peerChild: peer.keyDeriver!.derivePublicKey(c.protocolID, c.keyID, identity, true) }
}
export function ordinaryExtensionArgs(report: CoverageExtensionReport): Record<string, any> {
  const e = extensionCryptoEnvironment(report.identity)
  return {
    getPublicKey: { ...e.context, forSelf: true },
    revealCounterpartyKeyLinkage: { counterparty: e.peerIdentity, verifier: e.verifierIdentity },
    revealSpecificKeyLinkage: { ...e.context, verifier: e.verifierIdentity },
    encrypt: { ...e.context, plaintext: c.data }, decrypt: { ...e.context, ciphertext: e.ciphertext },
    createHmac: { ...e.context, data: c.data }, verifyHmac: { ...e.context, data: c.data, hmac: e.hmac },
    createSignature: { ...e.context, hashToDirectlySign: e.hash },
    verifySignature: { ...e.context, data: c.data, signature: report.peerSignature, forSelf: false }
  }
}
export type ExtensionRequest = { id: string; actor: 'wallet' | 'funder'; method: string; args: any }
/** Fixed policy inputs, shared as data. Outcomes are independently recomputed. */
export function coverageExtensionRequests(report: CoverageExtensionReport): ExtensionRequest[] {
  const revision = selectedCoverageExtensionPolicy(report.oracle).revision
  const base = ordinaryExtensionArgs(report), requests: ExtensionRequest[] = []
  const put = (id: string, method: string, args: any, actor: 'wallet' | 'funder' = 'wallet') => requests.push({ id, actor, method, args })
  for (const method of privilegedMethods) {
    put(`ordinary.${method}`, method, base[method])
    for (const reason of reasonVariants) put(`privileged.${reason}.${method}`, method, { ...base[method], privileged: true, ...(reason === 'missing-reason' ? {} : { privilegedReason: reason === 'short-reason' ? 'abcd' : 'x'.repeat(51) }) })
  }
  const e = extensionCryptoEnvironment(report.identity), ownSignature = report.trace.find(r => r.id === 'ordinary.createSignature')?.result?.signature
  put('crypto.default-positive', 'verifySignature', { ...e.context, data: c.data, signature: report.peerSignature })
  put('crypto.default-negative', 'verifySignature', { ...e.context, data: c.data, signature: ownSignature ?? [] })
  put('crypto.missing-create', 'createSignature', e.context)
  put('crypto.missing-verify', 'verifySignature', { ...e.context, signature: report.peerSignature })
  put('crypto.identity-true', 'getPublicKey', { ...e.context, identityKey: true, forSelf: true })
  put('crypto.identity-false', 'getPublicKey', { ...e.context, identityKey: false, forSelf: true })
  put('fixture-native', 'createAction', extensionFixtureArgs('wallet', revision))
  put('fixture-external', 'createAction', extensionFixtureArgs('funder', revision), 'funder')
  const native = report.trace.find(r => r.id === 'fixture-native')?.result, external = report.trace.find(r => r.id === 'fixture-external')?.result
  if (!/^[a-f0-9]{64}$/.test(native?.txid ?? '') || !Array.isArray(native?.tx) || !/^[a-f0-9]{64}$/.test(external?.txid ?? '') || !Array.isArray(external?.tx)) return requests
  const inventory = { basket: c.validBasket, include: 'locking scripts', includeTags: true, includeCustomInstructions: true, limit: 100 }
  put('basket.before', 'listOutputs', inventory)
  if (revision >= 2) put('basket.normalized-before', 'listOutputs', { ...inventory, basket: normalizedExtensionBasket })
  for (const [index, variant] of basketVariants.entries()) put(`basket.${variant.id}.createAction`, 'createAction', { description: `TPNIL coverage basket ${variant.id}`, labels: [c.label], inputBEEF: native.tx, inputs: [{ outpoint: `${native.txid}.${index}`, unlockingScript: '51', inputDescription: 'Coverage isolated source' }], outputs: [{ satoshis: 2, lockingScript: '51', outputDescription: 'Coverage named output', basket: variant.value, tags: ['coverage created'], customInstructions: 'coverage:created' }], options: { randomizeOutputs: false, acceptDelayedBroadcast: false } })
  put('basket.after-create', 'listOutputs', inventory)
  if (revision >= 2) put('basket.normalized-after-create', 'listOutputs', { ...inventory, basket: normalizedExtensionBasket })
  for (const [index, variant] of basketVariants.entries()) put(`basket.${variant.id}.internalizeAction`, 'internalizeAction', { tx: external.tx, outputs: [{ outputIndex: index, protocol: 'basket insertion', insertionRemittance: { basket: variant.value, tags: [`coverage inserted ${index}`], customInstructions: `coverage:inserted:${index}` } }], labels: [c.label], description: `TPNIL coverage insertion ${variant.id}` })
  put('basket.after-internalize', 'listOutputs', inventory)
  if (revision >= 2) put('basket.normalized-after-internalize', 'listOutputs', { ...inventory, basket: normalizedExtensionBasket })
  for (const variant of basketVariants) put(`basket.${variant.id}.listOutputs`, 'listOutputs', { ...inventory, basket: variant.value })
  for (const [index, variant] of basketVariants.entries()) put(`basket.${variant.id}.relinquishOutput`, 'relinquishOutput', { basket: variant.value, output: `${native.txid}.${6 + index}` })
  put('basket.after-relinquish', 'listOutputs', inventory)
  if (revision >= 2) put('basket.normalized-after-relinquish', 'listOutputs', { ...inventory, basket: normalizedExtensionBasket })
  put('basket.sources-after', 'listOutputs', { basket: c.sourceBasket, include: 'locking scripts', includeTags: true, includeCustomInstructions: true, limit: 100 })
  return requests
}
