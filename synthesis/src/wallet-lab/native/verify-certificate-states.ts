import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { Beef, Certificate, MasterCertificate, PrivateKey, ProtoWallet, Transaction, Utils, VerifiableCertificate } from '@bsv/sdk'
import { specifiedError } from './conformance-clauses-model.js'
import { certificateStateCallIds, certificateStateConfig as config, certificateStateIds, certificateStatePolicy, certificateStatePolicySha256, type CertificateStateReport } from './conformance-certificate-states-model.js'

const funding = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../../../fixtures/teranode/wab-funding-v1.json'), 'utf8'))
const tracker = { currentHeight: async () => funding.fundingHeight + funding.maturityDepth, isValidRootForHeight: async (root: string, height: number) => root === funding.merkleRoot && height === funding.fundingHeight }
const fields = ['type', 'serialNumber', 'subject', 'certifier', 'revocationOutpoint', 'signature', 'fields'] as const
export const certificateStateValue = (value: any) => Object.fromEntries(fields.map(key => [key, value?.[key]]))
const cert = (value: any) => new Certificate(value.type, value.serialNumber, value.subject, value.certifier, value.revocationOutpoint, value.fields, value.signature)
const key = (value: any) => JSON.stringify([value.type, value.certifier, value.serialNumber])
const issuer = (index: number) => PrivateKey.fromHex(config.issuerKeys[index]!).toPublicKey().toString()
const all = { certifiers: [], types: [], limit: 10000 }
const sorted = (values: any[]) => values.map(certificateStateValue).sort((a, b) => key(a).localeCompare(key(b)))
class MissingFixture extends Error {}

/** Fixed requests are shared with the producer; all response, storage-state and
 * cryptographic predicates below are derived independently of its assertions. */
export function certificateStateRequests(report: CertificateStateReport): Array<[string, string, any]> {
  const [a, b, c, wrongSubject] = report.fixtures
  const direct = (value: any): any => ({ ...certificateStateValue(value), acquisitionProtocol: 'direct', keyringRevealer: 'certifier', keyringForSubject: value.masterKeyring })
  const tampered = structuredClone(direct(a)); const raw = Buffer.from(tampered.fields.name, 'base64'); raw[raw.length - 1]! ^= 1; tampered.fields.name = raw.toString('base64')
  const proof = { certificate: certificateStateValue(a), fieldsToReveal: ['name'], verifier: PrivateKey.fromHex(config.verifierKey).toPublicKey().toString() }
  return [
    ['baseline', 'listCertificates', all], ['tampered-field', 'acquireCertificate', tampered], ['after-tampered', 'listCertificates', all],
    ['wrong-subject', 'acquireCertificate', direct(wrongSubject)], ['after-wrong-subject', 'listCertificates', all],
    ['acquire-a', 'acquireCertificate', direct(a)], ['direct-extra-url', 'acquireCertificate', { ...direct(b), certifierUrl: config.issuerUrl }], ['acquire-c', 'acquireCertificate', direct(c)],
    ['after-acquisition', 'listCertificates', all], ['proof-control', 'proveCertificate', proof],
    ...Object.entries({ certifier: issuer(1), serialNumber: config.serials[3], subject: wrongSubject.subject, signature: b.signature }).map(([field, value]) =>
      [`proof-wrong-${field === 'serialNumber' ? 'serial' : field}`, 'proveCertificate', { ...proof, certificate: { ...proof.certificate, [field]: value } }] as [string, string, any]),
    ['after-proof', 'listCertificates', all],
    ['issuance-direct-fields', 'acquireCertificate', { type: a.type, certifier: a.certifier, fields: config.fields, acquisitionProtocol: 'issuance', certifierUrl: config.issuerUrl,
      serialNumber: a.serialNumber, signature: a.signature, revocationOutpoint: a.revocationOutpoint, keyringRevealer: 'certifier', keyringForSubject: a.masterKeyring }],
    ['after-issuance', 'listCertificates', all],
    ['filter-issuer', 'listCertificates', { ...all, certifiers: [issuer(0)] }],
    ['filter-type', 'listCertificates', { ...all, types: [config.types[0]] }],
    ['filter-combined', 'listCertificates', { ...all, certifiers: [issuer(0)], types: [config.types[0]] }],
    ['filter-empty', 'listCertificates', all],
    ['filter-no-match', 'listCertificates', { ...all, certifiers: [issuer(1)], types: [config.types[1]] }],
    ...[a, b, c].map((value, index) => [`cleanup-${'abc'[index]}`, 'relinquishCertificate', { type: value.type, certifier: value.certifier, serialNumber: value.serialNumber }] as [string, string, any]),
    ['after-cleanup', 'listCertificates', all]
  ]
}

