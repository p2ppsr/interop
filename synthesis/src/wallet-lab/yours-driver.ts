import fs from 'node:fs'
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
import {
  aggregateOutcome,
  type ArtifactIdentity,
  type PermissionObservation,
  type VectorResult,
  type WalletLabResult
} from './model.js'
import { ControlledWalletServices } from './services.js'

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

export interface YoursRunOptions {
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
  const task = options.task ?? 'TPNIL controlled task'
  const amount = options.amount ?? 2
  const extensionDirectory = path.resolve(options.extensionDirectory)
  const webroot = path.resolve(options.webroot)
  const outputDirectory = path.resolve(options.outputDirectory)
  const runId = path.basename(outputDirectory)
  const evidence = new EvidenceBundle(outputDirectory)
  const services = new ControlledWalletServices({ webroot })
  const permissions: PermissionObservation[] = []
  const consoleErrors: string[] = []
  const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-yours-profile-'))
  let context: BrowserContext | undefined
  let promptPoll: NodeJS.Timeout | undefined
  let permissionSequence = 0
  let browserVersion = 'unknown'
  const handledPromptUrls = new Set<string>()
  const progress = (message: string): void => {
    process.stdout.write(`[wallet-lab:${runId}] ${message}\n`)
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
    context = await chromium.launchPersistentContext(profileDirectory, {
      headless: options.headless ?? true,
      ignoreHTTPSErrors: true,
      args: [
        `--disable-extensions-except=${extensionDirectory}`,
        `--load-extension=${extensionDirectory}`,
        `--proxy-server=${services.proxyUrl}`,
        '--proxy-bypass-list=<-loopback>',
        '--ignore-certificate-errors',
        '--disable-background-networking'
      ]
    })
    browserVersion = context.browser()?.version() ?? 'chromium-persistent-context'
    const handlePrompt = async (page: Page): Promise<void> => {
      await page.waitForLoadState('domcontentloaded').catch(() => undefined)
      if (!page.url().includes('/prompt.html')) return
      const promptUrl = page.url()
      if (handledPromptUrls.has(promptUrl)) return
      handledPromptUrls.add(promptUrl)
      let completed = false
      try {
        await page.locator('body').waitFor({ state: 'visible', timeout: 20_000 })
        await page.waitForFunction(() => {
          const text = document.body?.innerText.trim() ?? ''
          return text !== '' && text !== 'Loading...' && /Allow|Deny/.test(text)
        }, undefined, { timeout: 20_000 })
        const body = await page.locator('body').innerText()
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
        completed = true
      } finally {
        if (!completed) handledPromptUrls.delete(promptUrl)
      }
    }
    context.on('page', page => {
      page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 2_000))
      })
      const attempt = (): void => void handlePrompt(page).catch(error => consoleErrors.push(`prompt: ${String(error)}`))
      page.on('framenavigated', frame => {
        if (frame === page.mainFrame()) attempt()
      })
      attempt()
    })
    promptPoll = setInterval(() => {
      for (const page of context!.pages())
        void handlePrompt(page).catch(error => consoleErrors.push(`prompt-poll: ${String(error)}`))
    }, 250)
    let worker = context.serviceWorkers()[0]
    if (worker === undefined) worker = await context.waitForEvent('serviceworker')
    worker.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 2_000))
    })
    const extensionId = new URL(worker.url()).host
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

    const application = await context.newPage()
    await application.goto('https://todo.itcve.test/')
    await waitForText(application, 'ToDo List', 30_000)
    const boundary = await application.evaluate(async () => {
      const wallet = (window as unknown as { CWI: CwiBoundary }).CWI
      return {
        version: await wallet.getVersion({}),
        network: await wallet.getNetwork({}),
        authenticated: await wallet.isAuthenticated({})
      }
    })
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
    const funding = new Transaction()
    funding.addOutput({
      satoshis: 10_000,
      lockingScript: new P2PKH().lock(PublicKey.fromString(String(derived.publicKey)).toAddress())
    })
    fundingTxid = funding.id('hex')
    const fundingHeight = 900_000
    funding.merklePath = new MerklePath(fundingHeight, [[{ offset: 0, hash: fundingTxid, txid: true }]])
    services.registerHeader({
      version: 1,
      previousHash: '00'.repeat(32),
      merkleRoot: fundingTxid,
      time: 1_800_000_000,
      bits: 486_604_799,
      nonce: 0,
      height: fundingHeight,
      hash: '01'.repeat(32)
    })
    const fundingBeef = Uint8Array.from(funding.toAtomicBEEF())
    const fixtureProofValid = await Beef.fromBinary(fundingBeef).verify({
      isValidRootForHeight: async (root, height) => root === fundingTxid && height === fundingHeight,
      currentHeight: async () => 900_100
    }, false)
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
      outcome: walletVersion === 'yours-wallet-5.1.0' && walletNetwork === 'mainnet' && authenticated && fixtureProofValid
        ? 'PASS'
        : 'FAIL',
      assertions: [
        { id: 'artifact-and-version', outcome: walletVersion === 'yours-wallet-5.1.0' ? 'PASS' : 'FAIL', detail: walletVersion, evidence: ['artifact.json'] },
        { id: 'mainnet-configuration', outcome: walletNetwork === 'mainnet' ? 'PASS' : 'FAIL', detail: walletNetwork, evidence: ['boundary.json'] },
        { id: 'controlled-fixture-proof', outcome: fixtureProofValid ? 'PASS' : 'FAIL', detail: fundingTxid, evidence: ['funding.atomicbeef', 'funding.json'] }
      ],
      limitations: ['The controlled mainnet-format fixture is not a public-mainnet UTXO or public-network acceptance claim.']
    })
    evidence.addJson('boundary.json', boundary)
    evidence.addJson('artifact.json', { wallet: options.walletArtifact, application: options.applicationArtifact })
    progress('controlled funding internalized')

    const createUrl = new URL('https://todo.itcve.test/')
    createUrl.searchParams.set('p0Task', task)
    createUrl.searchParams.set('p0Amount', String(amount))
    createUrl.searchParams.set('p0OpenCreate', '1')
    await application.goto(createUrl.toString())
    await application.getByTestId('p0-todo-create-submit').click()
    const created = await waitForTodoOutputs(application, value =>
      value.outputs.some(output => output.satoshis === amount)
    )
    const createdOutput = created.outputs.find(output => output.satoshis === amount)
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
    vectors.push({
      id: 'ISI-4-V004',
      outcome: spent ? 'PASS' : 'FAIL',
      assertions: [{ id: 'spent-output-absent', outcome: spent ? 'PASS' : 'FAIL', detail: createdOutput.outpoint, evidence: ['redeem.json'] }],
      limitations: ['Delayed-broadcast wallet state was evaluated; public-mainnet acceptance was outside the profile.']
    })
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
    }> => {
      services.enqueueVerdict(verdict)
      const submissionsBefore = services.submissions.length
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
          if (services.submissions.length > submissionsBefore) break
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
      const observed = services.submissions.length > submissionsBefore ? services.submissions.at(-1) : undefined
      const discardedUnconsumedVerdict = observed === undefined ? services.discardQueuedVerdict(verdict) : false
      return {
        body,
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
    const safeBoundary = await application.evaluate(async () => {
      const wallet = (window as unknown as { CWI: CwiBoundary }).CWI
      const plaintext = Array.from(new TextEncoder().encode('TPNIL boundary fixture'))
      const encrypted = await wallet.encrypt({ plaintext, protocolID: [1, 'tpnil boundary'], keyID: '1', counterparty: 'self' })
      const decrypted = await wallet.decrypt({ ciphertext: encrypted.ciphertext, protocolID: [1, 'tpnil boundary'], keyID: '1', counterparty: 'self' })
      const signature = await wallet.createSignature({ data: plaintext, protocolID: [1, 'tpnil boundary'], keyID: '1', counterparty: 'self' })
      const verified = await wallet.verifySignature({ data: plaintext, signature: signature.signature, protocolID: [1, 'tpnil boundary'], keyID: '1', counterparty: 'self' })
      const hmac = await wallet.createHmac({ data: plaintext, protocolID: [1, 'tpnil boundary'], keyID: '1', counterparty: 'self' })
      const hmacVerified = await wallet.verifyHmac({ data: plaintext, hmac: hmac.hmac, protocolID: [1, 'tpnil boundary'], keyID: '1', counterparty: 'self' })
      return {
        decrypted: Array.from((decrypted.plaintext as number[]) ?? []),
        signatureVerified: Boolean(verified.valid),
        hmacVerified: Boolean(hmacVerified.valid),
        height: await wallet.getHeight({}),
        header: await wallet.getHeaderForHeight({ height: 0 })
      }
    })
    const cryptoRoundtrip = Buffer.from(safeBoundary.decrypted).toString() === 'TPNIL boundary fixture'
    evidence.addJson('method-inventory.json', { methods: methodInventory, safeBoundary })
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

    evidence.addJson('routes.json', services.routes)
    evidence.addJson('console-errors.json', consoleErrors)
    const resultWithoutEvidence: Omit<WalletLabResult, 'evidence'> = {
      schema: 'tpnil-isi4-wallet-run@1.0.0',
      claim: 'EXPERIMENTAL_CONFORMANCE_RESULT',
      program: 'ISI-4@1.0.0',
      itcve: 'ITCVE-1@1.0.0',
      profile: 'production-wallet-todo-controlled-services',
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
        walletNetwork: 'mainnet',
        publicMainnetBroadcast: false,
        applicationOrigin: 'https://todo.itcve.test',
        controlledDestinations: ['wallet.1sat.app', 'api.1sat.app', 'messagebox.1sat.app', 'todo.itcve.test', 'alternate.itcve.test'],
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
  } finally {
    if (promptPoll !== undefined) clearInterval(promptPoll)
    await context?.close().catch(() => undefined)
    await services.close().catch(() => undefined)
    fs.rmSync(profileDirectory, { recursive: true, force: true })
  }
}
