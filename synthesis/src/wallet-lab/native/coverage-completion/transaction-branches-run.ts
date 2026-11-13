import {observeActiveStorageSummary} from './provider-summary-observer.js'
// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import type { NativeScenarioContext } from '../../yours-driver.js'
import { nativeWalletBoundary } from '../integrated.js'
import { createFixtureWallet } from '../../../storage-sync/fixture-wallet.js'
import { coverageObservationEncoding, decodeCoverageObservation, writeCoverageObservation } from '../coverage-observation.js'
import { runTransactionBranches } from './transaction-branches-driver.js'
import { createIsolatedKnownSource } from './transaction-known-source.js'
import { finalizeTransactionBranchReport } from './transaction-branches-parent.js'
import { withNativePortabilitySettingsPage } from '../conformance-portability.js'

export async function runNativeTransactionBranches(context: NativeScenarioContext) {
  const funding = decodeCoverageObservation<any>(JSON.parse(context.evidence.readBytes('conformance/completion-funding.json').toString()), coverageObservationEncoding)
  const wallet = new Proxy({}, { get: (_target, method) => typeof method !== 'string' || method === 'then' ? undefined
    : (args: unknown) => nativeWalletBoundary(context.application, true)[method](args) })
  const funder = await createFixtureWallet(context.services, '77'.repeat(32)), unknownSource = await createIsolatedKnownSource(context.services, funder)
  let report: any, lastObservation: any, primary: unknown
  try {
    report = await runTransactionBranches({ wallet, funder, services: context.services, identity: funding.identity, unknownSource,
      observeActiveProvider: (stage: string) => context.manualPrompt(() => withNativePortabilitySettingsPage(context.application, context.extensionId, async page => {
        const startedAt = new Date().toISOString()
        await page.getByText('Settings', { exact: true }).last().click()
        await page.getByText('Lock Wallet', { exact: true }).waitFor()
        await page.getByText('Wallet Backup', { exact: true }).first().click()
        await page.getByText('Remote Backup', { exact: true }).click()
        await page.getByText('Sync Now', { exact: true }).waitFor()
        const allowed = [{ id: 'source', providerUrl: 'https://wallet.1sat.app' }, { id: 'source/replacement-wallet.itcve.test', providerUrl: 'https://replacement-wallet.itcve.test' }]
        if(context.integratedProfile==='ITCVE-1@4.8.0')return observeActiveStorageSummary(page,allowed,stage,context.evidence)
        const cards = await page.locator('button.w-full').allInnerTexts()
        const candidates = allowed.map(provider => { const matches = cards.filter(card => card.split('\n').map(line => line.trim()).includes(new URL(provider.providerUrl).host)); assert.ok(matches.length <= 1); return { ...provider, present: matches.length === 1, card: matches[0] ?? null } })
        const activeCards = cards.filter(card => card.split('\n').map(line => line.trim().toLowerCase()).includes('in use'))
        assert.equal(activeCards.length, 1)
        const selected = candidates.filter(provider => provider.card === activeCards[0]); assert.equal(selected.length, 1)
        const { id, providerUrl } = selected[0]!
        const mainScreenshot = `conformance/transaction-branches-provider-cards-${stage}.png`, mainBytes = await page.screenshot()
        context.evidence.addBytes(mainScreenshot, mainBytes)
        await page.getByRole('button').filter({ hasText: new URL(providerUrl).host }).first().click()
        await page.getByText(providerUrl, { exact: true }).waitFor()
        const card = await page.getByText(providerUrl, { exact: true }).evaluate(element => {
          let current: Element | null = element
          while (current && !(current.classList.contains('w-full') && current.classList.contains('rounded-xl'))) current = current.parentElement
          if (!current) throw Error('Exact remote provider detail card is absent')
          return (current as HTMLElement).innerText
        })
        assert.ok(card.split('\n').map(line => line.trim().toLowerCase()).includes('in use')); assert.ok(!card.includes('Backup copy'))
        const screenshot = `conformance/transaction-branches-active-provider-${stage}.png`, bytes = await page.screenshot()
        context.evidence.addBytes(screenshot, bytes)
        return { kind: 'NATIVE_REMOTE_BACKUP_UI', id, providerUrl, candidates, activeCards, mainScreenshot, mainScreenshotSha256: createHash('sha256').update(mainBytes).digest('hex'),
          url: page.url(), card, screenshot, screenshotSha256: createHash('sha256').update(bytes).digest('hex'), startedAt, endedAt: new Date().toISOString() }
      })),
      onProgress: (value: unknown) => { lastObservation = value; writeCoverageObservation(context.evidence, 'conformance/transaction-branches-observed.json', value, coverageObservationEncoding) } })
  } catch (error) { primary = error }
  finally {
    for (const close of [() => unknownSource.close(), () => funder.destroy()]) try { await close() }
    catch (error) { primary = primary ? new AggregateError([primary, error], 'Transaction completion cleanup failed', { cause: primary }) : error }
    writeCoverageObservation(context.evidence, 'conformance/transaction-branches-fixture.json', unknownSource.report, coverageObservationEncoding)
  }
  if (primary) {
    const failed = report ?? lastObservation
    if (failed) {
      failed.result = 'INVALID_EXECUTION'
      failed.executionError = { name: primary instanceof Error ? primary.name : 'Error', message: primary instanceof Error ? primary.message : String(primary) }
      writeCoverageObservation(context.evidence, 'conformance/transaction-branches.json', failed, coverageObservationEncoding)
    }
    throw primary
  }
  report.mode = 'NATIVE_OBSERVATION'
  report.observedStorage = await context.services.nativeTransactions()
  report.finalRoutes = structuredClone(context.services.routes)
  report.finalSubmissions = context.services.submissions.map(row => ({ txid: row.txid, verdict: row.verdict, beefHex: Buffer.from(row.bytes).toString('hex') }))
  report.fixture = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../../../../fixtures/teranode/wab-funding-v1.json'), 'utf8'))
  report.declaredNativePayments = [...new Set(report.cuts[0].snapshot.providers.flatMap((provider: any) => provider.snapshot.outputs.filter((output: any) => output.spendable).map((output: any) => output.outpoint)))]
  // The child needs the exact source-owned funding roots; the native parent
  // independently replaces this set with the complete admitted root inventory.
  report.parentAdmissionRequired = true
  return finalizeTransactionBranchReport(report, value => writeCoverageObservation(context.evidence, 'conformance/transaction-branches.json', value, coverageObservationEncoding))
}
