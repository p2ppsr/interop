// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { PrivateKey, ProtoWallet } from '@bsv/sdk'
import type { Page } from 'playwright'
import type { NativeScenarioContext } from '../yours-driver.js'
import { issueFixtureCertificateForSubject } from '../certificate-fixture.js'
import { canonicalJson } from '../../determinism.js'
import { createCoveragePermissionObserver, waitForCoverageRevocationSnapshot } from './permission-coverage-observer.js'
import { observePermissionClick } from './permission-click.js'
import { evaluateNativePermissionCoverage } from './verify-conformance-permission-coverage.js'
import { coverageCertificateSerial, coverageCertificateType, coverageCategoryCall, coverageManifestForRevision, coveragePaymentArgs, permissionCoverageCategories, permissionCoverageSelection, type NativePermissionCoverageReport, type CoverageRevocation, type CoverageStep, type PermissionCoverageCategory } from './conformance-permission-coverage-model.js'

const now = () => new Date().toISOString()
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const clean = (value: any) => JSON.parse(JSON.stringify(value))

/** Caller owns manualPrompt suspension. This scenario uses only native public
 * CWI and visible UI; browser restart is the source-owned driver hook. */
export async function runNativePermissionCoverage(context: NativeScenarioContext, revision: 1 | 2 | 3 | 4 | 5 = 1): Promise<NativePermissionCoverageReport> {
  const { evidence, services, extensionId } = context
  const { config, oracle, policy, policySha256 } = permissionCoverageSelection(revision)
  const coverageManifest = coverageManifestForRevision(revision)
  const manifestBytes = Buffer.from(canonicalJson(coverageManifest))
  const observer = createCoveragePermissionObserver(context)
  const report: NativePermissionCoverageReport = {
    schema: 'tpnil-native-permission-coverage@1.0.0', oracle, policySha256,
    ...(revision === 5 ? { fundingPrelude: { evidencePath: 'conformance/permission-prelude.json' as const, sha256: sha(evidence.readBytes('conformance/permission-prelude.json')) } } : {}),
    claim: 'ENGINEERING_OBSERVATION_ONLY', identity: '', extensionId, startedAt: now(), endedAt: '',
    steps: [], restarts: [], revocations: [], manifest: { value: coverageManifest, sha256: sha(manifestBytes), requests: [] },
    transactions: [], submissions: [], submissionWindow: { startIndex: services.submissions.length, endIndex: services.submissions.length },
    errors: [], cleanup: { pagesClosed: false, settingsClosed: false, routeUnregistered: false }, assertions: [], result: 'FAIL',
    remainingCoverage: policy.remainingCoverage, completeBRC100Conformance: false
  }
  let settings: Page | undefined, unregister: (() => void) | undefined
  const request = async (id: string, origin: string, method: string, args: any, options?: Parameters<typeof observer.request>[4]) => {
    const submissionStart = services.submissions.length
    const observed = await observer.request(id, origin, method, args, options)
    const row: CoverageStep = Object.assign(observed, { submissionStart, submissionEnd: services.submissions.length })
    report.steps.push(row)
    // An unresolved earlier request must never lend its popup or eventual grant
    // to a later nonce. Preserve the failed observation and stop this scenario.
    if (!['fulfilled', 'rejected'].includes(row.outcome.status)) throw new Error(`${id}: ${row.outcome.message ?? row.outcome.status}`)
    if (row.outcome.status === 'fulfilled' && ['setup-basket', 'allowance-first', 'allowance-second', ...(revision >= 3 ? ['allowance-third'] : [])].includes(id) && Array.isArray(row.outcome.value?.tx)) report.transactions.push({ role: id, txid: row.outcome.value.txid, atomicBeef: row.outcome.value.tx })
    return row
  }
  const value = (row: CoverageStep) => { if (row.outcome.status !== 'fulfilled') throw new Error(`${row.id}: ${row.outcome.error?.message ?? row.outcome.message ?? row.outcome.status}`); return row.outcome.value }
  const category = (name: PermissionCoverageCategory, suffix: string, origin: string, decision?: 'allow' | 'deny') => {
    const { method, args } = coverageCategoryCall(name, report.certificate)
    return request(`${name}-${suffix}`, origin, method, args, decision ? { decision } : {})
  }
  const image = async (page: Page, name: string) => {
    const bytes = await page.screenshot({ type: 'png', timeout: 5000 }); evidence.addBytes(name, bytes)
    return { name, sha256: sha(bytes), size: bytes.length }
  }
  const revoke = async (id: string, origin: string) => {
    settings = await context.context.newPage(); await settings.goto(`chrome-extension://${extensionId}/index.html`)
    await settings.getByText('Settings', { exact: true }).last().click({ timeout: 10_000 })
    await settings.getByText('Permissions', { exact: true }).first().click({ timeout: 10_000 })
    const header = settings.getByRole('button').filter({ has: settings.getByText(new URL(origin).host, { exact: true }) })
    await header.click({ timeout: 10_000 })
    const card = header.locator('..')
    await card.getByRole('button', { name: 'Revoke All Access', exact: true }).waitFor({ timeout: 10_000 })
    const snapshot = revision >= 2 ? await waitForCoverageRevocationSnapshot(settings, card, origin === config.allowance ? config.allowanceSatoshis : undefined) : { beforeBody: await settings.locator('body').innerText(), cardBody: await card.innerText() }
    const row: CoverageRevocation = { id, origin, pageUrl: settings.url(), requestNonce: randomUUID(), startedAt: now(), endedAt: '', ...snapshot, confirmationBody: '', afterBody: '', afterOriginCardCount: -1, revoke: undefined as any, confirm: undefined as any, before: await image(settings, `conformance/coverage-${id}-before.png`), confirmation: undefined as any, after: undefined as any }
    report.revocations.push(row)
    row.revoke = await observePermissionClick(settings, 'Revoke All Access', row.requestNonce)
    await settings.getByRole('button', { name: 'Confirm', exact: true }).waitFor({ timeout: 10_000 })
    row.confirmationBody = await settings.locator('body').innerText()
    row.confirmation = await image(settings, `conformance/coverage-${id}-confirmation.png`)
    row.confirm = await observePermissionClick(settings, 'Confirm', row.requestNonce)
    await header.waitFor({ state: 'hidden', timeout: 10_000 })
    row.afterOriginCardCount = await header.count(); row.afterBody = await settings.locator('body').innerText()
    row.after = await image(settings, `conformance/coverage-${id}-after.png`); row.endedAt = now()
    await settings.close(); settings = undefined
  }
  const restart = async () => {
    if (!context.restartBrowser) throw new Error('Native restart hook unavailable for declared permission coverage')
    await observer.closePages()
    const next = await context.restartBrowser()
    context.application = next.application; context.context = next.context
    report.restarts.push(next.receipt)
  }
  try {
    unregister = services.registerControlledRoute(new URL(config.allowance).host, async (request, response) => {
      const url = new URL(request.url ?? '/', config.allowance)
      if (request.method === 'GET' && url.pathname === '/manifest.json' && !url.search) {
        report.manifest.requests.push({ method: 'GET', path: '/manifest.json', servedAt: now(), responseSha256: sha(manifestBytes) })
        response.writeHead(200, { 'content-type': 'application/json', 'content-length': manifestBytes.length, 'cache-control': 'no-store' }); response.end(manifestBytes)
      } else if (request.method === 'GET' && url.pathname === '/') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); response.end('<!doctype html><html><head><title>TPNIL boundary fixture</title></head><body><h1>TPNIL boundary fixture</h1><p>Isolated native standing allowance scenario.</p></body></html>')
      } else { response.writeHead(404); response.end('Not found') }
    })
    report.identity = value(await request('identity', config.application, 'getPublicKey', { identityKey: true })).publicKey
    const created = value(await request('setup-basket', config.application, 'createAction', { description: 'TPNIL permission coverage basket fixture', outputs: [{ satoshis: config.basketAmount, lockingScript: '51', basket: config.basket, outputDescription: 'Native permission coverage fixture', customInstructions: 'tpnil:permission-coverage:1' }], options: { randomizeOutputs: false, acceptDelayedBroadcast: false } }, { decision: 'allow' }))
    if (!created.txid) throw new Error('Native coverage basket creation omitted txid')
    report.setupOutpoint = `${created.txid}.0`
    const certificate = await issueFixtureCertificateForSubject(new ProtoWallet(PrivateKey.fromHex(config.issuerKeyHex)), report.identity, config.fields, coverageCertificateType, async () => report.setupOutpoint!, coverageCertificateSerial)
    report.certificate = clean(certificate); report.certificateMasterKeyring = report.certificate.masterKeyring; delete report.certificate.masterKeyring
    value(await request('setup-certificate', config.application, 'acquireCertificate', { ...report.certificate, acquisitionProtocol: 'direct', keyringRevealer: 'certifier', keyringForSubject: report.certificateMasterKeyring }, { decision: 'allow' }))
    for (const name of permissionCoverageCategories) {
      await category(name, 'grant', config.primary, 'allow')
      await category(name, 'cached', config.primary)
      await category(name, 'alternate-deny', config.alternate, 'deny')
    }
    await request('manifest-grant', config.allowance, 'waitForAuthentication', {}, { decision: 'allow', selectSpending: true })
    for (const name of ['protocol', 'basket', 'certificate'] as const) {
      const call = coverageCategoryCall(name, report.certificate); await request(`manifest-${name}`, config.allowance, call.method, call.args)
    }
    await request('allowance-first', config.allowance, 'createAction', coveragePaymentArgs('first', revision))
    await restart()
    for (const name of permissionCoverageCategories) await category(name, 'restart', config.primary)
    await request('allowance-second', config.allowance, 'createAction', coveragePaymentArgs('second', revision))
    if (revision >= 3) await request('allowance-third', config.allowance, 'createAction', coveragePaymentArgs('third', revision))
    await request('allowance-overflow', config.allowance, 'createAction', coveragePaymentArgs('overflow', revision), { decision: 'deny' })
    await request('allowance-alternate', config.alternate, 'createAction', coveragePaymentArgs('alternate', revision), { decision: 'deny' })
    await revoke('revoke-primary', config.primary)
    await revoke('revoke-allowance', config.allowance)
    for (const name of permissionCoverageCategories) await category(name, 'revoked', config.primary, 'deny')
    await request('allowance-revoked', config.allowance, 'createAction', coveragePaymentArgs('revoked', revision), { decision: 'deny' })
    await restart()
    for (const name of permissionCoverageCategories) await category(name, 'revoked-restart', config.primary, 'deny')
    await request('allowance-revoked-restart', config.allowance, 'createAction', coveragePaymentArgs('revokedRestart', revision), { decision: 'deny' })
  } catch (error) { report.errors.push(error instanceof Error ? error.message : String(error)) }
  finally {
    try { report.cleanup.pagesClosed = (await observer.close()).pagesClosed } catch (error) { report.errors.push(String(error)) }
    try { await settings?.close(); report.cleanup.settingsClosed = !settings || settings.isClosed() } catch (error) { report.errors.push(String(error)) }
    try { if (unregister) { unregister(); report.cleanup.routeUnregistered = true } } catch (error) { report.errors.push(String(error)) }
    report.submissions = services.submissions.map(row => ({ txid: row.txid, verdict: row.verdict, beefHex: Buffer.from(row.bytes).toString('hex') }))
    report.submissionWindow.endIndex = report.submissions.length; report.endedAt = now()
  }
  // Evaluate the exact retained screenshot/restart bytes also consumed by the
  // independent replay. Flushing does not mutate any earlier observations.
  evidence.flush()
  report.assertions = await evaluateNativePermissionCoverage(report, name => fs.readFileSync(path.join(evidence.directory, 'evidence', name)), report.identity)
  report.result = report.assertions.every(row => row.result === 'PASS') ? 'PASS' : 'FAIL'
  evidence.addJson('conformance/permission-coverage.json', report)
  return report
}
