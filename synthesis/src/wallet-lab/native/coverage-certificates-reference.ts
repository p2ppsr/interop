import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

/** Real reference wallet/remote storage/authenticated HTTP/OverlayExpress fixture.
 * UI and native browser restart are deliberately unavailable, hence BLOCKED.
 * Run in an isolated process so SDK transport captures the controlled fetch. */
export async function captureCertificateCoverageReference(directory: string, storage: 'typescript' | 'go' = 'typescript') {
  const root = path.resolve(import.meta.dirname, '../../../..')
  if (fs.existsSync(path.join(directory, 'report.json'))) throw Error('Reference output is immutable')
  fs.mkdirSync(directory, { recursive: true })
  const sourceNames = [...fs.readdirSync(import.meta.dirname).filter(name => name.startsWith('coverage-certificates-')).map(name => `synthesis/src/wallet-lab/native/${name}`),
    'programs/ISI-4/profiles/native-coverage-certificates-1.0.0/policy.json', 'synthesis/package-lock.json', 'integrations/services/package-lock.json',
    'synthesis/src/wallet-lab/services.ts', 'synthesis/src/storage-sync/fixture-wallet.ts', 'synthesis/src/wallet-lab/certificate-fixture.ts', 'integrations/services/src/overlay.ts',
    'synthesis/src/wallet-lab/native/verify-identity-trust.ts', 'synthesis/src/wallet-lab/native/permission-click.ts', 'synthesis/src/wallet-lab/native/verify-transaction-state-bindings.ts',
    'fixtures/teranode/wab-funding-v1.json', ...(storage === 'go' ? ['out/itcve-go-storage-native-contracts.json'] : [])]
  const hashes = () => Object.fromEntries(sourceNames.map(name => [name, createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex')]))
  const before = hashes(); for (const name of sourceNames) { const target = path.join(directory, 'source', name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(root, name), target) }; fs.writeFileSync(path.join(directory, 'source-before.json'), JSON.stringify(before, null, 2) + '\n')
  const originalFetch = globalThis.fetch; let services: any, wallet: any, overlay: any, mongo: any
  globalThis.fetch = (async (input: any, init: any) => {
    const url = String(input)
    if (!url.startsWith('https://certifier.itcve.test/')) return originalFetch(input, init)
    return new Promise((resolve, reject) => {
      const req = http.request(url.replace('https://certifier.itcve.test', services.serviceUrl), { method: init?.method, headers: { ...Object.fromEntries(new Headers(init?.headers)), host: 'certifier.itcve.test' } }, response => {
        const chunks: Buffer[] = []; response.on('data', chunk => chunks.push(Buffer.from(chunk)))
        response.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode, headers: response.headers as any })))
      }); req.on('error', reject); req.end(init?.body)
    })
  }) as typeof fetch
  try {
    const { ControlledWalletServices } = await import('../services.js')
    const { createFixtureWallet } = await import('../../storage-sync/fixture-wallet.js')
    const { LookupResolver, PrivateKey, ProtoWallet, Transaction } = await import('@bsv/sdk')
    const { issueFixtureCertificateForSubject } = await import('../certificate-fixture.js')
    const { WalletSettingsManager } = await import('@bsv/wallet-toolbox')
    const { runCertificateCoverage } = await import('./coverage-certificates-run.js')
    const { verifyCertificateCoverage } = await import('./coverage-certificates-verify.js')
    const integration = createRequire(path.join(root, 'integrations/services/package.json'))
    const { MongoMemoryReplSet } = integration('mongodb-memory-server')
    const { startOverlayNode } = await import(path.join(root, 'integrations/services/src/overlay.ts'))
    services = new ControlledWalletServices({ webroot: directory, components: { storage }, ...(storage === 'go' ? { go: { binary: path.join(root, 'out/itcve-go-storage-native-contracts'), storageNativeContractsPatch: true, terminalRejectionReceipts: true } } : {}) })
    await services.start()
    await services.fundRemoteWalletFromTeranode('77'.repeat(32), JSON.parse(fs.readFileSync(path.join(root, 'fixtures/teranode/wab-funding-v1.json'), 'utf8')))
    wallet = await createFixtureWallet(services, '77'.repeat(32))
    const baseline = await issueFixtureCertificateForSubject(new ProtoWallet(PrivateKey.fromHex('84'.repeat(32))), (await wallet.getPublicKey({ identityKey: true })).publicKey,
      { name: 'Existing certificate retained across coverage' }, Buffer.alloc(32, 175).toString('base64'), async () => `${JSON.parse(fs.readFileSync(path.join(root, 'fixtures/teranode/wab-funding-v1.json'), 'utf8')).txid}.0`, Buffer.alloc(32, 176).toString('base64'))
    await wallet.acquireCertificate({ ...baseline, acquisitionProtocol: 'direct', keyringRevealer: 'certifier', keyringForSubject: baseline.masterKeyring })
    const originalSettings = new WalletSettingsManager(wallet); const original = await originalSettings.get(); original.theme = { ...original.theme, mode: 'light' }; await originalSettings.set(original)
    mongo = await MongoMemoryReplSet.create({ binary: { version: '8.0.16', ...(process.env.TPNIL_MONGOD ? { systemBinary: process.env.TPNIL_MONGOD } : {}) }, replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' } })
    overlay = await startOverlayNode({ directory: path.join(directory, 'overlay'), name: `certificates_${process.pid}`, mongoUri: mongo.getUri(), tracker: {
      currentHeight: async () => 900100, findHeaderForHeight: async (height: number) => services.headers.get(height), isValidRootForHeight: async (value: string, height: number) => services.headers.get(height)?.merkleRoot === value
    } })
    let resolver: any, originalResolver: any
    const publicWallet = new Proxy({}, { get: (_target, method) => typeof method !== 'string' || method === 'then' ? undefined : (...args: any[]) => wallet[method](...args) })
    const report = await runCertificateCoverage({ wallet: publicWallet, services, evidence: { addJson: () => {} }, overlayOrigin: overlay.origin,
      hooks: {
        async installLookup(answer) {
          originalResolver = wallet.lookupResolver
          resolver = new LookupResolver({ hostOverrides: { ls_identity: ['https://overlay.itcve.test'] }, facilitator: { lookup: async (_origin, question) => answer(question) } })
          wallet.lookupResolver = resolver
          return async () => { wallet.lookupResolver = originalResolver }
        },
        async restart() {
          const identityBefore = (await wallet.getPublicKey({ identityKey: true })).publicKey
          await wallet.destroy(); wallet = await createFixtureWallet(services, '77'.repeat(32)); wallet.lookupResolver = resolver
          const identityAfter = (await wallet.getPublicKey({ identityKey: true })).publicKey
          return { kind: 'REFERENCE_CLIENT_REOPEN', receipt: { identityBefore, identityAfter, sameAuthenticatedStorageUrl: services.storageUrl } }
        }
      } })
    fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n')
    const verification = await verifyCertificateCoverage(report)
    fs.writeFileSync(path.join(directory, 'verification.json'), JSON.stringify({ claim: 'LAB_SELF_TEST_ONLY', actualNative: false, storage, components: services.componentIdentity, calls: report.trace.length, ...verification }, null, 2) + '\n')
    fs.writeFileSync(path.join(directory, 'parent-ledgers.json'), JSON.stringify({ identity: report.identity, storageBinding: storage === 'go' ? 'INDEPENDENT_GO_CONTROL_DATABASE' : 'REFERENCE_PUBLIC_RESPONSES_ONLY', storageTransactions: storage === 'go' ? await services.nativeTransactions() : report.trace.filter(row => ['createAction', 'signAction'].includes(row.method) && row.result?.tx).map(row => ({ txid: row.result.txid, rawTxHex: Transaction.fromAtomicBEEF(row.result.tx).toHex() })), globalRoutes: services.routes, globalSubmissions: services.submissions.map((value: any) => ({ txid: value.txid, beefHex: Buffer.from(value.bytes).toString('hex'), verdict: value.verdict })) }, null, 2) + '\n')
    return verification
  } finally {
    const failures = []
    for (const close of [() => wallet?.destroy(), () => overlay?.close(), () => mongo?.stop(), () => services?.close()]) try { await close() } catch (error) { failures.push(String(error)) }
    globalThis.fetch = originalFetch
    const after = hashes(); fs.writeFileSync(path.join(directory, 'source-after.json'), JSON.stringify(after, null, 2) + '\n')
    if (JSON.stringify(before) !== JSON.stringify(after)) failures.push('Source changed during reference capture')
    fs.writeFileSync(path.join(directory, 'cleanup.json'), JSON.stringify({ failures }, null, 2) + '\n')
    if (failures.length) throw Error(failures.join('; '))
  }
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = process.argv[2]; if (!directory) throw Error('Expected unique output directory')
  const storage = process.argv[3] ?? 'typescript'; if (!['typescript', 'go'].includes(storage)) throw Error('Unknown reference storage')
  console.log(JSON.stringify(await captureCertificateCoverageReference(path.resolve(directory), storage as 'typescript' | 'go')))
}
