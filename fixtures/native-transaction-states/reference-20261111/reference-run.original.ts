import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { ControlledWalletServices } from '../../synthesis/src/wallet-lab/services.js'
import { createFixtureWallet } from '../../synthesis/src/storage-sync/fixture-wallet.js'
import { EvidenceBundle } from '../../synthesis/src/wallet-lab/evidence.js'
import { runNativeTransactionStates } from '../../synthesis/src/wallet-lab/native/conformance-transaction-states.js'
import { verifyNativeTransactionStates } from '../../synthesis/src/wallet-lab/native/verify-transaction-states.js'
const root = path.resolve(import.meta.dirname, '../..'), out = path.join(import.meta.dirname, `attempt-${Date.now()}`)
fs.mkdirSync(out)
const sources = ['synthesis/src/wallet-lab/native/conformance-transaction-states.ts', 'synthesis/src/wallet-lab/native/conformance-transaction-states-model.ts', 'synthesis/src/wallet-lab/native/verify-transaction-states.ts', 'programs/ISI-4/profiles/native-conformance-5.0.0/transaction-states-1.0.0.json', 'synthesis/package-lock.json', 'out/itcve-go-storage-native-contracts.json']
const capture = () => Object.fromEntries(sources.map(name => [name, createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex')]))
for (const file of fs.readdirSync(path.join(root, 'synthesis/src'), {recursive:true,withFileTypes:true})) if (file.isFile()) sources.push(path.relative(root,path.join(file.parentPath,file.name)))
const before = capture(); for (const name of Object.keys(before)) { const target=path.join(out,'source',name); fs.mkdirSync(path.dirname(target),{recursive:true}); fs.copyFileSync(path.join(root,name),target) }; fs.writeFileSync(path.join(out, 'source-before.json'), JSON.stringify(before, null, 2)+'\n')
const services = new ControlledWalletServices({ webroot: out, components: { storage: 'go' }, go: { binary: path.join(root, 'out/itcve-go-storage-native-contracts'), storageNativeContractsPatch: true, terminalRejectionReceipts: true } })
let wallet: any; const start = performance.now()
try {
  await services.start()
  await services.fundRemoteWalletFromTeranode('77'.repeat(32), JSON.parse(fs.readFileSync(path.join(root, 'fixtures/teranode/wab-funding-v1.json'), 'utf8')))
  wallet = await createFixtureWallet(services, '77'.repeat(32))
  const identity = await wallet.getPublicKey({ identityKey: true })
  const evidence = new EvidenceBundle(path.join(out, 'evidence'))
  const report = await runNativeTransactionStates({ wallet, services, evidence, boundaryReport: { trace: [{ method: 'getPublicKey', args: { identityKey: true }, result: identity }] } })
  evidence.flush()
  const result = await verifyNativeTransactionStates(report)
  fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify({ claim: 'LAB_SELF_TEST_ONLY', actualNative: false, verified: result.verified, assertionCount: result.assertionCount, counts: result.counts, calls: report.trace.length, signedTransactions: result.transactions.length, elapsedMs: performance.now()-start, assertions: report.assertions }, null, 2)+'\n')
  console.log(JSON.stringify({ out, counts: result.counts, calls: report.trace.length, elapsedMs: performance.now()-start }))
} finally { await wallet?.destroy(); await services.close(); const after = capture(); fs.writeFileSync(path.join(out, 'source-after.json'), JSON.stringify(after,null,2)+'\n'); if (JSON.stringify(before)!==JSON.stringify(after)) throw Error('Source changed during reference run') }
