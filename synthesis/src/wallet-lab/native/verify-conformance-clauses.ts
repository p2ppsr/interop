import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createCipheriv, createDecipheriv, createHash, createHmac } from 'node:crypto'
import { PrivateKey, ProtoWallet, Signature, Transaction } from '@bsv/sdk'
import { clauseAssertionIds, clauseOracle4AssertionIds, clauseContract, clauseCoverageGaps, clauseOracle4CoverageGaps, clauseCrypto, clauseOracleId, conforms, invalidClauses, semanticClauseIds, specifiedError } from './conformance-clauses-model.js'
import { clauseOracle4Id, noSendChangeInputId, noSendChangeOutputId } from './conformance-nosend-change.js'
import { verifyNoSendChangeFixture } from './verify-conformance-nosend-change.js'
import { clauseOracle5Id, reservedNamespaceRejection } from './conformance-namespace-oracle5.js'
class ClauseBlocked extends Error {}

export async function deriveClauseOutcomes(report: any) {
  const oracle5 = report.oracle === clauseOracle5Id
  const oracle4 = report.oracle === clauseOracle4Id || oracle5
  const assertionIds = oracle4 ? clauseOracle4AssertionIds : clauseAssertionIds
  let noSendChange: ReturnType<typeof verifyNoSendChangeFixture> | undefined
  const changeFixture = () => noSendChange ??= verifyNoSendChangeFixture(report)
  const trace = report.trace as any[]
  const one = (id: string) => { const matches = trace.filter(r => r.id === id); assert.equal(matches.length, 1, `${id}: exactly one public call required`); return matches[0] }
  const result = (id: string) => { const row = one(id); assert.ok(!row.error, `${id}: ${row.error?.message}`); assert.ok(row.result !== undefined, `${id}: public result missing`); return row.result }
  const predicates: Record<string, () => unknown> = {}
  for (const [method, schema] of Object.entries(clauseContract.methods)) predicates[`output.${method}`] = () => {
    const rows = report.positives.filter((r: any) => r.method === method)
    assert.equal(rows.length, 1); assert.ok(rows[0].observations.length > 0, `${method}: no successful response`)
    for (const row of rows[0].observations) assert.ok(conforms(schema.output, row.result), `${method}: returned value violates BRC100 return shape at source line${schema.line}`)
  }
  for (const fixture of invalidClauses) predicates[fixture.id] = async () => {
    const row = one(fixture.id)
    assert.equal(row.method, fixture.method)
    if (!conforms(clauseContract.methods[fixture.method]!.input, row.base)) throw new ClauseBlocked('Positive base is malformed; invalid-parameter rejection cannot establish the target clause')
    const expected = structuredClone(row.base)
    let parent = expected
    for (const part of fixture.path.slice(0, -1)) parent = parent[part]
    parent[fixture.path.at(-1)!] = structuredClone(fixture.invalid)
    assert.deepEqual(row.args, expected, 'The negative call must differ from its valid base at exactly one declared field')
    const actual = fixture.path.reduce((v, key) => v?.[key], row.args)
    assert.deepEqual(actual, fixture.invalid)
    assert.ok(!conforms(clauseContract.methods[fixture.method]!.input, row.args), 'Negative fixture is not outside the standard contract')
    assert.equal(row.result, undefined, `Invalid ${fixture.token} was accepted`)
    const control = row.controlId ? one(row.controlId) : undefined
    if (!control || control.result === undefined || control.error) throw new ClauseBlocked(`Positive control failed or was unavailable: ${JSON.stringify(control?.error ?? null)}`)
    if (oracle4 && fixture.id === noSendChangeInputId) {
      const anchor = await changeFixture()
      assert.deepEqual(row.base.options.noSendChange, anchor.outpoints, 'The positive outpoint must match the independently observed signed action and public outputs')
      const controlTx = Transaction.fromAtomicBEEF(control.result.signableTransaction.tx)
      assert.ok(controlTx.inputs.some(input => anchor.outpoints.includes(`${input.sourceTXID ?? input.sourceTransaction?.id('hex')}.${input.sourceOutputIndex}`)), 'Positive control must actually use the observed change')
    }
    if (row.controlUsesFreshReference) {
      assert.ok(['signAction', 'abortAction'].includes(fixture.method))
      const earlier = one(`setup.${fixture.id}`), fresh = one(`setup.fresh.${fixture.id}`)
      assert.equal(earlier.method, 'createAction'); assert.equal(fresh.method, 'createAction'); assert.deepEqual(earlier.args, fresh.args)
      assert.equal(control.args.reference, earlier.result?.signableTransaction?.reference)
      assert.equal(row.base.reference, fresh.result?.signableTransaction?.reference)
      assert.ok(trace.indexOf(earlier) < trace.indexOf(control) && trace.indexOf(control) < trace.indexOf(fresh) && trace.indexOf(fresh) < trace.indexOf(row))
      assert.deepEqual({ ...control.args, reference: row.base.reference }, row.base)
    } else assert.deepEqual(control.args, row.base)
    assert.equal(control.method, fixture.method)
    assert.ok(specifiedError(row.error, undefined, report.oracle === clauseOracleId || oracle4), `Expected specified rejection for${fixture.token}; observed${JSON.stringify(row.error)}`)
  }
  if (oracle4) predicates[noSendChangeOutputId] = async () => {
    const anchor = await changeFixture()
    if (anchor.returned === undefined || Array.isArray(anchor.returned) && anchor.returned.length === 0) throw new ClauseBlocked('Optional noSendChange return is absent or empty; final-outpoint behavior was not exercised')
    assert.ok(Array.isArray(anchor.returned), 'Returned noSendChange must be an outpoint array')
    assert.equal(new Set(anchor.returned).size, anchor.returned.length, 'Returned change outpoints must be unique')
    assert.ok(anchor.returned.every((outpoint: unknown) => typeof outpoint === 'string' && anchor.outpoints.includes(outpoint)), 'Returned noSendChange must identify final signed wallet-managed change outputs')
  }
  const peer = new ProtoWallet(PrivateKey.fromHex(clauseCrypto.peerKey))
  const peerIdentity = PrivateKey.fromHex(clauseCrypto.peerKey).toPublicKey().toString()
  const context = { protocolID: clauseCrypto.protocolID, keyID: clauseCrypto.keyID, counterparty: peerIdentity }
  const alternate = { ...context, keyID: `${context.keyID} alternate` }
  const ownChild = peer.keyDeriver!.derivePublicKey(clauseCrypto.protocolID, clauseCrypto.keyID, report.identity, false)
  const peerChild = peer.keyDeriver!.derivePublicKey(clauseCrypto.protocolID, clauseCrypto.keyID, report.identity, true)
  const key = Buffer.from(peer.keyDeriver!.deriveSymmetricKey(clauseCrypto.protocolID, clauseCrypto.keyID, report.identity).toArray('be', 32))
  const bytes = (value: any, label: string): number[] => { assert.ok(Array.isArray(value) && value.every(n => Number.isInteger(n) && n >= 0 && n <= 255), `${label}: exact byte array required`); return value }
  const call = (id: string, method: string, args: any) => {
    const row = one(id)
    assert.equal(row.method, method, `${id}: public method changed`)
    assert.deepEqual(row.args, args, `${id}: complete public argument context changed`)
    assert.ok(!(row.error !== undefined && row.result !== undefined), `${id}: result and error cannot both be present`)
    return row
  }
  const before = (first: string, second: string) => assert.ok(trace.indexOf(one(first)) < trace.indexOf(one(second)), `${first} must precede ${second}`)
  const encryptedBytes = () => {
    call('crypto.aes.peer-decrypt', 'encrypt', { ...context, plaintext: clauseCrypto.data })
    const encrypted = bytes(result('crypto.aes.peer-decrypt').ciphertext, 'Native ciphertext')
    assert.ok(encrypted.length >= 48)
    const data = Buffer.from(encrypted), decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 32))
    decipher.setAuthTag(data.subarray(-16))
    assert.deepEqual([...Buffer.concat([decipher.update(data.subarray(32, -16)), decipher.final()])], clauseCrypto.data)
    return encrypted
  }
  const independentCiphertext = () => {
    const iv = Buffer.alloc(32, 23), cipher = createCipheriv('aes-256-gcm', key, iv)
    return [...Buffer.concat([iv, cipher.update(Buffer.from(clauseCrypto.data)), cipher.final(), cipher.getAuthTag()])]
  }
  const nativeMac = () => {
    call('crypto.hmac.independent', 'createHmac', { ...context, data: clauseCrypto.data })
    const mac = bytes(result('crypto.hmac.independent').hmac, 'Native HMAC')
    assert.deepEqual(mac, [...createHmac('sha256', key).update(Buffer.from(clauseCrypto.data)).digest()])
    return mac
  }
  const cryptographicRejection = (row: any, kind: 'aes' | 'hmac') => {
    if (kind === 'hmac' && row.error === undefined && row.result?.valid === false) return
    assert.equal(row.result, undefined, 'A failed cryptographic operation must not return plaintext or a successful result')
    assert.ok(specifiedError(row.error), 'An explicit cryptographic rejection is required; observer and transport failures never qualify')
    assert.ok((kind === 'aes' ? /decrypt|authenticat|ciphertext|auth.?tag|mac check/i : /hmac|message authentication|mac.*invalid|invalid.*mac/i).test(row.error.message), 'The rejection must concern the exercised cryptographic check')
    assert.ok(!/permission|consent|not authorized|access denied/i.test(row.error.message), 'A permission failure is not cryptographic rejection')
  }
  predicates['crypto.brc42.self-child'] = () => {
    call('crypto.brc42.self-child', 'getPublicKey', { ...context, forSelf: true })
    assert.equal(result('crypto.brc42.self-child').publicKey, ownChild.toString())
  }
  predicates['crypto.brc42.peer-child'] = () => {
    call('crypto.brc42.peer-child', 'getPublicKey', { ...context, forSelf: false })
    assert.equal(result('crypto.brc42.peer-child').publicKey, peerChild.toString())
  }
  predicates['crypto.brc42.context-separation'] = () => {
    call('crypto.brc42.self-child', 'getPublicKey', { ...context, forSelf: true })
    assert.equal(result('crypto.brc42.self-child').publicKey, ownChild.toString())
    call('crypto.brc42.context-separation', 'getPublicKey', { ...alternate, forSelf: true })
    before('crypto.brc42.self-child', 'crypto.brc42.context-separation')
    assert.equal(result('crypto.brc42.context-separation').publicKey, peer.keyDeriver!.derivePublicKey(clauseCrypto.protocolID, alternate.keyID, report.identity, false).toString())
    assert.notEqual(result('crypto.brc42.context-separation').publicKey, ownChild.toString())
  }
  predicates['crypto.aes.peer-decrypt'] = () => { encryptedBytes() }
  predicates['crypto.aes.independent-encrypt'] = () => {
    call('crypto.aes.independent-encrypt', 'decrypt', { ...context, ciphertext: independentCiphertext() })
    assert.deepEqual(bytes(result('crypto.aes.independent-encrypt').plaintext, 'Native plaintext'), clauseCrypto.data)
  }
  predicates['crypto.aes.tamper-rejected'] = () => {
    const damaged = [...encryptedBytes()]; damaged[damaged.length - 1]! ^= 1
    const row = call('crypto.aes.tamper-rejected', 'decrypt', { ...context, ciphertext: damaged })
    before('crypto.aes.peer-decrypt', row.id)
    cryptographicRejection(row, 'aes')
  }
  predicates['crypto.aes.wrong-key-rejected'] = () => {
    const row = call('crypto.aes.wrong-key-rejected', 'decrypt', { ...alternate, ciphertext: encryptedBytes() })
    before('crypto.aes.peer-decrypt', row.id)
    cryptographicRejection(row, 'aes')
  }
  predicates['crypto.hmac.independent'] = () => { nativeMac() }
  predicates['crypto.hmac.wrong-context-rejected'] = () => {
    const row = call('crypto.hmac.wrong-context-rejected', 'verifyHmac', { ...alternate, data: clauseCrypto.data, hmac: nativeMac() })
    before('crypto.hmac.independent', row.id)
    cryptographicRejection(row, 'hmac')
  }
  predicates['crypto.ecdsa.direct-hash'] = () => {
    call('crypto.ecdsa.direct-hash', 'createSignature', { ...context, hashToDirectlySign: [...createHash('sha256').update(Buffer.from(clauseCrypto.data)).digest()] })
    assert.ok(Signature.fromDER(bytes(result('crypto.ecdsa.direct-hash').signature, 'Native direct-hash signature')).verify(clauseCrypto.data, ownChild))
  }
  predicates['crypto.ecdsa.peer-signature'] = () => {
    const row = one('crypto.ecdsa.peer-signature')
    const signature = bytes(row.args?.signature, 'Peer signature')
    call(row.id, 'verifySignature', { ...context, data: clauseCrypto.data, signature, forSelf: false })
    assert.ok(Signature.fromDER(signature).verify(clauseCrypto.data, peerChild))
    assert.equal(result(row.id).valid, true)
  }
  const protocolNames = { 'double-space': 'tpnil  clauses', suffix: 'tpnil clause protocol', reserved: 'p tpnil clauses', uppercase: 'TPNIL clauses' }
  const basketNames = { default: 'default', admin: 'admin tpnil', reserved: 'p tpnil clauses' }
  for (const [suffix, protocol] of Object.entries(protocolNames)) predicates[`namespace.protocol.${suffix}`] = () => {
    const row = call(`namespace.protocol.${suffix}`, 'getPublicKey', { ...context, protocolID: [0, protocol] })
    assert.ok(row.result === undefined && (specifiedError(row.error, 'protocol') || oracle5 && reservedNamespaceRejection(report, row)), 'The exact forbidden protocol name must be explicitly rejected')
  }
  for (const [suffix, basket] of Object.entries(basketNames)) predicates[`namespace.basket.${suffix}`] = () => {
    const row = call(`namespace.basket.${suffix}`, 'listOutputs', { basket })
    assert.ok(row.result === undefined && (specifiedError(row.error, 'basket') || oracle5 && reservedNamespaceRejection(report, row)), 'The exact forbidden basket name must be explicitly rejected')
  }
  const metadataCreation = () => {
    call('setup.metadata', 'createAction', { description: 'TPNIL native clause metadata', outputs: [0, 1, 2].map(index => ({ satoshis: 2 + index, lockingScript: '51', basket: 'tpnil native metadata', tags: ['clause', `row${index}`], customInstructions: `metadata:${index}`, outputDescription: `TPNIL metadata output ${index}` })), labels: ['tpnil-clause-metadata'], options: { randomizeOutputs: false, acceptDelayedBroadcast: false } })
    const creation = result('setup.metadata')
    assert.match(creation.txid, /^[0-9a-f]{64}$/)
    assert.equal(report.metadataTxid, creation.txid, 'Metadata transaction identity must come from the captured createAction')
    // When returned, bind serialized output bytes as well. The parent native
    // transaction oracle independently verifies the complete submitted ancestry.
    if (creation.tx !== undefined) {
      const tx = Transaction.fromAtomicBEEF(bytes(creation.tx, 'Metadata AtomicBEEF'))
      assert.equal(tx.id('hex'), creation.txid)
      for (let i = 0; i < 3; i++) { assert.equal(tx.outputs[i]?.satoshis, 2 + i); assert.equal(tx.outputs[i]?.lockingScript.toHex(), '51') }
    }
    return creation.txid
  }
  const metadataOutputs = () => {
    const txid = metadataCreation()
    call('metadata.tags-instructions', 'listOutputs', { basket: 'tpnil native metadata', includeTags: true, includeCustomInstructions: true, include: 'locking scripts', limit: 100 })
    before('setup.metadata', 'metadata.tags-instructions')
    const rows = result('metadata.tags-instructions'); assert.equal(rows.totalOutputs, 3); assert.equal(rows.outputs.length, 3)
    assert.equal(new Set(rows.outputs.map((row: any) => row.outpoint)).size, 3)
    for (let i = 0; i < 3; i++) {
      const row = rows.outputs.find((r: any) => r.outpoint === `${txid}.${i}`); assert.ok(row)
      assert.equal(row.satoshis, 2 + i); assert.equal(row.lockingScript, '51'); assert.equal(row.spendable, true)
      assert.deepEqual([...row.tags].sort(), ['clause', `row${i}`]); assert.equal(row.customInstructions, `metadata:${i}`)
    }
    return rows
  }
  predicates['metadata.tags-instructions'] = () => { metadataOutputs() }
  predicates['metadata.labels-outputs'] = () => {
    const txid = metadataCreation()
    call('metadata.labels-outputs', 'listActions', { labels: ['tpnil-clause-metadata'], includeLabels: true, includeOutputs: true, includeOutputLockingScripts: true, limit: 100 })
    before('setup.metadata', 'metadata.labels-outputs')
    const response = result('metadata.labels-outputs'); assert.equal(response.totalActions, 1); assert.equal(response.actions.length, 1)
    const row = response.actions[0]; assert.equal(row.txid, txid)
    assert.equal(row.labels.filter((label: string) => label === 'tpnil-clause-metadata').length, 1)
    assert.equal(row.description, 'TPNIL native clause metadata')
    assert.equal(new Set(row.outputs.map((r: any) => r.outputIndex)).size, row.outputs.length)
    for (let i = 0; i < 3; i++) {
      const output = row.outputs.find((r: any) => r.outputIndex === i); assert.ok(output)
      assert.equal(output.satoshis, 2 + i); assert.equal(output.lockingScript, '51')
      if (output.customInstructions !== undefined) assert.equal(output.customInstructions, `metadata:${i}`)
      assert.equal(output.spendable, true); assert.equal(output.basket, 'tpnil native metadata')
      assert.equal(output.outputDescription, `TPNIL metadata output ${i}`); assert.deepEqual([...output.tags].sort(), ['clause', `row${i}`])
    }
  }
  predicates['metadata.pagination'] = () => {
    const all = metadataOutputs()
    call('metadata.pagination', 'listOutputs', { basket: 'tpnil native metadata', tags: ['clause'], tagQueryMode: 'all', limit: 1, offset: 1, includeCustomInstructions: true })
    before('metadata.tags-instructions', 'metadata.pagination')
    const rows = result('metadata.pagination'); assert.equal(rows.totalOutputs, 3); assert.equal(rows.outputs.length, 1)
    const expected = all.outputs[1], row = rows.outputs[0]
    assert.equal(row.outpoint, expected.outpoint)
    assert.equal(row.satoshis, expected.satoshis); assert.equal(row.spendable, expected.spendable); assert.equal(row.customInstructions, expected.customInstructions)
  }
  predicates['errors.structured'] = () => {
    const errors = trace.filter(r => r.error && !r.id.startsWith('cleanup.')).map(r => r.error)
    assert.ok(errors.length > 0)
    for (const error of errors) {
      assert.equal(error.status, 'error', 'Public native errors must preserve status:error (BRC100L288)')
      assert.equal(typeof error.code, 'string'); assert.ok(error.code.length >= 10 && error.code.length <= 40)
      assert.equal(typeof error.description, 'string'); assert.ok(Buffer.byteLength(error.description) >= 20 && Buffer.byteLength(error.description) <= 200)
    }
  }
  const outcomes: Array<{ id: string; result: 'PASS' | 'FAIL' | 'BLOCKED'; detail: string }> = []
  for (const id of assertionIds) {
    if (id === 'coverage.remaining-obligations') { outcomes.push({ id, result: 'BLOCKED', detail: 'Full R008 remains blocked by the explicitly retained obligations in coverageGaps.' }); continue }
    assert.ok(predicates[id], `No independent predicate for${id}`)
    try { await predicates[id]!(); outcomes.push({ id, result: 'PASS', detail: 'Independent predicate satisfied by retained public calls.' }) }
    catch (error) { outcomes.push({ id, result: error instanceof ClauseBlocked ? 'BLOCKED' : 'FAIL', detail: error instanceof Error ? error.message : String(error) }) }
  }
  return outcomes
}

