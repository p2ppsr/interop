import { PrivateKey, ProtoWallet, PushDrop, Transaction, Utils } from '@bsv/sdk'
import { WalletSettingsManager } from '@bsv/wallet-toolbox'
import type { ControlledWalletServices } from '../services.js'
import type { EvidenceBundle } from '../evidence.js'
import { issueFixtureCertificateForSubject } from '../certificate-fixture.js'
import { captureClauseError } from './conformance-clauses.js'
import { createCoverageCertificateIssuer } from './coverage-certificates-issuer.js'
import { certificateCoverageConfig as config, certificateCoveragePolicy as policy, certificateCoveragePolicySha256, type CertificateCoverageReport } from './coverage-certificates-model.js'
import { deriveCertificateCoverageOutcomes } from './coverage-certificates-verify.js'
import type { CoveragePermissionCall } from './permission-coverage-observer.js'

export interface CertificateCoverageHooks {
  /** Installs a scoped real lookup transport. It must restore the preceding
   * provider when closed. The callback receives each actual wire question. */
  installLookup(answer: (question: any) => Promise<any>): Promise<() => Promise<void>>
  /** Close/reopen the same native profile and unlock through real UI. A reference
   * client recreation must return kind REFERENCE_CLIENT_REOPEN, never native. */
  restart(): Promise<{ kind: 'NATIVE_BROWSER_RESTART' | 'REFERENCE_CLIENT_REOPEN'; receipt: any }>
  permissionRequest?: (id: string, origin: string, method: string, args: any, decision: 'allow' | 'deny') => Promise<CoveragePermissionCall>
  readEvidence?: (name: string) => Buffer
  extensionId?: string
}

/** Prospective standalone coverage. Callers retain the complete global route,
 * provider and browser ledgers for the independent final parent binding. */
