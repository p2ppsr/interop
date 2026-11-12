import type { IdentityTrustOracleOptions } from './identity-trust-oracle2.js'
import type { ControlledHeaderFixture } from './controlled-header-fixture.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL } from 'node:url'
import type { Page } from 'playwright'
import type { ControlledWalletServices } from '../services.js'
import type { EvidenceBundle } from '../evidence.js'
import { createFixtureWallet } from '../../storage-sync/fixture-wallet.js'
import { runNativeSynthesis } from './synthesis.js'
import { runWalletBoundaryCorpus } from '../boundary-corpus.js'
import { PublicSettingsTrust } from './identity-trust.js'

/** Native wallet calls cross the unchanged application's public CWI boundary.
 * No wallet key, database or extension implementation is accessed by this proxy. */
export function nativeWalletBoundary(application: Page, preserveErrors = false): any {
  return new Proxy({}, { get: (_target, name) => {
    if (typeof name !== 'string' || name === 'then') return undefined
    return async (args: unknown = {}) => {
      let timer: NodeJS.Timeout | undefined
      try {
        const observed = await Promise.race([
          application.evaluate(async ({ method, args, preserveErrors }) => {
            const boundary = (window as any).CWI
            if (typeof boundary?.[method] !== 'function') throw new Error(`Wallet method unsupported: ${method}`)
            if (!preserveErrors) return boundary[method](args)
            try { return { ok: true, result: await boundary[method](args) } }
            catch (error: any) { return { ok: false, error: JSON.parse(JSON.stringify({ ...error, name: error?.name ?? 'Error', message: error?.message ?? String(error) })) } }
          }, { method: name, args, preserveErrors }),
          new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`Native ${name} exceeded 45 seconds`)), 45_000) })
        ])
        if (!preserveErrors) return observed
        if (!observed.ok) throw Object.assign(new Error(observed.error.message), observed.error)
        return observed.result
      } finally { if (timer) clearTimeout(timer) }
    }
  } })
}

