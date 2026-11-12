import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Beef, MerklePath, PushDrop, Transaction, Utils, type WalletInterface } from '@bsv/sdk'
import type { Page } from 'playwright'
import { ControlledWalletServices } from '../services.js'
import type { EvidenceBundle } from '../evidence.js'
import { nativeWalletBoundary } from './integrated.js'
import { ObservedStorageClient, readDataset, type Transcript } from '../../storage-sync/run.js'
import { projectDataset } from '../../storage-sync/projection.js'
import { projectDatasetWithReferenceOnlyRows } from '../../storage-sync/projection-reference-rows.js'
import { canonicalJson } from '../../determinism.js'
import { verifyPortableProofClosure } from './portability-proof.js'

export const portabilityAssertions = ['same-identity', 'distinct-counterparts', 'native-mediated-sync', 'complete-logical-dataset', 'source-unavailable', 'cold-wallet-reload', 'cold-task-recovery', 'replacement-redemption', 'cleanup'].map(id => `portability.${id}`)
const replacementHost = 'replacement-wallet.itcve.test'
const replacementUrl = `https://${replacementHost}`
export const portableTask = 'TPNIL native storage replacement'
const amount = 3
const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value))
async function until<T>(operation: () => Promise<T>, accept: (value: T) => boolean, timeout = 45_000, interval = 200): Promise<T> {
  const end = Date.now() + timeout
  do { const value = await operation(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, interval)) } while (Date.now() < end)
  throw new Error('Portability observation deadline exceeded')
}

/** Pending storage rows can precede the signed action response. Readiness needs
 * the complete public outpoint and its actual serialized output; all incomplete
 * observations remain in the caller's trace until the bounded poll succeeds. */
export function readyPortableTask(before: any, observed: any): { output: any; tx: Transaction } | undefined {
  if (!Array.isArray(observed?.outputs) || !Array.isArray(observed?.BEEF)) return
  const previous = new Set((before?.outputs ?? []).map((row: any) => row.outpoint))
  for (const output of observed.outputs) {
    if (output.satoshis !== amount || output.spendable !== true || previous.has(output.outpoint)) continue
    const match = typeof output.outpoint === 'string' ? /^([0-9a-f]{64})\.(0|[1-9][0-9]*)$/.exec(output.outpoint) : null
    if (!match || !Number.isSafeInteger(Number(match[2]))) continue
    try {
      const tx = Transaction.fromAtomicBEEF(Beef.fromBinary(observed.BEEF).toBinaryAtomic(match[1]!))
      const serialized = tx.outputs[Number(match[2])]
      if (tx.id('hex') !== match[1] || serialized?.satoshis !== amount) continue
      const token = PushDrop.decode(serialized.lockingScript)
      if (Utils.toUTF8(token.fields[0]!) !== '1ToDoDtKreEzbHYKFjmoBuduFmSXXUGZG' || !token.fields[1]?.length) continue
      return { output, tx }
    } catch { /* This public observation is not a complete serialized task yet. */ }
  }
}

/** A reserved input disappears before signAction finishes. Require its actual
 * signed spending transaction and complete retained ancestry before proceeding. */
export async function readyPortableRedemption(copy: any, outpoint: string) {
  const [txid, vout] = outpoint.split('.')
  const spent = copy.outputs.find((row: any) => row.txid === txid && row.vout === Number(vout))
  if (spent?.spendable !== false) return
  const spending = copy.transactions.find((row: any) => row.transactionId === spent.spentBy)
  if (!/^[0-9a-f]{64}$/.test(spending?.txid ?? '') || spending.status === 'unsigned') return
  const raw = spending.rawTx ?? copy.provenTxReqs.find((row: any) => row.txid === spending.txid)?.rawTx
  if (!Array.isArray(raw) || raw.length === 0) return
  const tx = Transaction.fromBinary(raw)
  if (tx.id('hex') !== spending.txid || !tx.inputs.some(input => input.sourceTXID === txid && input.sourceOutputIndex === Number(vout))) return
  const closure = await verifyPortableProofClosure(copy)
  if (!closure.verifiedTxids.includes(spending.txid)) return
  return { txid: tx.id('hex'), rawHex: tx.toHex(), transaction: spending }
}