export async function deriveCertificateStateOutcomes(report: CertificateStateReport): Promise<CertificateStateReport['assertions']> {
  assert.deepEqual(certificateStatePolicy.assertions.map((value: any) => value.id), certificateStateIds, 'Certificate-state policy/code predicate inventory differs')
  assert.equal(certificateStatePolicy.publicCallBound, 26, 'Certificate-state policy/code call bound differs')
  assert.equal(report.schema, 'tpnil-native-certificate-states@1.0.0', 'Certificate-state schema differs')
  assert.equal(report.oracle, certificateStatePolicy.oracle, 'Certificate-state oracle differs')
  assert.equal(report.policySha256, certificateStatePolicySha256, 'Certificate-state policy differs')
  assert.equal(report.claim, 'ENGINEERING_OBSERVATION_ONLY', 'Certificate-state claim differs')
  assert.equal(report.completeBRC100Conformance, false, 'Certificate states do not establish full BRC100 conformance')
  assert.ok(Array.isArray(report.trace) && report.trace.length <= 26, 'Certificate-state public-call bound differs')
  assert.equal(new Set(report.trace.map(row => row.id)).size, report.trace.length, 'Duplicate certificate-state call')
  assert.ok(report.trace.every((row, index) => row.id === certificateStateCallIds[index]), 'Certificate-state fixed call order differs')
  assert.ok(Number.isSafeInteger(report.submissionStart) && report.submissionStart >= 0, 'Certificate-state submission start is invalid')
  assert.ok(Number.isSafeInteger(report.submissionEnd) && report.submissionEnd >= report.submissionStart, 'Certificate-state submission end is invalid')
  assert.ok(Array.isArray(report.httpRequests), 'Certificate-state HTTP observation absent')
  assert.ok(Number.isSafeInteger(report.routeStart) && report.routeStart >= 0 && Number.isSafeInteger(report.routeEnd) && report.routeEnd >= report.routeStart, 'Certificate-state route window invalid')
  assert.equal(report.routes.length, report.routeEnd - report.routeStart, 'Certificate-state scoped route count differs')
  assert.equal(report.submissionPrefix.length, report.submissionStart, 'Certificate-state submission prefix length differs')
  assert.equal(report.submissions.length, report.submissionEnd - report.submissionStart, 'Certificate-state submission range length differs')
  let previousSubmission = report.submissionStart, previousHttp = 0, previousRoute = report.routeStart
  for (const row of report.trace) {
    assert.equal(row.submissionStart, previousSubmission, 'Certificate-state submission prefix differs')
    assert.ok(Number.isSafeInteger(row.submissionEnd) && row.submissionEnd >= row.submissionStart && row.submissionEnd <= report.submissionEnd, 'Certificate-state submission span invalid')
    assert.equal(row.httpStart, previousHttp, 'Certificate-state HTTP prefix differs')
    assert.ok(Number.isSafeInteger(row.httpEnd) && row.httpEnd >= row.httpStart && row.httpEnd <= report.httpRequests.length, 'Certificate-state HTTP span invalid')
    assert.ok(!(Object.hasOwn(row, 'result') && Object.hasOwn(row, 'error')), 'Certificate-state call has both result and error')
    assert.equal(row.routeStart, previousRoute, 'Certificate-state route prefix differs')
    assert.ok(Number.isSafeInteger(row.routeEnd) && row.routeEnd >= row.routeStart && row.routeEnd <= report.routeEnd, 'Certificate-state call route window invalid')
    previousSubmission = row.submissionEnd; previousHttp = row.httpEnd; previousRoute = row.routeEnd
  }
  const outcomes: CertificateStateReport['assertions'] = []
  let authenticated = false, acquired = false
  const row = (id: string) => { const value = report.trace.find(item => item.id === id); assert.ok(value, `Missing public call ${id}`); return value }
  const returned = (id: string) => { const value = row(id); assert.ok(value.result && !value.error, `Public call ${id} did not return a result`); return value.result }
  const rejected = (id: string) => { const value = row(id); assert.equal(value.result, undefined, `Negative call ${id} returned a result`); assert.ok(specifiedError(value.error), `Negative call ${id} did not produce a validation rejection`); assert.equal(value.submissionEnd, value.submissionStart, `Negative call ${id} submitted a transaction`) }
  const inventory = (id: string) => {
    const result = returned(id); assert.ok(Array.isArray(result.certificates), `Inventory ${id} is not an array`)
    assert.ok(result.certificates.length < 10000, `Inventory ${id} exceeds the complete-query bound`)
    assert.equal(result.totalCertificates, result.certificates.length, `Inventory ${id} total differs`)
    assert.equal(new Set(result.certificates.map(key)).size, result.certificates.length, `Inventory ${id} duplicates a certificate tuple`)
    return result.certificates as any[]
  }
  const baseline = () => inventory('baseline')
  const populated = () => [...baseline(), ...report.fixtures.slice(0, 3)]
  const noHttp = (id: string) => { const value = row(id); assert.equal(value.httpEnd, value.httpStart, `Call ${id} reached the controlled certificate handler`); assert.ok(!report.routes.slice(value.routeStart - report.routeStart, value.routeEnd - report.routeStart).some(route => route.host === 'certifier.itcve.test'), `Call ${id} attempted certificate HTTP, authentication or OPTIONS`) }
  const exactInventory = (id: string, expected: any[]) => assert.deepEqual(sorted(inventory(id)), sorted(expected), `Inventory ${id} differs from independently expected certificates`)
  const depend = (positive = false) => { if (!authenticated || positive && !acquired) throw new MissingFixture('Required independently authenticated certificate fixture was not established') }
  const check = async (suffix: string, operation: () => Promise<void> | void) => {
    const id = `certificate-states.${suffix}`
    try { await operation(); outcomes.push({ id, result: 'PASS', detail: 'Fixed public requests and independent certificate-state predicate agree.' }) }
    catch (error) { outcomes.push({ id, result: error instanceof MissingFixture ? 'BLOCKED' : 'FAIL', detail: error instanceof Error ? error.message.split('\n')[0]! : 'Certificate-state predicate failed.' }) }
  }
  await check('fixture-authentication', async () => {
    assert.match(report.identity, /^(02|03)[a-f0-9]{64}$/, 'Observed wallet identity is invalid')
    assert.ok(report.boundaryAnchor, 'Public boundary transaction fixture is absent')
    const anchor = report.boundaryAnchor; assert.equal(anchor.outputIndex, 1, 'Boundary revocation output differs')
    assert.ok(Array.isArray(anchor.atomicBeef) && anchor.atomicBeef.length > 0 && anchor.atomicBeef.every(value => Number.isInteger(value) && value >= 0 && value <= 255), 'Boundary BEEF bytes invalid')
    const reader = new Utils.Reader(anchor.atomicBeef), graph = Beef.fromReader(reader)
    assert.ok(reader.eof(), 'Boundary BEEF has trailing bytes'); assert.equal(graph.atomicTxid, anchor.txid, 'Boundary BEEF atomic identity differs')
    const tx = Transaction.fromAtomicBEEF(anchor.atomicBeef)
    assert.equal(tx.id('hex'), anchor.txid, 'Boundary transaction ID differs')
    assert.equal(tx.outputs[1]?.satoshis, 7, 'Boundary revocation value differs'); assert.equal(tx.outputs[1]?.lockingScript.toHex(), '7551', 'Boundary revocation script differs')
    assert.ok(await tx.verify(tracker), 'Boundary transaction fails pinned ancestry or script validation')
    assert.equal(report.fixtures.length, 4, 'Expected four external certificate fixtures')
    assert.deepEqual(report.route, { host: 'certifier.itcve.test', registered: true, unregistered: true }, 'Controlled certificate-state HTTP observer did not complete')
    for (const [index, value] of report.fixtures.entries()) {
      assert.equal(value.subject, index === 3 ? PrivateKey.fromHex(config.otherSubjectKey).toPublicKey().toString() : report.identity, 'External certificate subject differs')
      assert.equal(value.type, config.types[index === 1 ? 1 : 0], 'External certificate type differs')
      assert.equal(value.serialNumber, config.serials[index], 'External certificate serial differs')
      assert.equal(value.certifier, issuer(index === 2 ? 1 : 0), 'External certificate issuer differs')
      assert.equal(value.revocationOutpoint, `${anchor.txid}.1`, 'External certificate revocation anchor differs')
      assert.deepEqual(Object.keys(value.fields).sort(), Object.keys(config.fields).sort(), 'External certificate field set differs')
      assert.deepEqual(Object.keys(value.masterKeyring).sort(), Object.keys(config.fields).sort(), 'External certificate keyring field set differs')
      assert.ok(await cert(value).verify(), 'External certificate signature is invalid')
      const externalIssuer = new ProtoWallet(PrivateKey.fromHex(config.issuerKeys[index === 2 ? 1 : 0]!))
      assert.deepEqual(await MasterCertificate.decryptFields(externalIssuer as any, value.masterKeyring, value.fields, value.subject), config.fields, 'External certificate encrypted fields differ')
    }
    for (const value of baseline()) {
      assert.equal(value.subject, report.identity, 'Baseline certificate belongs to another subject')
      assert.ok(await cert(value).verify(), 'Baseline certificate signature is invalid')
      assert.ok(!report.fixtures.some(item => key(item) === key(value)), 'Fresh fixture tuple already exists in baseline inventory')
    }
    const requests = certificateStateRequests(report)
    assert.deepEqual(requests.map(item => item[0]), certificateStateCallIds, 'Fixed certificate request IDs differ')
    for (const value of report.trace) {
      const expected = requests.find(item => item[0] === value.id)!
      assert.equal(value.method, expected[1], 'Public certificate method differs'); assert.deepEqual(value.args, expected[2], 'Public certificate arguments differ')
    }
    authenticated = true
  })
  await check('fixture-acquisition', () => {
    depend()
    for (const [index, id] of ['acquire-a', 'direct-extra-url', 'acquire-c'].entries()) assert.deepEqual(certificateStateValue(returned(id)), certificateStateValue(report.fixtures[index]), 'Direct fixture acquisition returned another certificate')
    exactInventory('after-acquisition', populated()); acquired = true
  })
  await check('acquire-tampered-field', async () => {
    depend(); let invalid = false; try { invalid = !await cert(row('tampered-field').args).verify() } catch { invalid = true }
    assert.ok(invalid, 'Tampered field is not an actual certificate-signature negative')
    rejected('tampered-field'); exactInventory('after-tampered', baseline())
  })
  await check('acquire-wrong-subject', () => { depend(); assert.notEqual(report.fixtures[3].subject, report.identity, 'Wrong-subject fixture is not distinct'); rejected('wrong-subject'); exactInventory('after-wrong-subject', baseline()) })
  await check('direct-extra-url', () => { depend(); assert.deepEqual(certificateStateValue(returned('direct-extra-url')), certificateStateValue(report.fixtures[1]), 'Pinned SDK direct extra-URL behavior differs'); noHttp('direct-extra-url') })
  await check('issuance-direct-fields', () => { depend(true); rejected('issuance-direct-fields'); noHttp('issuance-direct-fields'); exactInventory('after-issuance', populated()) })
  await check('proof-control', async () => {
    depend(true); const proof = returned('proof-control')
    assert.deepEqual(Object.keys(proof.keyringForVerifier), ['name'], 'Proof disclosed a different field set')
    const certificate = VerifiableCertificate.fromCertificate(report.fixtures[0], proof.keyringForVerifier)
    assert.ok(await certificate.verify(), 'Proof certificate signature is invalid')
    assert.deepEqual(await certificate.decryptFields(new ProtoWallet(PrivateKey.fromHex(config.verifierKey))), { name: config.fields.name }, 'Proof does not decrypt for the designated verifier')
  })
  await check('proof-tuple-mismatches', () => {
    depend(true); if (outcomes.find(item => item.id === 'certificate-states.proof-control')?.result !== 'PASS') throw new MissingFixture('Successful selective proof control was not established')
    for (const field of ['certifier', 'serial', 'subject', 'signature']) rejected(`proof-wrong-${field}`)
    exactInventory('after-proof', populated())
  })
  for (const [suffix, id, filter] of [
    ['inventory-issuer', 'filter-issuer', (value: any) => value.certifier === issuer(0)],
    ['inventory-type', 'filter-type', (value: any) => value.type === config.types[0]],
    ['inventory-combined', 'filter-combined', (value: any) => value.certifier === issuer(0) && value.type === config.types[0]],
    ['inventory-empty', 'filter-empty', (_value: any) => true],
    ['inventory-no-match', 'filter-no-match', (value: any) => value.certifier === issuer(1) && value.type === config.types[1]]
  ] as const) await check(suffix, () => { depend(true); exactInventory(id, populated().filter(filter)) })
  await check('cleanup', () => {
    depend(true); for (const id of ['cleanup-a', 'cleanup-b', 'cleanup-c']) assert.equal(returned(id).relinquished, true, 'Cleanup did not affirm relinquishment')
    exactInventory('after-cleanup', baseline()); assert.equal(report.trace.length, 26, 'Certificate call set is incomplete')
    assert.equal(report.submissionEnd, report.submissionStart, 'Certificate-only module submitted a transaction')
    assert.equal(report.httpRequests.length, 0, 'Certificate-only module unexpectedly contacted its issuance endpoint')
    assert.ok(!report.routes.some(route => route.host === 'certifier.itcve.test'), 'Certificate-only module attempted HTTP, authentication or OPTIONS')
    assert.equal(report.errors.length, 0, 'Certificate producer recorded a fixture error')
  })
  assert.deepEqual(outcomes.map(item => item.id), certificateStateIds, 'Certificate predicate inventory differs')
  return outcomes
}

