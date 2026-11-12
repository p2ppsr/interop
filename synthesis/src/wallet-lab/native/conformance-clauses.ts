import { createCipheriv, createHash } from 'node:crypto'
import { PrivateKey, ProtoWallet } from '@bsv/sdk'
import { issueFixtureCertificateForSubject } from '../certificate-fixture.js'
import type { BoundaryWallet } from '../boundary-corpus.js'
import type { EvidenceBundle } from '../evidence.js'
import { clauseContract, clauseCoverageGaps, clauseOracle4CoverageGaps, clauseCrypto, clauseOracleId, conforms, invalidClauses, type Shape } from './conformance-clauses-model.js'
import { deriveClauseOutcomes } from './verify-conformance-clauses.js'
import { clauseOracle4Id, prepareNoSendChangeFixture } from './conformance-nosend-change.js'
import { clauseOracle5Id } from './conformance-namespace-oracle5.js'

const peer = new ProtoWallet(PrivateKey.fromHex('61'.repeat(32)))
export function captureClauseError(error: any) {
  const result: Record<string, unknown> = {}
  for (const key of new Set(['name', 'message', 'code', 'status', 'description', 'parameter', ...Object.getOwnPropertyNames(error ?? {})])) {
    if (key === 'stack' || typeof error?.[key] === 'function') continue
    try { if (error?.[key] !== undefined) result[key] = structuredClone(error[key]) } catch { /* non-serializable error fields are not fabricated */ }
  }
  if (!result.message) result.message = String(error)
  return result
}
function example(s: Shape, identity: string): any {
  if (s.kind === 'object') return Object.fromEntries(Object.entries(s.fields!).filter(([,v]) => !v.optional).map(([k,v]) => [k, example(v, identity)]))
  if (s.kind === 'record') return {}
  if (s.kind === 'array') return [example(s.item!, identity)]
  if (s.kind === 'tuple') return s.items!.map(v => example(v, identity))
  if (s.kind === 'union') return example(s.variants![0]!, identity)
  if (s.kind === 'literal') return s.value
  if (s.kind === 'boolean' || s.name?.startsWith('Boolean')) return false
  if (s.kind === 'number' || /PositiveInteger|SatoshiValue|Byte/.test(s.name ?? '')) return 1
  if (s.name === 'PubKeyHex') return identity
  if (s.name === 'TXIDHexString') return '00'.repeat(32)
  if (s.name === 'OutpointString') return `${'00'.repeat(32)}.0`
  if (s.name === 'Base64String') return Buffer.from('fixture').toString('base64')
  if (s.name === 'HexString') return '51'
  if (['BEEF', 'AtomicBEEF'].includes(s.name ?? '')) return [0]
  return 'tpnil clause fixture'
}
export function invalidFixture(base: any, shape: Shape, parts: (string | number)[], invalid: unknown, identity: string) {
  const args = structuredClone(base)
  let current = args, s = shape
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!
    const child = s.kind === 'object' ? s.fields![String(part)]! : s.kind === 'tuple' ? s.items![Number(part)]! : s.item!
    if (i === parts.length - 1) current[part] = structuredClone(invalid)
    else { if (current[part] === undefined || current[part] === null) current[part] = example(child, identity); current = current[part]; s = child }
  }
  return args
}
function completeBase(base: any, shape: Shape, parts: (string | number)[], identity: string) {
  let current = base, s = shape
  for (const part of parts) {
    const child = s.kind === 'object' ? s.fields![String(part)]! : s.kind === 'tuple' ? s.items![Number(part)]! : s.item!
    if (current[part] === undefined) current[part] = example(child, identity)
    current = current[part]; s = child
  }
}

