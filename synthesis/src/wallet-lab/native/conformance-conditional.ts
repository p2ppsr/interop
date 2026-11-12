import { Beef, Certificate, PrivateKey, ProtoWallet, Transaction, Utils } from '@bsv/sdk'
import type { BoundaryWallet } from '../boundary-corpus.js'
import type { EvidenceBundle } from '../evidence.js'
import type { ControlledWalletServices } from '../services.js'
import { issueFixtureCertificateForSubject } from '../certificate-fixture.js'
import { captureClauseError } from './conformance-clauses.js'
import { conditionalQueryCases, conditionalBasket, conditionalConfig as config, conditionalPolicySelection, type ConditionalReport } from './conformance-conditional-model.js'
import { createConditionalIssuer, conditionalIssuanceModes } from './conformance-conditional-issuer.js'
import { deriveConditionalOutcomes } from './verify-conformance-conditional.js'

/** Additional stateful public-API observations; never changes wallet private state. */
export async function runNativeConditionalConformance({ wallet, services, evidence, boundaryReport, fixtureRevision = 1 }: {
  wallet: BoundaryWallet; services: ControlledWalletServices; evidence: EvidenceBundle; boundaryReport: any; fixtureRevision?: 1 | 2
}): Promise<ConditionalReport> {
  const { oracle, policy, policySha256 } = conditionalPolicySelection(fixtureRevision)
  const identity = boundaryReport.trace.find((row: any) => row.method === 'getPublicKey' && row.args?.identityKey === true)?.result?.publicKey
  if (!identity) throw Error('Conditional corpus requires the independently observed native identity')
  const report: ConditionalReport = { schema: 'tpnil-native-conditional@1.0.0', oracle, claim: 'ENGINEERING_OBSERVATION_ONLY', policySha256, identity,
    trace: [], certificates: [], issuer: {}, errors: [], transactions: [], submissions: [], assertions: [], remainingCoverage: structuredClone(policy.remainingCoverage), completeBRC100Conformance: false, result: 'BLOCKED' }
  const issuer = createConditionalIssuer()
  const unregister = services.registerControlledRoute('certifier.itcve.test', issuer.handle)
  async function call(id: string, method: string, args: any) {
    const row: any = { id, method, args: structuredClone(args), submissionStart: services.submissions.length, submissionEnd: services.submissions.length }; report.trace.push(row)
    try { row.result = structuredClone(await wallet[method]!(structuredClone(args))) } catch (error) { row.error = captureClauseError(error) }
    row.submissionEnd = services.submissions.length
    return row
  }
  const output = (index: number) => ({ satoshis: config.satoshis, lockingScript: config.lockingScript, outputDescription: `TPNIL conditional output ${index}`, basket: config.basket, tags: ['shared', index % 2 ? 'odd' : 'even', `row${index}`], customInstructions: `conditional:${index}` })
  const explicit = { randomizeOutputs: false, acceptDelayedBroadcast: false }
  const population: any[] = []
  try {
    for (let index = 0; index < config.population; index++) population.push(await call(`population-${index}`, 'createAction', {
      description: `TPNIL conditional action ${index}`, outputs: [output(index)], labels: [config.label, index % 2 ? 'tpnil conditional odd' : 'tpnil conditional even'], ...(index ? { options: explicit } : {})
    }))
    const outputs = { basket: config.basket }
    await call('outputs-default', 'listOutputs', outputs)
    await call('outputs-any', 'listOutputs', { ...outputs, tags: ['row0', 'row1'], tagQueryMode: 'any', limit: 100 })
    await call('outputs-all', 'listOutputs', { ...outputs, tags: ['shared', 'even'], tagQueryMode: 'all', limit: 100 })
    await call('outputs-page1', 'listOutputs', { ...outputs, offset: 0, limit: 6 })
    await call('outputs-page2', 'listOutputs', { ...outputs, offset: 6, limit: 6 })
    await call('outputs-newest', 'listOutputs', { ...outputs, offset: -1, limit: 1 })
    await call('outputs-beyond', 'listOutputs', { ...outputs, offset: 20, limit: 6 })
    await call('outputs-metadata', 'listOutputs', { ...outputs, include: 'locking scripts', includeTags: true, includeLabels: true, includeCustomInstructions: true, limit: 100 })
    await call('outputs-beef', 'listOutputs', { ...outputs, include: 'entire transactions', limit: 100 })
    const actions = { labels: [config.label] }
    await call('actions-default', 'listActions', actions)
    await call('actions-any', 'listActions', { labels: ['tpnil conditional even', 'tpnil conditional odd'], labelQueryMode: 'any', limit: 100 })
    await call('actions-all', 'listActions', { labels: [config.label, 'tpnil conditional even'], labelQueryMode: 'all', limit: 100 })
    await call('actions-page1', 'listActions', { ...actions, offset: 0, limit: 6 })
    await call('actions-page2', 'listActions', { ...actions, offset: 6, limit: 6 })
    await call('actions-beyond', 'listActions', { ...actions, offset: 20, limit: 6 })
    await call('actions-includes', 'listActions', { ...actions, includeLabels: true, includeInputs: true, includeInputSourceLockingScripts: true, includeInputUnlockingScripts: true, includeOutputs: true, includeOutputLockingScripts: true, limit: 100 })
    for (const [id, request] of Object.entries(conditionalQueryCases)) await call(id, request.method, request.args)
    for (const length of [299, 300, 301, 399, 400, 401]) {
      const basket = conditionalBasket(length)
      await call(`basket-ascii-${length}`, 'createAction', { description: `TPNIL basket length ${length}`, outputs: [{ satoshis: 1, lockingScript: '51', basket, outputDescription: 'TPNIL basket boundary output' }], options: explicit })
      await call(`basket-query-${length}`, 'listOutputs', { basket, include: 'locking scripts' })
      await call(`basket-utf8-${length}`, 'listOutputs', { basket: conditionalBasket(length, true) })
    }
    const first = population[0]?.result, second = population[1]?.result, signingSource = population[fixtureRevision === 2 ? 2 : 0]?.result
    if (first?.tx && first.txid && second?.tx && second.txid && signingSource?.tx && signingSource.txid) {
      const sourceOutpoint = (value: any) => {
        const index = Transaction.fromAtomicBEEF(value.tx).outputs.findIndex(output => output.satoshis === config.satoshis && output.lockingScript.toHex() === config.lockingScript)
        if (index < 0) throw Error('Conditional fixture output absent')
        return `${value.txid}.${index}`
      }
      const firstOutpoint = sourceOutpoint(first), secondOutpoint = sourceOutpoint(second)
      const source = { outpoint: firstOutpoint, inputDescription: 'TPNIL conditional source', unlockingScriptLength: 1 }
      const base = { description: 'TPNIL conditional signing', inputBEEF: first.tx, inputs: [source], outputs: [{ satoshis: 1, lockingScript: '51', outputDescription: 'TPNIL conditional spend' }], options: { ...explicit, signAndProcess: false } }
      const control = await call('conflict-control', 'createAction', base)
      if (control.result?.signableTransaction?.reference) await call('conflict-control-abort', 'abortAction', { reference: control.result.signableTransaction.reference })
      const conflict = await call('conflicting-inputs', 'createAction', { ...base, inputs: [source, source] })
      if (conflict.result?.signableTransaction?.reference) await call('conflict-invalid-abort', 'abortAction', { reference: conflict.result.signableTransaction.reference })
      const omitted = new Beef(); omitted.mergeTxidOnly(first.txid)
      const trusted = await call('known-proof-omission', 'createAction', { ...base, inputBEEF: omitted.toBinary(), options: { ...base.options, trustSelf: 'known', knownTxids: [first.txid] } })
      if (trusted.result?.signableTransaction?.reference) await call('known-proof-abort', 'abortAction', { reference: trusted.result.signableTransaction.reference })
      const signing = fixtureRevision === 2 ? { ...base, inputBEEF: signingSource.tx, inputs: [{ ...source, outpoint: sourceOutpoint(signingSource) }] } : base
      const prepared = await call('signable', 'createAction', signing)
      if (prepared.result?.signableTransaction?.reference) await call('signed', 'signAction', { reference: prepared.result.signableTransaction.reference, spends: { 0: { unlockingScript: '51' } }, options: { acceptDelayedBroadcast: false } })
      const abort = await call('abort-prepare', 'createAction', { ...base, inputBEEF: second.tx, inputs: [{ ...source, outpoint: secondOutpoint }] })
      if (abort.result?.signableTransaction?.reference) await call('aborted', 'abortAction', { reference: abort.result.signableTransaction.reference })
      await call('after-abort', 'listOutputs', { basket: config.basket, limit: 100 })
      const held = await call('batch-held', 'createAction', { description: 'TPNIL conditional held batch', outputs: [{ satoshis: 1, lockingScript: '51', outputDescription: 'TPNIL conditional held output' }], options: { noSend: true, randomizeOutputs: false } })
      if (held.result?.txid) await call('batch-release', 'createAction', { description: 'TPNIL conditional batch release', options: { sendWith: [held.result.txid], acceptDelayedBroadcast: false } })
      issuer.setRevocationOutpoint(secondOutpoint)
      for (let index = 0; index < config.population; index++) {
        const cert = await issueFixtureCertificateForSubject(issuer.wallet, identity, config.fields, config.certificateType, async () => secondOutpoint, Buffer.alloc(32, 90 + index).toString('base64'))
        const plain = JSON.parse(JSON.stringify(cert)); report.certificates.push(plain)
        await call(`direct-${index}`, 'acquireCertificate', { ...plain, acquisitionProtocol: 'direct', keyringRevealer: 'certifier', keyringForSubject: plain.masterKeyring })
      }
      const certificate = report.certificates[0]
      const certArgs = { certifiers: [issuer.identity], types: [config.certificateType] }
      await call('certificates-default', 'listCertificates', certArgs)
      await call('certificates-page1', 'listCertificates', { ...certArgs, limit: 6, offset: 0 })
      await call('certificates-page2', 'listCertificates', { ...certArgs, limit: 6, offset: 6 })
      await call('certificates-other-type', 'listCertificates', { certifiers: [issuer.identity], types: [config.issuanceType], limit: 100 })
      const badBase = { ...certificate, serialNumber: Buffer.alloc(32, 120).toString('base64'), acquisitionProtocol: 'direct', keyringRevealer: 'certifier', keyringForSubject: certificate.masterKeyring }
      // Fresh valid signature for the negative controls; only one component changes.
      const validNegative = await issueFixtureCertificateForSubject(issuer.wallet, identity, config.fields, config.certificateType, async () => secondOutpoint, badBase.serialNumber)
      Object.assign(badBase, JSON.parse(JSON.stringify(validNegative)))
      badBase.keyringForSubject = badBase.masterKeyring
      const missing = { ...badBase }; delete missing.serialNumber
      await call('certificate-required-field', 'acquireCertificate', missing)
      for (const field of ['revocationOutpoint', 'signature', 'keyringRevealer', 'keyringForSubject']) { const args = { ...badBase }; delete args[field]; await call(`certificate-missing-${field}`, 'acquireCertificate', args) }
      await call('certificate-missing-field-key', 'acquireCertificate', { ...badBase, keyringForSubject: { name: badBase.keyringForSubject.name } })
      await call('certificate-bad-signature', 'acquireCertificate', { ...badBase, signature: '00'.repeat(70) })
      await call('certificate-bad-keyring', 'acquireCertificate', { ...badBase, keyringForSubject: { name: Buffer.alloc(32, 1).toString('base64'), private: badBase.masterKeyring.private } })
      await call('certificate-negative-control', 'acquireCertificate', badBase)
      const alternateCertificate = await issueFixtureCertificateForSubject(issuer.wallet, identity, config.fields, config.certificateType, async () => secondOutpoint, Buffer.alloc(32, 121).toString('base64'))
      const revealer = new ProtoWallet(PrivateKey.fromHex(config.revealerKeyHex)), alternateKeyring: Record<string, string> = {}
      for (const [field, wrapped] of Object.entries(alternateCertificate.masterKeyring)) {
        const details = Certificate.getCertificateFieldEncryptionDetails(field)
        const { plaintext } = await issuer.wallet.decrypt({ ciphertext: Utils.toArray(wrapped, 'base64'), ...details, counterparty: identity })
        const { ciphertext } = await revealer.encrypt({ plaintext, ...details, counterparty: identity })
        alternateKeyring[field] = Utils.toBase64(ciphertext)
      }
      const alternateArgs = { ...JSON.parse(JSON.stringify(alternateCertificate)), acquisitionProtocol: 'direct', keyringRevealer: (await revealer.getPublicKey({ identityKey: true })).publicKey, keyringForSubject: alternateKeyring }
      await call('certificate-wrong-revealer', 'acquireCertificate', { ...alternateArgs, keyringRevealer: 'certifier' })
      await call('certificate-alternate-revealer', 'acquireCertificate', alternateArgs)
      const verifier = PrivateKey.fromHex(config.verifierKeyHex).toPublicKey().toString()
      const proofCertificate = Object.fromEntries(['type', 'subject', 'serialNumber', 'certifier', 'revocationOutpoint', 'signature', 'fields'].map(key => [key, certificate[key]]))
      await call('certificate-proof', 'proveCertificate', { certificate: proofCertificate, fieldsToReveal: ['name'], verifier })
      await call('certificate-proof-all', 'proveCertificate', { certificate: proofCertificate, fieldsToReveal: ['name', 'private'], verifier })
      await call('certificate-proof-unknown-field', 'proveCertificate', { certificate: proofCertificate, fieldsToReveal: ['unknown'], verifier })
      await call('certificate-proof-alternate-verifier', 'proveCertificate', { certificate: proofCertificate, fieldsToReveal: ['name'], verifier: PrivateKey.fromHex(config.alternateVerifierKeyHex).toPublicKey().toString() })
      await call('certificate-relinquish', 'relinquishCertificate', { type: certificate.type, certifier: certificate.certifier, serialNumber: certificate.serialNumber })
      await call('certificates-after-relinquish', 'listCertificates', { ...certArgs, limit: 100 })
      const issuance = { type: config.issuanceType, certifier: issuer.identity, acquisitionProtocol: 'issuance', certifierUrl: config.issuerOrigin, fields: config.fields }
      const missingUrl: any = { ...issuance }; delete missingUrl.certifierUrl
      await call('issuance-missing-url', 'acquireCertificate', missingUrl)
      await call('issuance-valid', 'acquireCertificate', issuance)
      for (const mode of conditionalIssuanceModes.slice(1)) { issuer.setMode(mode); await call(`issuance-${mode}`, 'acquireCertificate', issuance) }
      await call('issuance-inventory', 'listCertificates', { certifiers: [issuer.identity], types: [config.issuanceType], limit: 100 })
    }
  } catch (error) { report.errors.push(error instanceof Error ? error.message : String(error)) }
  finally { unregister() }
  if (fixtureRevision === 2) {
    const txids = new Set(population.map(row => row.result?.txid).filter((txid): txid is string => typeof txid === 'string'))
    report.actionReferences = (await services.nativeActionReferences(identity)).filter(row => txids.has(row.txid))
  }
  report.issuer = { identity: issuer.identity, receipts: issuer.receipts, exchanges: issuer.exchanges, authMessages: issuer.authMessages }
  report.submissions = services.submissions.map((row, index) => ({ index, txid: row.txid, serializedHex: Buffer.from(row.bytes).toString('hex'), verdict: row.verdict }))
  const identities = new Set<string>()
  for (const row of report.trace) if (['createAction', 'signAction'].includes(row.method) && row.result?.txid && Array.isArray(row.result.tx) && !identities.has(row.result.txid)) {
    identities.add(row.result.txid); report.transactions.push({ role: `conditional/${row.id}`, txid: row.result.txid, atomicBeef: row.result.tx })
  }
  // JSON is the native public boundary and retained evidence format. SDK objects
  // may contain own undefined properties that are absent on that boundary.
  Object.assign(report, JSON.parse(JSON.stringify(report)))
  report.assertions = await deriveConditionalOutcomes(report)
  report.result = report.assertions.some(row => row.result === 'FAIL') ? 'FAIL' : report.assertions.some(row => row.result === 'BLOCKED') ? 'BLOCKED' : 'PASS'
  evidence.addJson('conformance/conditional.json', report)
  return report
}
