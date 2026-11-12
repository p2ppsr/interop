import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import {
  Beef,
  LockingScript,
  MerklePath,
  P2PKH,
  PrivateKey,
  PublicKey,
  PushDrop,
  Transaction,
  Utils
} from '@bsv/sdk'
import { chromium, type BrowserContext, type Page } from 'playwright'
import { sha256Hex } from '../determinism.js'
import { EvidenceBundle } from './evidence.js'
import { captureWithNativeCleanup, nativeFailureSnapshot, nativeShutdownFailure } from './native/failure.js'
import {
  aggregateOutcome,
  identifiesYoursCandidate,
  matchesYoursCandidate,
  type ArtifactIdentity,
  type PermissionObservation,
  type VectorResult,
  type WalletLabResult
} from './model.js'
import type { ComponentSelection } from './go-services.js'
import { ControlledWalletServices, type TeranodeWalletFundingFixture } from './services.js'
import { bindTodoSubmissionWindow, todoProtocol, todoSubmissionBinding, type TodoSubmissionWindow } from './native/todo-submission-binding.js'
import { getControlledHeaderFixture, type ControlledHeaderFixture } from './native/controlled-header-fixture.js'

export function nativeControlledDestinations(profile?: string): string[] {
  return [...(['ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(profile ?? '') ? ['permission-sequence', 'permission-sequence-alt', 'permission-sequence-denied', 'permission-sequence-group', 'permission-sequence-group-alt'].map(name => `${name}.itcve.test`) : []), 'wallet.1sat.app', 'api.1sat.app', 'messagebox.1sat.app', 'todo.itcve.test', 'alternate.itcve.test', ...(['ITCVE-1@4.0.0', 'ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.3.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(profile ?? '') ? ['deny.itcve.test', 'usercom.babbage.systems', 'overlay.itcve.test', 'overlay-us-1.bsvb.tech', 'overlay-eu-1.bsvb.tech', 'overlay-ap-1.bsvb.tech', 'users.bapp.dev', 'replacement-wallet.itcve.test', 'certifier.itcve.test', 'allowance.itcve.test'] : []), ...(['ITCVE-1@4.3.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(profile ?? '') ? ['permission-extension', 'permission-extension-alt', 'permission-extension-subset', 'permission-extension-unchecked', 'permission-extension-overcap', 'permission-extension-concurrent', 'permission-extension-abort', 'permission-extension-rejection', 'permission-extension-nosend', 'certificate-identity', 'certificate-attribute'].map(name => `${name}.itcve.test`) : [])]
}

interface CwiBoundary {
  [method: string]: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
  listOutputs: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
  listActions: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
  getVersion: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
  getNetwork: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
  isAuthenticated: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
  getPublicKey: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
  internalizeAction: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
  decrypt: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
  encrypt: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
  createSignature: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
  verifySignature: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
  createHmac: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
  verifyHmac: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
  getHeight: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
  getHeaderForHeight: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
}

/** Serializable browser-side baseline probe. The positive-header observer
 * retains a failure so the later method corpus can score its fixed request. */
export async function captureNativeSafeBoundary(headerFixture?: { height: number }): Promise<{
  decrypted: number[]; signatureVerified: boolean; hmacVerified: boolean; height: Record<string, unknown>
  headerRequest?: { height: number }; header?: Record<string, unknown>
  headerError?: { name?: string; message: string; code?: number }
}> {
  const wallet = (window as unknown as { CWI: CwiBoundary }).CWI
  const plaintext = Array.from(new TextEncoder().encode('TPNIL boundary fixture'))
  const encrypted = await wallet.encrypt({ plaintext, protocolID: [1, 'tpnil boundary'], keyID: '1', counterparty: 'self' })
  const decrypted = await wallet.decrypt({ ciphertext: encrypted.ciphertext, protocolID: [1, 'tpnil boundary'], keyID: '1', counterparty: 'self' })
  const signature = await wallet.createSignature({ data: plaintext, protocolID: [1, 'tpnil boundary'], keyID: '1', counterparty: 'self' })
  const verified = await wallet.verifySignature({ data: plaintext, signature: signature.signature, protocolID: [1, 'tpnil boundary'], keyID: '1', counterparty: 'self' })
  const hmac = await wallet.createHmac({ data: plaintext, protocolID: [1, 'tpnil boundary'], keyID: '1', counterparty: 'self' })
  const hmacVerified = await wallet.verifyHmac({ data: plaintext, hmac: hmac.hmac, protocolID: [1, 'tpnil boundary'], keyID: '1', counterparty: 'self' })
  const height = await wallet.getHeight({})
  const headerRequest = headerFixture ? { height: headerFixture.height } : undefined
  let headerObservation: Record<string, unknown>
  if (headerRequest) {
    try { headerObservation = { headerRequest, header: await wallet.getHeaderForHeight(headerRequest) } }
    catch (error) { headerObservation = { headerRequest, headerError: error instanceof Error ? { name: error.name, message: error.message, ...(typeof (error as any).code === 'number' ? { code: (error as any).code } : {}) } : { message: String(error) } } }
  } else headerObservation = { header: await wallet.getHeaderForHeight({ height: 0 }) }
  return {
    decrypted: Array.from((decrypted.plaintext as number[]) ?? []),
    signatureVerified: Boolean(verified.valid),
    hmacVerified: Boolean(hmacVerified.valid),
    height,
    ...headerObservation
  }
}

interface OutputProjection {
  outpoint: string
  satoshis: number
  lockingScript?: string
  spendable: boolean
}

interface ListOutputProjection {
  totalOutputs: number
  outputs: OutputProjection[]
  beef?: number[]
}

export interface NativeScenarioContext {
  integratedProfile?: YoursRunOptions['integratedProfile']
  application: Page; context: BrowserContext; extensionId: string; password: string
  services: ControlledWalletServices; evidence: EvidenceBundle; baselineVectors: VectorResult[]
  manualPrompt: <T>(operation: () => Promise<T>) => Promise<T>
  restartBrowser?: () => Promise<{ application: Page; context: BrowserContext; receipt: NativeBrowserRestartReceipt }>
}

export interface NativeBrowserRestartReceipt {
  schema: 'tpnil-native-browser-restart@1'; sequence: number; profileBinding: string; extensionId: string
  startedAt: string; closedAt: string; openedAt: string; unlockedAt: string; endedAt: string
  oldPageCount: number; oldPagesClosed: boolean; version: string; identity: string; sandboxEvidence?: string
}

/** A final capture must belong to the browser that still owns the run. */
export function activeNativeApplication(context: BrowserContext, application: Page): Page {
  if (application.isClosed() || application.context() !== context) throw new Error('Native application page does not belong to the active browser context')
  return application
}

export interface YoursRunOptions {
  headerFixture?: ControlledHeaderFixture
  shutdownSubmissionPolicy?: 'tpnil-native-shutdown-submissions@1.0.0' | 'tpnil-native-shutdown-submissions@2.0.0' | 'tpnil-native-shutdown-submissions@3.0.0'
  submissionOrdering?: 'tpnil-owned-submission-order@1'
  walletCandidate?: Record<string, unknown>
  integratedProfile?: 'ITCVE-1@1.3.0' | 'ITCVE-1@1.4.0' | 'ITCVE-1@1.5.0' | 'ITCVE-1@2.0.0' | 'ITCVE-1@4.0.0' | 'ITCVE-1@4.1.0' | 'ITCVE-1@4.2.0' | 'ITCVE-1@4.3.0' | 'ITCVE-1@4.4.0' | 'ITCVE-1@4.5.0' | 'ITCVE-1@4.6.0' | 'ITCVE-1@4.7.0'
  go?: import('./go-services.js').GoServiceOptions
  prepareScenario?: (context: NativeScenarioContext) => Promise<void>
  additionalScenario?: (context: NativeScenarioContext) => Promise<void | { vectors: VectorResult[] }>
  nativeActionReferenceEvidence?: boolean
  nativeQualification?: { fundingFixture: TeranodeWalletFundingFixture; sandbox: true }
  components?: ComponentSelection
  extensionDirectory: string
  webroot: string
  outputDirectory: string
  walletArtifact: ArtifactIdentity
  applicationArtifact: ArtifactIdentity
  headless?: boolean
  task?: string
  amount?: number
}

async function waitForText(page: Page, value: string, timeout = 30_000): Promise<void> {
  await page.getByText(value, { exact: false }).first().waitFor({ state: 'visible', timeout })
}

async function within<T>(label: string, timeout: number, operation: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeout} ms`)), timeout)
      })
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

function extractTxid(outpoint: string): string {
  const txid = outpoint.split(/[._]/)[0]
  if (txid === undefined || !/^[0-9a-f]{64}$/i.test(txid)) throw new Error(`Invalid outpoint: ${outpoint}`)
  return txid.toLowerCase()
}

async function listTodoOutputs(page: Page): Promise<ListOutputProjection> {
  return page.evaluate(async () => {
    const wallet = (window as unknown as { CWI: CwiBoundary }).CWI
    const result = await wallet.listOutputs({ basket: 'todo tokens', include: 'entire transactions', limit: 1_000 })
    return {
      totalOutputs: Number(result.totalOutputs),
      outputs: (result.outputs as Array<Record<string, unknown>>).map(output => ({
        outpoint: String(output.outpoint),
        satoshis: Number(output.satoshis),
        ...(typeof output.lockingScript === 'string' ? { lockingScript: output.lockingScript } : {}),
        spendable: Boolean(output.spendable)
      })),
      beef: Array.isArray(result.BEEF) ? result.BEEF.map(Number) : undefined
    }
  })
}

async function waitForTodoOutputs(
  page: Page,
  predicate: (value: ListOutputProjection) => boolean,
  timeout = 45_000
): Promise<ListOutputProjection> {
  const deadline = Date.now() + timeout
  let last: ListOutputProjection | undefined
  while (Date.now() < deadline) {
    try {
      last = await listTodoOutputs(page)
      if (predicate(last)) return last
    } catch {
      // The wallet may still be settling permissions or the action commit.
    }
    await page.waitForTimeout(500)
  }
  throw new Error(`Timed out waiting for ToDo wallet state; last projection: ${JSON.stringify(last)}`)
}

export async function runYoursWallet(options: YoursRunOptions): Promise<WalletLabResult> {
  const startedAt = new Date().toISOString()
  if (options.integratedProfile === 'ITCVE-1@4.1.0' || options.integratedProfile === 'ITCVE-1@4.2.0' || options.integratedProfile === 'ITCVE-1@4.3.0' || options.integratedProfile === 'ITCVE-1@4.4.0' || ['ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(options.integratedProfile ?? '')) {
    if (options.walletCandidate?.officialRelease !== false || !matchesYoursCandidate(options.walletArtifact, options.integratedProfile)) throw new Error('Candidate native profile requires its explicit artifact and engineering metadata')
  } else if (identifiesYoursCandidate(options.walletArtifact) || options.walletCandidate !== undefined) throw new Error('Candidate build cannot enter an official release profile')
  const expectedWalletVersion = ['ITCVE-1@4.0.0', 'ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.3.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(options.integratedProfile ?? '') ? 'yours-wallet-5.1.1' : 'yours-wallet-5.1.0'
  const task = options.task ?? 'TPNIL controlled task'
  const amount = options.amount ?? 2
  const extensionDirectory = path.resolve(options.extensionDirectory)
  const webroot = path.resolve(options.webroot)
  const outputDirectory = path.resolve(options.outputDirectory)
  const runId = path.basename(outputDirectory)
  const evidence = new EvidenceBundle(outputDirectory)
  if (options.go?.storageSyncPatch && !['ITCVE-1@1.3.0', 'ITCVE-1@1.4.0', 'ITCVE-1@1.5.0', 'ITCVE-1@2.0.0', 'ITCVE-1@4.0.0', 'ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.3.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(options.integratedProfile ?? '')) throw new Error('Patched native services require the prospective integrated profile')
  if (options.go?.terminalRejectionReceipts && !['ITCVE-1@1.4.0', 'ITCVE-1@1.5.0', 'ITCVE-1@2.0.0', 'ITCVE-1@4.0.0', 'ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.3.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(options.integratedProfile ?? '')) throw new Error('Terminal submission receipts require the prospective conformance profile')
  if (options.shutdownSubmissionPolicy && options.shutdownSubmissionPolicy !== (['ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(options.integratedProfile ?? '') ? 'tpnil-native-shutdown-submissions@3.0.0' : ['ITCVE-1@4.0.0', 'ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.3.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(options.integratedProfile ?? '') ? 'tpnil-native-shutdown-submissions@2.0.0' : 'tpnil-native-shutdown-submissions@1.0.0')) throw new Error('Unknown or mismatched shutdown submission policy')
  if (options.shutdownSubmissionPolicy && !['ITCVE-1@2.0.0', 'ITCVE-1@4.0.0', 'ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.3.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(options.integratedProfile ?? '')) throw new Error('Shutdown submission receipts require prospective coverage mode')
  let submissionClosure: ReturnType<ControlledWalletServices['observeSubmissionClosure']> | undefined
  let initialSubmissionCaptureAt: string | undefined
  let completionInventoryObserver: ReturnType<typeof import('./native/completion-observer-ledger.js').observeCompletionInventoryClosure> | undefined
  if (['ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(options.integratedProfile ?? '') && options.submissionOrdering !== 'tpnil-owned-submission-order@1') throw new Error('Completion requires explicit owned submission ordering')
  if (options.submissionOrdering && !['ITCVE-1@4.6.0','ITCVE-1@4.7.0'].includes(options.integratedProfile ?? '')) throw new Error('Owned submission ordering requires the completion profile')
  const services = new ControlledWalletServices({ webroot, components: options.components, go: options.go, submissionOrdering: options.submissionOrdering })
  const permissions: PermissionObservation[] = []
  const consoleErrors: string[] = []
  const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-yours-profile-'))
  let context: BrowserContext | undefined
  let primaryFailure: { error: unknown } | undefined
  let promptPoll: NodeJS.Timeout | undefined
  let permissionSequence = 0
  let browserVersion = 'unknown'
  const handledPromptUrls = new Set<string>()
  const activeAutomaticPrompts = new Set<Promise<void>>()
  let manualPromptActive = false
  const browserContexts: Array<Record<string, unknown>> = []
  const profileBinding = sha256Hex(Buffer.from(profileDirectory))
  const manualPrompt = async <T>(operation: () => Promise<T>): Promise<T> => {
    if (manualPromptActive) throw new Error('Nested manual permission scenario')
    manualPromptActive = true
    try {
      await Promise.allSettled([...activeAutomaticPrompts])
      return await operation()
    } finally { manualPromptActive = false }
  }
  const progress = (message: string): void => {
    process.stdout.write(`[wallet-lab:${runId}] ${message}\n`)
    if (options.nativeQualification !== undefined) {
      evidence.addJson('live-diagnostics.json', { phase: message, routes: services.routes, storageRpc: services.storageRpcObservations, consoleErrors, permissions })
      evidence.addText('go-diagnostics.log', services.componentDiagnostics)
      evidence.flush()
    }
  }
  const vectors: VectorResult[] = []
  let walletVersion = ''
  let walletNetwork = ''
  let authenticated = false
  let fundingTxid = ''
  let createTxid: string | undefined
  let redeemTxid: string | undefined
  try {
    await services.start()
    if (Object.values(services.components).includes('go')) evidence.addJson('service-components.json', services.componentIdentity)
    if (options.nativeQualification !== undefined) {
      const nss = path.join(os.homedir(), '.pki/nssdb')
      fs.mkdirSync(nss, { recursive: true })
      execFileSync('certutil', ['-N', '--empty-password', '-d', `sql:${nss}`])
      const certificate = path.join(services.caDirectory, 'certs/ca.pem')
      execFileSync('certutil', ['-A', '-d', `sql:${nss}`, '-n', 'ITCVE controlled CA', '-t', 'C,,', '-i', certificate])
      evidence.addText('controlled-ca.pem', fs.readFileSync(certificate, 'utf8'))
      evidence.addText('native-trust.txt', execFileSync('certutil', ['-L', '-d', `sql:${nss}`], { encoding: 'utf8' }))
    }
    const launchBrowser = () => chromium.launchPersistentContext(profileDirectory, {
      headless: options.headless ?? true,
      chromiumSandbox: options.nativeQualification?.sandbox ?? false,
      ignoreHTTPSErrors: options.nativeQualification === undefined,
      args: [
        `--disable-extensions-except=${extensionDirectory}`,
        `--load-extension=${extensionDirectory}`,
        `--proxy-server=${services.proxyUrl}`,
        '--proxy-bypass-list=<-loopback>',
        ...(options.nativeQualification === undefined ? ['--ignore-certificate-errors'] : []),
        '--disable-background-networking'
      ]
    })
    context = await launchBrowser()
    browserVersion = context.browser()?.version() ?? 'chromium-persistent-context'
    const handlePrompt = async (page: Page): Promise<void> => {
      if (manualPromptActive) return
      await page.waitForLoadState('domcontentloaded').catch(() => undefined)
      if (manualPromptActive || !page.url().includes('/prompt.html')) return
      const promptUrl = page.url()
      if (handledPromptUrls.has(promptUrl)) return
      handledPromptUrls.add(promptUrl)
      try {
        await page.locator('body').waitFor({ state: 'visible', timeout: 20_000 })
        await page.waitForFunction(() => {
          const text = document.body?.innerText.trim() ?? ''
          return text !== '' && text !== 'Loading...' && /Allow|Deny/.test(text)
        }, undefined, { timeout: 20_000 })
        const body = await page.locator('body').innerText()
        if (manualPromptActive) return
        const origin = body.match(/Origin\s+([^\s]+)/)?.[1]
          ?? body.match(/\n([^\s]+) is requesting/)?.[1]
          ?? 'unknown'
        const kind = body.split('\n')[0]?.trim() || 'permission'
        const summary = body
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean)
          .slice(0, 12)
          .join(' | ')
          .slice(0, 1_000)
        const decision = /tpnil denied permission|tpnil origin isolation/i.test(body) ? 'deny' : 'allow'
        permissions.push({ sequence: ++permissionSequence, origin, kind, decision, summary })
        progress(`permission ${permissionSequence}: ${decision} ${kind} for ${origin}`)
        const button = decision === 'allow'
          ? page.getByRole('button', { name: /^Allow(?: Selected)?$/, exact: true })
          : page.getByRole('button', { name: /^Deny(?: All)?$/, exact: true })
        await button.first().click({ timeout: 20_000 })
      } finally {
        handledPromptUrls.delete(promptUrl)
      }
    }
    const automaticPrompt = (page: Page): void => {
      if (manualPromptActive) return
      const operation = handlePrompt(page).catch(error => { consoleErrors.push(`prompt: ${String(error)}`) })
      activeAutomaticPrompts.add(operation)
      void operation.finally(() => activeAutomaticPrompts.delete(operation))
    }
    const observePages = (activeContext: BrowserContext) => activeContext.on('page', page => {
      page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 2_000))
      })
      const attempt = (): void => automaticPrompt(page)
      page.on('framenavigated', frame => {
        if (frame === page.mainFrame()) attempt()
      })
      attempt()
    })
    observePages(context)
    promptPoll = setInterval(() => {
      for (const page of context!.pages())
        automaticPrompt(page)
    }, 250)
    let worker = context.serviceWorkers()[0]
    if (worker === undefined) worker = await context.waitForEvent('serviceworker')
    worker.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 2_000))
    })
    if (options.nativeQualification !== undefined) {
      const securityPage = await context.newPage()
      await securityPage.goto('chrome://sandbox')
      const sandbox = await securityPage.locator('body').innerText()
      evidence.addText('native-sandbox.txt', sandbox)
      if (!/PID namespaces\s+Yes/.test(sandbox) || !/Seccomp-BPF sandbox\s+Yes/.test(sandbox)) throw new Error(`Native Chromium sandbox qualification failed: ${sandbox}`)
      await securityPage.close()
    }
    const extensionId = new URL(worker.url()).host
    if (['ITCVE-1@4.0.0', 'ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.3.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(options.integratedProfile ?? '')) {
      browserContexts.push({ sequence: 0, profileBinding, extensionId, openedAt: new Date().toISOString() })
      evidence.addJson('native-browser-contexts.json', { schema: 'tpnil-native-browser-contexts@1', contexts: browserContexts })
    }
    const walletPage = await context.newPage()
    await walletPage.goto(`chrome-extension://${extensionId}/index.html`)
    await walletPage.getByText('Create New Wallet', { exact: true }).click()
    await walletPage.getByPlaceholder('Account Name').fill('TPNIL Fixture')
    await walletPage.getByPlaceholder('Password', { exact: true }).fill('TPNIL-Fixture-Only-2026!')
    await walletPage.getByPlaceholder('Confirm password', { exact: true }).fill('TPNIL-Fixture-Only-2026!')
    await walletPage.getByRole('button', { name: /Generate Seed/i }).click()
    await walletPage.getByRole('button', { name: /Copy to Clipboard/i }).click()
    await walletPage.getByRole('button', { name: /Next/i }).click()
    await waitForText(walletPage, 'Wallet Ready!', 45_000)
    await walletPage.getByRole('button', { name: 'Enter', exact: true }).click()
    progress('wallet initialized')

    let application = await context.newPage()
    await application.goto('https://todo.itcve.test/')
    await waitForText(application, 'ToDo List', 30_000)
    const restartBrowser = async (): Promise<{ application: Page; context: BrowserContext; receipt: NativeBrowserRestartReceipt }> => {
      if (!['ITCVE-1@4.0.0', 'ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.3.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(options.integratedProfile ?? '') || !manualPromptActive || !context) throw new Error('Browser restart requires the declared native coverage scenario with automatic prompts suspended')
      await Promise.allSettled([...activeAutomaticPrompts])
      const oldContext = context, oldPages = oldContext.pages(), sequence = browserContexts.length
      const startedAt = new Date().toISOString()
      await oldContext.close()
      const closedAt = new Date().toISOString()
      if (!oldPages.every(page => page.isClosed())) throw new Error('Previous native browser pages survived restart')
      browserContexts[sequence - 1]!.closedAt = closedAt
      context = await launchBrowser()
      observePages(context)
      const openedAt = new Date().toISOString()
      const nextWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 30_000 })
      if (new URL(nextWorker.url()).host !== extensionId) throw new Error('Restart changed native extension identity')
      nextWorker.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 2_000)) })
      let sandboxEvidence: string | undefined
      if (options.nativeQualification) {
        const page = await context.newPage(); await page.goto('chrome://sandbox')
        const body = await page.locator('body').innerText(); await page.close()
        if (!/PID namespaces\s+Yes/.test(body) || !/Seccomp-BPF sandbox\s+Yes/.test(body)) throw new Error('Restarted browser lost native sandbox isolation')
        sandboxEvidence = `native-sandbox-restart-${sequence}.txt`; evidence.addText(sandboxEvidence, body)
      }
      const unlock = await context.newPage(); await unlock.goto(`chrome-extension://${extensionId}/index.html`)
      await unlock.getByPlaceholder('Password', { exact: true }).fill('TPNIL-Fixture-Only-2026!')
      await unlock.getByRole('button', { name: 'Unlock', exact: true }).click()
      await unlock.getByPlaceholder('Password', { exact: true }).waitFor({ state: 'hidden', timeout: 45_000 })
      const unlockedAt = new Date().toISOString()
      evidence.addBytes(`conformance/restart-${sequence}-unlocked.png`, await unlock.screenshot())
      await unlock.close()
      const nextApplication = await context.newPage(); await nextApplication.goto('https://todo.itcve.test/')
      await waitForText(nextApplication, 'ToDo List', 30_000)
      await nextApplication.waitForFunction(() => typeof (window as any).CWI?.getPublicKey === 'function', undefined, { timeout: 30_000 })
      const observed = await within('restarted native version and identity', 30_000, nextApplication.evaluate(async () => {
        const wallet = (window as any).CWI
        return { version: (await wallet.getVersion({})).version, identity: (await wallet.getPublicKey({ identityKey: true, seekPermission: false })).publicKey }
      })).catch(error => {
        evidence.addJson(`conformance/restart-${sequence}-failure.json`, { sequence, profileBinding, extensionId, startedAt, closedAt, openedAt, unlockedAt, failedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) })
        throw error
      })
      if (observed.version !== expectedWalletVersion) throw new Error('Restart changed native wallet version')
      if (typeof observed.identity !== 'string' || !/^(02|03)[0-9a-f]{64}$/.test(observed.identity) || !PublicKey.fromString(observed.identity).validate()) throw new Error('Restart did not return a valid native identity')
      const receipt: NativeBrowserRestartReceipt = { schema: 'tpnil-native-browser-restart@1', sequence, profileBinding, extensionId, startedAt, closedAt, openedAt, unlockedAt, endedAt: new Date().toISOString(), oldPageCount: oldPages.length, oldPagesClosed: true, version: observed.version, identity: observed.identity, ...(sandboxEvidence ? { sandboxEvidence } : {}) }
      browserContexts.push({ sequence, profileBinding, extensionId, openedAt, restart: receipt })
      evidence.addJson('native-browser-contexts.json', { schema: 'tpnil-native-browser-contexts@1', contexts: browserContexts })
      application = activeNativeApplication(context, nextApplication)
      return { application, context, receipt }
    }
    const boundaryCall = async (method: 'getVersion' | 'getNetwork' | 'isAuthenticated') => {
      progress(`boundary ${method}: requesting`)
      const result = await within(`wallet boundary ${method}`, 30_000, application.evaluate(async method => {
        const wallet = (window as unknown as { CWI: CwiBoundary }).CWI
        return wallet[method]({})
      }, method))
      progress(`boundary ${method}: completed`)
      return result
    }
    const boundary = {
      version: await boundaryCall('getVersion'),
      network: await boundaryCall('getNetwork'),
      authenticated: await boundaryCall('isAuthenticated')
    }
    walletVersion = String(boundary.version.version)
    walletNetwork = String(boundary.network.network)
    authenticated = Boolean(boundary.authenticated.authenticated)
    progress(`boundary identified ${walletVersion} on ${walletNetwork}`)

    const senderKey = PrivateKey.fromHex('22'.repeat(32))
    const senderIdentityKey = senderKey.toPublicKey().toString()
    const derivationPrefix = Buffer.from('tpnil-wallet-lab').toString('base64')
    const derivationSuffix = Buffer.from('funding-001').toString('base64')
    const keyID = `${derivationPrefix} ${derivationSuffix}`
    const derived = await application.evaluate(
      async ({ keyID, senderIdentityKey }) => {
        const wallet = (window as unknown as { CWI: CwiBoundary }).CWI
        return wallet.getPublicKey({ protocolID: [2, '3241645161d8'], keyID, counterparty: senderIdentityKey, forSelf: true })
      },
      { keyID, senderIdentityKey }
    )
    let fundingBeef: Uint8Array
    let fundingHeight: number
    let fixtureProofValid: boolean
    if (options.nativeQualification !== undefined) {
      const fixture = options.nativeQualification.fundingFixture
      const source = await services.fundRemoteWalletFromTeranode('77'.repeat(32), fixture)
      const payment = await services.payNativeWallet(String(derived.publicKey), 10_000)
      fundingBeef = Uint8Array.from(payment.tx)
      fundingTxid = payment.txid
      fundingHeight = fixture.fundingHeight
      fixtureProofValid = await Beef.fromBinary(fundingBeef).verify({
        isValidRootForHeight: async (root, height) => services.headers.get(height)?.merkleRoot === root,
        currentHeight: async () => 900_100
      }, false)
      evidence.addJson('mined-funding-source.json', { fixture, source, paymentTxid: fundingTxid, outputIndex: 0, publicKey: String(derived.publicKey), satoshis: 10_000 })
    } else {
      const funding = new Transaction()
      funding.addOutput({ satoshis: 10_000, lockingScript: new P2PKH().lock(PublicKey.fromString(String(derived.publicKey)).toAddress()) })
      fundingTxid = funding.id('hex')
      fundingHeight = 900_000
      funding.merklePath = new MerklePath(fundingHeight, [[{ offset: 0, hash: fundingTxid, txid: true }]])
      services.registerSyntheticHeader({ version: 1, previousHash: '00'.repeat(32), merkleRoot: fundingTxid, time: 1_800_000_000, bits: 486_604_799, nonce: 0, height: fundingHeight })
      fundingBeef = Uint8Array.from(funding.toAtomicBEEF())
      fixtureProofValid = await Beef.fromBinary(fundingBeef).verify({
        isValidRootForHeight: async (root, height) => root === fundingTxid && height === fundingHeight,
        currentHeight: async () => 900_100
      }, false)
    }
    const internalized = await application.evaluate(
      async ({ tx, derivationPrefix, derivationSuffix, senderIdentityKey }) => {
        const wallet = (window as unknown as { CWI: CwiBoundary }).CWI
        return wallet.internalizeAction({
          tx,
          outputs: [{
            outputIndex: 0,
            protocol: 'wallet payment',
            paymentRemittance: { derivationPrefix, derivationSuffix, senderIdentityKey }
          }],
          description: 'TPNIL controlled fixture funding',
          labels: ['tpnil-fixture']
        })
      },
      { tx: [...fundingBeef], derivationPrefix, derivationSuffix, senderIdentityKey }
    )
    evidence.addBytes('funding.atomicbeef', fundingBeef)
    evidence.addJson('funding.json', { fundingTxid, fundingHeight, fixtureProofValid, internalized })
    vectors.push({
      id: 'ISI-4-V001',
      outcome: walletVersion === expectedWalletVersion && walletNetwork === 'mainnet' && authenticated && fixtureProofValid
        ? 'PASS'
        : 'FAIL',
      assertions: [
        { id: 'artifact-and-version', outcome: walletVersion === expectedWalletVersion ? 'PASS' : 'FAIL', detail: walletVersion, evidence: ['artifact.json'] },
        { id: 'mainnet-configuration', outcome: walletNetwork === 'mainnet' ? 'PASS' : 'FAIL', detail: walletNetwork, evidence: ['boundary.json'] },
        { id: 'controlled-fixture-proof', outcome: fixtureProofValid ? 'PASS' : 'FAIL', detail: fundingTxid, evidence: ['funding.atomicbeef', 'funding.json'] }
      ],
      limitations: ['The controlled mainnet-format fixture is not a public-mainnet UTXO or public-network acceptance claim.']
    })
    evidence.addJson('boundary.json', boundary)
    evidence.addJson('artifact.json', { wallet: options.walletArtifact, application: options.applicationArtifact })
    progress('controlled funding internalized')

    if (options.prepareScenario !== undefined) {
      await options.prepareScenario({ integratedProfile: options.integratedProfile, application, context, extensionId, password: 'TPNIL-Fixture-Only-2026!', services, evidence, baselineVectors: structuredClone(vectors), manualPrompt: async () => { throw new Error('Preparation does not own manual permission UI') } })
      evidence.addJson('conformance/scenario-start.json', { startedAt: new Date().toISOString(), stage: 'before-all-customer-scenarios' })
      progress('declared initial conformance reserves internalized before customer scenarios')
    }

    if (['ITCVE-1@4.3.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(options.integratedProfile ?? '')) {
      if (!options.prepareScenario) throw new Error('Expanded permissions require declared upfront funding')
      const preludeContext: NativeScenarioContext = { integratedProfile: options.integratedProfile, application, context, extensionId, password: 'TPNIL-Fixture-Only-2026!', services, evidence, baselineVectors: structuredClone(vectors), manualPrompt, restartBrowser }
      await (await import('./native/permission-prelude.js')).runNativePermissionPrelude(preludeContext, ['ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(options.integratedProfile ?? '') ? { identityPermission: 'explicit-allow-v1' } : undefined)
      application = activeNativeApplication(preludeContext.context, preludeContext.application)
      context = preludeContext.context
      progress('fresh funded native permission prelude completed before ToDo scenarios')
    }

    const createUrl = new URL('https://todo.itcve.test/')
    createUrl.searchParams.set('p0Task', task)
    createUrl.searchParams.set('p0Amount', String(amount))
    createUrl.searchParams.set('p0OpenCreate', '1')
    await application.goto(createUrl.toString())
    await application.getByTestId('p0-todo-create-submit').click()
    const created = await waitForTodoOutputs(application, value =>
      value.outputs.some(output => output.satoshis === amount && /^[a-f0-9]{64}[._]\d+$/i.test(output.outpoint))
    )
    const createdOutput = created.outputs.find(output => output.satoshis === amount && /^[a-f0-9]{64}[._]\d+$/i.test(output.outpoint))
    if (createdOutput === undefined) throw new Error('Created ToDo output is absent from the wallet basket')
    createTxid = extractTxid(createdOutput.outpoint)
    if (created.beef === undefined) throw new Error('Wallet omitted BEEF for the created ToDo output')
    const outputIndex = Number(createdOutput.outpoint.split(/[._]/)[1])
    if (!Number.isSafeInteger(outputIndex) || outputIndex < 0) throw new Error('Created ToDo output index is invalid')
    const createdBeef = Beef.fromBinary(Uint8Array.from(created.beef))
    const createdTransaction = Transaction.fromAtomicBEEF(createdBeef.toBinaryAtomic(createTxid))
    const createdLockingScript = createdTransaction.outputs[outputIndex]?.lockingScript
    if (createdLockingScript === undefined) throw new Error('Created ToDo locking script is absent from BEEF')
    const pushDrop = PushDrop.decode(LockingScript.fromHex(createdLockingScript.toHex()))
    const protocolAddress = Utils.toUTF8(pushDrop.fields[0] ?? [])
    const decrypted = await application.evaluate(async ciphertext => {
      const wallet = (window as unknown as { CWI: CwiBoundary }).CWI
      return wallet.decrypt({ ciphertext, protocolID: [0, 'todo list'], keyID: '1', counterparty: 'self' })
    }, pushDrop.fields[1] ?? [])
    const plaintext = Utils.toUTF8((decrypted.plaintext as number[]) ?? [])
    evidence.addJson('created-output.json', {
      created,
      lockingScript: createdLockingScript.toHex(),
      protocolAddress,
      plaintext,
      createTxid
    })
    if (created.beef !== undefined) evidence.addBytes('create.beef', Uint8Array.from(created.beef))
    vectors.push({
      id: 'ISI-4-V002',
      outcome: protocolAddress === '1ToDoDtKreEzbHYKFjmoBuduFmSXXUGZG' && plaintext === task ? 'PASS' : 'FAIL',
      assertions: [
        { id: 'todo-basket-output', outcome: createdOutput.satoshis === amount ? 'PASS' : 'FAIL', detail: createdOutput.outpoint, evidence: ['created-output.json'] },
        { id: 'pushdrop-protocol-field', outcome: protocolAddress === '1ToDoDtKreEzbHYKFjmoBuduFmSXXUGZG' ? 'PASS' : 'FAIL', detail: protocolAddress, evidence: ['created-output.json'] },
        { id: 'encrypted-task-roundtrip', outcome: plaintext === task ? 'PASS' : 'FAIL', detail: plaintext, evidence: ['created-output.json'] }
      ],
      limitations: []
    })
    if (options.nativeQualification !== undefined) evidence.addBytes('native-created.png', await application.screenshot())
    progress('ToDo token created and decoded')

    await application.evaluate(() => localStorage.clear())
    await application.goto('https://todo.itcve.test/')
    await waitForText(application, task, 45_000)
    const afterReload = await listTodoOutputs(application)
    const reloadMatches = afterReload.outputs.filter(output => output.outpoint === createdOutput.outpoint).length === 1
    evidence.addJson('cold-reload.json', { localStorageCleared: true, afterReload, taskVisible: true })
    vectors.push({
      id: 'ISI-4-V003',
      outcome: reloadMatches ? 'PASS' : 'FAIL',
      assertions: [{
        id: 'wallet-state-reconstruction',
        outcome: reloadMatches ? 'PASS' : 'FAIL',
        detail: createdOutput.outpoint,
        evidence: ['cold-reload.json']
      }],
      limitations: []
    })
    if (options.nativeQualification !== undefined) evidence.addBytes('native-reloaded.png', await application.screenshot())
    progress('cold reload reconstructed wallet state')

    await application.getByLabel(`${task} ${amount} satoshis`).click()
    await application.getByTestId('p0-todo-complete-submit').click()
    const afterRedeem = await waitForTodoOutputs(application, value =>
      !value.outputs.some(output => output.outpoint === createdOutput.outpoint)
    )
    const spent = !afterRedeem.outputs.some(output => output.outpoint === createdOutput.outpoint)
    const actions = await application.evaluate(async () => {
      const wallet = (window as unknown as { CWI: CwiBoundary }).CWI
      return wallet.listActions({ limit: 100, includeInputs: true, includeOutputs: true })
    })
    const actionList = (actions.actions as Array<Record<string, unknown>>) ?? []
    const newest = actionList.at(-1)
    redeemTxid = typeof newest?.txid === 'string' ? newest.txid : undefined
    evidence.addJson('redeem.json', { spentOutpoint: createdOutput.outpoint, afterRedeem, actions })
    if (options.nativeQualification !== undefined) {
      const submissions = services.submissions.map(item => ({ txid: item.txid, verdict: item.verdict, beefHex: Buffer.from(item.bytes).toString('hex') }))
      evidence.addJson('native-submissions.json', submissions)
      const spend = actionList.find(action => Array.isArray(action.inputs) && action.inputs.some((input: Record<string, unknown>) => String(input.sourceOutpoint ?? '') === createdOutput.outpoint))
      if (typeof spend?.txid === 'string') redeemTxid = spend.txid
    }
    vectors.push({
      id: 'ISI-4-V004',
      outcome: spent ? 'PASS' : 'FAIL',
      assertions: [{ id: 'spent-output-absent', outcome: spent ? 'PASS' : 'FAIL', detail: createdOutput.outpoint, evidence: ['redeem.json'] }],
      limitations: ['Delayed-broadcast wallet state was evaluated; public-mainnet acceptance was outside the profile.']
    })
    if (options.nativeQualification !== undefined) evidence.addBytes('native-redeemed.png', await application.screenshot())
    progress('ToDo token redeemed')

    const deniedProtocol = [2, 'tpnil denied permission']
    const denialPage = await context.newPage()
    await denialPage.goto('https://deny.itcve.test/')
    await waitForText(denialPage, 'TPNIL boundary fixture', 30_000)
    await denialPage.waitForFunction(() => Boolean((window as unknown as { CWI?: unknown }).CWI), undefined, {
      timeout: 30_000
    })
    progress('requesting explicit protocol denial')
    const denial = await within('protocol-denial request', 60_000, denialPage.evaluate(async protocolID => {
      const wallet = (window as unknown as { CWI: CwiBoundary }).CWI
      try {
        await wallet.getPublicKey({ protocolID, keyID: 'denied', counterparty: 'anyone', forSelf: true })
        return { rejected: false, message: '' }
      } catch (error) {
        return { rejected: true, message: error instanceof Error ? error.message : String(error) }
      }
    }, deniedProtocol)).catch(error => ({
      rejected: false,
      message: error instanceof Error ? error.message : String(error)
    }))
    await denialPage.close()
    const alternate = await context.newPage()
    await alternate.goto('https://alternate.itcve.test/')
    await waitForText(alternate, 'TPNIL boundary fixture', 30_000)
    await alternate.waitForFunction(() => Boolean((window as unknown as { CWI?: unknown }).CWI), undefined, {
      timeout: 30_000
    })
    progress('requesting independent cross-origin protocol decision')
    const crossOrigin = await within('cross-origin permission request', 45_000, alternate.evaluate(async () => {
      const wallet = (window as unknown as { CWI: CwiBoundary }).CWI
      try {
        await wallet.getPublicKey({ protocolID: [2, 'tpnil origin isolation'], keyID: '1', counterparty: 'anyone', forSelf: true })
        return { independentlyPrompted: false, message: '' }
      } catch (error) {
        return { independentlyPrompted: true, message: error instanceof Error ? error.message : String(error) }
      }
    })).catch(error => ({
      independentlyPrompted: false,
      message: error instanceof Error ? error.message : String(error)
    }))
    await alternate.close()
    evidence.addJson('permissions.json', { denial, crossOrigin, permissions })
    vectors.push({
      id: 'ISI-4-V005',
      outcome: denial.rejected && crossOrigin.independentlyPrompted ? 'PASS' : 'FAIL',
      assertions: [
        { id: 'deny-enforced', outcome: denial.rejected ? 'PASS' : 'FAIL', detail: denial.message, evidence: ['permissions.json'] },
        { id: 'origin-isolation', outcome: crossOrigin.independentlyPrompted ? 'PASS' : 'FAIL', detail: crossOrigin.message, evidence: ['permissions.json'] }
      ],
      limitations: ['The extension window-injection substrate was exercised; HTTP and XDM substrates are separate deployment profiles.']
    })
    progress('permission denial and cross-origin isolation exercised')

    const exerciseImmediate = async (
      name: string,
      verdict: 'ACCEPTED_BY_NETWORK' | 'REJECTED'
    ): Promise<{
      body: string
      outputs?: ListOutputProjection
      error?: string
      submission?: { txid: string; verdict: 'ACCEPTED_BY_NETWORK' | 'REJECTED'; sha256: string }
      submissionWindow?: TodoSubmissionWindow
    }> => {
      services.enqueueVerdict(verdict, ['ITCVE-1@1.4.0', 'ITCVE-1@1.5.0', 'ITCVE-1@2.0.0', 'ITCVE-1@4.0.0', 'ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.3.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(options.integratedProfile ?? '') ? { kind: 'todo-output', protocol: todoProtocol, amount: 2 } : undefined)
      const submissionsBefore = services.submissions.length
      const phaseStartedAt = new Date().toISOString()
      const casePage = await context!.newPage()
      const url = new URL('https://todo.itcve.test/')
      url.searchParams.set('p0Task', name)
      url.searchParams.set('p0Amount', '2')
      url.searchParams.set('p0OpenCreate', '1')
      url.searchParams.set('p0ImmediateBroadcast', '1')
      progress(`immediate ${verdict}: opening isolated application page`)
      let body = ''
      let outputs: ListOutputProjection | undefined
      let error: string | undefined
      try {
        await within(`immediate ${verdict} navigation`, 30_000, casePage.goto(url.toString()).then(() => undefined))
        await within(`immediate ${verdict} form readiness`, 30_000,
          casePage.getByTestId('p0-todo-create-submit').waitFor({ state: 'visible' }))
        await within(`immediate ${verdict} task prefill`, 30_000,
          casePage.waitForFunction(expected => {
            const input = document.querySelector<HTMLInputElement>('[data-testid="p0-todo-task-input"]')
            return input?.value === expected
          }, name))
        await within(`immediate ${verdict} amount prefill`, 30_000,
          casePage.waitForFunction(() => {
            const input = document.querySelector<HTMLInputElement>('[data-testid="p0-todo-amount-input"]')
            return input?.value === '2'
          }))
        await within(`immediate ${verdict} submit`, 30_000,
          casePage.getByTestId('p0-todo-create-submit').click())
        progress(`immediate ${verdict}: submit dispatched`)
        const deadline = Date.now() + 45_000
        while (Date.now() < deadline) {
          body = await within(`immediate ${verdict} page observation`, 5_000,
            casePage.locator('body').innerText())
          if (['ITCVE-1@1.4.0', 'ITCVE-1@1.5.0', 'ITCVE-1@2.0.0', 'ITCVE-1@4.0.0', 'ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.3.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(options.integratedProfile ?? '')) {
            const candidate = bindTodoSubmissionWindow(services.submissions, submissionsBefore, name, phaseStartedAt, new Date().toISOString())
            if (candidate.selection !== 'none') break
          } else if (services.submissions.length > submissionsBefore) break
          await casePage.waitForTimeout(500)
        }
        progress(`immediate ${verdict}: ${services.submissions.length - submissionsBefore} submission(s) observed`)
        await casePage.waitForTimeout(2_000)
        body = await within(`immediate ${verdict} final page observation`, 5_000,
          casePage.locator('body').innerText())
        outputs = await within(`immediate ${verdict} wallet projection`, 30_000, listTodoOutputs(casePage))
      } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause)
        progress(`immediate ${verdict}: bounded failure: ${error}`)
        body = await casePage.locator('body').innerText({ timeout: 5_000 }).catch(() => '')
      } finally {
        await casePage.close().catch(() => undefined)
      }
      const submissionWindow = ['ITCVE-1@1.4.0', 'ITCVE-1@1.5.0', 'ITCVE-1@2.0.0', 'ITCVE-1@4.0.0', 'ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.3.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(options.integratedProfile ?? '')
        ? bindTodoSubmissionWindow(services.submissions, submissionsBefore, name, phaseStartedAt, new Date().toISOString()) : undefined
      const observed = submissionWindow === undefined
        ? services.submissions.length > submissionsBefore ? services.submissions.at(-1) : undefined
        : submissionWindow.selection === 'unique' ? services.submissions[submissionWindow.selectedIndex!] : undefined
      const discardedUnconsumedVerdict = observed === undefined ? services.discardQueuedVerdict(verdict) : false
      return {
        body,
        ...(submissionWindow === undefined ? {} : { submissionWindow }),
        ...(outputs === undefined ? {} : { outputs }),
        ...(error === undefined ? {} : { error }),
        ...(discardedUnconsumedVerdict ? { error: error ?? 'No controlled submission consumed the scheduled verdict.' } : {}),
        ...(observed === undefined ? {} : {
          submission: { txid: observed.txid, verdict: observed.verdict, sha256: sha256Hex(observed.bytes) }
        })
      }
    }
    const accepted = await exerciseImmediate(`${task} accepted`, 'ACCEPTED_BY_NETWORK')
    const acceptedCount = accepted.outputs?.totalOutputs
    const rejected = await exerciseImmediate(`${task} rejected`, 'REJECTED')
    const rejectedStatePreserved = acceptedCount !== undefined && rejected.outputs?.totalOutputs === acceptedCount
    const recovered = await exerciseImmediate(`${task} recovered`, 'ACCEPTED_BY_NETWORK')
    const recoveredStateAdvanced = acceptedCount !== undefined && recovered.outputs?.totalOutputs === acceptedCount + 1
    const acceptedPassed = accepted.submission?.verdict === 'ACCEPTED_BY_NETWORK'
      && accepted.body.includes('Task successfully created!')
    const rejectedPassed = rejected.submission?.verdict === 'REJECTED' && rejectedStatePreserved
    const recoveryPassed = recovered.submission?.verdict === 'ACCEPTED_BY_NETWORK' && recoveredStateAdvanced
    evidence.addJson('broadcast-lifecycle.json', {
      ...(['ITCVE-1@1.4.0', 'ITCVE-1@1.5.0', 'ITCVE-1@2.0.0', 'ITCVE-1@4.0.0', 'ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.3.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(options.integratedProfile ?? '') ? { submissionBinding: todoSubmissionBinding } : {}),
      accepted,
      rejected,
      recovered,
      assertions: { acceptedPassed, rejectedPassed, rejectedStatePreserved, recoveryPassed, recoveredStateAdvanced }
    })
    vectors.push({
      id: 'ISI-4-V006',
      outcome: acceptedPassed && rejectedPassed && recoveryPassed ? 'PASS' : 'FAIL',
      assertions: [
        {
          id: 'accepted-service-verdict-observed',
          outcome: acceptedPassed ? 'PASS' : 'FAIL',
          detail: accepted.submission?.txid ?? 'no controlled submission observed',
          evidence: ['broadcast-lifecycle.json']
        },
        {
          id: 'rejection-preserves-wallet-state',
          outcome: rejectedPassed ? 'PASS' : 'FAIL',
          detail: rejected.submission?.txid ?? 'no controlled rejected submission observed',
          evidence: ['broadcast-lifecycle.json']
        },
        {
          id: 'post-rejection-recovery',
          outcome: recoveryPassed ? 'PASS' : 'FAIL',
          detail: recovered.submission?.txid ?? 'no controlled recovery submission observed',
          evidence: ['broadcast-lifecycle.json']
        }
      ],
      limitations: ['These are controlled-service verdicts; they are not public-mainnet observations.']
    })
    progress('accepted, rejected, and recovered immediate broadcasts exercised')

    vectors.push({
      id: 'ISI-4-V007',
      outcome: 'BLOCKED',
      assertions: [{
        id: 'remote-storage-continuity',
        outcome: 'PASS',
        detail: 'Creation, cold reload, and redemption used the controlled Wallet Toolbox remote-storage boundary.',
        evidence: ['cold-reload.json', 'redeem.json']
      }],
      limitations: ['Counterpart replacement requires the executable ISI-3 multi-remote synchronization profile, which is not yet implemented.']
    })

    const methodInventory = await application.evaluate(() =>
      Object.keys((window as unknown as { CWI: CwiBoundary }).CWI).sort()
    )
    const controlledHeader = options.headerFixture === undefined ? undefined : getControlledHeaderFixture(options.headerFixture)
    const safeBoundary = await application.evaluate(captureNativeSafeBoundary, controlledHeader)
    const cryptoRoundtrip = Buffer.from(safeBoundary.decrypted).toString() === 'TPNIL boundary fixture'
    evidence.addJson('method-inventory.json', { methods: methodInventory, safeBoundary, ...(controlledHeader ? { headerFixture: controlledHeader.id, headerFixturePolicySha256: controlledHeader.policySha256, headerFundingFixtureSha256: controlledHeader.fixtureSha256 } : {}) })
    vectors.push({
      id: 'ISI-4-V008',
      outcome: 'BLOCKED',
      assertions: [
        { id: 'declared-method-inventory', outcome: methodInventory.length === 28 ? 'PASS' : 'FAIL', detail: `${methodInventory.length} methods`, evidence: ['method-inventory.json'] },
        { id: 'crypto-positive-cases', outcome: cryptoRoundtrip && safeBoundary.signatureVerified && safeBoundary.hmacVerified ? 'PASS' : 'FAIL', detail: 'encrypt/decrypt, signature, and HMAC', evidence: ['method-inventory.json'] }
      ],
      limitations: ['Certificate acquisition, identity discovery, linkage revelation, abort, and relinquishment need clause-level positive and specified-error fixtures before complete BRC-100 coverage can be claimed.']
    })
    progress('safe BRC-100 boundary corpus exercised')

    if (options.additionalScenario !== undefined) {
      progress('additional integrated component scenario: starting')
      const baselineVectors = structuredClone(vectors)
      if (['ITCVE-1@1.4.0', 'ITCVE-1@1.5.0', 'ITCVE-1@2.0.0', 'ITCVE-1@4.0.0', 'ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.3.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(options.integratedProfile ?? '')) evidence.addJson('conformance/baseline-vectors.json', baselineVectors)
      const additional = await options.additionalScenario({ integratedProfile: options.integratedProfile, application, context, extensionId, password: 'TPNIL-Fixture-Only-2026!', services, evidence, baselineVectors, manualPrompt, ...(['ITCVE-1@4.0.0', 'ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.3.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(options.integratedProfile ?? '') ? { restartBrowser } : {}) })
      if (['ITCVE-1@1.4.0', 'ITCVE-1@1.5.0', 'ITCVE-1@2.0.0', 'ITCVE-1@4.0.0', 'ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.3.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(options.integratedProfile ?? '')) {
        if (!additional || additional.vectors.length !== 8 || additional.vectors.some((vector, i) => vector.id !== `ISI-4-V00${i + 1}`)) throw new Error('Conformance scenario omitted required vector outcomes')
        vectors.splice(0, vectors.length, ...additional.vectors)
        evidence.addJson('conformance/service-counterparts.json', services.storageCounterpartIdentities)
      }
      progress('additional integrated component scenario: completed')
    }

    if (options.nativeQualification !== undefined) {
      evidence.addJson('native-transactions.json', await services.nativeTransactions())
      if (options.nativeActionReferenceEvidence) {
        const { publicKey: identity } = await activeNativeApplication(context, application).evaluate(() => (window as any).CWI.getPublicKey({ identityKey: true, seekPermission: false }))
        evidence.addJson('native-action-references.json', { identity, references: await services.nativeActionReferences(identity) })
      }
      if (['ITCVE-1@4.3.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(options.integratedProfile ?? '')) {
        evidence.addJson('native-output-snapshot-observations.json', services.nativeOutputSnapshotObservations)
        evidence.addJson('native-output-provider-registry.json', services.nativeOutputProviderRegistry)
      }
      if (['ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(options.integratedProfile ?? '')) {
        const { captureCompletionInventoryLedger, completionInventoryLedgerFile } = await import('./native/completion-observer-ledger.js')
        const identity = JSON.parse(evidence.readBytes('integrated/result.json').toString()).walletIdentity
        await services.nativeActionQueryCuts(identity)
        evidence.addJson(completionInventoryLedgerFile, captureCompletionInventoryLedger(services, options.integratedProfile))
      }
      if (options.shutdownSubmissionPolicy) {
        submissionClosure = services.observeSubmissionClosure()
        initialSubmissionCaptureAt = new Date().toISOString()
      }
      evidence.addJson('native-submissions.json', submissionClosure?.initialSubmissions ?? services.submissions.map(item => ({ txid: item.txid, verdict: item.verdict, beefHex: Buffer.from(item.bytes).toString('hex') })))
    }
    evidence.addJson('routes.json', services.routes)
    evidence.addJson('console-errors.json', consoleErrors)
    const resultWithoutEvidence: Omit<WalletLabResult, 'evidence'> = {
      schema: 'tpnil-isi4-wallet-run@1.0.0',
      claim: Object.values(services.components).includes('go') ? 'ENGINEERING_OBSERVATION_ONLY' : 'EXPERIMENTAL_CONFORMANCE_RESULT',
      program: options.integratedProfile === 'ITCVE-1@4.7.0' ? 'ISI-4@5.7.0' : ['ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(options.integratedProfile ?? '') ? 'ISI-4@5.6.0' : options.integratedProfile === 'ITCVE-1@4.5.0' ? 'ISI-4@5.5.0' : options.integratedProfile === 'ITCVE-1@4.4.0' ? 'ISI-4@5.4.0' : ['ITCVE-1@4.3.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(options.integratedProfile ?? '') ? 'ISI-4@5.3.0' : options.integratedProfile === 'ITCVE-1@4.2.0' ? 'ISI-4@5.2.0' : options.integratedProfile === 'ITCVE-1@4.1.0' ? 'ISI-4@5.1.0' : options.integratedProfile === 'ITCVE-1@4.0.0' ? 'ISI-4@5.0.0' : options.integratedProfile === 'ITCVE-1@2.0.0' ? 'ISI-4@4.0.0' : options.integratedProfile === 'ITCVE-1@1.5.0' ? 'ISI-4@3.0.0' : options.integratedProfile === 'ITCVE-1@1.4.0' ? 'ISI-4@2.0.0' : 'ISI-4@1.0.0',
      itcve: options.integratedProfile ?? (Object.values(services.components).includes('go') ? 'ITCVE-1@1.1.0' : 'ITCVE-1@1.0.0'),
      ...(options.walletCandidate ? { walletCandidate: options.walletCandidate } : {}),
      profile: ['ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.3.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(options.integratedProfile ?? '') ? 'candidate-wallet-native-engineering' : ['ITCVE-1@1.4.0', 'ITCVE-1@1.5.0', 'ITCVE-1@2.0.0', 'ITCVE-1@4.0.0', 'ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.3.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(options.integratedProfile ?? '') ? 'production-wallet-native-conformance' : 'production-wallet-todo-controlled-services',
      runId,
      startedAt,
      endedAt: new Date().toISOString(),
      runner: {
        os: `${os.platform()} ${os.release()}`,
        architecture: os.arch(),
        node: process.version,
        browser: browserVersion,
        headless: options.headless ?? true
      },
      artifacts: { wallet: options.walletArtifact, application: options.applicationArtifact },
      configuration: {
        ...(Object.values(services.components).includes('go') ? { serviceComponents: services.componentIdentity } : {}),
        walletNetwork: 'mainnet',
        publicMainnetBroadcast: false,
        applicationOrigin: 'https://todo.itcve.test',
        controlledDestinations: nativeControlledDestinations(options.integratedProfile),
        ...(options.submissionOrdering ? { submissionOrdering: options.submissionOrdering } : {}),
        undeclaredEgress: 'blocked'
      },
      observations: {
        walletVersion,
        walletNetwork,
        authenticated,
        fundingTxid,
        ...(createTxid === undefined ? {} : { createTxid }),
        ...(redeemTxid === undefined ? {} : { redeemTxid }),
        routes: services.routes,
        permissions
      },
      vectors,
      semanticProjection: {
        walletVersion,
        walletNetwork,
        authenticated,
        v001: vectors.find(vector => vector.id === 'ISI-4-V001')!.outcome,
        v002: vectors.find(vector => vector.id === 'ISI-4-V002')!.outcome,
        v003: vectors.find(vector => vector.id === 'ISI-4-V003')!.outcome,
        v004: vectors.find(vector => vector.id === 'ISI-4-V004')!.outcome,
        v005: vectors.find(vector => vector.id === 'ISI-4-V005')!.outcome,
        v006: vectors.find(vector => vector.id === 'ISI-4-V006')!.outcome,
        v007: vectors.find(vector => vector.id === 'ISI-4-V007')!.outcome,
        v008: vectors.find(vector => vector.id === 'ISI-4-V008')!.outcome,
        todoLifecycle: spent,
        permissionsIsolated: denial.rejected && crossOrigin.independentlyPrompted,
        methodCount: methodInventory.length
      },
      outcome: aggregateOutcome(vectors)
    }
    return evidence.write(resultWithoutEvidence)
  } catch (error) {
    primaryFailure = { error }
    evidence.addJson('attempt-failure.json', { error: nativeFailureSnapshot(error), message: error instanceof Error ? error.message : String(error), vectors, routes: services.routes, storageRpc: services.storageRpcObservations, consoleErrors, permissions })
    if (options.nativeQualification !== undefined && context !== undefined) {
      for (const [index, page] of context.pages().filter(page => page.url().startsWith('https://todo.itcve.test/')).entries()) {
        try { evidence.addBytes(`attempt-application-${index}.png`, await page.screenshot({ timeout: 5000 })) } catch { /* Preserve the original observer failure. */ }
      }
    }
    evidence.addText('go-diagnostics.log', services.componentDiagnostics)
    evidence.flush()
    throw error
  } finally {
    if (promptPoll !== undefined) clearInterval(promptPoll)
    const cleanupFailures: unknown[] = [], evidenceFailures: unknown[] = []
    if (['ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(options.integratedProfile ?? '')) {
      try {
        const { observeCompletionInventoryClosure } = await import('./native/completion-observer-ledger.js')
        completionInventoryObserver = observeCompletionInventoryClosure(services, options.integratedProfile)
      } catch (error) { evidenceFailures.push(error) }
    }
    if (options.shutdownSubmissionPolicy) {
      const closed = await captureWithNativeCleanup(async closers => {
        submissionClosure ??= services.observeSubmissionClosure()
        initialSubmissionCaptureAt ??= new Date().toISOString()
        const { closeWithSubmissionReceipt } = await import('./native/shutdown-submissions.js')
        return await closeWithSubmissionReceipt({ directory: outputDirectory, observer: submissionClosure, initialCapturedAt: initialSubmissionCaptureAt,
          profile: options.integratedProfile as 'ITCVE-1@2.0.0' | 'ITCVE-1@4.0.0' | 'ITCVE-1@4.1.0' | 'ITCVE-1@4.2.0' | 'ITCVE-1@4.3.0' | 'ITCVE-1@4.4.0' | 'ITCVE-1@4.5.0' | 'ITCVE-1@4.6.0' | 'ITCVE-1@4.7.0',
          ...closers })
      }, {
        closeBrowser: async () => { if (!context) throw new Error('Native browser context is absent'); await context.close() },
        closeServices: async () => { await services.close() },
        removeProfile: () => fs.rmSync(profileDirectory, { recursive: true, force: true })
      })
      cleanupFailures.push(...closed.cleanupErrors)
      evidenceFailures.push(...closed.evidenceErrors)
    } else {
      try { await context?.close() } catch (error) { cleanupFailures.push(error) }
      try { await services.close() } catch (error) { cleanupFailures.push(error) }
      try { fs.rmSync(profileDirectory, { recursive: true, force: true }) } catch (error) { cleanupFailures.push(error) }
    }
    if (['ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(options.integratedProfile ?? '')) {
      try {
        const { closeCompletionInventoryLedger } = await import('./native/completion-observer-ledger.js')
        evidenceFailures.push(...closeCompletionInventoryLedger(outputDirectory, completionInventoryObserver ?? services).errors)
      } catch (error) { evidenceFailures.push(error) }
    }
    if (options.nativeQualification !== undefined && (cleanupFailures.length > 0 || evidenceFailures.length > 0)) throw nativeShutdownFailure(primaryFailure, cleanupFailures, evidenceFailures)
  }
}
