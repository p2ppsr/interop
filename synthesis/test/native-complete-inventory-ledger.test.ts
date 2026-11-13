import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PrivateKey } from '@bsv/sdk'
import { expect, it } from 'vitest'
import { ControlledWalletServices } from '../src/wallet-lab/services.js'

// LAB_SELF_TEST_ONLY: injected provider responses exercise observer attribution,
// retention and copies. The separate gated suite starts the real prepared host.
const identity = PrivateKey.fromHex('1'.padStart(64, '0')).toPublicKey().toString()
async function fixture(run: (source: ControlledWalletServices, peer: ControlledWalletServices) => Promise<void>) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-complete-inventory-'))
  const services = ['11', '12'].map(key => new ControlledWalletServices({ webroot: directory, walletStorageRootKeyHex: key.repeat(32), components: { storage: 'go' }, go: { storageCallerKnownInputsPatch: true } }))
  for (const service of services) (service as any).goServices = {
    identity: { schema: 'SELFTEST_ONLY', provider: service.identityKey },
    certificateInventory: async (owner: string) => ({ schema: 'tpnil-native-certificate-inventory@1.0.0', identityKey: owner, providerIdentityKey: service.identityKey, certificates: [], fields: [] }),
    transactionKnowledgeInventory: async () => ({ schema: 'tpnil-native-transaction-knowledge-inventory@1.0.0', scope: 'PROVIDER_GLOBAL_ALL_STATUSES_ALL_USERS_INCLUDING_DELETED', providerIdentityKey: service.identityKey, knownCount: 0, transactionCount: 0, known: [], transactions: [] }),
    dispose: async () => {}, close: async () => {}
  }
  ;(services[0] as any).ownedStorageCounterparts.set('replacement-wallet.itcve.test', services[1])
  try { await run(services[0]!, services[1]!) }
  finally { await Promise.all(services.map(service => service.close())); fs.rmSync(directory, { recursive: true, force: true }) }
}
const methods = ['certificate', 'knowledge'] as const
const capture = (service: ControlledWalletServices, method: typeof methods[number]) => method === 'certificate' ? service.nativeCertificateInventories(identity) : service.nativeTransactionKnowledgeInventories()
const observations = (service: ControlledWalletServices, method: typeof methods[number]) => method === 'certificate' ? service.nativeCertificateInventoryObservations : service.nativeTransactionKnowledgeInventoryObservations
for (const method of methods) {
  it(`${method} captures all retained owned providers and defensive copies`, () => fixture(async source => {
    const result = await capture(source, method), ledger = observations(source, method)
    expect(result.providers.map(row => row.id)).toEqual(['source', 'source/replacement-wallet.itcve.test'])
    expect(ledger[0]!.registry.map(row => row.id)).toEqual(result.providers.map(row => row.id))
    expect(ledger[0]!.snapshots).toEqual(result)
    expect(Date.parse(ledger[0]!.startedAt)).toBeLessThanOrEqual(Date.parse(ledger[0]!.endedAt))
    result.providers.length = 0; ledger[0]!.registry.length = 0
    expect(observations(source, method)[0]!.snapshots!.providers).toHaveLength(2)
    expect(observations(source, method)[0]!.registry).toHaveLength(2)
  }))
  it(`${method} rejects a provider identity substitution without recording success`, () => fixture(async (source, peer) => {
    const stub = (peer as any).goServices, key = method === 'certificate' ? 'certificateInventory' : 'transactionKnowledgeInventory', original = stub[key]
    stub[key] = async (...args: unknown[]) => ({ ...await original(...args), providerIdentityKey: source.identityKey })
    await expect(capture(source, method)).rejects.toThrow()
    const row = observations(source, method)[0]!
    expect(row.error).toBeDefined(); expect(row.snapshots).toBeUndefined(); expect(row.registry).toHaveLength(2)
  }))
  it(`${method} rejects provider omission during an asynchronous cut`, () => fixture(async (source, peer) => {
    const stub = (peer as any).goServices, key = method === 'certificate' ? 'certificateInventory' : 'transactionKnowledgeInventory', original = stub[key]
    stub[key] = async (...args: unknown[]) => { (source as any).ownedStorageCounterparts.clear(); return original(...args) }
    await expect(capture(source, method)).rejects.toThrow(/registry changed/)
    expect(observations(source, method)[0]!.snapshots).toBeUndefined()
  }))
  it(`${method} retains exact thrown provider error and rejects duplicate ownership`, () => fixture(async (source, peer) => {
    const stub = (peer as any).goServices, key = method === 'certificate' ? 'certificateInventory' : 'transactionKnowledgeInventory'
    const error = new Error('controlled provider failure'); stub[key] = async () => { throw error }
    await expect(capture(source, method)).rejects.toBe(error)
    expect(observations(source, method)[0]!.error!.message).toBe(error.message)
    ;(source as any).ownedStorageCounterparts.set('duplicate.itcve.test', peer)
    await expect(capture(source, method)).rejects.toThrow(/Duplicate or cyclic/)
    expect(observations(source, method).map(row => row.sequence)).toEqual([0, 1])
  }))
}