/** Public calls only. The parent supplies the same native CWI boundary used by the application. */
export async function runNativeClauseConformance({ wallet, evidence, boundaryReport, substrate = 'unchanged-native-window.CWI', oracle = clauseOracleId }: { wallet: BoundaryWallet; evidence: EvidenceBundle; boundaryReport: any; substrate?: 'unchanged-native-window.CWI' | 'reference-toolbox-public-api'; oracle?: typeof clauseOracleId | typeof clauseOracle4Id | typeof clauseOracle5Id }) {
  if (oracle !== clauseOracleId && oracle !== clauseOracle4Id && oracle !== clauseOracle5Id) throw Error('Unsupported native clause oracle')
  const trace: any[] = [], cleanup: any[] = []
  async function call(id: string, method: string, args: any) {
    const row: any = { id, method, args: structuredClone(args) }; trace.push(row)
    try { row.result = structuredClone(await wallet[method]!(structuredClone(args))) } catch (error) { row.error = captureClauseError(error) }
    return row
  }
  const originals = boundaryReport.trace as any[]
  const first = (method: string) => originals.find(r => r.method === method && r.result !== undefined)
  const identity = first('getPublicKey')?.result?.publicKey
  if (typeof identity !== 'string') throw Error('Clause corpus requires observed native identity')
  let certificateIndex = 40
  async function certificateFixture() {
    const certificate = await issueFixtureCertificateForSubject(new ProtoWallet(PrivateKey.fromHex('36'.repeat(32))), identity, { name: 'TPNIL clause identity', private: 'Unrevealed clause field' }, Buffer.alloc(32, 17).toString('base64'), async () => `${'00'.repeat(32)}.0`, Buffer.alloc(32, certificateIndex++).toString('base64'))
    return JSON.parse(JSON.stringify({ ...certificate, acquisitionProtocol: 'direct', keyringRevealer: 'certifier', keyringForSubject: certificate.masterKeyring }))
  }
  const cert = await certificateFixture()
  await call('setup.certificate', 'acquireCertificate', cert)
  const bases = Object.fromEntries(Object.keys(clauseContract.methods).map(method => [method, structuredClone(first(method)?.args ?? {})]))
  if (cert) bases.proveCertificate.certificate = Object.fromEntries(['type', 'subject', 'serialNumber', 'certifier', 'revocationOutpoint', 'signature', 'fields'].map(k => [k, cert[k]]))
  bases.getHeaderForHeight = { height: 1 }
  bases.createAction = { description: 'TPNIL parameter validation fixture', outputs: [{ satoshis: 1, lockingScript: '51', outputDescription: 'TPNIL validation output', basket: 'tpnil clause parameters', tags: ['clause'], customInstructions: 'fixture' }], labels: ['tpnil-clauses'], options: { signAndProcess: false, noSend: true, randomizeOutputs: false } }
  bases.getPublicKey = { protocolID: [0, 'tpnil boundary corpus'], keyID: '1', counterparty: 'self', forSelf: true }
  bases.listCertificates = { certifiers: [cert.certifier], types: [cert.type], offset: 0 }
  const inputFixture = await call('setup.input-token', 'createAction', { description: 'TPNIL parameter input fixture', outputs: [{ satoshis: 50, lockingScript: '7551', outputDescription: 'Parameter input fixture', basket: 'tpnil input fixture' }], options: { randomizeOutputs: false, acceptDelayedBroadcast: false } })
  async function release(id: string, value: any, pending = true) {
    if (value?.signableTransaction?.reference) {
      const released = await call(`cleanup.${id}`, 'abortAction', { reference: value.signableTransaction.reference })
      cleanup.push({ id, reference: value.signableTransaction.reference, result: released.result, error: released.error })
    } else if (value?.txid && pending) {
      const released = await call(`cleanup.${id}`, 'createAction', { description: 'TPNIL release accepted invalid fixture', options: { sendWith: [value.txid], acceptDelayedBroadcast: false } })
      cleanup.push({ id, txid: value.txid, result: released.result, error: released.error })
    }
  }
  // All successful original responses are checked against the exact standard return shapes.
  const positives = Object.keys(clauseContract.methods).map(method => ({ method, observations: originals.filter(r => r.method === method && r.result !== undefined).map(r => ({ args: r.args, result: r.result })) }))
  for (const fixture of invalidClauses) {
    let base = structuredClone(bases[fixture.method]), prepared: any, pendingBatch: any
    if (fixture.method === 'createAction' && fixture.path[0] === 'inputs') {
      base.inputBEEF = inputFixture.result?.tx
      base.inputs = [{ outpoint: `${inputFixture.result?.txid}.0`, unlockingScript: '51', inputDescription: 'TPNIL known input fixture', sequenceNumber: 0xffffffff }]
      if (fixture.path[2] === 'unlockingScriptLength') { delete base.inputs[0].unlockingScript; base.inputs[0].unlockingScriptLength = 1 }
    }
    if (fixture.method === 'createAction' && fixture.path[0] === 'inputBEEF') base.inputBEEF = inputFixture.result?.tx
    if (fixture.method === 'createAction' && fixture.path.includes('noSendChange')) {
      if (oracle === clauseOracle4Id || oracle === clauseOracle5Id) {
        const prepared = await prepareNoSendChangeFixture(call)
        pendingBatch = prepared.pendingBatch
        base.options.noSendChange = prepared.outpoints
      } else {
        pendingBatch = await call(`setup.${fixture.id}`, 'createAction', { ...bases.createAction, options: { noSend: true, randomizeOutputs: false } })
        base.options.noSendChange = pendingBatch.result?.noSendChange
      }
    }
    if (fixture.method === 'createSignature' && fixture.path[0] === 'hashToDirectlySign') { base.hashToDirectlySign = [...createHash('sha256').update(Buffer.from(base.data)).digest()]; delete base.data }
    if (fixture.method === 'verifySignature' && fixture.path[0] === 'hashToDirectlyVerify') { base.hashToDirectlyVerify = [...createHash('sha256').update(Buffer.from(base.data)).digest()]; delete base.data }
    if (fixture.method === 'internalizeAction' && fixture.path.includes('insertionRemittance')) {
      base.tx = inputFixture.result?.tx
      base.outputs[0] = { outputIndex: 0, protocol: 'basket insertion', insertionRemittance: { basket: 'tpnil insertion fixture', customInstructions: 'fixture', tags: ['clause'] } }
    }
    if (fixture.method === 'acquireCertificate') base = await certificateFixture()
    if (fixture.method === 'relinquishCertificate') {
      const fresh = await certificateFixture(); await call(`setup.${fixture.id}`, 'acquireCertificate', fresh)
      base = { type: fresh.type, serialNumber: fresh.serialNumber, certifier: fresh.certifier }
    }
    if (fixture.method === 'relinquishOutput') {
      const fresh = await call(`setup.${fixture.id}`, 'createAction', { description: 'TPNIL relinquishment input fixture', outputs: [{ satoshis: 1, lockingScript: '51', outputDescription: 'Relinquishment input fixture', basket: 'tpnil relinquish fixture' }], options: { randomizeOutputs: false, acceptDelayedBroadcast: false } })
      base = { basket: 'tpnil relinquish fixture', output: `${fresh.result?.txid}.0` }
    }
    if (['signAction', 'abortAction'].includes(fixture.method)) {
      prepared = await call(`setup.${fixture.id}`, 'createAction', bases.createAction)
      base = fixture.method === 'signAction' ? { spends: {}, reference: prepared.result?.signableTransaction?.reference, options: { noSend: true } } : { reference: prepared.result?.signableTransaction?.reference }
    }
    completeBase(base, clauseContract.methods[fixture.method]!.input, fixture.path, identity)
    if (['createAction', 'signAction'].includes(fixture.method) && fixture.path.includes('sendWith')) base.options.sendWith = []
    // Read-only controls are actual successful calls using the exact unmutated base.
    // Stateful controls use the public availability evidence retained with their fresh setup.
    const stateful = ['createAction', 'signAction', 'abortAction', 'acquireCertificate', 'relinquishCertificate', 'relinquishOutput'].includes(fixture.method)
    let control: any
    if (!stateful) control = await call(`control.${fixture.id}`, fixture.method, structuredClone(base))
    else if (fixture.method === 'createAction') { control = await call(`control.${fixture.id}`, fixture.method, structuredClone(base)); await release(`control.${fixture.id}`, control.result) }
    else if (['signAction', 'abortAction'].includes(fixture.method)) {
      control = await call(`control.${fixture.id}`, fixture.method, structuredClone(base))
      await release(`control.${fixture.id}`, control.result, base.options?.noSend === true)
      prepared = await call(`setup.fresh.${fixture.id}`, 'createAction', bases.createAction)
      base.reference = prepared.result?.signableTransaction?.reference
    }
    const args = invalidFixture(base, clauseContract.methods[fixture.method]!.input, fixture.path, fixture.invalid, identity)
    const row = await call(fixture.id, fixture.method, args)
    if (stateful && fixture.method !== 'createAction' && !control && row.error) {
      control = await call(`control.${fixture.id}`, fixture.method, structuredClone(base))
      await release(`control.${fixture.id}`, control.result)
    }
    row.base = base
    row.controlId = control?.id
    row.controlUsesFreshReference = ['signAction', 'abortAction'].includes(fixture.method)
    row.baseContractValid = conforms(clauseContract.methods[fixture.method]!.input, base)
    // The returned action can inherit noSend from its prepared action even when
    // the malformed signAction option is null. Flush any returned TXID explicitly.
    if (row.result) await release(fixture.id, row.result)
    else if (prepared?.result && (row.controlUsesFreshReference || !control?.result)) await release(fixture.id, prepared.result)
    if (pendingBatch?.result) await release(`batch.${fixture.id}`, pendingBatch.result)
  }
  const peerIdentity = (await peer.getPublicKey({ identityKey: true })).publicKey
  const context = { protocolID: clauseCrypto.protocolID, keyID: clauseCrypto.keyID, counterparty: peerIdentity }
  await call('crypto.brc42.self-child', 'getPublicKey', { ...context, forSelf: true })
  await call('crypto.brc42.peer-child', 'getPublicKey', { ...context, forSelf: false })
  await call('crypto.brc42.context-separation', 'getPublicKey', { ...context, keyID: `${context.keyID} alternate`, forSelf: true })
  const encrypted = await call('crypto.aes.peer-decrypt', 'encrypt', { ...context, plaintext: clauseCrypto.data })
  const key = Buffer.from(peer.keyDeriver!.deriveSymmetricKey(context.protocolID, context.keyID, identity).toArray('be', 32))
  const iv = Buffer.alloc(32, 23), cipher = createCipheriv('aes-256-gcm', key, iv)
  const encryptedByPeer = [...Buffer.concat([iv, cipher.update(Buffer.from(clauseCrypto.data)), cipher.final(), cipher.getAuthTag()])]
  await call('crypto.aes.independent-encrypt', 'decrypt', { ...context, ciphertext: encryptedByPeer })
  const damaged = [...(encrypted.result?.ciphertext ?? encryptedByPeer)]; damaged[damaged.length - 1] ^= 1
  await call('crypto.aes.tamper-rejected', 'decrypt', { ...context, ciphertext: damaged })
  await call('crypto.aes.wrong-key-rejected', 'decrypt', { ...context, keyID: `${context.keyID} alternate`, ciphertext: encrypted.result?.ciphertext ?? encryptedByPeer })
  const mac = await call('crypto.hmac.independent', 'createHmac', { ...context, data: clauseCrypto.data })
  await call('crypto.hmac.wrong-context-rejected', 'verifyHmac', { ...context, keyID: `${context.keyID} alternate`, data: clauseCrypto.data, hmac: mac.result?.hmac ?? [] })
  const hash = [...createHash('sha256').update(Buffer.from(clauseCrypto.data)).digest()]
  await call('crypto.ecdsa.direct-hash', 'createSignature', { ...context, hashToDirectlySign: hash })
  const peerSignature = await peer.createSignature({ ...context, counterparty: identity, data: clauseCrypto.data })
  await call('crypto.ecdsa.peer-signature', 'verifySignature', { ...context, data: clauseCrypto.data, signature: peerSignature.signature, forSelf: false })
  for (const [suffix, protocol] of [['double-space', 'tpnil  clauses'], ['suffix', 'tpnil clause protocol'], ['reserved', 'p tpnil clauses'], ['uppercase', 'TPNIL clauses']]) await call(`namespace.protocol.${suffix}`, 'getPublicKey', { ...context, protocolID: [0, protocol] })
  for (const [suffix, basket] of [['default', 'default'], ['admin', 'admin tpnil'], ['reserved', 'p tpnil clauses']]) await call(`namespace.basket.${suffix}`, 'listOutputs', { basket })
  const creation = await call('setup.metadata', 'createAction', { description: 'TPNIL native clause metadata', outputs: [0, 1, 2].map(index => ({ satoshis: 2 + index, lockingScript: '51', basket: 'tpnil native metadata', tags: ['clause', `row${index}`], customInstructions: `metadata:${index}`, outputDescription: `TPNIL metadata output ${index}` })), labels: ['tpnil-clause-metadata'], options: { randomizeOutputs: false, acceptDelayedBroadcast: false } })
  await call('metadata.tags-instructions', 'listOutputs', { basket: 'tpnil native metadata', includeTags: true, includeCustomInstructions: true, include: 'locking scripts', limit: 100 })
  await call('metadata.labels-outputs', 'listActions', { labels: ['tpnil-clause-metadata'], includeLabels: true, includeOutputs: true, includeOutputLockingScripts: true, limit: 100 })
  await call('metadata.pagination', 'listOutputs', { basket: 'tpnil native metadata', tags: ['clause'], tagQueryMode: 'all', limit: 1, offset: 1, includeCustomInstructions: true })
  if (cert) await call('cleanup.certificate', 'relinquishCertificate', { type: cert.type, serialNumber: cert.serialNumber, certifier: cert.certifier })
  const report: any = { schema: 'tpnil-native-brc100-clauses@2.0.0', oracle, claim: 'ENGINEERING_OBSERVATION_ONLY', source: clauseContract.source, substrate, identity, positives, trace, cleanup, coverageGaps: (oracle === clauseOracle4Id || oracle === clauseOracle5Id) ? clauseOracle4CoverageGaps : clauseCoverageGaps, completeBRC100Conformance: false, metadataTxid: creation.result?.txid }
  report.assertions = await deriveClauseOutcomes(report)
  report.result = report.assertions.some((r: any) => r.result === 'FAIL') ? 'FAIL' : report.assertions.some((r: any) => r.result === 'BLOCKED') ? 'BLOCKED' : 'PASS'
  // Omitted optional JavaScript properties remain absent in the JSON transport evidence.
  const serialized = JSON.parse(JSON.stringify(report))
  evidence.addJson('conformance/clauses.json', serialized)
  return serialized
}
