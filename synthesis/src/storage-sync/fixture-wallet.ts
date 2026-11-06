import { CachedKeyDeriver, PrivateKey, type WalletInterface } from '@bsv/sdk'
import { Services, StorageClient, Wallet, WalletStorageManager } from '@bsv/wallet-toolbox'
import { serializeHeader, type ControlledWalletServices } from '../wallet-lab/services.js'

/** Actual Toolbox wallet with every transaction/chain service bound to this run. */
export async function createFixtureWallet(services: ControlledWalletServices, rootKeyHex: string, clientFactory: (wallet: WalletInterface, endpoint: string) => StorageClient = (wallet, endpoint) => new StorageClient(wallet, endpoint)): Promise<Wallet> {
  const keyDeriver = new CachedKeyDeriver(PrivateKey.fromHex(rootKeyHex))
  const storage = new WalletStorageManager(keyDeriver.identityKey)
  const dependencies = new Services('main')
  const wallet = new Wallet({ chain: 'main', keyDeriver: keyDeriver as unknown as ConstructorParameters<typeof Wallet>[0]['keyDeriver'], storage, services: dependencies })
  await storage.addWalletStorageProvider(clientFactory(wallet, services.storageUrl))
  await storage.makeAvailable()
  dependencies.options.chainTracker = {
    isValidRootForHeight: async (root: string, height: number) => services.headers.get(height)?.merkleRoot === root,
    currentHeight: async () => 900_100
  }
  dependencies.getHeaderForHeight = async height => {
    const header = services.headers.get(height)
    if (header === undefined) throw new Error(`Controlled header unavailable: ${height}`)
    return [...serializeHeader(header)]
  }
  dependencies.getHeight = async () => 900_100
  dependencies.postBeef = async (beef, txids) => txids.map(txid => {
    const bytes = Uint8Array.from(beef.toBinaryAtomic(txid))
    services.submissions.push({ txid, bytes, verdict: 'ACCEPTED_BY_NETWORK' })
    return { name: 'tpnil-controlled-submission', status: 'success' as const,
      txidResults: [{ txid, status: 'success' as const }] }
  })
  return wallet
}
