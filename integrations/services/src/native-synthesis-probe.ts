import fs from 'node:fs/promises'
import path from 'node:path'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { ControlledWalletServices } from '../../../synthesis/src/wallet-lab/services.js'
import { createFixtureWallet } from '../../../synthesis/src/storage-sync/fixture-wallet.js'
import { runNativeSynthesis } from '../../../synthesis/src/wallet-lab/native/synthesis.js'

// Engineering check of the reusable public-wallet API flow; this is not a native-wallet qualification.
const output = path.resolve(process.argv[2] ?? 'out/native-synthesis-probe')
await fs.mkdir(output, { recursive: true })
if ((await fs.readdir(output)).length) throw new Error('Evidence directory must be empty')
const implementation = process.argv[3] ?? 'go'
if (!['go', 'typescript'].includes(implementation)) throw new Error('Expected go or typescript')
const mongo = await MongoMemoryReplSet.create({ binary: { version: process.env.TPNIL_MONGO_VERSION ?? '8.0.16', ...(process.env.TPNIL_MONGOD ? { systemBinary: process.env.TPNIL_MONGOD } : {}) }, replSet: { count: 1, ip: '127.0.0.1', storageEngine: 'wiredTiger' } })
process.env.TPNIL_GO_MONGO_URI = mongo.getUri()
const services = new ControlledWalletServices({ webroot: output, components: { overlay: implementation, chaintracks: implementation, storage: implementation }, ...(process.env.TPNIL_STORAGE_SYNC_PATCH === '1' ? { go: { binary: path.resolve('out/itcve-go-storage-sync'), storageSyncPatch: true } } : {}) })
let wallet: Awaited<ReturnType<typeof createFixtureWallet>> | undefined
try {
  await services.start()
  const funding = await services.fundRemoteWalletFromTeranode('77'.repeat(32), JSON.parse(await fs.readFile('fixtures/teranode/wab-funding-v1.json', 'utf8')))
  wallet = await createFixtureWallet(services, '77'.repeat(32))
  const result = await runNativeSynthesis(wallet, services, path.join(output, 'synthesis'))
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ ...result, interface: 'Toolbox public wallet API engineering check; not native', funding }, null, 2) + '\n')
  console.log(JSON.stringify(result))
} finally { await wallet?.destroy(); await services.close(); await mongo.stop({ doCleanup: true, force: false }) }
