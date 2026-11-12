// SPDX-License-Identifier: Apache-2.0
import { PrivateKey, ProtoWallet, PushDrop, Transaction, Utils } from '@bsv/sdk'
import { WalletSettingsManager } from '@bsv/wallet-toolbox'
import { issueFixtureCertificateForSubject } from '../../certificate-fixture.js'
import { bounds, schema, fixtureConfig, issuerKey, anyone, trust, queryProgram, type Report, type Call } from './pagination-model.js'
export interface Ports { installLookup(answer: (q: any) => Promise<any>): Promise<() => Promise<void>> }
export async function capturePagination({ wallet, services, overlayOrigin, hooks, anchor, nonce, mode = 'REFERENCE' }: { wallet: any; services: any; overlayOrigin: string; hooks: Ports; anchor: { outpoint: string; rawTxHex: string; source: string; sha256: string }; nonce: string; mode?: Report['mode'] }): Promise<Report> {
  const url = new URL(overlayOrigin)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/' || url.search || url.hash) throw Error('Owned loopback overlay required')
  const config = fixtureConfig(nonce), issuer = new ProtoWallet(PrivateKey.fromHex(issuerKey))
  const report: Report = { schema, claim: 'ENGINEERING_OBSERVATION_ONLY', mode, nonce, identity: '', issuer: (await issuer.getPublicKey({ identityKey: true })).publicKey, anchor: structuredClone(anchor), fixtures: [], publicCertificates: [], trace: [], lookup: [], settings: {}, publication: {}, errors: [], lookupClosed: false, submissionStart: services.submissions.length, submissionEnd: services.submissions.length, submissions: [], completeBRC100Conformance: false }
  let current = '', helper = 0, closeLookup: (() => Promise<void>)|undefined, changed = false
  const call = async (id: string, method: string, args: any, mandatory = false) => {
    if (report.trace.length >= bounds.publicCalls) throw Error('Pagination public-call budget exceeded')
    current = id
    const row: Call = { id, method, args: structuredClone(args), start: Date.now(), end: 0, submissionStart: services.submissions.length, submissionEnd: services.submissions.length }; report.trace.push(row)
    try { row.result = structuredClone(await wallet[method](structuredClone(args))); return row.result }
    catch (e) { row.error = e instanceof Error ? { name: e.name, message: e.message } : { message: String(e) }; if (mandatory) throw e }
    finally { row.end = Date.now(); row.submissionEnd = services.submissions.length }
  }
  const proxy: any = new Proxy({}, { get: (_, method) => typeof method !== 'string' || method === 'then' ? undefined : (args: any) => call(`helper-${++helper}`, method, args, true) })
  const settings = new WalletSettingsManager(proxy)
  const settingsOutputs = () => proxy.listOutputs({ basket: 'wallet settings', tags: ['settings'], tagQueryMode: 'all', include: 'entire transactions' })
  const lookup = async (q: any) => {
    const response = await fetch(`${url.origin}/lookup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(q), redirect: 'error', signal: AbortSignal.timeout(15000) })
    const answer = await response.json(); if (!response.ok) throw Error(`Owned overlay HTTP ${response.status}`)
    report.lookup.push({ id: current, question: structuredClone(q), answer: structuredClone(answer) }); return answer
  }
  try {
    report.identity = (await call('identity', 'getPublicKey', { identityKey: true }, true)).publicKey
    await call('baseline', 'listCertificates', { certifiers: [report.issuer], types: [config.type], limit: 10000 }, true)
    for (let i = 0; i < 11; i++) {
      const c = JSON.parse(JSON.stringify(await issueFixtureCertificateForSubject(issuer, report.identity, config.fields, config.type, async () => anchor.outpoint, config.serials[i]!)))
      report.fixtures.push(c)
      await call(`acquire-${i}`, 'acquireCertificate', { ...c, acquisitionProtocol: 'direct', keyringRevealer: 'certifier', keyringForSubject: c.masterKeyring }, true)
      const proof = await call(`proof-${i}`, 'proveCertificate', { certificate: { type: c.type, serialNumber: c.serialNumber, certifier: c.certifier }, verifier: anyone, fieldsToReveal: ['name'] }, true)
      const { masterKeyring, ...publicFields } = c; report.publicCertificates.push({ ...publicFields, keyring: proof.keyringForVerifier })
    }
    const scripts = []
    for (const c of report.publicCertificates) scripts.push(await new PushDrop(proxy).lock([Utils.toArray(JSON.stringify(c), 'utf8')], [1, 'identity'], '1', 'anyone', true))
    scripts.push(await new PushDrop(proxy).lock([Utils.toArray('SLAP', 'utf8'), Utils.toArray(report.identity, 'hex'), Utils.toArray('https://overlay.itcve.test', 'utf8'), Utils.toArray('ls_identity', 'utf8')], [2, 'service lookup availability'], '1', 'anyone', true))
    const publication = await call('publication', 'createAction', { description: 'Publish eleven pagination certificates', outputs: scripts.map((s, i) => ({ satoshis: 1, lockingScript: s.toHex(), outputDescription: `Pagination certificate publication ${i}` })), options: { randomizeOutputs: false, acceptDelayedBroadcast: false } }, true)
    const tx = Transaction.fromAtomicBEEF(publication.tx)
    const submitted = await fetch(`${url.origin}/submit`, { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-topics': JSON.stringify(['tm_identity', 'tm_slap']) }, body: Buffer.from(tx.toAtomicBEEF()), redirect: 'error', signal: AbortSignal.timeout(15000) })
    report.publication.receipt = await submitted.json(); if (!submitted.ok) throw Error(`Publication HTTP ${submitted.status}`)
    report.publication.answer = await lookup({ service: 'ls_identity', query: { identityKey: report.identity, certifiers: [report.issuer] } })
    closeLookup = await hooks.installLookup(lookup)
    report.settings.original = await settings.get(); report.settings.originalOutputs = await settingsOutputs()
    report.settings.temporary = structuredClone(report.settings.original)
    if (report.settings.temporary.trustSettings.trustedCertifiers.some((x: any) => x.identityKey === report.issuer)) throw Error('Fixture issuer already trusted')
    report.settings.temporary.trustSettings.trustedCertifiers.push({ identityKey: report.issuer, ...trust })
    changed = true; await settings.set(report.settings.temporary)
    report.settings.temporaryOutputs = await settingsOutputs(); report.settings.readback = await settings.get()
    for (const p of queryProgram(report.identity, report.issuer, nonce)) await call(p.id, p.method, p.args)
  } catch (e) { report.errors.push(e instanceof Error ? e.message : String(e)) }
  finally {
    for (const [i, c] of report.fixtures.entries()) await call(`cleanup-${i}`, 'relinquishCertificate', { type: c.type, serialNumber: c.serialNumber, certifier: c.certifier })
    await call('after-cleanup', 'listCertificates', { certifiers: [report.issuer], types: [config.type], limit: 10000 })
    try { if (changed) { if (report.settings.originalOutputs.totalOutputs === 0) await settings.delete(); else await settings.set(report.settings.original) }; if (report.settings.original) { report.settings.restored = await settings.get(); report.settings.restoredOutputs = await settingsOutputs() } } catch (e) { report.errors.push(`Settings cleanup: ${String(e)}`) }
    try { if (closeLookup) { await closeLookup(); report.lookupClosed = true } } catch (e) { report.errors.push(`Lookup cleanup: ${String(e)}`) }
  }
  report.submissionEnd = services.submissions.length
  report.submissions = services.submissions.slice(report.submissionStart).map((s: any) => ({ txid: s.txid, beefHex: Buffer.from(s.bytes).toString('hex'), verdict: s.verdict }))
  return report
}
