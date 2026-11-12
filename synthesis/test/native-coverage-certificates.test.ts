import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFailed } from 'vitest'
import { Transaction } from '@bsv/sdk'
import { runReferenceChild } from './reference-child.js'
import { certificateCoverageIds, type CertificateCoverageReport } from '../src/wallet-lab/native/coverage-certificates-model.js'
import { deriveCertificateCoverageOutcomes, verifyCertificateCoverage, verifyCertificateCoverageParentBindings } from '../src/wallet-lab/native/coverage-certificates-verify.js'
import { coverageObservationEncoding, encodeCoverageObservation, decodeCoverageObservation } from '../src/wallet-lab/native/coverage-observation.js'

// Self-contained LAB_SELF_TEST_ONLY: actual reference wallet, remote storage,
// authenticated issuer and OverlayExpress, never synthetic native UI receipts.
describe.skipIf(process.env.TPNIL_CERTIFICATE_COVERAGE_TESTS !== '1')('prospective certificate coverage evidence', () => {
  const root = path.resolve(import.meta.dirname, '../..')
  let directory: string | undefined, referenceCompleted = false, suiteFailed = false
  let report: CertificateCoverageReport, binding: Parameters<typeof verifyCertificateCoverageParentBindings>[1]
  beforeAll(async () => {
    const evidenceRoot = path.join(root, 'out/test-evidence'); fs.mkdirSync(evidenceRoot, { recursive: true })
    directory = fs.mkdtempSync(path.join(fs.realpathSync(evidenceRoot), 'certificate-coverage-'))
    await runReferenceChild(process.execPath, ['--import', path.join(root, 'synthesis/node_modules/tsx/dist/loader.mjs'),
      path.join(root, 'synthesis/src/wallet-lab/native/coverage-certificates-reference.ts'), directory], { cwd: root, directory, timeout: 120000, maxBuffer: 16 * 1024 * 1024 })
    report = JSON.parse(fs.readFileSync(path.join(directory, 'report.json'), 'utf8'))
    const ledger = JSON.parse(fs.readFileSync(path.join(directory, 'parent-ledgers.json'), 'utf8'))
    const transactions = new Map<string, Transaction>()
    const add = (tx: Transaction) => { if (transactions.has(tx.id('hex'))) return; transactions.set(tx.id('hex'), tx); for (const input of tx.inputs) if (input.sourceTransaction) add(input.sourceTransaction) }
    for (const row of report.trace) if (['createAction', 'signAction'].includes(row.method) && row.result?.tx) add(Transaction.fromAtomicBEEF(row.result.tx))
    const fixture = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/teranode/wab-funding-v1.json'), 'utf8'))
    binding = { ...ledger, finalSubmissions: structuredClone(ledger.globalSubmissions), browserContexts: [], storageTransactions: new Map(ledger.storageTransactions.map((row: any) => [row.txid, Transaction.fromHex(row.rawTxHex)])), resolvedTransactions: transactions, trustedMinedRoot: { txid: fixture.txid, rawHex: fixture.rawHex } }
    referenceCompleted = true
  }, 150000)
  beforeEach(() => { onTestFailed(() => { suiteFailed = true }) })
  afterAll(() => { if (referenceCompleted && !suiteFailed && directory) fs.rmSync(directory, { recursive: true, force: true }) })
  const mutation = async (id: string, change: (value: CertificateCoverageReport) => void) => {
    const value = structuredClone(report); change(value)
    const outcomes = await deriveCertificateCoverageOutcomes(value)
    expect(outcomes.find(row => row.id === `coverage-certificates.${id}`)?.result).not.toBe('PASS')
    await expect(verifyCertificateCoverage(value)).rejects.toThrow()
  }
  const call = (value: CertificateCoverageReport, id: string) => value.trace.find(row => row.id === id)!
  it('executes real public operations with explicit native-only gaps', async () => {
    const result = await verifyCertificateCoverage(report)
    expect(result.counts).toEqual({ PASS: 8, FAIL: 0, BLOCKED: 3 })
    expect(result.assertions.map(row => row.id)).toEqual(certificateCoverageIds)
    expect(report.trace.length).toBeLessThanOrEqual(96); expect(report.issuer.map(x => x.receipts.length)).toEqual([1, 1])
    expect(report.permissionSteps).toEqual([]); expect(report.restart.kind).toBe('REFERENCE_CLIENT_REOPEN')
    expect(await verifyCertificateCoverageParentBindings(report, binding)).toEqual({ verified: true, finalLedgerChecked: true })
  })
  it('retains immutable source hashes through reference execution', () => {
    expect(fs.readFileSync(path.join(directory!, 'source-after.json'), 'utf8')).toBe(fs.readFileSync(path.join(directory!, 'source-before.json'), 'utf8'))
    expect(JSON.parse(fs.readFileSync(path.join(directory!, 'cleanup.json'), 'utf8')).failures).toEqual([])
  })
  it('replays sorted canonical object keys without changing details', async () => {
    const value = JSON.parse(JSON.stringify(report, (_key, value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value))
    expect((await verifyCertificateCoverage(value)).counts).toEqual({ PASS: 8, FAIL: 0, BLOCKED: 3 })
  })
  it.each(['subject', 'signature', 'revocationOutpoint', 'type'])('rejects an altered fixture %s', async field => mutation('fixture-authentication', value => { value.fixtures[0][field] += '00' }))
  it('rejects unlinked public disclosure keys', async () => mutation('fixture-authentication', value => { value.publicCertificates[0].keyring.name = 'AA==' }))
  it('rejects forged public settings readback', async () => mutation('fixture-authentication', value => { value.settings.readback.trustSettings.trustedCertifiers[0].trust++ }))
  it('rejects a changed signed trust-token ciphertext', async () => mutation('fixture-authentication', value => { value.settings.temporaryOutputs.BEEF[80] ^= 1 }))
  it.each(['publication', 'revocation-setup'])('rejects trailing serialized bytes in %s', async id => mutation('fixture-authentication', value => { call(value, id).result.tx.push(0) }))
  it.each(['hole', 'undefined', 'nonfinite'])('retains and rejects malformed %s bytes through the prospective observation codec', async kind => {
    const value = structuredClone(report), bytes = call(value, 'publication').result.tx, index = bytes.indexOf(0)
    expect(index).toBeGreaterThanOrEqual(0)
    if (kind === 'hole') delete bytes[index]
    else bytes[index] = kind === 'undefined' ? undefined : NaN
    const decoded = decodeCoverageObservation<CertificateCoverageReport>(JSON.parse(JSON.stringify(encodeCoverageObservation(value))), coverageObservationEncoding)
    expect((await deriveCertificateCoverageOutcomes(decoded)).find(row => row.id === 'coverage-certificates.fixture-authentication')?.result).toBe('FAIL')
  })
  it('rejects trailing bytes in the actual revocation spend', async () => mutation('relinquish-revoked', value => { call(value, 'revoke').result.tx.push(0) }))
  it('rejects mismatched final settings output count', async () => mutation('cleanup', value => { value.settings.restoredOutputs.outputs.push({ outpoint: `${'00'.repeat(32)}.0` }) }))
  it('binds restored settings to the final actual decrypt response', async () => mutation('cleanup', value => {
    const decrypt = value.trace.filter(row => row.method === 'decrypt').at(-1)!; decrypt.result.plaintext = [...Buffer.from('{"unrelated":"plaintext"}')]
  }))
  it('rejects a claimed transport identity unsupported by signatures', async () => mutation('wrong-auth-identity', value => { value.issuer[1].transportIdentity = value.issuer[0].identity }))
  it('rejects authenticated issuance payload substitution', async () => mutation('wrong-auth-identity', value => { value.issuer[1].receipts[0].request.fields.name = 'AA==' }))
  it('rejects a bad server nonce even with a claimed auth receipt', async () => mutation('wrong-auth-identity', value => { value.issuer[1].receipts[0].response.serverNonce = Buffer.alloc(48, 1).toString('base64') }))
  it('allows a correctly authenticated early identity rejection without demanding issuance', async () => {
    const value = structuredClone(report), issuer = value.issuer[1]
    // Derived self-test only: retain the real signed handshake but model a
    // wallet which refuses to send the application request to the wrong peer.
    issuer.receipts = []; issuer.authMessages = issuer.authMessages.filter((r: any) => r.message.messageType !== 'general'); issuer.exchanges = issuer.exchanges.filter((r: any) => r.path === '/.well-known/auth')
    expect((await deriveCertificateCoverageOutcomes(value)).find(r => r.id.endsWith('.wrong-auth-identity'))?.result).toBe('PASS')
    issuer.authMessages[1].message.signature[10] ^= 1
    expect((await deriveCertificateCoverageOutcomes(value)).find(r => r.id.endsWith('.wrong-auth-identity'))?.result).toBe('FAIL')
  })
  it('rejects a timeout masquerading as identity validation', async () => mutation('wrong-auth-identity', value => { call(value, 'issuance-wrong-auth').error = { name: 'Error', message: 'Invalid certifier request timed out' } }))
  it('rejects persistence after the wrong authenticated identity', async () => mutation('wrong-auth-identity', value => { const result = call(value, 'after-wrong-auth').result; result.certificates.push(value.issuer[1].receipts[0].response.certificate); result.totalCertificates++ }))
  it('checks inventory even when native restart is unavailable', async () => {
    const value = structuredClone(report); call(value, 'inventory-after-restart').result.certificates.pop(); call(value, 'inventory-after-restart').result.totalCertificates--
    expect((await deriveCertificateCoverageOutcomes(value)).find(row => row.id.endsWith('.inventory-restart'))?.result).toBe('FAIL')
  })
  it('independently decrypts the new randomized selective proof after restart', async () => {
    expect(call(report, 'proof-after-restart').result.keyringForVerifier).not.toEqual(call(report, 'proof-0').result.keyringForVerifier)
    const value = structuredClone(report); call(value, 'proof-after-restart').result.keyringForVerifier.name = 'AA=='
    expect((await deriveCertificateCoverageOutcomes(value)).find(row => row.id.endsWith('.inventory-restart'))?.result).toBe('FAIL')
  })
  it('rejects revocation of an unrelated output', async () => mutation('relinquish-revoked', value => { call(value, 'revoke').args.inputs[0].outpoint = `${call(value, 'publication').result.txid}.0` }))
  it('rejects a revoked certificate still present after relinquishment', async () => mutation('relinquish-revoked', value => { const result = call(value, 'after-relinquishment').result; result.certificates.push(value.fixtures[0]); result.totalCertificates++ }))
  it('rejects absent-attribute query substitution', async () => mutation('attribute-no-match', value => { call(value, 'attribute-no-match').args.attributes.name = value.fixtures[0].fields.name }))
  it.each(['multiple-certifiers', 'bad-signature', 'bad-keyring'])('requires both authenticated controls for %s', async id => mutation(id, value => {
    const prefix = id === 'multiple-certifiers' ? 'valid' : id, result = call(value, `${prefix}-discoverByIdentityKey`).result
    result.certificates.pop(); result.totalCertificates--
  }))
  it.each(['bad-signature', 'bad-keyring'])('requires actual malicious lookup bytes for %s', async id => mutation(id, value => {
    for (const lookup of value.lookup.filter(row => row.callId === `${id}-discoverByIdentityKey`)) lookup.answer.outputs.pop()
  }))
  it('rejects invalid certificate inclusion despite valid controls', async () => mutation('bad-signature', value => {
    const result = call(value, 'bad-signature-discoverByAttributes').result
    result.certificates.push({ ...value.publicCertificates[2], publiclyRevealedKeyring: value.publicCertificates[2].keyring }); result.totalCertificates++
  }))
  it('rejects response transport errors alongside discovered certificates', async () => {
    const value = structuredClone(report); call(value, 'valid-discoverByIdentityKey').error = { message: 'error' }
    await expect(deriveCertificateCoverageOutcomes(value)).rejects.toThrow(/Contradictory/)
  })
  it('rejects a missing teardown with otherwise successful cases', async () => mutation('cleanup', value => { value.lookupClosed = false }))
  it('preserves an independently issued preexisting certificate during cleanup', async () => {
    expect(call(report, 'baseline').result.certificates).toHaveLength(1)
    await mutation('cleanup', value => { call(value, 'after-cleanup').result = { totalCertificates: 0, certificates: [] } })
  })
  it('rejects reordered named public calls', async () => {
    const value = structuredClone(report), a = value.trace.findIndex(row => row.id === 'before-wrong-auth'), b = value.trace.findIndex(row => row.id === 'after-wrong-auth')
    ;[value.trace[a], value.trace[b]] = [value.trace[b]!, value.trace[a]!]
    await expect(deriveCertificateCoverageOutcomes(value)).rejects.toThrow(/order/)
  })
  it('binds parent identity, complete route window and submission prefix', async () => {
    await expect(verifyCertificateCoverageParentBindings(report, { ...binding, identity: 'wrong' })).rejects.toThrow()
    const routes = structuredClone(binding.globalRoutes); routes.push({ host: 'certifier.itcve.test', pathname: '/certificate-coverage/signCertificate' })
    await expect(verifyCertificateCoverageParentBindings(report, { ...binding, globalRoutes: routes })).rejects.toThrow(/omitted|window/)
    const globalSubmissions = structuredClone(binding.globalSubmissions); globalSubmissions[0]!.beefHex = '00'
    await expect(verifyCertificateCoverageParentBindings(report, { ...binding, globalSubmissions })).rejects.toThrow()
  })
  it('rejects valid revocation target replayed in the final tail', async () => {
    const revoke = call(report, 'revoke'), submission = binding.globalSubmissions.find(row => row.txid === revoke.result.txid)!
    await expect(verifyCertificateCoverageParentBindings(report, { ...binding, finalSubmissions: [...binding.finalSubmissions, submission] })).rejects.toThrow(/replayed/)
  })
  it('rejects unbound stored raw transaction bytes', async () => {
    const storageTransactions = new Map(binding.storageTransactions); storageTransactions.delete(call(report, 'publication').result.txid)
    await expect(verifyCertificateCoverageParentBindings(report, { ...binding, storageTransactions })).rejects.toThrow()
  })
})