export async function runNativeIntegration({ application, services, evidence, profile = 'ITCVE-1@1.3.0', beforeTrustRestore, fixtureRevision = 1, headerFixture, identityTrustOracle }: {
  application: Page; services: ControlledWalletServices; evidence: EvidenceBundle
  profile?: 'ITCVE-1@1.3.0' | 'ITCVE-1@1.4.0' | 'ITCVE-1@1.5.0' | 'ITCVE-1@2.0.0' | 'ITCVE-1@4.0.0' | 'ITCVE-1@4.1.0' | 'ITCVE-1@4.2.0' | 'ITCVE-1@4.3.0' | 'ITCVE-1@4.4.0' | 'ITCVE-1@4.5.0' | 'ITCVE-1@4.6.0'
  fixtureRevision?: 1 | 2
  headerFixture?: ControlledHeaderFixture
  identityTrustOracle?: IdentityTrustOracleOptions['oracle']
  beforeTrustRestore?: (boundaryReport: any) => Promise<void>
}): Promise<void> {
  const root = path.resolve(import.meta.dirname, '../../../..')
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-native-joined-'))
  const payee = await createFixtureWallet(services, '78'.repeat(32))
  try {
    const wallet = nativeWalletBoundary(application, ['ITCVE-1@1.4.0', 'ITCVE-1@1.5.0', 'ITCVE-1@2.0.0', 'ITCVE-1@4.0.0', 'ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.3.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0'].includes(profile ?? ''))
    const walletIdentity = (await wallet.getPublicKey({ identityKey: true })).publicKey
    const { qualifyRelay } = await import(pathToFileURL(path.join(root, 'components/transport/relay.mjs')).href)
    const { qualifyPaidHttp } = await import(pathToFileURL(path.join(root, 'components/transport/paid-http.mjs')).href)
    const relay = await qualifyRelay({ wallet, onPaired: (payer: unknown) => qualifyPaidHttp({ payer, payee, directory: temporary }) })
    const paid = relay.joined; delete relay.joined
    evidence.addJson('integrated/relay.json', relay)
    evidence.addJson('integrated/paid-http.json', paid)
    const { runNativeMessaging } = await import(pathToFileURL(path.join(root, 'components/messaging/native.mjs')).href)
    const messagingDirectory = path.join(temporary, 'messaging')
    const messaging = await runNativeMessaging(wallet, services, messagingDirectory)
    evidence.addJson('integrated/messaging.json', messaging)
    for (const file of fs.readdirSync(messagingDirectory).filter(file => file.endsWith('.json') && file !== 'result.json')) {
      evidence.addJson(`integrated/messaging-${file}`, JSON.parse(fs.readFileSync(path.join(messagingDirectory, file), 'utf8')))
    }
    const messagingAssertions = ['typescript', 'go-adapted'].flatMap(implementation => ['discovery', 'native-paid-delivery', 'restart-ack-replay'].map(suffix => {
      const id = `${implementation}/${suffix}`
      const actual = messaging.assertions.find((item: any) => item.id === id)
      return { id: `messaging/${id}`, result: actual?.verdict ?? 'BLOCKED', detail: actual ?? messaging.assertions.find((item: any) => item.id === `${implementation}/execution`) }
    }))
    const synthesisDirectory = path.join(temporary, 'synthesis')
    const synthesis = await runNativeSynthesis(wallet, services, synthesisDirectory, ['ITCVE-1@4.3.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0'].includes(profile ?? '') ? 'validated-v2' : 'legacy-v1') as any
    evidence.addJson('integrated/synthesis.json', synthesis)
    for (const file of ['transactions.json', 'lch.json', 'events.json']) {
      const target = path.join(synthesisDirectory, file)
      if (fs.existsSync(target)) evidence.addJson(`integrated/synthesis-${file}`, JSON.parse(fs.readFileSync(target, 'utf8')))
    }
    const synthesisAssertions = ['NATIVE-SYNTHESIS-UHRP', 'NATIVE-SYNTHESIS-BOARD', 'NATIVE-SYNTHESIS-LCH', 'NATIVE-SYNTHESIS-REVISION'].map(id => {
      const actual = synthesis.assertions.find((item: any) => item.id === id)
      return { id, result: actual?.verdict ?? 'BLOCKED', detail: actual ?? synthesis.assertions.find((item: any) => item.id === 'NATIVE-SYNTHESIS-EXECUTION') }
    })
    const { startOverlayNode } = await import(pathToFileURL(path.join(root, 'integrations/services/src/overlay.ts')).href)
    const { publishIdentityCertificate } = await import(pathToFileURL(path.join(root, 'integrations/services/src/identity.ts')).href)
    const funder = await createFixtureWallet(services, '77'.repeat(32))
    const identityOverlay = await startOverlayNode({ directory: path.join(temporary, 'identity'), name: `native_identity_${process.pid}`, mongoUri: process.env.TPNIL_GO_MONGO_URI, tracker: {
      currentHeight: async () => 900100,
      findHeaderForHeight: async (height: number) => services.headers.get(height),
      isValidRootForHeight: async (merkleRoot: string, height: number) => services.headers.get(height)?.merkleRoot === merkleRoot
    } })
    let boundary: any, publication: any
    const trust = process.env.TPNIL_NATIVE_IDENTITY_TRUST === '1' ? new PublicSettingsTrust(wallet, identityTrustOracle ? { oracle: identityTrustOracle, ...(profile === 'ITCVE-1@4.6.0' ? { initialDiscoveryConsent: 'explicit-allow-v1' as const } : {}) } : undefined) : undefined
    try {
      services.registerOverlayLookup(identityOverlay.origin, ['ls_identity'])
      boundary = await runWalletBoundaryCorpus({ wallet, fixtureRevision, headerFixture, funder: funder as any, discoveryExpectation: trust ? 'published' : 'untrusted-excluded', prepareDiscovery: async certificate => {
        publication = await publishIdentityCertificate({ wallet, origin: identityOverlay.origin, certificate, fixtureRevision, ...(['ITCVE-1@4.3.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0'].includes(profile ?? '') ? { namespaceFixture: 'validated-v2' } : {}) })
        await trust?.enable(certificate)
      } })
      evidence.addJson('integrated/boundary.json', boundary)
      evidence.addJson('integrated/boundary-publication.json', publication ?? null)
      evidence.addJson('integrated/boundary-coverage.json', JSON.parse(fs.readFileSync(path.join(root, 'programs/ISI-4/profiles/brc100-boundary-1.0.0/coverage.json'), 'utf8')))
      if (beforeTrustRestore) await beforeTrustRestore(boundary)
    } finally {
      if (trust) { await trust.finish(boundary); evidence.addJson('integrated/identity-trust.json', trust.report) }
      await funder.destroy(); await identityOverlay.close()
    }
    const boundaryAssertions = boundary.assertions.map((item: any) => ({ ...item, id: `boundary/${item.id}` }))
    evidence.addJson('integrated/result.json', {
      schema: 'tpnil-native-integration@1', profile,
      claim: 'ENGINEERING_OBSERVATION_ONLY',
      interface: 'unchanged Yours Wallet public CWI through native Chromium extension',
      customerInterface: 'Harness-driven wallet API operations; ToDo UI remains separately evaluated',
      walletIdentity,
      assertions: [...relay.assertions, ...paid.assertions, ...messagingAssertions, ...synthesisAssertions, ...boundaryAssertions, ...(trust?.report.assertions ?? [])],
      cleanup: { relay: relay.cleanup, paid: paid.cleanup, messaging: messaging.cleanup, synthesis: synthesis.cleanup, ...(trust ? { identityTrust: trust.report.cleanup } : {}) }
    })
  } finally { await payee.destroy(); fs.rmSync(temporary, { recursive: true, force: true }) }
}
