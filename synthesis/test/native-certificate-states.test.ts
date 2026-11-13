import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { PrivateKey, ProtoWallet } from '@bsv/sdk'
import { ControlledWalletServices } from '../src/wallet-lab/services.js'
import { createFixtureWallet } from '../src/storage-sync/fixture-wallet.js'
import { issueFixtureCertificateForSubject } from '../src/wallet-lab/certificate-fixture.js'
import { runNativeCertificateStates } from '../src/wallet-lab/native/conformance-certificate-states.js'
import { certificateStateConfig as config, certificateStateIds, type CertificateStateReport } from '../src/wallet-lab/native/conformance-certificate-states-model.js'
import { deriveCertificateStateOutcomes, verifyCertificateStateParentBindings, verifyNativeCertificateStates } from '../src/wallet-lab/native/verify-certificate-states.js'

// LAB_SELF_TEST_ONLY: real TypeScript reference wallet, remote storage and SDK
// cryptography. These tests never qualify native behavior or replace its data.
describe('prospective certificate states with real reference wallet', () => {
  let report: CertificateStateReport, missingBoundary: CertificateStateReport
  let binding: Parameters<typeof verifyCertificateStateParentBindings>[1]
  beforeAll(async () => {
    let wallet: any, services: ControlledWalletServices | undefined
    const failures: unknown[] = []
    const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'tpnil-certificate-states-'))
    try {
      services = new ControlledWalletServices({ webroot: directory }); await services.start()
      await services.fundRemoteWalletFromTeranode('77'.repeat(32), JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../fixtures/teranode/wab-funding-v1.json'), 'utf8')))
      wallet = await createFixtureWallet(services, '77'.repeat(32))
      const identity = await wallet.getPublicKey({ identityKey: true })
      const args = { description: 'TPNIL boundary token pair', outputs: [0, 1].map(index => ({ satoshis: 7, lockingScript: '7551', outputDescription: `Boundary token ${index}` })), options: { randomizeOutputs: false, acceptDelayedBroadcast: false } }
      const creation = await wallet.createAction(args)
      // A real preexisting certificate overlaps both an issuer and type. Exact
      // filter/cleanup checks must retain it instead of assuming an empty wallet.
      const baseline = await issueFixtureCertificateForSubject(new ProtoWallet(PrivateKey.fromHex(config.issuerKeys[0])) as any, identity.publicKey,
        { name: 'Preexisting retained certificate' }, config.types[0], async () => `${creation.txid}.1`, Buffer.alloc(32, 190).toString('base64'))
      await wallet.acquireCertificate({ ...baseline, acquisitionProtocol: 'direct', keyringRevealer: 'certifier', keyringForSubject: baseline.masterKeyring })
      const boundaryReport = { trace: [{ method: 'getPublicKey', args: { identityKey: true }, result: identity }, { method: 'createAction', args, result: creation }] }
      report = await runNativeCertificateStates({ wallet, services, evidence: { addJson: () => {} } as any, boundaryReport })
      binding = { boundary: boundaryReport, identity: identity.publicKey, globalRoutes: structuredClone(services.routes), globalSubmissions: services.submissions.map(value => ({ txid: value.txid, beefHex: Buffer.from(value.bytes).toString('hex'), verdict: value.verdict })) }
      missingBoundary = await runNativeCertificateStates({ wallet, services, evidence: { addJson: () => {} } as any,
        boundaryReport: { trace: [{ method: 'getPublicKey', args: { identityKey: true }, result: { publicKey: report.identity } }] } })
    } catch (error) { failures.push(error) }
    finally {
      // All tests below replay immutable observations. Release authenticated
      // storage clients before CPU-only cryptographic mutations can leave an
      // idle HTTP connection pending for longer than the server keepalive.
      try { await wallet?.destroy() } catch (error) { failures.push(error) }
      try { await services?.close() } catch (error) { failures.push(error) }
      try { fs.rmSync(directory, { recursive: true, force: true }) } catch (error) { failures.push(error) }
    }
    if (failures.length) throw new AggregateError(failures, 'Certificate fixture capture or cleanup failed')
  }, 90000)
  const mutation = async (id: string, change: (value: CertificateStateReport) => void) => {
    const changed = structuredClone(report); change(changed)
    const outcomes = await deriveCertificateStateOutcomes(changed)
    expect(outcomes.find(row => row.id === `certificate-states.${id}`)?.result).not.toBe('PASS')
    await expect(verifyNativeCertificateStates(changed)).rejects.toThrow()
  }
  it('runs all26 public calls and14 independent predicates, preserving baseline', async () => {
    const verified = await verifyNativeCertificateStates(report)
    expect(verified.assertions.map(row => row.id)).toEqual(certificateStateIds)
    expect(verified.assertions.map(row => [row.id, row.result, row.detail])).toEqual(certificateStateIds.map(id => [id, 'PASS', 'Fixed public requests and independent certificate-state predicate agree.']))
    expect(verified.publicCalls).toBe(26)
    expect(report.submissionEnd).toBe(report.submissionStart)
    expect(report.httpRequests).toEqual([])
    expect(report.trace.find(row => row.id === 'baseline')!.result.certificates).toHaveLength(1)
    expect(report.trace.find(row => row.id === 'after-cleanup')!.result.certificates).toHaveLength(1)
    expect(verifyCertificateStateParentBindings(report, binding)).toEqual({ verified: true })
  })
  it('replays canonical evidence with sorted keys identically', async () => {
    const canonical = JSON.parse(JSON.stringify(report, (_key, value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value))
    expect((await verifyNativeCertificateStates(canonical)).result).toBe('PASS')
  })
  it.each(['signature', 'subject', 'certifier', 'revocationOutpoint'] as const)('rejects mutated independently signed fixture %s', async field => {
    await mutation('fixture-authentication', changed => { changed.fixtures[0][field] = changed.fixtures[3][field] + '00' })
  })
  it('rejects wrong field key without native-wallet substitution', async () => mutation('fixture-authentication', changed => { changed.fixtures[0].masterKeyring.name = Buffer.alloc(32, 2).toString('base64') }))
  it('rejects a changed boundary BEEF graph', async () => mutation('fixture-authentication', changed => { changed.boundaryAnchor!.atomicBeef[50]! ^= 1 }))
  it('keeps acquisition failure visible and blocks dependent positive predicates', async () => {
    const changed = structuredClone(report), row = changed.trace.find(value => value.id === 'acquire-a')!
    delete row.result; row.error = { name: 'Error', message: 'Invalid certificate' }
    const outcomes = await deriveCertificateStateOutcomes(changed)
    expect(outcomes.find(value => value.id === 'certificate-states.fixture-acquisition')!.result).toBe('FAIL')
    expect(outcomes.find(value => value.id === 'certificate-states.inventory-issuer')!.result).toBe('BLOCKED')
  })
  it.each(['tampered-field', 'wrong-subject', 'proof-wrong-certifier', 'proof-wrong-serial', 'proof-wrong-subject', 'proof-wrong-signature', 'issuance-direct-fields'])('rejects timeout masquerading as %s validation', async id => {
    const suffix = id.startsWith('proof-') ? 'proof-tuple-mismatches' : id === 'tampered-field' ? 'acquire-tampered-field' : id === 'wrong-subject' ? 'acquire-wrong-subject' : id
    await mutation(suffix, changed => { changed.trace.find(value => value.id === id)!.error = { name: 'Error', message: 'Operation timed out' } })
  })
  it('rejects unrequested disclosure even when the requested field decrypts', async () => mutation('proof-control', changed => { changed.trace.find(row => row.id === 'proof-control')!.result.keyringForVerifier.private = 'AA==' }))
  it('rejects invalid designated-verifier key material', async () => mutation('proof-control', changed => { changed.trace.find(row => row.id === 'proof-control')!.result.keyringForVerifier.name = 'AA==' }))
  it.each(['issuer', 'type', 'combined', 'empty', 'no-match'])('rejects unrelated result in %s inventory', async suffix => mutation(`inventory-${suffix}`, changed => {
    const result = changed.trace.find(row => row.id === `filter-${suffix}`)!.result
    result.certificates.push(changed.fixtures[3]); result.totalCertificates++
  }))
  it('rejects loss of the preexisting certificate during cleanup', async () => mutation('cleanup', changed => { const result = changed.trace.find(row => row.id === 'after-cleanup')!.result; result.certificates = []; result.totalCertificates = 0 }))
  it('rejects rejected-acquisition persistence', async () => mutation('acquire-tampered-field', changed => { const result = changed.trace.find(row => row.id === 'after-tampered')!.result; result.certificates.push(changed.fixtures[0]); result.totalCertificates++ }))
  it('rejects HTTP activity during the direct branch', async () => mutation('direct-extra-url', changed => {
    changed.httpRequests.push({ method: 'POST', path: '/certificate-state/signCertificate' })
    const index = changed.trace.findIndex(row => row.id === 'direct-extra-url')
    changed.trace[index]!.httpEnd++
    for (const row of changed.trace.slice(index + 1)) { row.httpStart++; row.httpEnd++ }
  }))
  it('rejects omitted handler counts against independent global endpoint requests', () => {
    const changedBinding = structuredClone(binding)
    changedBinding.globalRoutes.push({ sequence: changedBinding.globalRoutes.length + 1, method: 'POST', host: 'certifier.itcve.test', pathname: '/certificate-state/signCertificate', disposition: 'controlled-service' })
    expect(report.httpRequests).toEqual([])
    expect(() => verifyCertificateStateParentBindings(report, changedBinding)).toThrow(/omitted|outside/)
    const shifted = structuredClone(report); shifted.routeStart = shifted.routeEnd = changedBinding.globalRoutes.length; shifted.routes = []
    expect(() => verifyCertificateStateParentBindings(shifted, changedBinding)).toThrow(/omitted|outside/)
  })
  it('detects global OPTIONS even when it never reached the handler', async () => mutation('direct-extra-url', changed => {
    const index = changed.trace.findIndex(row => row.id === 'direct-extra-url'), value = changed.trace[index]!
    changed.routes.splice(value.routeEnd - changed.routeStart, 0, { sequence: 999, method: 'OPTIONS', host: 'certifier.itcve.test', pathname: '/certificate-state/signCertificate', disposition: 'controlled-service' })
    value.routeEnd++; for (const row of changed.trace.slice(index + 1)) { row.routeStart++; row.routeEnd++ }; changed.routeEnd++
    expect(changed.httpRequests).toEqual([])
  }))
  it('rejects substituted parent identity, boundary anchor or submission prefix', () => {
    const changedIdentity = structuredClone(binding); changedIdentity.identity = PrivateKey.fromHex(config.otherSubjectKey).toPublicKey().toString()
    expect(() => verifyCertificateStateParentBindings(report, changedIdentity)).toThrow(/identity/)
    const changedAnchor = structuredClone(binding); changedAnchor.boundary.trace.find((row: any) => row.method === 'createAction').result.tx[50] ^= 1
    expect(() => verifyCertificateStateParentBindings(report, changedAnchor)).toThrow(/anchor/)
    const changedPrefix = structuredClone(binding); changedPrefix.globalSubmissions[0]!.beefHex = '00'
    expect(() => verifyCertificateStateParentBindings(report, changedPrefix)).toThrow(/submission prefix/)
  })
  it('rejects substituted public arguments', async () => mutation('fixture-authentication', changed => { changed.trace.find(row => row.id === 'proof-wrong-subject')!.args.certificate.subject = report.identity }))
  it('rejects missing/duplicated calls as evidence corruption', async () => {
    const changed = structuredClone(report); changed.trace.splice(10, 1)
    await expect(deriveCertificateStateOutcomes(changed)).rejects.toThrow(/call order/)
    const duplicate = structuredClone(report); duplicate.trace[10]!.id = duplicate.trace[9]!.id
    await expect(deriveCertificateStateOutcomes(duplicate)).rejects.toThrow(/Duplicate/)
  })
  it('preserves absence of a public boundary fixture as oneFAIL and13BLOCKED', async () => {
    const result = missingBoundary
    expect(result.boundaryAnchor).toBe(null)
    expect(result.trace).toEqual([])
    expect((await verifyNativeCertificateStates(result)).assertions.map(row => row.result)).toEqual(['FAIL', ...Array(13).fill('BLOCKED')])
  })
})
