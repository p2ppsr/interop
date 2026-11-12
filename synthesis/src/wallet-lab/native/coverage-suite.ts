import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { NativeScenarioContext } from '../yours-driver.js'
import type { NativePermissionCoverageReport } from './conformance-permission-coverage-model.js'
import { nativeWalletBoundary } from './integrated.js'
import { createFixtureWallet } from '../../storage-sync/fixture-wallet.js'
import { createCoveragePermissionObserver } from './permission-coverage-observer.js'
import { runNativeCoverageExtension } from './coverage-extension-driver.js'
import { runNativeTransactionCoverage } from './coverage-transactions-producer.js'
import { runCertificateCoverage } from './coverage-certificates-run.js'
import { certificateCoverageConfig } from './coverage-certificates-model.js'
import { coverageObservationEncoding } from './coverage-observation.js'

/** Explicit prospective profile only. Every browser restart changes the public
 * boundary page; resolve it afresh for each call. No wallet implementation state
 * or test-only private wallet API is accessed. */
export async function runNativeCoverageSuite(context: NativeScenarioContext, anchor: NativePermissionCoverageReport, profile?: 'ITCVE-1@4.5.0' | 'ITCVE-1@4.6.0') {
  const observationEncoding = profile ? coverageObservationEncoding : undefined
  const { services, evidence } = context
  const root = path.resolve(import.meta.dirname, '../../../..')
  const wallet: any = new Proxy({}, { get: (_target, method) => typeof method !== 'string' || method === 'then' ? undefined : (args: unknown) => nativeWalletBoundary(context.application, true)[method](args) })
  const reports: Record<string, any> = {}, errors: Array<{ module: string; error: string }> = []
  const execute = async (name: string, fn: () => Promise<unknown>) => {
    try { reports[name] = await fn() }
    catch (error) { errors.push({ module: name, error: error instanceof Error ? error.stack ?? error.message : String(error) }) }
  }
  reports.permissions = JSON.parse(evidence.readBytes('conformance/permission-extension.json').toString())
  const funder = await createFixtureWallet(services, '77'.repeat(32))
  try {
    const boundaryReport = JSON.parse(evidence.readBytes('integrated/boundary.json').toString())
    const clauseReport = JSON.parse(evidence.readBytes('conformance/clauses.json').toString())
    const trustReport = JSON.parse(evidence.readBytes('integrated/identity-trust.json').toString())
    await execute('transactions', () => runNativeTransactionCoverage({ wallet, funder: funder as any, identity: anchor.identity, services, evidence }, profile ? 3 : 2))
    await execute('extension', () => runNativeCoverageExtension({ wallet, funder: funder as any, services, evidence, boundaryReport, clauseReport, trustReport, observationEncoding, observationRevision: profile === 'ITCVE-1@4.6.0' ? 3 : 2 }))
  } finally { await funder.destroy() }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-native-certificate-coverage-'))
  const observer = createCoveragePermissionObserver(context), unregister: Array<() => void> = []
  let overlay: any
  const events: unknown[] = [], cleanup = { pagesClosed: false, routesClosed: false, overlayClosed: false }
  try {
    for (const origin of certificateCoverageConfig.origins) unregister.push(services.registerControlledRoute(new URL(origin).host, async (request, response) => {
      const url = new URL(request.url ?? '/', origin)
      if (request.method === 'GET' && url.pathname === '/' && !url.search) {
        response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' })
        response.end('<!doctype html><h1>TPNIL boundary fixture</h1><p>Native certificate coverage</p>')
      } else { response.writeHead(404); response.end('Not found') }
    }))
    const { startOverlayNode } = await import(pathToFileURL(path.join(root, 'integrations/services/src/overlay.ts')).href)
    overlay = await startOverlayNode({ directory: temporary, name: `native_certificate_coverage_${process.pid}`, mongoUri: process.env.TPNIL_GO_MONGO_URI,
      tracker: { currentHeight: async () => 900100, findHeaderForHeight: async (height: number) => services.headers.get(height), isValidRootForHeight: async (value: string, height: number) => services.headers.get(height)?.merkleRoot === value },
      log: (...values: unknown[]) => events.push(values) })
    await execute('certificates', () => runCertificateCoverage({ wallet, services, evidence, overlayOrigin: overlay.origin, observationEncoding, hooks: {
      extensionId: context.extensionId,
      readEvidence: name => evidence.readBytes(name),
      async installLookup(answer) { const remove = services.installIdentityCoverageLookup(answer); return async () => remove() },
      async restart() {
        if (!context.restartBrowser) throw new Error('Certificate coverage requires native same-profile restart')
        await observer.closePages()
        const next = await context.manualPrompt(() => context.restartBrowser!())
        context.application = next.application; context.context = next.context
        return { kind: 'NATIVE_BROWSER_RESTART', receipt: next.receipt }
      },
      permissionRequest: (id, origin, method, args, decision) => context.manualPrompt(() => observer.request(id, origin, method, args, { decision }))
    } }))
  } catch (error) { errors.push({ module: 'certificate-environment', error: error instanceof Error ? error.stack ?? error.message : String(error) }) }
  finally {
    try { cleanup.pagesClosed = (await observer.close()).pagesClosed } catch (error) { errors.push({ module: 'certificate-pages', error: String(error) }) }
    for (const remove of unregister) remove(); cleanup.routesClosed = true
    try { if (overlay) { await overlay.close(); cleanup.overlayClosed = true } } catch (error) { errors.push({ module: 'certificate-overlay', error: String(error) }) }
    evidence.addJson('conformance/coverage-suite.json', { schema: 'tpnil-native-coverage-suite@1.0.0', claim: 'ENGINEERING_OBSERVATION_ONLY', modules: Object.keys(reports), errors, certificateEnvironment: { events, cleanup } })
    fs.rmSync(temporary, { recursive: true, force: true })
  }
  return reports
}