export interface PortabilityControls {
  createTask(): Promise<void>
  addAndSync(url: string): Promise<void>
  activateAndRemoveSource(url: string): Promise<void>
  coldReload(): Promise<Record<string, unknown>>
  redeemTask(): Promise<void>
  /** Reference engineering only; native evidence comes from the browser proxy. */
  referenceTranscript?(): Transcript[]
}

/** Core operations are public wallet calls and authenticated RPC reads. Only the
 * wallet's own supported settings UI performs synchronization and replacement. */
export async function qualifyStoragePortability(options: {
  wallet: WalletInterface; source: ControlledWalletServices; destination: ControlledWalletServices
  controls: PortabilityControls; mode: 'native-ui' | 'reference-engineering'; proofOracle?: 'v2' | 'v3' | 'v4'
}) {
  const { wallet, source, destination, controls } = options
  const v4 = options.proofOracle === 'v4'
  const v3 = v4 || options.proofOracle === 'v3'
  const project = v4 ? projectDatasetWithReferenceOnlyRows : projectDataset
  const report: any = { schema: v4 ? 'tpnil-native-storage-portability@4' : v3 ? 'tpnil-native-storage-portability@3' : options.proofOracle === 'v2' ? 'tpnil-native-storage-portability@2' : 'tpnil-native-storage-portability@1', ...(options.proofOracle ? { oracle: v4 ? 'tpnil-native-portability-oracle@4.0.0' : v3 ? 'tpnil-native-portability-oracle@3.0.0' : 'tpnil-native-portability-oracle@2.0.0' } : {}), claim: 'ENGINEERING_OBSERVATION_ONLY', mode: options.mode, assertions: [], trace: [], storage: [], readWindows: {}, ui: [], cleanup: { sourceRestored: false } }
  const check = (id: string, pass: boolean, detail: string) => report.assertions.push({ id: `portability.${id}`, result: pass ? 'PASS' : 'FAIL', detail })
  const call = async (method: string, args: any): Promise<any> => {
    const row: any = { method, args, startedAt: new Date().toISOString() }; report.trace.push(row)
    try { const result = await (wallet as any)[method](args); row.result = clean(result); return result }
    catch (error) { row.error = String(error); throw error } finally { row.endedAt = new Date().toISOString() }
  }
  const dataset = async (name: string, reader: ObservedStorageClient, identity: string) => {
    const window = { startedAt: new Date().toISOString(), storageStart: report.storage.length, storageEnd: report.storage.length, endedAt: '' }
    report.readWindows[name] = window
    try { return await readDataset(reader, identity) }
    finally { window.storageEnd = report.storage.length; window.endedAt = new Date().toISOString() }
  }
  let unavailable = false
  let replacementStart = -1
  try {
    const identity = (await call('getPublicKey', { identityKey: true })).publicKey
    report.identity = identity
    const beforeTask = await call('listOutputs', { basket: 'todo tokens', include: 'entire transactions', includeTags: true, includeCustomInstructions: true, limit: 1000 })
    await controls.createTask()
    report.created = await until(() => call('listOutputs', { basket: 'todo tokens', include: 'entire transactions', includeTags: true, includeCustomInstructions: true, limit: 1000 }), r => readyPortableTask(beforeTask, r) !== undefined)
    const { output, tx } = readyPortableTask(beforeTask, report.created)!
    report.outpoint = output.outpoint
    const [txid, index] = output.outpoint.split('.')
    const token = PushDrop.decode(tx.outputs[Number(index)]!.lockingScript)
    report.task = { text: portableTask, amount, protocolAddress: Utils.toUTF8(token.fields[0]!), ciphertext: token.fields[1], txid, vout: Number(index), rawHex: tx.toHex(), beefHex: Buffer.from(tx.toAtomicBEEF()).toString('hex') }
    report.beforeDecryption = await call('decrypt', { ciphertext: token.fields[1], protocolID: [0, 'todo list'], keyID: '1', counterparty: 'self' })
    assert.equal(Utils.toUTF8(report.beforeDecryption.plaintext), portableTask)
    const transcript = report.storage as Transcript[]
    const reader = new ObservedStorageClient(wallet, source.storageUrl, 'source-observer', transcript, source.components.storage)
    const target = new ObservedStorageClient(wallet, destination.storageUrl, 'destination-observer', transcript, destination.components.storage)
    report.counterparts = { source: await reader.makeAvailable(), destination: await target.makeAvailable(), url: replacementUrl }
    check('distinct-counterparts', report.counterparts.source.storageIdentityKey !== report.counterparts.destination.storageIdentityKey, 'Independent storage identities and temporary databases back the two counterparts.')
    await controls.addAndSync(replacementUrl)
    // Read after the native mediator completes; the harness never writes chunks.
    report.source = await dataset('source', reader, identity)
    report.destination = await dataset('destination', target, identity)
    let complete = report.source.transactions.length >= 2 && report.source.outputs.length >= 2 && canonicalJson(project(report.source)) === canonicalJson(project(report.destination))
    if (options.proofOracle) {
      try {
        const fixture = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../../../fixtures/teranode/wab-funding-v1.json'), 'utf8'))
        const tracker = { currentHeight: async () => fixture.fundingHeight + fixture.maturityDepth, isValidRootForHeight: async (root: string, height: number) => root === fixture.merkleRoot && height === fixture.fundingHeight }
        // Producer uses only captured dataset bytes, never earlier listOutputs BEEF.
        for (const copy of [report.source, report.destination]) {
          const graph = new Beef()
          for (const row of [...copy.transactions, ...copy.provenTxReqs]) if (row.inputBEEF?.length) graph.mergeBeef(row.inputBEEF)
          for (const row of [...copy.transactions, ...copy.provenTxReqs]) if (row.rawTx?.length) { assert.equal(Transaction.fromBinary(row.rawTx).id('hex'), row.txid); graph.mergeRawTx(row.rawTx) }
          for (const row of copy.provenTxs) graph.mergeRawTx(row.rawTx, graph.mergeBump(MerklePath.fromBinary(row.merklePath)))
          assert.equal(graph.findTxid(fixture.txid)?.tx?.toHex(), fixture.rawHex)
          assert.ok(await graph.verify(tracker))
          for (const row of copy.transactions) if (row.txid) assert.ok(await Transaction.fromAtomicBEEF(graph.toBinaryAtomic(row.txid)).verify(tracker))
          for (const row of copy.provenTxReqs) if (row.rawTx?.length) assert.ok(await Transaction.fromAtomicBEEF(graph.toBinaryAtomic(row.txid)).verify(tracker))
        }
      } catch (error) { complete = false; report.proofClosureError = String(error) }
    } else complete &&= report.source.provenTxs.length >= 1
    check('complete-logical-dataset', complete, 'All logical records, bytes, metadata and foreign keys match; the declared proof oracle verifies retained ancestry.')
    report.nativeRpc = clean(source.storageRpcObservations)
    if (options.mode === 'reference-engineering') report.referenceMediator = clean(controls.referenceTranscript?.() ?? [])
    check('native-mediated-sync', options.mode === 'native-ui' ? report.nativeRpc.some((r: any) => r.host === replacementHost && r.method === 'processSyncChunk' && r.completed && r.status === 200) : report.referenceMediator.some((r: any) => r.method === 'processSyncChunk' && r.response && !r.error), 'The declared wallet mediator sends authenticated processSyncChunk requests; reference mode is not native qualification.')
    await controls.activateAndRemoveSource(replacementUrl)
    await source.setStorageEndpointAvailable(false); unavailable = true
    report.outage = { startedAt: new Date().toISOString(), events: clean(source.storageEndpointEvents) }
    try { await fetch(source.storageUrl, { signal: AbortSignal.timeout(2000) }); report.outage.probe = { reachable: true } }
    catch (error) { report.outage.probe = { reachable: false, error: String(error) } }
    check('source-unavailable', report.outage.probe.reachable === false, 'The source storage TCP listener is stopped while chain, overlay and replacement services remain running.')
    replacementStart = source.storageRpcObservations.length
    report.coldReload = await controls.coldReload()
    check('cold-wallet-reload', report.coldReload.locked === true && report.coldReload.unlocked === true && report.coldReload.applicationCacheCleared === true && report.coldReload.contextDropped === true, 'Supported Lock/Unlock retires the native live wallet context; the ToDo client cache is cleared and reloaded.')
    report.identityAfter = (await call('getPublicKey', { identityKey: true })).publicKey
    check('same-identity', report.identityAfter === identity, 'Native wallet identity is unchanged after counterpart replacement and cold reconstruction.')
    report.recovered = await call('listOutputs', { basket: 'todo tokens', include: 'entire transactions', includeTags: true, includeCustomInstructions: true, limit: 1000 })
    report.afterDecryption = await call('decrypt', { ciphertext: token.fields[1], protocolID: [0, 'todo list'], keyID: '1', counterparty: 'self' })
    const recovered = report.recovered.outputs.filter((o: any) => o.outpoint === report.outpoint)
    check('cold-task-recovery', recovered.length === 1 && recovered[0].spendable === true && Utils.toUTF8(report.afterDecryption.plaintext) === portableTask && report.coldReload.taskVisible === true, 'The same unspent encrypted ToDo outpoint is reconstructed and decrypted from the replacement.')
    const receiptStart = destination.storageProcessActionReceipts.length
    await controls.redeemTask()
    if (v3) {
      report.redemptionObservations = []
      const ready = await until(async () => {
        const name = `redemptionPoll${report.redemptionObservations.length}`
        const row: any = { name, dataset: await dataset(name, target, identity), ready: false }
        row.processActionReceipts = clean(destination.storageProcessActionReceipts.slice(receiptStart))
        row.capturedAt = new Date().toISOString()
        report.redemptionObservations.push(row)
        try {
          const signed = await readyPortableRedemption(row.dataset, report.outpoint)
          const processed = options.mode === 'native-ui'
            ? row.processActionReceipts.some((receipt: any) => {
                const request = JSON.parse(Buffer.from(receipt.requestHex, 'hex').toString())
                const response = JSON.parse(Buffer.from(receipt.responseHex, 'hex').toString())
                return signed && receipt.status === 200 && receipt.requestIdentityKey === identity && request.method === 'processAction'
                  && request.params[0]?.identityKey === identity && request.params[1]?.txid === signed.txid
                  && Buffer.from(request.params[1]?.rawTx ?? []).toString('hex') === signed.rawHex
                  && response.id === request.id && !response.error && response.result
                  && !(response.result.sendWithResults ?? []).some((r: any) => ['failed', 'error'].includes(r.status))
              })
            : controls.referenceTranscript?.().some(r => r.provider === 'replacement-active' && r.method === 'processAction' && r.response && !r.error)
          row.ready = Boolean(signed && processed)
          if (row.ready) row.txid = signed!.txid
        } catch (error) { row.error = String(error) }
        return row
      }, row => row.ready, 45_000, 1000)
      report.redemptionCompletion = { observation: ready.name, txid: ready.txid, at: new Date().toISOString() }
    }
    report.redeemed = await until(() => call('listOutputs', { basket: 'todo tokens', include: 'entire transactions', limit: 1000 }), r => !r.outputs.some((o: any) => o.outpoint === report.outpoint))
    report.destinationAfter = await dataset('destinationAfter', target, identity)
    report.replacementRpc = clean(source.storageRpcObservations.slice(replacementStart))
    if (options.mode === 'reference-engineering') report.referenceMediatorAfter = clean(controls.referenceTranscript?.() ?? [])
    const spent = report.destinationAfter.outputs.find((o: any) => o.txid === txid && Number(o.vout) === Number(index))
    const spending = report.destinationAfter.transactions.find((t: any) => t.transactionId === spent?.spentBy)
    const raw = spending?.rawTx ?? report.destinationAfter.provenTxReqs.find((t: any) => t.txid === spending?.txid)?.rawTx
    if (raw) {
      const redemption = Transaction.fromBinary(raw)
      report.redemption = { txid: redemption.id('hex'), rawHex: redemption.toHex(), transaction: spending }
    }
    check('replacement-redemption', spent?.spendable === false && Boolean(report.redemption) && (options.mode === 'native-ui' ? report.replacementRpc.some((r: any) => r.host === replacementHost && r.method === 'processAction' && r.status === 200) : report.referenceMediatorAfter.some((r: any) => r.provider === 'replacement-active' && r.method === 'processAction' && r.response && !r.error)), 'A ToDo redemption is serialized and stored by the replacement while the source listener remains unavailable.')
  } catch (error) { report.error = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error) }
  finally {
    if (v3 && replacementStart >= 0) report.replacementRpc = clean(source.storageRpcObservations.slice(replacementStart))
    if (unavailable) {
      report.outage.restorationStartedAt = new Date().toISOString()
      await source.setStorageEndpointAvailable(true); report.outage.endedAt = new Date().toISOString()
    }
    report.cleanup.sourceRestored = true
    check('cleanup', true, 'The source listener is restored; caller retires the isolated replacement after evidence collection.')
  }
  for (const id of portabilityAssertions) if (!report.assertions.some((a: any) => a.id === id)) report.assertions.push({ id, result: 'FAIL', detail: 'A preceding operation prevented this observation.' })
  report.result = report.assertions.every((a: any) => a.result === 'PASS') ? 'PASS' : 'FAIL'
  return clean(report)
}

