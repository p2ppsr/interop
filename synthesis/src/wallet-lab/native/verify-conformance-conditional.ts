import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { Beef, Certificate, MasterCertificate, PrivateKey, ProtoWallet, Transaction, Utils, VerifiableCertificate, verifyNonce } from '@bsv/sdk'
import { conditionalIssuerKey, conditionalIssuanceModes, type ConditionalIssuanceMode } from './conformance-conditional-issuer.js'
import { conditionalQueryCases, conditionalBasket, conditionalConfig as config, conditionalPolicySelection, type ConditionalReport } from './conformance-conditional-model.js'
import { specifiedError } from './conformance-clauses-model.js'

const fixture = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../../../fixtures/teranode/wab-funding-v1.json'), 'utf8'))
const tracker = { currentHeight: async () => fixture.fundingHeight + fixture.maturityDepth, isValidRootForHeight: async (root: string, height: number) => root === fixture.merkleRoot && height === fixture.fundingHeight }
class Blocked extends Error {}
const sorted = (values: any[]) => [...values].sort()
const cert = (value: any) => new Certificate(value.type, value.serialNumber, value.subject, value.certifier, value.revocationOutpoint, value.fields, value.signature)
const certificateFields = ['type', 'serialNumber', 'subject', 'certifier', 'revocationOutpoint', 'signature', 'fields'] as const
const certificateValue = (value: any) => Object.fromEntries(certificateFields.map(key => [key, value[key]]))
const unique = (values: unknown[], label: string) => assert.equal(new Set(values).size, values.length, `${label} contains duplicate identities`)
// Evidence serialization sorts object keys. Diagnostic text must be stable
// across that boundary too, without changing malformed public values or verdicts.
const jsonDetail = (value: unknown) => JSON.stringify(value, (_key, nested) => nested !== null && typeof nested === 'object' && !Array.isArray(nested)
  ? Object.fromEntries(Object.keys(nested).sort().map(key => [key, nested[key]])) : nested)
function atomicGraph(bytes: unknown): Beef {
  assert.ok(Array.isArray(bytes) && bytes.length > 0, 'Missing Atomic BEEF bytes')
  for (let i = 0; i < bytes.length; i++) assert.ok(Object.hasOwn(bytes, i) && Number.isInteger(bytes[i]) && bytes[i] >= 0 && bytes[i] <= 255, 'Atomic BEEF must be a dense byte array')
  const reader = new Utils.Reader(bytes), graph = Beef.fromReader(reader)
  assert.ok(reader.eof(), 'Unparsed trailing Atomic BEEF bytes'); assert.match(graph.atomicTxid ?? '', /^[0-9a-f]{64}$/)
  return graph
}
function atomicTransaction(bytes: unknown, txid?: unknown): Transaction {
  const graph = atomicGraph(bytes)
  const tx = Transaction.fromAtomicBEEF(bytes as number[])
  assert.equal(tx.id('hex'), graph.atomicTxid)
  if (txid !== undefined) assert.equal(tx.id('hex'), txid)
  return tx
}

export async function verifyConditionalIssuance(report: ConditionalReport, mode: ConditionalIssuanceMode, expectedRevocationOutpoint?: string) {
  const issuer = new ProtoWallet(PrivateKey.fromHex(conditionalIssuerKey))
  const identity = (await issuer.getPublicKey({ identityKey: true })).publicKey
  assert.equal(report.issuer.identity, identity)
  const rows = report.issuer.receipts.filter((row: any) => row.mode === mode)
  assert.equal(rows.length, 1, 'Expected exactly one authenticated issuance receipt')
  const receipt = rows[0]
  assert.equal(receipt.authenticatedSubject, report.identity)
  assert.equal(receipt.request.type, config.issuanceType)
  assert.equal(Utils.toArray(receipt.requestId, 'base64').length, 32)
  unique(report.issuer.receipts.map((row: any) => row.requestId), 'Authenticated issuance request IDs')
  assert.deepEqual(receipt.decryptedFields, config.fields)
  assert.deepEqual(await MasterCertificate.decryptFields(issuer as any, receipt.request.masterKeyring, receipt.request.fields, report.identity), config.fields)
  assert.ok(await verifyNonce(receipt.request.clientNonce, issuer as any, report.identity))
  if (mode === 'missing-server-nonce') assert.equal(receipt.response.serverNonce, undefined)
  else {
    let valid = false; try { valid = await verifyNonce(receipt.response.serverNonce, issuer as any, report.identity) } catch { /* A malformed authenticated negative is expected to fail this check. */ }
    assert.equal(valid, mode !== 'bad-server-nonce')
  }
  const c = receipt.response.certificate
  if (mode === 'missing-certificate') assert.equal(c, undefined)
  else {
    if (expectedRevocationOutpoint !== undefined) assert.equal(c.revocationOutpoint, expectedRevocationOutpoint)
    assert.equal(c.subject, mode === 'bad-subject' ? PrivateKey.fromHex('72'.repeat(32)).toPublicKey().toString() : report.identity)
    assert.equal(c.certifier, mode === 'bad-certifier' ? PrivateKey.fromHex('71'.repeat(32)).toPublicKey().toString() : identity)
    assert.equal(c.type, mode === 'bad-type' ? Buffer.alloc(32, 73).toString('base64') : config.issuanceType)
    assert.deepEqual(c.fields, mode === 'bad-fields' ? { ...receipt.request.fields, name: receipt.request.fields.private } : receipt.request.fields)
    if (mode !== 'missing-server-nonce') {
      let valid = false
      try { valid = (await issuer.verifyHmac({ protocolID: [2, 'certificate issuance'], keyID: receipt.response.serverNonce + receipt.request.clientNonce, data: Utils.toArray(receipt.request.clientNonce + receipt.response.serverNonce, 'base64'), hmac: Utils.toArray(c.serialNumber, 'base64'), counterparty: report.identity })).valid } catch { /* Invalid serial is the separately authenticated negative fixture. */ }
      assert.equal(valid, mode !== 'bad-serial')
    }
  }
  const messages = report.issuer.authMessages.filter((row: any) => row.message.messageType === 'general' && Utils.toBase64(row.message.payload.slice(0, 32)) === receipt.requestId)
  assert.equal(messages.length, 2, 'Issuance lacks signed request/response pair')
  for (const direction of ['incoming', 'outgoing']) {
    const row = messages.find((entry: any) => entry.direction === direction); assert.ok(row)
    const m = row.message
    assert.equal(m.identityKey, direction === 'incoming' ? report.identity : identity)
    const signature = await issuer.verifySignature({ protocolID: [2, 'auth message signature'], keyID: `${m.nonce} ${m.yourNonce}`, counterparty: report.identity, forSelf: direction === 'outgoing', data: m.payload, signature: m.signature })
    assert.equal(signature.valid, true, 'Authenticated HTTP signature differs')
    const reader = new Utils.Reader(m.payload); reader.read(32)
    const text = () => { const size = reader.readVarIntNum(); return size > 0 ? Utils.toUTF8(reader.read(size)) : '' }
    if (direction === 'incoming') {
      assert.equal(text(), 'POST'); assert.equal(text(), '/signCertificate'); assert.equal(text(), '')
      const n = reader.readVarIntNum(); for (let i = 0; i < n; i++) { text(); text() }
      assert.deepEqual(JSON.parse(text()), receipt.request)
    } else {
      assert.equal(reader.readVarIntNum(), 200); assert.equal(reader.readVarIntNum(), 0)
      assert.deepEqual(JSON.parse(text()), receipt.response)
    }
    assert.ok(reader.eof(), 'Unparsed authenticated HTTP payload bytes')
  }
  if (mode !== 'missing-certificate' && mode !== 'bad-signature') assert.ok(await cert(c).verify())
  else if (mode === 'bad-signature') { let invalid = false; try { invalid = !(await cert(c).verify()) } catch { invalid = true }; assert.ok(invalid, 'Negative issuer must actually corrupt certificate signature') }
  return c
}

