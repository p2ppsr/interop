import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { PrivateKey, ProtoWallet } from '@bsv/sdk'
import { expect, it } from 'vitest'
import { ControlledWalletServices } from '../src/wallet-lab/services.js'
import { createFixtureWallet } from '../src/storage-sync/fixture-wallet.js'
import { runWalletBoundaryCorpus } from '../src/wallet-lab/boundary-corpus.js'
import { clauseCrypto } from '../src/wallet-lab/native/conformance-clauses-model.js'
import { runNativeCoverageExtension } from '../src/wallet-lab/native/coverage-extension-driver.js'
import { verifyNativeCoverageExtension } from '../src/wallet-lab/native/coverage-extension-verifier.js'
import type { CoverageExtensionReport } from '../src/wallet-lab/native/coverage-extension-model.js'

// Explicit prepared-Go engineering test. Default tests replay the exact retained
// real reference. Neither path claims native execution.
it.skipIf(process.env.TPNIL_TEST_COVERAGE_EXTENSION_GO !== '1')('executes all73 public requests against the actual TS wallet and authenticated Go storage', async () => {
  const root = path.resolve(import.meta.dirname, '../..'), directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'tpnil-coverage-extension-'))
  const retained = path.join(root, 'out/native-coverage-extension/go-test', `attempt-${Date.now()}`); fs.mkdirSync(retained, { recursive: true })
  const files = ['coverage-extension-model.ts', 'coverage-extension-requests.ts', 'coverage-extension-driver.ts', 'coverage-extension-verifier.ts'].map(file => `synthesis/src/wallet-lab/native/${file}`)
  files.push('programs/ISI-4/profiles/native-coverage-extension-1.0.0/policy.json', 'synthesis/package-lock.json', 'out/itcve-go-storage-native-contracts.json', 'infra/adapters/storage-native-contracts/patch.lock.json', 'synthesis/test/native-coverage-extension-go.test.ts')
  const capture = () => Object.fromEntries(files.map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]))
  const before = capture(); fs.writeFileSync(path.join(retained, 'source-before.json'), JSON.stringify(before, null, 2) + '\n')
  const started = Date.now(), errors: unknown[] = []
  let services: ControlledWalletServices | undefined, wallet: any, funder: any, report: CoverageExtensionReport | undefined
  try {
    services = new ControlledWalletServices({ webroot: directory, components: { storage: 'go' }, go: { binary: path.join(root, 'out/itcve-go-storage-native-contracts'), storageNativeContractsPatch: true, terminalRejectionReceipts: true } })
    await services.start(); await services.fundRemoteWalletFromTeranode('77'.repeat(32), JSON.parse(fs.readFileSync(path.join(root, 'fixtures/teranode/wab-funding-v1.json'), 'utf8')))
    funder = await createFixtureWallet(services, '77'.repeat(32)); wallet = await createFixtureWallet(services, '78'.repeat(32))
    const boundary = await runWalletBoundaryCorpus({ wallet, funder, fixtureRevision: 2, headerFixture: 'tpnil-native-controlled-header@1.0.0' })
    const identity = (await wallet.getPublicKey({ identityKey: true })).publicKey, peer = new ProtoWallet(PrivateKey.fromHex(clauseCrypto.peerKey))
    const context = { protocolID: clauseCrypto.protocolID, keyID: clauseCrypto.keyID, counterparty: (await peer.getPublicKey({ identityKey: true })).publicKey }
    const clauses: any = { identity, trace: [] }
    const call = async (id: string, method: string, args: any) => { const row: any = { id, method, args }; clauses.trace.push(row); try { row.result = await wallet[method](args) } catch (error: any) { row.error = { name: error.name, message: error.message } } }
    await call('crypto.ecdsa.direct-hash', 'createSignature', { ...context, hashToDirectlySign: [...createHash('sha256').update(Buffer.from(clauseCrypto.data)).digest()] })
    const signed: any = boundary.trace.find((row: any) => row.method === 'createSignature')
    await call('control.input.verifySignature.hashToDirectlyVerify.0', 'verifySignature', { protocolID: [0, 'tpnil boundary corpus'], keyID: '1', counterparty: 'anyone', forSelf: true, signature: signed.result.signature, hashToDirectlyVerify: [...createHash('sha256').update(Buffer.from(signed.args.data)).digest()] })
    report = await runNativeCoverageExtension({ wallet, funder, services, boundaryReport: boundary, clauseReport: clauses, observationRevision: 1, evidence: { addJson(name, value) { const target = path.join(retained, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, JSON.stringify(value, null, 2) + '\n') } } })
  } catch (error) { errors.push(error) }
  finally {
    try { await wallet?.destroy() } catch (error) { errors.push(error) }
    try { await funder?.destroy() } catch (error) { errors.push(error) }
    try { await services?.close() } catch (error) { errors.push(error) }
    fs.rmSync(directory, { recursive: true, force: true })
    const after = capture(); fs.writeFileSync(path.join(retained, 'source-after.json'), JSON.stringify(after, null, 2) + '\n'); expect(after).toEqual(before)
  }
  if (errors.length) throw new AggregateError(errors, 'Real Go reference capture or cleanup failed')
  expect(report).toBeDefined()
  const result = await verifyNativeCoverageExtension(report!)
  expect(report!.trace).toHaveLength(73); expect(result.assertions).toHaveLength(61); expect(result.counts).toEqual({ PASS: 16, FAIL: 43, BLOCKED: 2 }); expect(result.transactions).toHaveLength(7)
  fs.writeFileSync(path.join(retained, 'receipt.json'), JSON.stringify({ claim: 'LAB_SELF_TEST_ONLY_NOT_NATIVE', elapsedMs: Date.now() - started, sourceStable: true, calls: report!.trace.length, counts: result.counts, signedTransactions: result.transactions.length }, null, 2) + '\n')
}, 90_000)
