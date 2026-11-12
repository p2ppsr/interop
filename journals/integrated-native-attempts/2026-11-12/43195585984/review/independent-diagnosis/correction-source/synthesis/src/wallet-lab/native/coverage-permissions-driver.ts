// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import type { Page } from 'playwright'
import type { NativeScenarioContext } from '../yours-driver.js'
import type { NativePermissionCoverageReport } from './conformance-permission-coverage-model.js'
import { canonicalJson } from '../../determinism.js'
import { createExtendedPermissionObserver, waitForCoverageRevocationSnapshot } from './coverage-permissions-observer.js'
import { permissionExtensionImage, observeExtensionControl } from './coverage-permissions-ui.js'
import { permissionExtensionPolicy, extensionCategories, linkageDimensions, coverageCategoryCall, coverageManifest, coveragePaymentScript, extensionLinkageArgs, extensionPaymentArgs, permissionCoverageConfig, type NativePermissionExtensionReport, type ExtensionStep } from './coverage-permissions-model.js'
import { evaluatePermissionExtension } from './coverage-permissions-verifier.js'
const now = () => new Date().toISOString()
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
/** Public CWI and visible native UI only. Caller suspends automatic prompts.
 * The original coverage report is immutable fixture provenance, never a source
 * of inherited permission results for these fresh origins. */