/** Derive verdicts from fixed policy, public calls and independent bytes. */
export async function deriveConditionalOutcomes(report: ConditionalReport): Promise<ConditionalReport['assertions']> {
  const revision = report.oracle === 'tpnil-native-conditional-oracle@1.0.0' ? 1 : report.oracle === 'tpnil-native-conditional-oracle@2.0.0' ? 2 : undefined
  assert.ok(revision, 'Unknown conditional oracle')
  const { policy: conditionalPolicy, policySha256: conditionalPolicySha256 } = conditionalPolicySelection(revision)
  assert.equal(report.schema, 'tpnil-native-conditional@1.0.0')
  assert.equal(report.oracle, conditionalPolicy.oracle)
  assert.equal(report.policySha256, conditionalPolicySha256)
  assert.equal(report.claim, 'ENGINEERING_OBSERVATION_ONLY')
  assert.equal(report.completeBRC100Conformance, false)
  assert.deepEqual(report.remainingCoverage, conditionalPolicy.remainingCoverage)
  assert.match(report.identity, /^(02|03)[a-f0-9]{64}$/)
  assert.equal(new Set(report.trace.map(row => row.id)).size, report.trace.length, 'Duplicate native conditional call')
  const issuerIdentity = PrivateKey.fromHex(conditionalIssuerKey).toPublicKey().toString()
  const fixed: Record<string, [string, any]> = {
    'outputs-default': ['listOutputs', { basket: config.basket }],
    'outputs-any': ['listOutputs', { basket: config.basket, tags: ['row0', 'row1'], tagQueryMode: 'any', limit: 100 }],
    'outputs-all': ['listOutputs', { basket: config.basket, tags: ['shared', 'even'], tagQueryMode: 'all', limit: 100 }],
    'outputs-page1': ['listOutputs', { basket: config.basket, offset: 0, limit: 6 }],
    'outputs-page2': ['listOutputs', { basket: config.basket, offset: 6, limit: 6 }],
    'outputs-newest': ['listOutputs', { basket: config.basket, offset: -1, limit: 1 }],
    'outputs-beyond': ['listOutputs', { basket: config.basket, offset: 20, limit: 6 }],
    'outputs-metadata': ['listOutputs', { basket: config.basket, include: 'locking scripts', includeTags: true, includeLabels: true, includeCustomInstructions: true, limit: 100 }],
    'outputs-beef': ['listOutputs', { basket: config.basket, include: 'entire transactions', limit: 100 }],
    'actions-default': ['listActions', { labels: [config.label] }],
    'actions-any': ['listActions', { labels: ['tpnil conditional even', 'tpnil conditional odd'], labelQueryMode: 'any', limit: 100 }],
    'actions-all': ['listActions', { labels: [config.label, 'tpnil conditional even'], labelQueryMode: 'all', limit: 100 }],
    'actions-page1': ['listActions', { labels: [config.label], offset: 0, limit: 6 }],
    'actions-page2': ['listActions', { labels: [config.label], offset: 6, limit: 6 }],
    'actions-beyond': ['listActions', { labels: [config.label], offset: 20, limit: 6 }],
    'actions-includes': ['listActions', { labels: [config.label], includeLabels: true, includeInputs: true, includeInputSourceLockingScripts: true, includeInputUnlockingScripts: true, includeOutputs: true, includeOutputLockingScripts: true, limit: 100 }],
    'after-abort': ['listOutputs', { basket: config.basket, limit: 100 }],
    'certificates-default': ['listCertificates', { certifiers: [issuerIdentity], types: [config.certificateType] }],
    'certificates-page1': ['listCertificates', { certifiers: [issuerIdentity], types: [config.certificateType], limit: 6, offset: 0 }],
    'certificates-page2': ['listCertificates', { certifiers: [issuerIdentity], types: [config.certificateType], limit: 6, offset: 6 }],
    'certificates-other-type': ['listCertificates', { certifiers: [issuerIdentity], types: [config.issuanceType], limit: 100 }],
    'certificates-after-relinquish': ['listCertificates', { certifiers: [issuerIdentity], types: [config.certificateType], limit: 100 }],
    'issuance-inventory': ['listCertificates', { certifiers: [issuerIdentity], types: [config.issuanceType], limit: 100 }],
    ...Object.fromEntries(conditionalIssuanceModes.map(mode => `issuance-${mode}`).map(id => [id, ['acquireCertificate', { type: config.issuanceType, certifier: issuerIdentity, acquisitionProtocol: 'issuance', certifierUrl: config.issuerOrigin, fields: config.fields }]]))
  }
  for (const [id, request] of Object.entries(conditionalQueryCases)) fixed[id] = [request.method, request.args]
  const calls = new Map(report.trace.map(row => [row.id, row]))
  const row = (id: string) => {
    const value = calls.get(id); if (!value) throw new Blocked(`Prerequisite call absent: ${id}`)
    const inferred = /^(population-|basket-ascii-)/.test(id) || ['conflict-control', 'conflicting-inputs', 'known-proof-omission', 'signable', 'abort-prepare', 'batch-held', 'batch-release'].includes(id) ? 'createAction' : /^(basket-query-|basket-utf8-)/.test(id) ? 'listOutputs' : ['conflict-control-abort', 'conflict-invalid-abort', 'known-proof-abort', 'aborted'].includes(id) ? 'abortAction' : id === 'signed' ? 'signAction' : id.startsWith('certificate-proof') ? 'proveCertificate' : id === 'certificate-relinquish' ? 'relinquishCertificate' : /^(direct-|certificate-|issuance-)/.test(id) && !fixed[id] ? 'acquireCertificate' : undefined
    if (inferred) assert.equal(value.method, inferred, `${id}: method changed`)
    if (fixed[id]) { assert.equal(value.method, fixed[id][0]); assert.deepEqual(value.args, fixed[id][1], `${id}: fixed request changed`) }
    assert.ok(Number.isSafeInteger(value.submissionStart) && value.submissionStart >= 0 && Number.isSafeInteger(value.submissionEnd) && value.submissionEnd >= value.submissionStart && value.submissionEnd <= report.submissions.length)
    return value
  }
  const value = (id: string) => { const call = row(id); assert.equal(call.error, undefined, `${id}: ${jsonDetail(call.error)}`); assert.ok(call.result !== undefined, `${id}: response missing`); return call.result }
  const population = () => {
    const rows = Array.from({ length: config.population }, (_, i) => row(`population-${i}`))
    if (rows.some(row => !row.result?.tx || !row.result?.txid)) throw new Blocked('Native funded population prerequisite failed')
    unique(rows.map(row => row.result.txid), 'Population transactions')
    return rows.map((row, index) => {
      const tx = atomicTransaction(row.result.tx, row.result.txid)
      assert.deepEqual(row.args, { description: `TPNIL conditional action ${index}`, outputs: [{ satoshis: config.satoshis, lockingScript: config.lockingScript, outputDescription: `TPNIL conditional output ${index}`, basket: config.basket, tags: ['shared', index % 2 ? 'odd' : 'even', `row${index}`], customInstructions: `conditional:${index}` }], labels: [config.label, index % 2 ? 'tpnil conditional odd' : 'tpnil conditional even'], ...(index ? { options: { randomizeOutputs: false, acceptDelayedBroadcast: false } } : {}) })
      const outputIndex = tx.outputs.findIndex(output => output.satoshis === config.satoshis && output.lockingScript.toHex() === config.lockingScript)
      assert.ok(outputIndex >= 0)
      return { index, row, tx, outputIndex, outpoint: `${tx.id('hex')}.${outputIndex}` }
    })
  }
  const reject = (id: string, token: string | string[]) => { const call = row(id); assert.equal(call.result, undefined, `${id}: malformed input was accepted`); assert.ok((Array.isArray(token) ? token : [token]).some(token => specifiedError(call.error, token)), `${id}: not an attributable parameter/crypto rejection: ${jsonDetail(call.error)}`) }
  const outputSet = (id: string) => sorted(value(id).outputs.map((o: any) => o.outpoint))
  const actionSet = (id: string) => sorted(value(id).actions.map((a: any) => a.txid))
  const expectedOutputs = () => sorted(population().map(p => p.outpoint))
  const expectedActions = () => sorted(population().map(p => p.tx.id('hex')))
  const associatedOutputLabels = (output: any, expected: ReturnType<typeof population>[number]) => {
    assert.deepEqual(actionSet('actions-includes'), expectedActions())
    assert.ok(Array.isArray(report.actionReferences), 'Independent stored action references are required')
    assert.deepEqual(sorted(report.actionReferences.map(row => row.txid)), expectedActions())
    unique(report.actionReferences.map(row => row.reference), 'Stored action references')
    for (const binding of report.actionReferences) {
      assert.equal(typeof binding.reference, 'string'); assert.ok(binding.reference.length > 0)
      assert.equal(Buffer.from(binding.reference, 'base64').toString('base64'), binding.reference, 'Action reference must be canonical base64')
    }
    const reference = report.actionReferences.find(row => row.txid === expected.tx.id('hex'))!.reference
    const synthetic = `reference ${Buffer.from(reference, 'base64').toString('hex')}`
    const actions = value('actions-includes').actions.filter((action: any) => action.txid === expected.tx.id('hex')); assert.equal(actions.length, 1)
    const labels = actions[0].labels
    for (const [name, entries] of [['Output labels', output.labels], ['Action labels', labels]] as const) { assert.ok(Array.isArray(entries) && entries.every(label => typeof label === 'string')); unique(entries, name) }
    assert.deepEqual(labels.filter((label: string) => label.startsWith('reference ')), [synthetic], 'BRC153 annotation must bind the independent stored reference')
    assert.ok(output.labels.every((label: string) => !label.startsWith('reference ')), 'BRC153 reference annotation is listActions-only')
    assert.ok(expected.row.args.labels.every((label: string) => output.labels.includes(label) && labels.includes(label)))
    assert.deepEqual(sorted(output.labels), sorted(labels.filter((label: string) => label !== synthetic)))
  }
  const direct = () => {
    if (report.certificates.length !== config.population) throw new Blocked('Direct certificate fixture prerequisite failed')
    const p = population(); unique(report.certificates.map(c => c.serialNumber), 'Direct certificate serials')
    for (const [index, c] of report.certificates.entries()) {
      assert.equal(c.subject, report.identity); assert.equal(c.certifier, issuerIdentity); assert.equal(c.type, config.certificateType); assert.equal(c.revocationOutpoint, p[1]!.outpoint); assert.equal(c.serialNumber, Buffer.alloc(32, 90 + index).toString('base64'))
      assert.deepEqual(row(`direct-${index}`).args, { ...c, acquisitionProtocol: 'direct', keyringRevealer: 'certifier', keyringForSubject: c.masterKeyring })
      assert.deepEqual(certificateValue(value(`direct-${index}`)), certificateValue(c))
    }
    return report.certificates
  }
  const issuer = new ProtoWallet(PrivateKey.fromHex(conditionalIssuerKey))
  const signingArgs = (index = 0) => {
    const source = population()[index]!
    return { description: 'TPNIL conditional signing', inputBEEF: source.row.result.tx, inputs: [{ outpoint: source.outpoint, inputDescription: 'TPNIL conditional source', unlockingScriptLength: 1 }], outputs: [{ satoshis: 1, lockingScript: '51', outputDescription: 'TPNIL conditional spend' }], options: { randomizeOutputs: false, acceptDelayedBroadcast: false, signAndProcess: false } }
  }
  const signable = (id: string, index = 0, known = false) => {
    const call = row(id), expected: any = signingArgs(index)
    if (known) { const omitted = new Beef(); omitted.mergeTxidOnly(population()[index]!.tx.id('hex')); expected.inputBEEF = omitted.toBinary(); expected.options = { ...expected.options, trustSelf: 'known', knownTxids: [population()[index]!.tx.id('hex')] } }
    assert.deepEqual(call.args, expected, `${id}: signing request differs from funded fixture`)
    const result = value(id); assert.equal(result.tx, undefined); assert.equal(result.txid, undefined)
    assert.equal(typeof result.signableTransaction?.reference, 'string'); assert.ok(result.signableTransaction.reference.length > 0)
    const graph = atomicGraph(result.signableTransaction.tx), txid = graph.atomicTxid!
    if (known) graph.mergeBeef(population()[index]!.row.result.tx)
    const tx = Transaction.fromAtomicBEEF(graph.toBinaryAtomic(txid))
    assert.equal(`${tx.inputs[0]?.sourceTXID}.${tx.inputs[0]?.sourceOutputIndex}`, population()[index]!.outpoint)
    assert.equal(tx.outputs[0]?.satoshis, 1); assert.equal(tx.outputs[0]?.lockingScript.toHex(), '51')
    return { result, tx }
  }
  const aborted = (prepare: string, abort: string, index = 0, known = false) => {
    const prepared = signable(prepare, index, known)
    assert.deepEqual(row(abort).args, { reference: prepared.result.signableTransaction.reference }); assert.equal(value(abort).aborted, true)
  }
  const negativeCertificateControl = async () => {
    direct(); const c = row('certificate-negative-control').args, observed = value('certificate-negative-control')
    assert.equal(c.type, config.certificateType); assert.equal(c.subject, report.identity); assert.equal(c.certifier, issuerIdentity); assert.equal(c.serialNumber, Buffer.alloc(32, 120).toString('base64')); assert.equal(c.revocationOutpoint, population()[1]!.outpoint)
    assert.equal(c.acquisitionProtocol, 'direct'); assert.equal(c.keyringRevealer, 'certifier'); assert.deepEqual(c.keyringForSubject, c.masterKeyring)
    assert.ok(await cert(c).verify()); assert.deepEqual(await MasterCertificate.decryptFields(issuer as any, c.keyringForSubject, c.fields, report.identity), config.fields)
    assert.deepEqual(certificateValue(observed), certificateValue(c)); return c
  }
  const certificateRows = (id: string, expected: any[], count?: number) => {
    const response = value(id); if (count !== undefined) assert.equal(response.totalCertificates, count); unique(response.certificates.map((c: any) => c.serialNumber), `${id} certificates`)
    for (const c of response.certificates) { const original = expected.find(e => e.serialNumber === c.serialNumber); assert.ok(original, `${id}: unknown certificate`); assert.deepEqual(certificateValue(c), certificateValue(original)) }
    return response.certificates
  }
  const assertActionInputs = (action: any, tx: Transaction) => {
    assert.equal(action.inputs.length, tx.inputs.length)
    assert.deepEqual(sorted(action.inputs.map((input: any) => input.sourceOutpoint)), sorted(tx.inputs.map(input => `${input.sourceTXID}.${input.sourceOutputIndex}`)), 'Included inputs must match each actual input exactly once')
  }
  const assertActionOutputs = (action: any, tx: Transaction) => {
    assert.equal(action.outputs.length, tx.outputs.length)
    assert.deepEqual(sorted(action.outputs.map((output: any) => output.outputIndex)), sorted(tx.outputs.map((_output, index) => index)), 'Included outputs must match each actual output index exactly once')
  }
  const assertions: Record<string, () => any | Promise<any>> = {
    'fixture.call-inventory': () => {
      const expected = [...Array.from({ length: config.population }, (_, i) => `population-${i}`), ...Object.keys(fixed).slice(0, 16), ...Object.keys(conditionalQueryCases)]
      for (const length of [299, 300, 301, 399, 400, 401]) expected.push(`basket-ascii-${length}`, `basket-query-${length}`, `basket-utf8-${length}`)
      if (calls.get('population-0')?.result?.tx && calls.get('population-0')?.result?.txid && calls.get('population-1')?.result?.tx && calls.get('population-1')?.result?.txid) {
        const prepare = (id: string, next: string) => { expected.push(id); if (calls.get(id)?.result?.signableTransaction?.reference) expected.push(next) }
        prepare('conflict-control', 'conflict-control-abort'); prepare('conflicting-inputs', 'conflict-invalid-abort'); prepare('known-proof-omission', 'known-proof-abort'); prepare('signable', 'signed'); prepare('abort-prepare', 'aborted')
        expected.push('after-abort', 'batch-held'); if (calls.get('batch-held')?.result?.txid) expected.push('batch-release')
        expected.push(...Array.from({ length: config.population }, (_, i) => `direct-${i}`), 'certificates-default', 'certificates-page1', 'certificates-page2', 'certificates-other-type', 'certificate-required-field', ...['revocationOutpoint', 'signature', 'keyringRevealer', 'keyringForSubject'].map(field => `certificate-missing-${field}`), 'certificate-missing-field-key', 'certificate-bad-signature', 'certificate-bad-keyring', 'certificate-negative-control', 'certificate-wrong-revealer', 'certificate-alternate-revealer', 'certificate-proof', 'certificate-proof-all', 'certificate-proof-unknown-field', 'certificate-proof-alternate-verifier', 'certificate-relinquish', 'certificates-after-relinquish', 'issuance-missing-url', ...conditionalIssuanceModes.map(mode => `issuance-${mode}`), 'issuance-inventory')
      }
      assert.deepEqual(report.trace.map(row => row.id), expected, 'Native conditional execution omitted, added or reordered a planned call')
      let end = 0
      for (const call of report.trace) { row(call.id); assert.ok(call.submissionStart >= end, 'Submission windows overlap or move backwards'); end = call.submissionEnd }
    },
    'fixture.population': async () => {
      assert.deepEqual(report.errors, [])
      for (let index = 0; index < config.population; index++) { assert.ok(calls.has(`population-${index}`), 'Population setup call missing'); const observed = value(`population-${index}`); assert.ok(observed.tx && observed.txid, 'Population setup lacks signed transaction') }
      const rows = population()
      for (const { index, row: call, tx } of rows) {
        assert.equal(call.method, 'createAction'); assert.equal(call.args.description, `TPNIL conditional action ${index}`)
        assert.deepEqual(call.args.labels, [config.label, index % 2 ? 'tpnil conditional odd' : 'tpnil conditional even'])
        assert.deepEqual(call.args.outputs, [{ satoshis: config.satoshis, lockingScript: config.lockingScript, outputDescription: `TPNIL conditional output ${index}`, basket: config.basket, tags: ['shared', index % 2 ? 'odd' : 'even', `row${index}`], customInstructions: `conditional:${index}` }])
        assert.ok(await tx.verify(tracker), 'Population transaction lacks valid mined ancestry/signatures')
      }
    },
    'transaction.defaults': () => {
      const p = population(); assert.equal(p[0]!.row.args.options, undefined)
      assert.equal(p[0]!.row.result.signableTransaction, undefined)
      for (const entry of p.slice(1)) { assert.deepEqual(entry.row.args.options, { randomizeOutputs: false, acceptDelayedBroadcast: false }); assert.equal(entry.outputIndex, 0) }
    },
    'query.outputs-default': () => { population(); const r = value('outputs-default'); assert.equal(r.totalOutputs, 11); assert.equal(r.outputs.length, 10); unique(r.outputs.map((o: any) => o.outpoint), 'Default outputs'); assert.ok(r.outputs.every((o: any) => expectedOutputs().includes(o.outpoint))); assert.equal(r.BEEF, undefined); for (const o of r.outputs) for (const key of ['lockingScript', 'tags', 'labels', 'customInstructions']) assert.equal(o[key], undefined) },
    'query.outputs-filter': () => { const p = population(); assert.equal(value('outputs-any').totalOutputs, 2); assert.equal(value('outputs-all').totalOutputs, 6); assert.deepEqual(outputSet('outputs-any'), sorted(p.slice(0, 2).map(p => p.outpoint))); assert.deepEqual(outputSet('outputs-all'), sorted(p.filter(p => p.index % 2 === 0).map(p => p.outpoint))) },
    'query.outputs-pagination': () => {
      const p = population(); assert.equal(value('outputs-page1').outputs.length, 6); assert.equal(value('outputs-page2').outputs.length, 5)
      assert.deepEqual(sorted([...outputSet('outputs-page1'), ...outputSet('outputs-page2')]), expectedOutputs())
      assert.deepEqual(outputSet('outputs-page1'), sorted(p.slice(0, 6).map(p => p.outpoint)))
      assert.deepEqual(outputSet('outputs-newest'), [p.at(-1)!.outpoint]); assert.deepEqual(outputSet('outputs-beyond'), [])
      for (const id of ['outputs-page1', 'outputs-page2', 'outputs-newest', 'outputs-beyond']) assert.equal(value(id).totalOutputs, 11)
    },
    'query.outputs-includes': async () => {
      const p = population(); assert.deepEqual(outputSet('outputs-metadata'), expectedOutputs())
      for (const o of value('outputs-metadata').outputs) {
        const expected = p.find(p => p.outpoint === o.outpoint)!; assert.ok(expected)
        assert.equal(o.lockingScript, config.lockingScript); assert.equal(o.customInstructions, `conditional:${expected.index}`)
        assert.deepEqual(sorted(o.tags), sorted(expected.row.args.outputs[0].tags))
        if (revision === 1) assert.deepEqual(sorted(o.labels), sorted(expected.row.args.labels))
        else associatedOutputLabels(o, expected)
      }
      assert.deepEqual(outputSet('outputs-beef'), expectedOutputs())
      const graph = Beef.fromBinary(value('outputs-beef').BEEF); assert.ok(await graph.verify(tracker))
      for (const item of p) assert.equal(graph.findTxid(item.tx.id('hex'))?.tx?.toHex(), item.tx.toHex())
    },
    'query.actions-default': () => { population(); const r = value('actions-default'); assert.equal(r.totalActions, 11); assert.equal(r.actions.length, 10); unique(r.actions.map((a: any) => a.txid), 'Default actions'); assert.ok(r.actions.every((a: any) => expectedActions().includes(a.txid))); for (const a of r.actions) for (const field of ['labels', 'inputs', 'outputs']) assert.equal(a[field], undefined) },
    'query.actions-filter': () => { assert.equal(value('actions-any').totalActions, 11); assert.equal(value('actions-all').totalActions, 6); assert.deepEqual(actionSet('actions-any'), expectedActions()); assert.deepEqual(actionSet('actions-all'), sorted(population().filter(p => p.index % 2 === 0).map(p => p.tx.id('hex')))) },
    'query.actions-pagination': () => { population(); assert.equal(value('actions-page1').actions.length, 6); assert.equal(value('actions-page2').actions.length, 5); assert.deepEqual(sorted([...actionSet('actions-page1'), ...actionSet('actions-page2')]), expectedActions()); assert.deepEqual(actionSet('actions-beyond'), []); for (const id of ['actions-page1', 'actions-page2', 'actions-beyond']) assert.equal(value(id).totalActions, 11) },
    'query.actions-includes': () => {
      const p = population(); assert.deepEqual(actionSet('actions-includes'), expectedActions())
      for (const action of value('actions-includes').actions) {
        const expected = p.find(p => p.tx.id('hex') === action.txid)!; assert.ok(expected.row.args.labels.every((label: string) => action.labels.includes(label)))
        assert.equal(action.version, expected.tx.version); assert.equal(action.lockTime, expected.tx.lockTime)
        assertActionInputs(action, expected.tx); assertActionOutputs(action, expected.tx)
        for (const input of action.inputs) {
          const source = expected.tx.inputs.find(i => `${i.sourceTXID}.${i.sourceOutputIndex}` === input.sourceOutpoint); assert.ok(source?.sourceTransaction)
          assert.equal(input.sourceSatoshis, source.sourceTransaction.outputs[source.sourceOutputIndex]!.satoshis)
          assert.equal(input.sourceLockingScript, source.sourceTransaction.outputs[source.sourceOutputIndex]!.lockingScript.toHex())
          assert.equal(input.unlockingScript, source.unlockingScript?.toHex()); assert.equal(input.sequenceNumber, source.sequence)
        }
        for (const output of action.outputs) { const actual = expected.tx.outputs[output.outputIndex]; assert.ok(actual); assert.equal(output.satoshis, actual.satoshis); assert.equal(output.lockingScript, actual.lockingScript.toHex()) }
      }
    },
    'transaction.conflicting-inputs': () => { aborted('conflict-control', 'conflict-control-abort'); const base = signingArgs(); assert.deepEqual(row('conflicting-inputs').args, { ...base, inputs: [base.inputs[0], base.inputs[0]] }); reject('conflicting-inputs', 'input') },
    'transaction.known-proof-omission': () => { aborted('known-proof-omission', 'known-proof-abort', 0, true) },
    'transaction.signable-and-sign': async () => {
      const prepared = signable('signable', revision === 2 ? 2 : 0), signed = value('signed')
      assert.deepEqual(row('signed').args, { reference: prepared.result.signableTransaction.reference, spends: { 0: { unlockingScript: '51' } }, options: { acceptDelayedBroadcast: false } })
      const tx = atomicTransaction(signed.tx, signed.txid)
      assert.equal(tx.version, prepared.tx.version); assert.equal(tx.lockTime, prepared.tx.lockTime)
      assert.deepEqual(tx.outputs.map(o => ({ satoshis: o.satoshis, script: o.lockingScript.toHex() })), prepared.tx.outputs.map(o => ({ satoshis: o.satoshis, script: o.lockingScript.toHex() })))
      assert.deepEqual(tx.inputs.map(i => ({ txid: i.sourceTXID, index: i.sourceOutputIndex, sequence: i.sequence })), prepared.tx.inputs.map(i => ({ txid: i.sourceTXID, index: i.sourceOutputIndex, sequence: i.sequence })))
      assert.equal(tx.inputs[0]!.unlockingScript?.toHex(), '51'); assert.ok(await tx.verify(tracker))
    },
    'transaction.abort-release': async () => { if (revision === 2) await assertions['transaction.signable-and-sign']!(); const p = population(); aborted('abort-prepare', 'aborted', 1); const output = value('after-abort').outputs.find((o: any) => o.outpoint === p[1]!.outpoint); assert.equal(output?.spendable, true); assert.ok(!outputSet('after-abort').includes(p[revision === 2 ? 2 : 0]!.outpoint)) },
    'transaction.batch-release': async () => {
      population(); const held = value('batch-held'), released = value('batch-release'), transaction = atomicTransaction(held.tx, held.txid)
      assert.deepEqual(row('batch-held').args, { description: 'TPNIL conditional held batch', outputs: [{ satoshis: 1, lockingScript: '51', outputDescription: 'TPNIL conditional held output' }], options: { noSend: true, randomizeOutputs: false } })
      assert.deepEqual(row('batch-release').args, { description: 'TPNIL conditional batch release', options: { sendWith: [held.txid], acceptDelayedBroadcast: false } })
      assert.equal(transaction.outputs[0]?.satoshis, 1); assert.equal(transaction.outputs[0]?.lockingScript.toHex(), '51'); assert.ok(await transaction.verify(tracker))
      assert.ok(released.sendWithResults?.some((r: any) => r.txid === held.txid && ['unproven', 'sending'].includes(r.status)))
      const submissions = report.submissions.filter(r => r.txid === held.txid)
      assert.ok(submissions.length); assert.ok(submissions.every(r => r.index >= row('batch-release').submissionStart))
      assert.ok(submissions.some(r => r.index < row('batch-release').submissionEnd && r.verdict === 'ACCEPTED_BY_NETWORK'))
      for (const r of submissions) { let submitted: Transaction; try { submitted = Transaction.fromBEEF([...Buffer.from(r.serializedHex, 'hex')]) } catch { submitted = Transaction.fromHex(r.serializedHex) }; assert.equal(submitted.toHex(), transaction.toHex()) }
    },
    'certificate.direct': async () => { const p = population(); for (const [index, c] of direct().entries()) { assert.equal(c.subject, report.identity); assert.equal(c.type, config.certificateType); assert.equal(c.revocationOutpoint, p[1]!.outpoint); assert.equal(c.serialNumber, Buffer.alloc(32, 90 + index).toString('base64')); assert.ok(await cert(c).verify()); assert.deepEqual(await MasterCertificate.decryptFields(issuer as any, c.masterKeyring, c.fields, report.identity), config.fields); assert.deepEqual(row(`direct-${index}`).args, { ...c, acquisitionProtocol: 'direct', keyringRevealer: 'certifier', keyringForSubject: c.masterKeyring }); const observed = value(`direct-${index}`); for (const key of ['type', 'serialNumber', 'subject', 'certifier', 'revocationOutpoint', 'signature', 'fields']) assert.deepEqual(observed[key], c[key]) } },
    'certificate.default-pagination': () => { const expected = direct(), defaults = certificateRows('certificates-default', expected, 11); assert.equal(defaults.length, 10); const first = certificateRows('certificates-page1', expected), second = certificateRows('certificates-page2', expected); assert.equal(first.length, 6); assert.equal(second.length, 5); assert.deepEqual(sorted([...first, ...second].map((c: any) => c.serialNumber)), sorted(expected.map(c => c.serialNumber))) },
    'certificate.filter': () => { direct(); assert.equal(value('certificates-other-type').totalCertificates, 0); assert.deepEqual(value('certificates-other-type').certificates, []) },
    'certificate.required-field': async () => { await negativeCertificateControl(); const expected = { ...row('certificate-negative-control').args }; delete expected.serialNumber; assert.deepEqual(row('certificate-required-field').args, expected); reject('certificate-required-field', 'serialNumber') },
    'certificate.missing-field-key': async () => { await negativeCertificateControl(); assert.deepEqual(row('certificate-missing-field-key').args, { ...row('certificate-negative-control').args, keyringForSubject: { name: row('certificate-negative-control').args.keyringForSubject.name } }); reject('certificate-missing-field-key', ['keyring', 'private', 'decrypt']) },
    'certificate.proof-all': async () => { await assertions['certificate.selective-proof']!(); const proof = value('certificate-proof-all'); assert.deepEqual(row('certificate-proof-all').args, { ...row('certificate-proof').args, fieldsToReveal: ['name', 'private'] }); assert.deepEqual(sorted(Object.keys(proof.keyringForVerifier)), ['name', 'private']); const verifier = new ProtoWallet(PrivateKey.fromHex(config.verifierKeyHex)); assert.deepEqual(await VerifiableCertificate.fromCertificate(report.certificates[0], proof.keyringForVerifier).decryptFields(verifier as any), config.fields) },
    'certificate.proof-unknown-field': async () => { await assertions['certificate.selective-proof']!(); assert.deepEqual(row('certificate-proof-unknown-field').args, { ...row('certificate-proof').args, fieldsToReveal: ['unknown'] }); reject('certificate-proof-unknown-field', 'field') },
    'certificate.proof-alternate-verifier': async () => { await assertions['certificate.selective-proof']!(); const alternate = new ProtoWallet(PrivateKey.fromHex(config.alternateVerifierKeyHex)); assert.deepEqual(row('certificate-proof-alternate-verifier').args, { ...row('certificate-proof').args, verifier: (await alternate.getPublicKey({ identityKey: true })).publicKey }); const proof = value('certificate-proof-alternate-verifier'); assert.deepEqual(Object.keys(proof.keyringForVerifier), ['name']); const c = VerifiableCertificate.fromCertificate(report.certificates[0], proof.keyringForVerifier); assert.deepEqual(await c.decryptFields(alternate as any), { name: config.fields.name }); await assert.rejects(() => c.decryptFields(new ProtoWallet(PrivateKey.fromHex(config.verifierKeyHex)) as any)) },
    'certificate.issuance-missing-url': async () => { await assertions['certificate.issuance']!(); const expected = { ...row('issuance-valid').args }; delete expected.certifierUrl; assert.deepEqual(row('issuance-missing-url').args, expected); reject('issuance-missing-url', 'certifierUrl') },
    'certificate.bad-signature': async () => { await negativeCertificateControl(); assert.deepEqual(row('certificate-bad-signature').args, { ...row('certificate-negative-control').args, signature: '00'.repeat(70) }); reject('certificate-bad-signature', 'signature') },
    'certificate.bad-keyring': async () => { await negativeCertificateControl(); const control = row('certificate-negative-control').args; assert.deepEqual(row('certificate-bad-keyring').args, { ...control, keyringForSubject: { name: Buffer.alloc(32, 1).toString('base64'), private: control.keyringForSubject.private } }); reject('certificate-bad-keyring', 'keyring') },
    'certificate.alternate-revealer': async () => {
      const p = population(), r = row('certificate-alternate-revealer'), actual = value(r.id)
      const revealer = new ProtoWallet(PrivateKey.fromHex(config.revealerKeyHex))
      assert.equal(r.method, 'acquireCertificate'); assert.equal(r.args.acquisitionProtocol, 'direct')
      assert.equal(r.args.keyringRevealer, (await revealer.getPublicKey({ identityKey: true })).publicKey)
      assert.equal(r.args.type, config.certificateType); assert.equal(r.args.subject, report.identity); assert.equal(r.args.certifier, issuerIdentity)
      assert.equal(r.args.serialNumber, Buffer.alloc(32, 121).toString('base64')); assert.equal(r.args.revocationOutpoint, p[1]!.outpoint)
      assert.ok(await cert(r.args).verify()); assert.deepEqual(await MasterCertificate.decryptFields(revealer as any, r.args.keyringForSubject, r.args.fields, report.identity), config.fields)
      for (const key of ['type', 'serialNumber', 'subject', 'certifier', 'revocationOutpoint', 'signature', 'fields']) assert.deepEqual(actual[key], r.args[key])
    },
    'certificate.wrong-revealer': async () => { await assertions['certificate.alternate-revealer']!(); assert.deepEqual(row('certificate-wrong-revealer').args, { ...row('certificate-alternate-revealer').args, keyringRevealer: 'certifier' }); reject('certificate-wrong-revealer', ['keyring', 'decrypt']) },
    'certificate.selective-proof': async () => { direct(); const proof = value('certificate-proof'); assert.deepEqual(row('certificate-proof').args, { certificate: Object.fromEntries(['type', 'subject', 'serialNumber', 'certifier', 'revocationOutpoint', 'signature', 'fields'].map(key => [key, report.certificates[0][key]])), fieldsToReveal: ['name'], verifier: PrivateKey.fromHex(config.verifierKeyHex).toPublicKey().toString() }); assert.deepEqual(Object.keys(proof.keyringForVerifier), ['name']); const verifier = new ProtoWallet(PrivateKey.fromHex(config.verifierKeyHex)); const certificate = VerifiableCertificate.fromCertificate(report.certificates[0], proof.keyringForVerifier); assert.ok(await certificate.verify()); assert.deepEqual(await certificate.decryptFields(verifier as any), { name: config.fields.name }) },
    'certificate.verifier-separation': async () => { await assertions['certificate.selective-proof']!(); const proof = value('certificate-proof'); const alternate = new ProtoWallet(PrivateKey.fromHex(config.alternateVerifierKeyHex)); const certificate = VerifiableCertificate.fromCertificate(report.certificates[0], proof.keyringForVerifier); assert.ok(await certificate.verify()); assert.deepEqual(await certificate.decryptFields(new ProtoWallet(PrivateKey.fromHex(config.verifierKeyHex)) as any), { name: config.fields.name }); await assert.rejects(() => certificate.decryptFields(alternate as any)) },
    'certificate.relinquishment': async () => { await negativeCertificateControl(); await assertions['certificate.alternate-revealer']!(); const certificates = direct(); const control = value('certificate-negative-control'), alternate = value('certificate-alternate-revealer'); assert.deepEqual(row('certificate-relinquish').args, { type: certificates[0].type, certifier: certificates[0].certifier, serialNumber: certificates[0].serialNumber }); assert.equal(value('certificate-relinquish').relinquished, true); assert.deepEqual(sorted(value('certificates-after-relinquish').certificates.map((c: any) => c.serialNumber)), sorted([...certificates.slice(1).map(c => c.serialNumber), control.serialNumber, alternate.serialNumber])); assert.equal(value('certificates-after-relinquish').totalCertificates, 12) },
    'certificate.issuance': async () => { const p = population(); const issued = await verifyConditionalIssuance(report, 'valid', p[1]!.outpoint); assert.equal(issued.revocationOutpoint, p[1]!.outpoint); assert.deepEqual(value('issuance-valid'), issued); const stored = certificateRows('issuance-inventory', [issued], 1); assert.equal(stored.length, 1) },
    'certificate.issuance-bad-signature': async () => { await assertions['certificate.issuance']!(); await verifyConditionalIssuance(report, 'bad-signature', population()[1]!.outpoint); reject('issuance-bad-signature', ['signature', 'certificate verification']); assert.equal(value('issuance-inventory').totalCertificates, 1) },
    'coverage.remaining-obligations': () => { throw new Blocked(conditionalPolicy.remainingCoverage.map((r: any) => `${r.id}: ${r.reason}`).join(' ')) }
  }
  for (const field of ['revocationOutpoint', 'signature', 'keyringRevealer', 'keyringForSubject']) assertions[`certificate.missing-${field}`] = async () => { await negativeCertificateControl(); const expected = { ...row('certificate-negative-control').args }; delete expected[field]; assert.deepEqual(row(`certificate-missing-${field}`).args, expected); reject(`certificate-missing-${field}`, field) }
  for (const [id, request] of Object.entries(conditionalQueryCases)) assertions[`query.${id}`] = () => {
    const p = population(), response = value(id), args = request.args
    if (request.method === 'listOutputs') {
      const expected = id === 'outputs-any-default' ? p.slice(0, 2) : id === 'outputs-no-match' ? [] : id === 'outputs-limit1' ? p.slice(0, 1) : id === 'outputs-offset1' ? p.slice(1, 2) : id === 'outputs-minus2' ? p.slice(-2, -1) : p
      assert.deepEqual(outputSet(id), sorted(expected.map(p => p.outpoint)))
      assert.equal(response.totalOutputs, id === 'outputs-any-default' ? 2 : id === 'outputs-no-match' ? 0 : config.population)
      for (const o of response.outputs) {
        const item = p.find(p => p.outpoint === o.outpoint)!
        assert.equal(o.lockingScript, args.include === 'locking scripts' ? config.lockingScript : undefined)
        assert.deepEqual(o.tags && sorted(o.tags), args.includeTags ? sorted(item.row.args.outputs[0].tags) : undefined)
        if (args.includeLabels) { if (revision === 2) associatedOutputLabels(o, item); else assert.ok(item.row.args.labels.every((label: string) => o.labels.includes(label))) } else assert.equal(o.labels, undefined)
        assert.equal(o.customInstructions, args.includeCustomInstructions ? `conditional:${item.index}` : undefined)
      }
    } else {
      if (id === 'actions-empty-labels') { assert.ok(expectedActions().every(txid => actionSet(id).includes(txid))); assert.equal(response.totalActions, response.actions.length) }
      else {
        const ordered = value('actions-includes').actions.map((a: any) => a.txid)
        const expected = id === 'actions-no-match' ? [] : id === 'actions-limit1' ? ordered.slice(0, 1) : id === 'actions-offset1' ? ordered.slice(1, 2) : expectedActions()
        assert.deepEqual(actionSet(id), sorted(expected)); assert.equal(response.totalActions, id === 'actions-no-match' ? 0 : config.population)
      }
      for (const a of response.actions) {
        const item = p.find(p => p.tx.id('hex') === a.txid)
        if (!item) { assert.equal(id, 'actions-empty-labels'); continue }
        if (args.includeLabels) assert.ok(item.row.args.labels.every((label: string) => a.labels.includes(label))); else assert.equal(a.labels, undefined)
        if (!args.includeInputs) assert.equal(a.inputs, undefined)
        else { assertActionInputs(a, item.tx); for (const input of a.inputs) {
          const source: Transaction['inputs'][number] | undefined = item.tx.inputs.find(i => `${i.sourceTXID}.${i.sourceOutputIndex}` === input.sourceOutpoint); assert.ok(source?.sourceTransaction)
          assert.equal(input.sourceSatoshis, source.sourceTransaction.outputs[source.sourceOutputIndex]!.satoshis)
          assert.equal(input.sourceLockingScript, args.includeInputSourceLockingScripts ? source.sourceTransaction.outputs[source.sourceOutputIndex]!.lockingScript.toHex() : undefined)
          assert.equal(input.unlockingScript, args.includeInputUnlockingScripts ? source.unlockingScript?.toHex() : undefined)
        } }
        if (!args.includeOutputs) assert.equal(a.outputs, undefined)
        else { assertActionOutputs(a, item.tx); for (const output of a.outputs) { const actual: Transaction['outputs'][number] | undefined = item.tx.outputs[output.outputIndex]; assert.ok(actual); assert.equal(output.satoshis, actual.satoshis); assert.equal(output.lockingScript, args.includeOutputLockingScripts ? actual.lockingScript.toHex() : undefined) } }
      }
    }
  }
  for (const mode of conditionalIssuanceModes.slice(2)) assertions[`certificate.issuance-${mode}`] = async () => {
    await assertions['certificate.issuance']!(); await verifyConditionalIssuance(report, mode, population()[1]!.outpoint)
    reject(`issuance-${mode}`, mode === 'bad-server-nonce' || mode === 'missing-server-nonce' ? ['nonce', 'hmac'] : mode === 'bad-serial' ? ['serial', 'hmac'] : mode === 'bad-type' ? 'type' : mode === 'bad-subject' ? 'subject' : mode === 'bad-certifier' ? 'certifier' : mode === 'bad-fields' ? 'field' : 'certificate')
    assert.equal(value('issuance-inventory').totalCertificates, 1)
  }
  for (const length of [299, 300, 301, 399, 400, 401]) {
    assertions[`basket.ascii-${length}`] = async () => {
      population(); assert.deepEqual(row(`basket-ascii-${length}`).args, { description: `TPNIL basket length ${length}`, outputs: [{ satoshis: 1, lockingScript: '51', basket: conditionalBasket(length), outputDescription: 'TPNIL basket boundary output' }], options: { randomizeOutputs: false, acceptDelayedBroadcast: false } }); assert.deepEqual(row(`basket-query-${length}`).args, { basket: conditionalBasket(length), include: 'locking scripts' })
      if (length > 300) { value('basket-ascii-300'); reject(`basket-ascii-${length}`, 'basket'); reject(`basket-query-${length}`, 'basket') }
      else { const created = value(`basket-ascii-${length}`), queried = value(`basket-query-${length}`); const tx = atomicTransaction(created.tx, created.txid); assert.equal(tx.outputs[0]?.satoshis, 1); assert.equal(tx.outputs[0]?.lockingScript.toHex(), '51'); assert.ok(await tx.verify(tracker)); assert.equal(queried.totalOutputs, 1); assert.equal(queried.outputs[0].outpoint, `${created.txid}.0`); assert.equal(queried.outputs[0].lockingScript, '51') }
    }
    assertions[`basket.utf8-${length}`] = () => { population(); value('basket-query-299'); assert.deepEqual(row(`basket-utf8-${length}`).args, { basket: conditionalBasket(length, true) }); reject(`basket-utf8-${length}`, 'basket') }
  }
  assert.deepEqual(sorted(Object.keys(assertions)), sorted(conditionalPolicy.assertionIds))
  let directVerification: Promise<any> | undefined
  const results: ConditionalReport['assertions'] = []
  for (const id of conditionalPolicy.assertionIds) {
    try {
      if (id.startsWith('certificate.') && !id.startsWith('certificate.issuance')) {
        directVerification ??= Promise.resolve().then(() => assertions['certificate.direct']!())
        await directVerification
      }
      await assertions[id]!(); results.push({ id, result: 'PASS', detail: 'Independent fixed-policy predicate verified against original public observations.' }) }
    catch (error) { results.push({ id, result: error instanceof Blocked ? 'BLOCKED' : 'FAIL', detail: error instanceof Error ? error.message : String(error) }) }
  }
  return results
}

export async function verifyNativeConditionalConformance(report: ConditionalReport) {
  const assertions = await deriveConditionalOutcomes(report)
  assert.deepEqual(report.assertions, assertions)
  assert.equal(report.result, assertions.some(row => row.result === 'FAIL') ? 'FAIL' : assertions.some(row => row.result === 'BLOCKED') ? 'BLOCKED' : 'PASS')
  const transactions: ConditionalReport['transactions'] = [], seen = new Set<string>()
  for (const row of report.trace) if (['createAction', 'signAction'].includes(row.method) && row.result?.txid && Array.isArray(row.result.tx) && !seen.has(row.result.txid)) { seen.add(row.result.txid); transactions.push({ role: `conditional/${row.id}`, txid: row.result.txid, atomicBeef: row.result.tx }) }
  assert.deepEqual(report.transactions, transactions, 'Conditional transaction inventory omitted or substituted public returned bytes')
  return { verified: true as const, assertions, assertionCount: assertions.length, counts: Object.fromEntries(['PASS', 'FAIL', 'BLOCKED'].map(result => [result, assertions.filter(row => row.result === result).length])), completeBRC100Conformance: false }
}