export async function runCertificateCoverage({ wallet, services, evidence, overlayOrigin, hooks }: {
  wallet: any; services: ControlledWalletServices; evidence: Pick<EvidenceBundle, 'addJson'>; overlayOrigin: string; hooks: CertificateCoverageHooks
}): Promise<CertificateCoverageReport> {
  const origin = new URL(overlayOrigin)
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || !origin.port || origin.pathname !== '/' || origin.search || origin.hash) throw Error('Certificate fixture overlay must be an isolated loopback service')
  const snapshot = () => services.submissions.map(value => ({ txid: value.txid, beefHex: Buffer.from(value.bytes).toString('hex'), verdict: value.verdict }))
  const report: CertificateCoverageReport = { schema: 'tpnil-native-coverage-certificates@1.0.0', oracle: policy.oracle, policySha256: certificateCoveragePolicySha256,
    claim: 'ENGINEERING_OBSERVATION_ONLY', completeBRC100Conformance: false, finalLedgerRequired: true, identity: '', trace: [], fixtures: [], publicCertificates: [], issuer: [],
    lookup: [], lookupMode: 'valid', lookupClosed: false, routeClosed: false, settings: {}, permissionSteps: [], extensionId: hooks.extensionId, errors: [],
    submissionStart: services.submissions.length, submissionEnd: services.submissions.length, submissionPrefix: snapshot(), submissions: [],
    routeStart: services.routes.length, routeEnd: services.routes.length, routes: [], assertions: [], result: 'BLOCKED' }
  let currentCall = '', helper = 0, closeLookup: (() => Promise<void>) | undefined, closeRoute: (() => void) | undefined
  let changedSettings = false
  const call = async (id: string, method: string, args: any, throwError = false): Promise<any> => {
    if (report.trace.length >= policy.bounds.publicCalls) throw Error('Certificate coverage public-call budget exceeded')
    currentCall = id
    const row = { id, method, args: structuredClone(args), startedAt: new Date().toISOString(), endedAt: '',
      submissionStart: services.submissions.length, submissionEnd: services.submissions.length, routeStart: services.routes.length, routeEnd: services.routes.length } as CertificateCoverageReport['trace'][number]
    report.trace.push(row)
    try { const value = await wallet[method](structuredClone(args)); row.result = structuredClone(value); return value }
    catch (error) { row.error = captureClauseError(error); if (throwError) throw error }
    finally { row.endedAt = new Date().toISOString(); row.submissionEnd = services.submissions.length; row.routeEnd = services.routes.length }
  }
  const publicWallet: any = new Proxy({}, { get: (_target, method) => typeof method !== 'string' || method === 'then' ? undefined : (args: any) => call(`helper-${++helper}`, method, args, true) })
  const settings = new WalletSettingsManager(publicWallet)
  const outputs = () => publicWallet.listOutputs({ basket: 'wallet settings', tags: ['settings'], tagQueryMode: 'all', include: 'entire transactions' })
  const inventory = (id: string) => call(id, 'listCertificates', { certifiers: [], types: [], limit: 10000 })
  const issuers = [createCoverageCertificateIssuer(), createCoverageCertificateIssuer(config.transportKey)]
  let activeIssuer = issuers[0]!
  const query = async (question: any) => {
    const response = await fetch(`${origin.origin}/lookup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(question), redirect: 'error', signal: AbortSignal.timeout(15000) })
    const value = await response.json(); if (!response.ok) throw Error(`Certificate overlay lookup HTTP ${response.status}`); return value as any
  }
  try {
    report.identity = (await call('identity', 'getPublicKey', { identityKey: true }, true)).publicKey
    await inventory('baseline')
    const setup = await call('revocation-setup', 'createAction', { description: 'TPNIL certificate coverage revocation token', outputs: [{ satoshis: config.satoshis, lockingScript: config.script, outputDescription: 'Dedicated certificate revocation output', basket: config.basket }], options: { randomizeOutputs: false, acceptDelayedBroadcast: false } }, true)
    const revocationOutpoint = `${setup.txid}.0`
    for (const issuer of issuers) issuer.setRevocationOutpoint(revocationOutpoint)
    closeRoute = services.registerControlledRoute('certifier.itcve.test', (request, response) => activeIssuer.handle(request, response))
    for (let index = 0; index < 2; index++) {
      const issuer = new ProtoWallet(PrivateKey.fromHex(config.issuerKeys[index]!))
      const certificate = JSON.parse(JSON.stringify(await issueFixtureCertificateForSubject(issuer, report.identity, config.fields, config.type, async () => revocationOutpoint, config.serials[index]!)))
      report.fixtures.push(certificate)
      await call(`acquire-${index}`, 'acquireCertificate', { ...certificate, acquisitionProtocol: 'direct', keyringRevealer: 'certifier', keyringForSubject: certificate.masterKeyring }, true)
      const proof = await call(`proof-${index}`, 'proveCertificate', { certificate: { type: certificate.type, serialNumber: certificate.serialNumber, certifier: certificate.certifier }, verifier: config.anyone, fieldsToReveal: ['name'] }, true)
      const { masterKeyring: _private, ...publicFields } = certificate
      report.publicCertificates.push({ ...publicFields, keyring: proof.keyringForVerifier })
    }
    const issuanceArgs = { type: config.issuanceType, certifier: issuers[0]!.identity, acquisitionProtocol: 'issuance', certifierUrl: config.issuerUrl, fields: config.fields }
    await call('issuance-valid', 'acquireCertificate', issuanceArgs)
    await inventory('before-wrong-auth')
    activeIssuer = issuers[1]!
    await call('issuance-wrong-auth', 'acquireCertificate', issuanceArgs)
    await inventory('after-wrong-auth')
    const invalidSignature = { ...report.publicCertificates[0], signature: '00'.repeat(70) }
    const invalidKeyring = { ...report.publicCertificates[1], keyring: { name: Buffer.alloc(32, 1).toString('base64') } }
    report.publicCertificates.push(invalidSignature, invalidKeyring)
    const scripts = []
    for (const certificate of report.publicCertificates) scripts.push(await new PushDrop(publicWallet).lock([Utils.toArray(JSON.stringify(certificate), 'utf8')], [1, 'identity'], '1', 'anyone', true))
    const slap = await new PushDrop(publicWallet).lock([Utils.toArray('SLAP', 'utf8'), Utils.toArray(report.identity, 'hex'), Utils.toArray('https://overlay.itcve.test', 'utf8'), Utils.toArray('ls_identity', 'utf8')], [2, 'service lookup availability'], '1', 'anyone', true)
    const publication = await call('publication', 'createAction', { description: 'TPNIL certificate coverage signed publications', outputs: [...scripts.map((script, index) => ({ satoshis: 1, lockingScript: script.toHex(), outputDescription: `Certificate coverage publication ${index}` })), { satoshis: 1, lockingScript: slap.toHex(), outputDescription: 'Certificate coverage lookup advertisement' }], options: { randomizeOutputs: false, acceptDelayedBroadcast: false } }, true)
    const tx = Transaction.fromAtomicBEEF(publication.tx)
    const response = await fetch(`${origin.origin}/submit`, { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-topics': JSON.stringify(['tm_identity', 'tm_slap']) }, body: Buffer.from(tx.toAtomicBEEF()), signal: AbortSignal.timeout(15000) })
    const receipt = await response.json(); if (!response.ok) throw Error(`Certificate publication HTTP ${response.status}`)
    report.publication = { receipt, answer: await query({ service: 'ls_identity', query: { identityKey: report.identity, certifiers: report.fixtures.map(c => c.certifier) } }) }
    closeLookup = await hooks.installLookup(async question => {
      let answer = await query(question)
      if (question.service === 'ls_identity' && ['bad-signature', 'bad-keyring'].includes(report.lookupMode)) {
        answer = structuredClone(answer)
        answer.outputs.push({ beef: tx.toBEEF(), outputIndex: report.lookupMode === 'bad-signature' ? 2 : 3 })
      }
      report.lookup.push({ callId: currentCall, question: structuredClone(question), answer: structuredClone(answer) })
      return answer
    })
    report.settings.original = await settings.get(); report.settings.originalOutputs = await outputs()
    report.settings.temporary = structuredClone(report.settings.original)
    report.settings.temporary.trustSettings.trustedCertifiers.push(...report.fixtures.map((c, index) => ({ identityKey: c.certifier, name: `TPNIL additional issuer ${index}`, description: 'Temporary certificate coverage issuer', trust: index === 0 ? 4 : 3 })))
    changedSettings = true; await settings.set(report.settings.temporary)
    report.settings.temporaryOutputs = await outputs(); report.settings.readback = await settings.get()
    await inventory('inventory-before-restart')
    report.restart = { ...await hooks.restart(), beforeCall: report.trace.length, startedAfter: report.trace.at(-1)!.endedAt, endedAt: new Date().toISOString() }
    await call('identity-after-restart', 'getPublicKey', { identityKey: true })
    await inventory('inventory-after-restart')
    await call('proof-after-restart', 'proveCertificate', { certificate: { type: report.fixtures[0].type, serialNumber: report.fixtures[0].serialNumber, certifier: report.fixtures[0].certifier }, verifier: config.anyone, fieldsToReveal: ['name'] })
    for (const mode of ['valid', 'bad-signature', 'bad-keyring']) {
      report.lookupMode = mode
      for (const [method, args] of [['discoverByIdentityKey', { identityKey: report.identity }], ['discoverByAttributes', { attributes: { name: config.fields.name } }]] as const)
        await call(`${mode}-${method}`, method, { ...args, seekPermission: true, forceRefresh: true })
    }
    report.lookupMode = 'valid'
    await call('attribute-no-match', 'discoverByAttributes', { attributes: { name: config.absentName }, seekPermission: true, forceRefresh: true })
    if (hooks.permissionRequest) {
      for (let index = 0; index < 2; index++) {
        const method = index === 0 ? 'discoverByIdentityKey' : 'discoverByAttributes', args = index === 0 ? { identityKey: report.identity } : { attributes: { name: config.fields.name } }
        for (const phase of ['omitted', 'false', 'deny', 'allow']) {
          const id = `permission-${index}-${phase}`; currentCall = id
          report.permissionSteps.push(await hooks.permissionRequest(id, config.origins[index]!, method, { ...args, forceRefresh: true, ...(phase === 'omitted' ? {} : { seekPermission: phase !== 'false' }) }, phase === 'allow' ? 'allow' : 'deny'))
        }
      }
    }
    await call('revoke', 'createAction', { description: 'Spend certificate revocation token', inputBEEF: setup.tx, inputs: [{ outpoint: revocationOutpoint, unlockingScript: '51', inputDescription: 'Revoke certificate coverage pair' }], outputs: [{ satoshis: 1, lockingScript: '51', outputDescription: 'Certificate revocation receipt' }], options: { randomizeOutputs: false, acceptDelayedBroadcast: false } })
    await call('relinquish-revoked', 'relinquishCertificate', { type: report.fixtures[0].type, serialNumber: report.fixtures[0].serialNumber, certifier: report.fixtures[0].certifier })
    await inventory('after-relinquishment')
  } catch (error) { report.errors.push(error instanceof Error ? error.message : String(error)) }
  finally {
    for (const [index, cert] of report.fixtures.entries()) await call(`cleanup-${index}`, 'relinquishCertificate', { type: cert.type, serialNumber: cert.serialNumber, certifier: cert.certifier })
    const issued = report.trace.find(row => row.id === 'issuance-valid')?.result
    if (issued) await call('cleanup-issued', 'relinquishCertificate', { type: issued.type, serialNumber: issued.serialNumber, certifier: issued.certifier })
    await inventory('after-cleanup')
    try {
      if (changedSettings) { if (report.settings.originalOutputs.totalOutputs === 0) await settings.delete(); else await settings.set(report.settings.original) }
      if (report.settings.original) { report.settings.restored = await settings.get(); report.settings.restoredOutputs = await outputs() }
    } catch (error) { report.errors.push(`Settings cleanup: ${String(error)}`) }
    try { if (closeLookup) { await closeLookup(); report.lookupClosed = true } } catch (error) { report.errors.push(`Lookup cleanup: ${String(error)}`) }
    if (closeRoute) { closeRoute(); report.routeClosed = true }
  }
  report.issuer = issuers.map(issuer => ({ identity: issuer.identity, transportIdentity: issuer.transportIdentity, receipts: issuer.receipts, exchanges: issuer.exchanges, authMessages: issuer.authMessages }))
  report.submissionEnd = services.submissions.length; report.submissions = snapshot().slice(report.submissionStart)
  report.routeEnd = services.routes.length; report.routes = structuredClone(services.routes.slice(report.routeStart))
  report.assertions = await deriveCertificateCoverageOutcomes(report, hooks.readEvidence)
  report.result = report.assertions.some(row => row.result === 'FAIL') ? 'FAIL' : report.assertions.some(row => row.result === 'BLOCKED') ? 'BLOCKED' : 'PASS'
  evidence.addJson('conformance/coverage-certificates.json', report)
  return report
}