/** Real settings UI controls; no extension messaging or private wallet access. */
export function nativePortabilityControls(application: Page, walletPage: Page, password: string, ui: any[], waitForSignedCompletion = false): PortabilityControls {
  const snapshot = async (stage: string) => ui.push({ stage, at: new Date().toISOString(), text: await walletPage.locator('body').innerText() })
  const settings = async () => { await walletPage.reload(); await walletPage.getByText('Settings', { exact: true }).last().click(); await walletPage.getByText('Lock Wallet', { exact: true }).waitFor() }
  const backups = async () => { await settings(); await walletPage.getByText('Wallet Backup', { exact: true }).first().click(); await walletPage.getByText('Remote Backup', { exact: true }).click(); await walletPage.getByText('Sync Now', { exact: true }).waitFor() }
  return {
    async createTask() {
      const url = new URL('https://todo.itcve.test/'); url.searchParams.set('p0Task', portableTask); url.searchParams.set('p0Amount', String(amount)); url.searchParams.set('p0OpenCreate', '1')
      await application.goto(url.href); await application.getByTestId('p0-todo-create-submit').click()
      await application.getByLabel(`${portableTask} ${amount} satoshis`, { exact: true }).waitFor({ state: 'visible', timeout: 45_000 })
      ui.push({ stage: 'native-task-visible', at: new Date().toISOString(), text: await application.locator('body').innerText() })
    },
    async addAndSync(url) {
      await backups(); await snapshot('before-add')
      await walletPage.getByRole('button', { name: 'Add', exact: true }).click()
      await walletPage.getByText('Custom Provider', { exact: true }).click()
      await walletPage.getByPlaceholder('https://your-server.com/storage').fill(url)
      await walletPage.getByRole('button', { name: 'Add Custom Remote', exact: true }).click()
      await walletPage.getByText('Remote added', { exact: true }).waitFor({ timeout: 45_000 })
      await walletPage.getByText('Sync Now', { exact: true }).click()
      await walletPage.getByText('Sync complete', { exact: true }).waitFor({ timeout: 60_000 }); await snapshot('native-sync-complete')
    },
    async activateAndRemoveSource(url) {
      await walletPage.getByRole('button').filter({ hasText: new URL(url).host }).first().click()
      await walletPage.getByRole('button', { name: 'Make Active', exact: true }).click()
      // The success snackbar is transient. The exact selected provider's durable
      // detail card and disappearance of its activation control prove the handoff.
      const detail = walletPage.getByText(url, { exact: true })
      await detail.waitFor({ timeout: 60_000 })
      await walletPage.getByRole('button', { name: 'Make Active', exact: true }).waitFor({ state: 'hidden', timeout: 60_000 })
      await walletPage.getByText('In use', { exact: true }).first().waitFor({ timeout: 30_000 }); await snapshot('replacement-active')
      await backups()
      await walletPage.getByRole('button').filter({ hasText: 'wallet.1sat.app' }).first().click()
      await walletPage.getByRole('button', { name: 'Remove', exact: true }).click()
      await walletPage.getByText('Remote removed', { exact: true }).waitFor(); await snapshot('source-removed-from-config')
    },
    async coldReload() {
      const consoleMessages: string[] = []
      const workers = application.context().serviceWorkers()
      const listener = (message: any) => { if (/dropWalletContext \(WALLET_LOCKED\): gone immediately/.test(message.text())) consoleMessages.push(message.text()) }
      for (const worker of workers) worker.on('console', listener)
      try {
        await settings(); await walletPage.getByText('Lock Wallet', { exact: true }).click()
        await walletPage.getByPlaceholder('Password', { exact: true }).waitFor({ timeout: 30_000 })
        await until(async () => consoleMessages.length, n => n > 0, 10_000)
        await walletPage.getByPlaceholder('Password', { exact: true }).fill(password)
        await walletPage.getByRole('button', { name: 'Unlock', exact: true }).click()
        await walletPage.getByText('Settings', { exact: true }).last().waitFor({ timeout: 60_000 })
        await application.evaluate(() => localStorage.clear()); await application.goto('https://todo.itcve.test/')
        await application.getByText(portableTask, { exact: true }).waitFor({ timeout: 45_000 })
        return { mechanism: 'native-settings-lock-unlock', locked: true, unlocked: true, contextDropped: consoleMessages.length > 0, consoleMessages, applicationCacheCleared: true, taskVisible: true, at: new Date().toISOString() }
      } finally { for (const worker of workers) worker.off('console', listener) }
    },
    async redeemTask() {
      await application.getByLabel(`${portableTask} ${amount} satoshis`, { exact: true }).click()
      await application.getByTestId('p0-todo-complete-submit').click()
      if (waitForSignedCompletion) {
        // The unchanged ToDo app emits this only after await wallet.signAction.
        // Let that public operation finish before starting a separate observer
        // authentication session; signed storage/proof checks still follow.
        await application.getByText('Congrats! Task complete 🎉', { exact: true }).waitFor({ timeout: 45_000 })
        ui.push({ stage: 'native-task-complete', at: new Date().toISOString(), text: await application.locator('body').innerText() })
      }
    }
  }
}

