import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { LookupResolver, PrivateKey } from '@bsv/sdk'
import { ControlledWalletServices } from './services.js'
import { createFixtureWallet } from '../storage-sync/fixture-wallet.js'
import { runWalletBoundaryCorpus, type BoundaryWallet } from './boundary-corpus.js'

const root = path.resolve(import.meta.dirname, '../../..')
const [target, storage = 'typescript'] = process.argv.slice(2)
if (!target || !['typescript', 'go'].includes(storage)) throw new Error('Usage: run-boundary.ts OUTPUT typescript|go')
const output = path.resolve(target)
if (fs.existsSync(path.join(output, 'result.json'))) throw new Error('Immutable output already exists')
fs.mkdirSync(output, { recursive: true })
const hash = (filename: string) => createHash('sha256').update(fs.readFileSync(filename)).digest('hex')
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-boundary-'))
fs.writeFileSync(path.join(temp, 'index.html'), '<title>TPNIL boundary corpus</title>')
const services = new ControlledWalletServices({ webroot: temp, components: { storage: storage as 'typescript' | 'go' }, ...(storage === 'go' ? { go: { binary: path.join(root, 'out/itcve-go-storage-sync'), storageSyncPatch: true } } : {}) })
const integration = createRequire(path.join(root, 'integrations/services/package.json'))
const { MongoMemoryReplSet } = integration('mongodb-memory-server')
const overlayModule = path.join(root, 'integrations/services/src/overlay.ts')
const identityModule = path.join(root, 'integrations/services/src/identity.ts')
const { startOverlayNode } = await import(overlayModule)
const { publishIdentityCertificate } = await import(identityModule)
let mongo: any, overlay: any, wallet: Awaited<ReturnType<typeof createFixtureWallet>> | undefined, funder: typeof wallet
let corpus: any, failure: unknown, publication: unknown
const cleanup: Array<{ name: string; closed: boolean; error?: string }> = []
const lookupTrace: unknown[] = []
try {
  await services.start()
  await services.fundRemoteWalletFromTeranode('77'.repeat(32), JSON.parse(fs.readFileSync(path.join(root, 'fixtures/teranode/wab-funding-v1.json'), 'utf8')))
  funder = await createFixtureWallet(services, '77'.repeat(32)); wallet = await createFixtureWallet(services, '79'.repeat(32))
  const binary: Record<string, string> = { version: process.env.TPNIL_MONGO_VERSION ?? '8.0.16' }
  if (process.env.TPNIL_MONGOD) binary.systemBinary = process.env.TPNIL_MONGOD
  mongo = await MongoMemoryReplSet.create({ binary, replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' } })
  overlay = await startOverlayNode({ directory: path.join(temp, 'overlay'), name: `boundary_${process.pid}`, mongoUri: mongo.getUri(), tracker: {
    currentHeight: async () => 900_100,
    findHeaderForHeight: async (height: number) => services.headers.get(height),
    isValidRootForHeight: async (merkleRoot: string, height: number) => services.headers.get(height)?.merkleRoot === merkleRoot
  } })
  services.registerOverlayLookup(overlay.origin, ['ls_identity'])
  wallet.lookupResolver = new LookupResolver({ slapTrackers: ['https://overlay.itcve.test'], facilitator: { lookup: async (origin, question) => {
    if (origin !== 'https://overlay.itcve.test') throw new Error(`Unexpected lookup origin: ${origin}`)
    const response = await fetch(`${overlay.origin}/lookup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(question), signal: AbortSignal.timeout(15000), redirect: 'error' })
    const answer = await response.json(); lookupTrace.push({ origin, question, status: response.status, answer })
    if (!response.ok) throw new Error(`Identity lookup HTTP ${response.status}`)
    return answer as any
  } } }) as unknown as NonNullable<typeof wallet>['lookupResolver']
  corpus = await runWalletBoundaryCorpus({ wallet: wallet as unknown as BoundaryWallet, funder: funder as unknown as BoundaryWallet, prepareDiscovery: async certificate => {
    const settings = await wallet!.settingsManager.get()
    settings.trustSettings.trustedCertifiers.push({ identityKey: PrivateKey.fromHex('36'.repeat(32)).toPublicKey().toString(), name: 'TPNIL controlled issuer', description: 'Pinned boundary fixture certifier', trust: 4 })
    await wallet!.settingsManager.set(settings)
    publication = await publishIdentityCertificate({ wallet, origin: overlay.origin, certificate })
  } })
} catch (error) { failure = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error) }
finally {
  for (const [name, close] of [['wallet', () => wallet?.destroy()], ['funder', () => funder?.destroy()], ['overlay', () => overlay?.close()], ['mongo', () => mongo?.stop()], ['services', () => services.close()]] as Array<[string, () => unknown]>) {
    try { await close(); cleanup.push({ name, closed: true }) } catch (error) { cleanup.push({ name, closed: false, error: String(error) }) }
  }
  fs.rmSync(temp, { recursive: true, force: true })
}
fs.writeFileSync(path.join(output, 'observations.json'), JSON.stringify({ corpus, publication, lookupTrace, failure, components: services.componentIdentity, cleanup }, null, 2) + '\n')
fs.copyFileSync(path.join(root, 'programs/ISI-4/profiles/brc100-boundary-1.0.0/coverage.json'), path.join(output, 'coverage.json'))
const assertions = [...(corpus?.assertions ?? []), ...(failure ? [{ id: 'execution', result: 'FAIL', detail: JSON.stringify(failure) }] : []), { id: 'cleanup', result: cleanup.every(x => x.closed) ? 'PASS' : 'FAIL', detail: 'All clients, services, Mongo process and temporary databases closed and removed.' }]
const result = { schema: 'tpnil-wallet-boundary-run@1.0.0', claim: 'ENGINEERING_OBSERVATION_ONLY', components: { storage, wallet: '@bsv/wallet-toolbox@2.13.0', identity: 'real-identity-services' }, assertions,
  evidence: ['observations.json', 'coverage.json'].map(name => ({ path: name, sha256: hash(path.join(output, name)) })), cleanup, result: assertions.every(x => x.result === 'PASS') ? 'PASS' : 'FAIL', completeBRC100Conformance: false }
fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