export async function runPermissionExtension(context: NativeScenarioContext, anchor: NativePermissionCoverageReport, options?: { identityPermission: 'explicit-allow-v1' }): Promise<NativePermissionExtensionReport> {
  const policy = permissionExtensionPolicy(), c = policy.configuration, observer = createExtendedPermissionObserver(context), services = context.services
  const report: NativePermissionExtensionReport = { schema: 'tpnil-native-permission-extension@1.0.0', oracle: policy.oracle, policySha256: policy.sha256, claim: 'ENGINEERING_OBSERVATION_ONLY', completeBRC100Conformance: false, identity: '', extensionId: context.extensionId, startedAt: now(), endedAt: '', anchorSha256: sha(Buffer.from(canonicalJson(anchor))), steps: [], ui: [], settings: [], restarts: [], lock: { sameContext: false, beforePageUrl: '', afterPageUrl: '', passwordVisible: false, passwordHiddenAfterUnlock: false }, manifests: [], storageTransactions: [], submissions: [], submissionWindow: { startIndex: services.submissions.length, endIndex: services.submissions.length }, concurrent: { startedAt: '', endedAt: '' }, references: {}, errors: [], cleanup: { pagesClosed: false, routesUnregistered: false, settingsClosed: false }, assertions: [], result: 'FAIL' }
  if (options) {
    if (options.identityPermission !== 'explicit-allow-v1') throw new Error('Unknown permission extension identity observer')
    report.identityPermission = options.identityPermission
  }
  const unregister: Array<() => void> = [], settingsPages = new Set<Page>()
  const request = async (id: string, origin: string, method: string, args: any, options?: Parameters<typeof observer.request>[4]) => {
    if (report.steps.length >= policy.maximumCalls) throw new Error('Permission extension call limit reached')
    const start = services.submissions.length
    const result: ExtensionStep = Object.assign(await observer.request(id, origin, method, args, options), { submissionStart: start, submissionEnd: services.submissions.length })
    report.steps.push(result)
    if (!['fulfilled', 'rejected'].includes(result.outcome.status)) throw new Error(`${id}: ${result.outcome.message ?? result.outcome.status}`)
    return result
  }
  const value = (step: ExtensionStep) => { if (step.outcome.status !== 'fulfilled') throw new Error(`${step.id}: ${step.outcome.error?.message ?? step.outcome.status}`); return step.outcome.value }
  const category = (category: typeof extensionCategories[number], suffix: string, origin: string, decision?: 'allow' | 'deny') => { const call = coverageCategoryCall(category, anchor.certificate); return request(`${category}-${suffix}`, origin, call.method, call.args, { decision }) }
  const screen = async (origin: string) => {
    const page = await context.context.newPage(); settingsPages.add(page)
    await page.goto(`chrome-extension://${context.extensionId}/index.html`)
    await page.getByText('Settings', { exact: true }).last().click({ timeout: 10_000 })
    await page.getByText('Permissions', { exact: true }).first().click({ timeout: 10_000 })
    const header = page.getByRole('button').filter({ has: page.getByText(new URL(origin).host, { exact: true }) })
    await header.click({ timeout: 10_000 }); return { page, card: header.locator('..') }
  }
  const snapshot = async (id: string, origin: string) => {
    const { page, card } = await screen(origin)
    const body = await waitForCoverageRevocationSnapshot(page, card, c.cap)
    report.settings.push({ id, origin, pageUrl: page.url(), at: now(), body: body.beforeBody, cardBody: body.cardBody, image: await permissionExtensionImage(context, page, `conformance/extension-settings-${id}.png`) })
    await page.close()
  }
  const grant = async (name: 'subset' | 'unchecked' | 'overcap' | 'concurrent' | 'abort' | 'rejection' | 'nosend') => request(`${name}-grant`, c[name], 'waitForAuthentication', {}, { decision: 'allow', ...(name === 'subset' ? { selectOnlyProtocol: true } : name === 'unchecked' ? {} : { selectSpending: true }) })
  const recover = async (kind: 'abort' | 'rejection' | 'nosend') => { await request(`${kind}-recovery`, c[kind], 'createAction', extensionPaymentArgs(`${kind}-recovery`, c.accountingAmount)); await snapshot(`${kind}-recovered`, c[kind]) }
  try {
    for (const [name, origin] of Object.entries(c).filter(([, origin]) => typeof origin === 'string' && origin.startsWith('https://')) as Array<[string, string]>) {
      const manifest = ['primary', 'alternate'].includes(name) ? undefined : { origin, value: coverageManifest, sha256: sha(Buffer.from(canonicalJson(coverageManifest))), requests: [] as Array<{ at: string; sha256: string }> }
      if (manifest) report.manifests.push(manifest)
      unregister.push(services.registerControlledRoute(new URL(origin).host, async (request, response) => {
        const url = new URL(request.url ?? '/', origin)
        if (request.method === 'GET' && url.pathname === '/manifest.json' && !url.search && manifest) { const bytes = Buffer.from(canonicalJson(manifest.value)); manifest.requests.push({ at: now(), sha256: sha(bytes) }); response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(bytes) }
        else if (request.method === 'GET' && url.pathname === '/') { response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }); response.end('<!doctype html><h1>TPNIL boundary fixture</h1><p>Native permission extension</p>') }
        else { response.writeHead(404); response.end('Not found') }
      }))
    }
    report.identity = value(await request('identity', c.primary, 'getPublicKey', { identityKey: true }, options ? { decision: 'allow' } : undefined)).publicKey
    for (const name of extensionCategories) { await category(name, 'grant', c.primary, 'allow'); await category(name, 'cached', c.primary); await category(name, 'alternate-deny', c.alternate, 'deny') }
    value(await request('before-lock-auth', c.primary, 'isAuthenticated', {}))
    const originalContext = context.context, lockPage = await context.context.newPage(); settingsPages.add(lockPage)
    await lockPage.goto(`chrome-extension://${context.extensionId}/index.html`); report.lock.beforePageUrl = lockPage.url()
    await lockPage.getByText('Settings', { exact: true }).last().click({ timeout: 10_000 })
    report.ui.push(await observeExtensionControl(context, lockPage, lockPage.getByText('Lock Wallet', { exact: true }), 'lock', () => lockPage.getByPlaceholder('Password', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 })))
    report.lock.passwordVisible = await lockPage.getByPlaceholder('Password', { exact: true }).isVisible()
    await request('locked-auth', c.primary, 'isAuthenticated', {})
    await lockPage.getByPlaceholder('Password', { exact: true }).fill(context.password)
    report.ui.push(await observeExtensionControl(context, lockPage, lockPage.getByRole('button', { name: 'Unlock', exact: true }), 'unlock', () => lockPage.getByPlaceholder('Password', { exact: true }).waitFor({ state: 'hidden', timeout: 45_000 })))
    report.lock.passwordHiddenAfterUnlock = !(await lockPage.getByPlaceholder('Password', { exact: true }).isVisible()); report.lock.afterPageUrl = lockPage.url(); report.lock.sameContext = context.context === originalContext && lockPage.context() === originalContext
    await request('unlocked-auth', c.primary, 'isAuthenticated', {}); await lockPage.close()
    for (const name of extensionCategories) { await category(name, 'after-lock', c.primary); await category(name, 'after-lock-alternate-deny', c.alternate, 'deny') }
    const { page, card } = await screen(c.primary)
    const detail = card.getByText(`Can access: ${permissionCoverageConfig.basket}`, { exact: true }), row = detail.locator('..'), revoke = row.getByRole('button')
    if (await revoke.count() !== 1) throw new Error('Individual basket revoke control is ambiguous')
    report.ui.push(await observeExtensionControl(context, page, revoke, 'single-revoke', () => detail.waitFor({ state: 'hidden', timeout: 10_000 }))); await page.close()
    for (const name of extensionCategories) await category(name, 'after-single-revoke', c.primary, name === 'basket' ? 'deny' : undefined)
    if (!context.restartBrowser) throw new Error('Permission extension requires native restart hook')
    await observer.closePages(); const next = await context.restartBrowser(); context.context = next.context; context.application = next.application; report.restarts.push(next.receipt)
    await request('restart-identity', c.primary, 'getPublicKey', { identityKey: true })
    for (const name of extensionCategories) await category(name, 'after-single-revoke-restart', c.primary, name === 'basket' ? 'deny' : undefined)
    await request('linkage-grant', c.primary, 'revealSpecificKeyLinkage', extensionLinkageArgs(), { decision: 'allow' })
    await request('linkage-cached', c.primary, 'revealSpecificKeyLinkage', extensionLinkageArgs())
    for (const dimension of linkageDimensions) { await request(`linkage-${dimension}-deny`, c.primary, 'revealSpecificKeyLinkage', extensionLinkageArgs(dimension), { decision: 'deny' }); await request(`linkage-${dimension}-control`, c.primary, 'revealSpecificKeyLinkage', extensionLinkageArgs()) }
    await grant('subset')
    for (const name of extensionCategories) await category(name, 'subset', c.subset, name === 'protocol' ? undefined : 'deny')
    await request('subset-spend-deny', c.subset, 'createAction', extensionPaymentArgs('subset-denied', 17), { decision: 'deny' })
    await grant('unchecked')
    for (const name of extensionCategories) await category(name, 'unchecked', c.unchecked)
    await request('unchecked-spend-deny', c.unchecked, 'createAction', extensionPaymentArgs('unchecked-denied', 19), { decision: 'deny' })
    await grant('overcap'); await snapshot('overcap-before', c.overcap)
    await request('overcap-deny', c.overcap, 'createAction', extensionPaymentArgs('overcap-denied', c.overcapAmount), { decision: 'deny' }); await snapshot('overcap-after', c.overcap)
    await grant('concurrent'); await snapshot('concurrent-before', c.concurrent)
    report.concurrent.startedAt = now()
    await Promise.all(['a', 'b'].map(suffix => request(`concurrent-${suffix}`, c.concurrent, 'createAction', extensionPaymentArgs(`concurrent-${suffix}`, c.concurrentAmount), { decision: 'deny', promptText: [`TPNIL extended permission concurrent-${suffix}`] })))
    report.concurrent.endedAt = now(); await snapshot('concurrent-after', c.concurrent)
    await grant('abort'); await snapshot('abort-before', c.abort)
    const staged = value(await request('abort-stage', c.abort, 'createAction', extensionPaymentArgs('abort-stage', c.accountingAmount, { signAndProcess: false })))
    report.references.abort = staged.signableTransaction?.reference; if (!report.references.abort) throw new Error('Aborted-action fixture omitted public reference')
    await snapshot('abort-held', c.abort)
    await request('abort-close', c.abort, 'abortAction', { reference: report.references.abort }); await snapshot('abort-after', c.abort); await recover('abort')
    await grant('rejection'); await snapshot('rejection-before', c.rejection)
    services.enqueueVerdict('REJECTED', { kind: 'exact-output', lockingScript: coveragePaymentScript, amount: c.accountingAmount })
    const rejected = await request('rejection-create', c.rejection, 'createAction', extensionPaymentArgs('rejection-create', c.accountingAmount))
    if (rejected.submissionEnd === rejected.submissionStart) report.cleanup.rejectedVerdictRemoved = services.discardQueuedVerdict('REJECTED')
    await snapshot('rejection-after', c.rejection); await recover('rejection')
    await grant('nosend'); await snapshot('nosend-before', c.nosend)
    const held = value(await request('nosend-stage', c.nosend, 'createAction', extensionPaymentArgs('nosend-stage', c.accountingAmount, { signAndProcess: false, noSend: true })))
    report.references.nosend = held.signableTransaction?.reference; if (!report.references.nosend) throw new Error('Held-action fixture omitted public reference')
    await request('nosend-sign', c.nosend, 'signAction', { reference: report.references.nosend, spends: {}, options: { noSend: true } }); await snapshot('nosend-held', c.nosend)
    await request('nosend-close', c.nosend, 'abortAction', { reference: report.references.nosend }); await snapshot('nosend-after', c.nosend); await recover('nosend')
  } catch (error) { report.errors.push(error instanceof Error ? error.message : String(error)) }
  finally {
    try { report.cleanup.pagesClosed = (await observer.close()).pagesClosed } catch (error) { report.errors.push(String(error)) }
    try { for (const page of settingsPages) if (!page.isClosed()) await page.close(); report.cleanup.settingsClosed = [...settingsPages].every(page => page.isClosed()) } catch (error) { report.errors.push(String(error)) }
    try { for (const remove of unregister) remove(); report.cleanup.routesUnregistered = unregister.length === 9 } catch (error) { report.errors.push(String(error)) }
    try { report.storageTransactions = await services.nativeTransactions() } catch (error) { report.errors.push(String(error)) }
    report.submissions = services.submissions.map(row => ({ txid: row.txid, verdict: row.verdict, beefHex: Buffer.from(row.bytes).toString('hex') })); report.submissionWindow.endIndex = report.submissions.length; report.endedAt = now()
  }
  context.evidence.flush()
  report.assertions = await evaluatePermissionExtension(report, anchor, name => fs.readFileSync(path.join(context.evidence.directory, 'evidence', name)), report.identity)
  report.result = report.assertions.every(row => row.result === 'PASS') ? 'PASS' : report.assertions.some(row => row.result === 'FAIL') ? 'FAIL' : 'BLOCKED'
  context.evidence.addJson('conformance/permission-extension.json', report)
  return report
}