export async function verifyNativeClauseConformance(report: any, boundaryReport?: any) {
  assert.equal(report.schema, 'tpnil-native-brc100-clauses@2.0.0')
  assert.equal(report.claim, 'ENGINEERING_OBSERVATION_ONLY'); assert.ok(['unchanged-native-window.CWI', 'reference-toolbox-public-api'].includes(report.substrate))
  assert.ok(report.oracle === clauseOracleId || report.oracle === clauseOracle4Id || report.oracle === clauseOracle5Id || report.oracle === undefined && report.substrate === 'reference-toolbox-public-api', 'Native qualification requires an independently versioned clause oracle; omitted IDs admit historical reference diagnostics only')
  const gaps = (report.oracle === clauseOracle4Id || report.oracle === clauseOracle5Id) ? clauseOracle4CoverageGaps : clauseCoverageGaps
  assert.deepEqual(report.source, clauseContract.source); assert.deepEqual(report.coverageGaps, gaps)
  assert.equal(report.completeBRC100Conformance, false)
  if (boundaryReport) assert.deepEqual(report.positives, JSON.parse(JSON.stringify(Object.keys(clauseContract.methods).map(method => ({ method, observations: boundaryReport.trace.filter((r: any) => r.method === method && r.result !== undefined).map((r: any) => ({ args: r.args, result: r.result })) })))))
  assert.deepEqual(report.assertions.map((r: any) => r.id), (report.oracle === clauseOracle4Id || report.oracle === clauseOracle5Id) ? clauseOracle4AssertionIds : clauseAssertionIds)
  const assertions = await deriveClauseOutcomes(report)
  assert.deepEqual(report.assertions.map(({ id, result }: any) => ({ id, result })), assertions.map(({ id, result }) => ({ id, result })))
  const result = assertions.some(r => r.result === 'FAIL') ? 'FAIL' : 'BLOCKED'
  assert.equal(report.result, result)
  return { verified: true, result, assertions, completeBRC100Conformance: false, coverageGaps: gaps }
}

if (process.argv[1] === import.meta.filename) {
  const filename = process.argv[2]
  if (!filename) throw Error('Usage: verify-conformance-clauses.ts REPORT [--reference] [--boundary OBSERVATIONS]')
  const report = JSON.parse(fs.readFileSync(filename, 'utf8'))
  assert.equal(report.substrate, process.argv.includes('--reference') ? 'reference-toolbox-public-api' : 'unchanged-native-window.CWI')
  const index = process.argv.indexOf('--boundary')
  const boundary = index < 0 ? undefined : JSON.parse(fs.readFileSync(process.argv[index + 1]!, 'utf8'))
  const verified = await verifyNativeClauseConformance(report, boundary?.corpus ?? boundary)
  console.log(JSON.stringify({ verified: verified.verified, result: verified.result, counts: Object.fromEntries(['PASS', 'FAIL', 'BLOCKED'].map(result => [result, verified.assertions.filter(a => a.result === result).length])), completeBRC100Conformance: false }))
}
