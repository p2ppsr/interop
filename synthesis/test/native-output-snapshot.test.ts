import fs from 'node:fs'
import { LockingScript, PrivateKey, Transaction, UnlockingScript } from '@bsv/sdk'
import { expect, it } from 'vitest'
import { ControlledWalletServices } from '../src/wallet-lab/services.js'
import { validateNativeOutputSnapshot, type NativeOutputSnapshot } from '../src/wallet-lab/native-output-snapshot.js'

const identity = PrivateKey.fromHex('22'.repeat(32)).toPublicKey().toString()
const provider = PrivateKey.fromHex('11'.repeat(32)).toPublicKey().toString()
const transaction = new Transaction(1, [{ sourceTXID: 'ab'.repeat(32), sourceOutputIndex: 0, sequence: 0xffffffff, unlockingScript: UnlockingScript.fromHex('51') }], [{ satoshis: 7, lockingScript: LockingScript.fromHex('51') }], 0)
const sample = (): NativeOutputSnapshot => ({ schema: 'tpnil-native-output-snapshot@2.0.0', identityKey: identity, providerIdentityKey: provider, outputs: [{ outputId: 1, transactionId: 3, txid: transaction.id('hex'), rawTx: transaction.toHex(), outpoint: `${transaction.id('hex')}.0`, vout: 0, satoshis: 7, lockingScript: '51', spendable: true, basketName: 'owned basket', tags: ['alpha', 'beta'], customInstructions: 'customer metadata' }] })

it('validates exact signed bytes and preserves pending output metadata without inventing an outpoint', () => {
  const snapshot = sample(); validateNativeOutputSnapshot(snapshot, identity, provider)
  snapshot.outputs.push({ ...snapshot.outputs[0]!, outputId: 2, transactionId: 4, outpoint: null, txid: null, rawTx: null, basketName: null, customInstructions: null, tags: [] })
  expect(() => validateNativeOutputSnapshot(snapshot, identity, provider)).not.toThrow()
})
const mutations: Record<string, (s: NativeOutputSnapshot) => void> = {
  'wrong user': s => { s.identityKey = provider },
  'wrong provider': s => { s.providerIdentityKey = identity },
  'noncanonical key': s => { s.providerIdentityKey = '04' + '11'.repeat(64) },
  'foreign transaction': s => { s.outputs[0]!.txid = 'cd'.repeat(32) },
  'raw suffix': s => { s.outputs[0]!.rawTx += '00' },
  'amount mismatch': s => { s.outputs[0]!.satoshis = 8 },
  'script mismatch': s => { s.outputs[0]!.lockingScript = '52' },
  'missing index': s => { s.outputs[0]!.vout = 1 },
  'outpoint alias': s => { s.outputs[0]!.outpoint = `${transaction.id('hex')}.00` },
  'unsafe id': s => { s.outputs[0]!.outputId = Number.MAX_SAFE_INTEGER + 1 },
  'negative amount': s => { s.outputs[0]!.satoshis = -1 },
  'missing transaction identity': s => { s.outputs[0]!.transactionId = 0 },
  'duplicate output': s => { s.outputs.push(structuredClone(s.outputs[0]!)) },
  'duplicate outpoint': s => { s.outputs.push({ ...s.outputs[0]!, outputId: 2 }) },
  'duplicate tag': s => { s.outputs[0]!.tags = ['alpha', 'alpha'] },
  'tag order': s => { s.outputs[0]!.tags = ['beta', 'alpha'] },
  'invalid UTF8': s => { s.outputs[0]!.customInstructions = '\ud800' },
  'pending with claimed bytes': s => { s.outputs[0]!.txid = null },
  'unknown field': s => { (s.outputs[0] as any).unscopedOwner = true },
  'missing field': s => { delete (s.outputs[0] as any).basketName }
}
for (const [name, mutate] of Object.entries(mutations)) it(`rejects ${name}`, () => { const s = sample(); mutate(s); expect(() => validateNativeOutputSnapshot(s, identity, provider)).toThrow() })

it('collects every retained provider with independent identity and metadata without merging local IDs', async () => {
  const services = ['11', '12', '13'].map(key => new ControlledWalletServices({ webroot: '.', walletStorageRootKeyHex: key.repeat(32), components: { storage: 'go' } }))
  try {
    for (const service of services) (service as any).goServices = { identity: { fixture: true }, async outputSnapshot() { return { ...sample(), providerIdentityKey: service.identityKey } } }
    ;(services[0] as any).ownedStorageCounterparts.set('retired.itcve.test', services[1])
    ;(services[1] as any).ownedStorageCounterparts.set('replacement.itcve.test', services[2])
    const result = await services[0]!.nativeOutputSnapshots(identity)
    expect(result.providers.map(p => p.id)).toEqual(['source', 'source/retired.itcve.test', 'source/retired.itcve.test/replacement.itcve.test'])
    expect(result.providers.map(p => p.snapshot.providerIdentityKey)).toEqual(services.map(s => s.identityKey))
    expect(result.providers.map(p => p.snapshot.outputs[0]!.outputId)).toEqual([1, 1, 1])
    ;(services[2] as any).goServices.outputSnapshot = async () => sample()
    await expect(services[0]!.nativeOutputSnapshots(identity)).rejects.toThrow('provider differs')
    ;(services[2] as any).goServices.outputSnapshot = async () => ({ ...sample(), providerIdentityKey: services[2]!.identityKey })
    ;(services[2] as any).ownedStorageCounterparts.set('loop.itcve.test', services[0])
    await expect(services[0]!.nativeOutputSnapshots(identity)).rejects.toThrow('cyclic')
  } finally { for (const service of services) fs.rmSync(service.temporaryDirectory, { recursive: true, force: true }) }
})