/** A prospective run owns its settings tab. Earlier browser restarts may
 * legitimately have closed every index page; no unrelated extension is used. */
export async function withNativePortabilitySettingsPage<T>(application: Page, extensionId: string, operation: (page: Page) => Promise<T>): Promise<T> {
  assert.match(extensionId, /^[a-p]{32}$/)
  const page = await application.context().newPage()
  let primary: { error: unknown } | undefined
  try {
    const url = `chrome-extension://${extensionId}/index.html`
    await page.goto(url, { timeout: 30_000 }); assert.equal(page.url(), url)
    await page.getByText('Settings', { exact: true }).last().waitFor({ state: 'visible', timeout: 30_000 })
    return await operation(page)
  } catch (error) { primary = { error }; throw error }
  finally {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([page.close({ runBeforeUnload: false }), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Owned portability settings page did not close within 10 seconds')), 10_000) })])
      assert.equal(page.isClosed(), true)
    } catch (error) { if (primary) throw new AggregateError([primary.error, error], 'Native portability operation and owned settings cleanup failed', { cause: primary.error }); throw error }
    finally { if (timer) clearTimeout(timer) }
  }
}

export async function runNativePortability({ application, services, evidence, password, extensionId, oracle = 'tpnil-native-portability-oracle@2.0.0' }: {
  application: Page; services: ControlledWalletServices; evidence: EvidenceBundle; password: string; extensionId?: string
  oracle?: 'tpnil-native-portability-oracle@2.0.0' | 'tpnil-native-portability-oracle@3.0.0' | 'tpnil-native-portability-oracle@4.0.0'
}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-native-portability-'))
  fs.writeFileSync(path.join(directory, 'index.html'), '<title>Isolated storage counterpart</title>')
  const replacement = services.createStorageCounterpart(directory, '12'.repeat(32))
  let report: any
  let retained = false
  try {
    for (const header of services.headers.values()) replacement.registerHeader(header)
    await replacement.start()
    services.registerStorageCounterpart(replacementHost, replacement.storageUrl, replacement)
    retained = true
    const ui: any[] = []
    const execute = (walletPage: Page) => qualifyStoragePortability({ wallet: nativeWalletBoundary(application), source: services, destination: replacement, controls: nativePortabilityControls(application, walletPage, password, ui, ['tpnil-native-portability-oracle@3.0.0', 'tpnil-native-portability-oracle@4.0.0'].includes(oracle ?? '')), mode: 'native-ui', proofOracle: oracle === 'tpnil-native-portability-oracle@4.0.0' ? 'v4' : oracle === 'tpnil-native-portability-oracle@3.0.0' ? 'v3' : 'v2' })
    if (extensionId !== undefined) report = await withNativePortabilitySettingsPage(application, extensionId, execute)
    else {
      const walletPage = application.context().pages().find(page => /^chrome-extension:\/\/.+\/index.html/.test(page.url()))
      if (!walletPage) throw new Error('Native wallet settings page is absent')
      report = await execute(walletPage)
    }
    report.ui = ui
    report.components = { source: services.componentIdentity, replacement: replacement.componentIdentity }
    report.cleanup.replacementOwnedByServiceGraph = true
    report.cleanup.retirement = 'ControlledWalletServices.close after the complete native scenario'
    evidence.addJson('conformance/portability.json', report)
  } finally {
    if (!retained) await replacement.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
  return report
}