/** Joined parent evidence prevents scoped HTTP/submission counters from hiding
 * observed requests. The unique endpoint is checked across the entire run,
 * including requests arriving outside a forged or truncated scoped window. */
export function verifyCertificateStateParentBindings(report: CertificateStateReport, binding: {
  boundary: any; identity: string; globalRoutes: CertificateStateReport['routes']; globalSubmissions: CertificateStateReport['submissions']
}) {
  assert.equal(report.identity, binding.identity, 'Certificate-state identity differs from native identity')
  const creation = binding.boundary.trace.find((row: any) => row.method === 'createAction' && row.args?.description === 'TPNIL boundary token pair')?.result
  assert.deepEqual(report.boundaryAnchor, creation?.txid && Array.isArray(creation.tx) ? { txid: creation.txid, atomicBeef: creation.tx, outputIndex: 1 } : null, 'Certificate-state anchor differs from joined boundary creation')
  assert.ok(Number.isSafeInteger(report.routeStart) && report.routeStart >= 0 && Number.isSafeInteger(report.routeEnd) && report.routeEnd >= report.routeStart && report.routeEnd <= binding.globalRoutes.length, 'Certificate-state route window is outside global routes')
  assert.deepEqual(report.routes, binding.globalRoutes.slice(report.routeStart, report.routeEnd), 'Certificate-state routes differ from global route ledger')
  const uniquePath = (row: CertificateStateReport['routes'][number]) => row.host === 'certifier.itcve.test' && (row.pathname === '/certificate-state' || row.pathname.startsWith('/certificate-state/'))
  assert.deepEqual(report.routes.filter(uniquePath), binding.globalRoutes.filter(uniquePath), 'Certificate-state endpoint request was omitted or placed outside the scoped window')
  assert.ok(Number.isSafeInteger(report.submissionStart) && report.submissionStart >= 0 && Number.isSafeInteger(report.submissionEnd) && report.submissionEnd >= report.submissionStart && report.submissionEnd <= binding.globalSubmissions.length, 'Certificate-state submission window is outside global ledger')
  assert.deepEqual(report.submissionPrefix, binding.globalSubmissions.slice(0, report.submissionStart), 'Certificate-state submission prefix differs from global ledger')
  assert.deepEqual(report.submissions, binding.globalSubmissions.slice(report.submissionStart, report.submissionEnd), 'Certificate-state submissions differ from global ledger')
  return { verified: true as const }
}

export async function verifyNativeCertificateStates(report: CertificateStateReport) {
  const assertions = await deriveCertificateStateOutcomes(report)
  assert.deepEqual(report.assertions, assertions, 'Certificate-state retained verdicts differ from independent replay')
  const result = assertions.some(row => row.result === 'FAIL') ? 'FAIL' : assertions.some(row => row.result === 'BLOCKED') ? 'BLOCKED' : 'PASS'
  assert.equal(report.result, result, 'Certificate-state result differs')
  return { schema: report.schema, oracle: report.oracle, result, assertions, publicCalls: report.trace.length, completeBRC100Conformance: false }
}
