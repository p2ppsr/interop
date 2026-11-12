import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { Beef, Certificate, MasterCertificate, PrivateKey, ProtoWallet, PushDrop, Transaction, Utils, VerifiableCertificate, verifyNonce } from '@bsv/sdk'
import { canonicalJson } from '../../determinism.js'
import { verifySettingsTokenSignature } from './verify-identity-trust.js'
import { verifyPermissionCallNonces, verifyPermissionClick } from './permission-click.js'
import { observedSubmissionTransactions } from './verify-transaction-state-bindings.js'
import { certificateCoverageConfig as config, certificateCoveragePolicy as policy, certificateCoveragePolicySha256, certificateCoverageIds, type CertificateCoverageReport, type CertificateCoverageSubmission } from './coverage-certificates-model.js'
const funding = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../../../fixtures/teranode/wab-funding-v1.json'), 'utf8'))
const tracker = { currentHeight: async () => 900100, isValidRootForHeight: async (root: string, height: number) => root === funding.merkleRoot && height === funding.fundingHeight }
const fields = ['type', 'serialNumber', 'subject', 'certifier', 'revocationOutpoint', 'fields', 'signature']
const projection = (value: any) => Object.fromEntries(fields.map(field => [field, value?.[field]]))
const tuple = (value: any) => `${value.type}:${value.certifier}:${value.serialNumber}`
const sorted = (values: any[]) => values.map(projection).sort((a, b) => tuple(a).localeCompare(tuple(b)))
const certificate = (value: any) => new Certificate(value.type, value.serialNumber, value.subject, value.certifier, value.revocationOutpoint, value.fields, value.signature)
class Blocked extends Error {}
function strictAtomic(value: any, txid: string): Transaction {
  assert.ok(Array.isArray(value) && value.length > 0 && value.every(n => Number.isInteger(n) && n >= 0 && n <= 255), 'Invalid AtomicBEEF bytes')
  const reader = new Utils.Reader(value), beef = Beef.fromReader(reader); assert.equal(reader.eof(), true, 'Trailing AtomicBEEF bytes'); assert.equal(beef.atomicTxid, txid)
  const tx = Transaction.fromAtomicBEEF(value); assert.equal(tx.id('hex'), txid); return tx
}
const submissionTransaction = (row: CertificateCoverageSubmission) => { const bytes = [...Buffer.from(row.beefHex, 'hex')]; let tx: Transaction; try { tx = Transaction.fromAtomicBEEF(bytes) } catch { try { tx = Transaction.fromBEEF(bytes) } catch { tx = Transaction.fromHex(row.beefHex) } }; assert.equal(tx.id('hex'), row.txid); return tx }
const errorText = (value: any) => typeof value?.message === 'string' ? value.message : typeof value?.description === 'string' ? value.description : ''
const rejected = (row: any, pattern: RegExp) => {
  assert.equal(row.result, undefined); assert.ok(row.error && errorText(row.error)); assert.match(errorText(row.error), pattern)
  assert.doesNotMatch(errorText(row.error), /timed?\s*out|timeout|fetch failed|ECONN|Target closed|observer/i)
  assert.equal(row.submissionStart, row.submissionEnd)
}

export async function deriveCertificateCoverageOutcomes(report: CertificateCoverageReport, readEvidence?: (name: string) => Buffer) {
  report = JSON.parse(JSON.stringify(report, (_key, value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value))
  assert.equal(report.schema, 'tpnil-native-coverage-certificates@1.0.0'); assert.equal(report.oracle, policy.oracle); assert.equal(report.policySha256, certificateCoveragePolicySha256)
  assert.equal(report.claim, 'ENGINEERING_OBSERVATION_ONLY'); assert.equal(report.completeBRC100Conformance, false); assert.equal(report.finalLedgerRequired, true)
  assert.ok(report.trace.length <= policy.bounds.publicCalls); assert.equal(new Set(report.trace.map(row => row.id)).size, report.trace.length)
  const named = report.trace.filter(row => !/^helper-[1-9][0-9]*$/.test(row.id)).map(row => row.id)
  const expected = ['identity', 'baseline', 'revocation-setup', 'acquire-0', 'proof-0', 'acquire-1', 'proof-1', 'issuance-valid', 'before-wrong-auth', 'issuance-wrong-auth', 'after-wrong-auth', 'publication', 'inventory-before-restart', 'identity-after-restart', 'inventory-after-restart', 'proof-after-restart', 'valid-discoverByIdentityKey', 'valid-discoverByAttributes', 'bad-signature-discoverByIdentityKey', 'bad-signature-discoverByAttributes', 'bad-keyring-discoverByIdentityKey', 'bad-keyring-discoverByAttributes', 'attribute-no-match', 'revoke', 'relinquish-revoked', 'after-relinquishment']
  const cleanup = named.findIndex(id => id.startsWith('cleanup-') || id === 'after-cleanup')
  assert.ok(cleanup >= 0); assert.deepEqual(named.slice(0, cleanup), expected.slice(0, cleanup), 'Certificate named public-call order differs')
  assert.deepEqual(named.slice(cleanup), [...report.fixtures.map((_value, index) => `cleanup-${index}`), ...(report.trace.find(row => row.id === 'issuance-valid')?.result ? ['cleanup-issued'] : []), 'after-cleanup'])
  assert.ok(report.trace.filter(row => row.id.startsWith('helper-')).every(row => ['getPublicKey', 'createSignature', 'encrypt', 'decrypt', 'listOutputs', 'createAction', 'signAction', 'abortAction'].includes(row.method)), 'Unexpected helper method')
  assert.equal(report.submissionPrefix.length, report.submissionStart); assert.equal(report.submissions.length, report.submissionEnd - report.submissionStart)
  assert.equal(report.routes.length, report.routeEnd - report.routeStart)
  for (const row of report.trace) {
    assert.ok(!(Object.hasOwn(row, 'result') && Object.hasOwn(row, 'error')), 'Contradictory certificate call result/error')
    assert.ok(row.submissionStart >= report.submissionStart && row.submissionEnd >= row.submissionStart && row.submissionEnd <= report.submissionEnd)
    assert.ok(row.routeStart >= report.routeStart && row.routeEnd >= row.routeStart && row.routeEnd <= report.routeEnd)
    assert.ok(Date.parse(row.startedAt) <= Date.parse(row.endedAt))
  }
  const row = (id: string) => { const value = report.trace.find(value => value.id === id); assert.ok(value, `Missing public call ${id}`); return value }
  const returned = (id: string) => { const value = row(id); assert.equal(value.error, undefined); assert.ok(value.result, `Missing result ${id}`); return value.result }
  const args = (id: string, method: string, value: any) => { assert.equal(row(id).method, method); assert.deepEqual(row(id).args, value) }
  const inventory = (id: string) => {
    args(id, 'listCertificates', { certifiers: [], types: [], limit: 10000 })
    const result = returned(id); assert.ok(Array.isArray(result.certificates) && result.certificates.length < 10000)
    assert.equal(result.totalCertificates, result.certificates.length); assert.equal(new Set(result.certificates.map(tuple)).size, result.certificates.length)
    return result.certificates as any[]
  }
  const tx = async (id: string) => {
    const value = returned(id); const parsed = strictAtomic(value.tx, value.txid)
    assert.equal(parsed.id('hex'), value.txid); assert.ok(await parsed.verify(tracker), `Invalid transaction ${id}`)
    const submissions = report.submissions.slice(row(id).submissionStart - report.submissionStart, row(id).submissionEnd - report.submissionStart)
    assert.ok(submissions.some(value => value.txid === parsed.id('hex') && value.verdict === 'ACCEPTED_BY_NETWORK' && submissionTransaction(value).toHex() === parsed.toHex()), `No scoped accepted submission ${id}`)
    return parsed
  }
  const issuance = async (index: number) => {
    const item = report.issuer[index]; assert.ok(item); const signer = new ProtoWallet(PrivateKey.fromHex(config.issuerKeys[0]))
    const transport = new ProtoWallet(PrivateKey.fromHex(index === 0 ? config.issuerKeys[0] : config.transportKey))
    assert.equal(item.identity, (await signer.getPublicKey({ identityKey: true })).publicKey); assert.equal(item.transportIdentity, (await transport.getPublicKey({ identityKey: true })).publicKey)
    assert.equal(item.receipts.length, 1); const receipt = item.receipts[0]
    assert.equal(receipt.mode, 'valid'); assert.equal(receipt.authenticatedSubject, report.identity); assert.equal(receipt.request.type, config.issuanceType)
    assert.equal(Buffer.from(receipt.requestId, 'base64').length, 32)
    assert.deepEqual(await MasterCertificate.decryptFields(signer, receipt.request.masterKeyring, receipt.request.fields, report.identity), config.fields)
    assert.deepEqual(receipt.decryptedFields, config.fields); assert.ok(await verifyNonce(receipt.request.clientNonce, signer as any, report.identity)); assert.ok(await verifyNonce(receipt.response.serverNonce, signer as any, report.identity))
    const c = receipt.response.certificate
    assert.equal(c.certifier, item.identity); assert.equal(c.subject, report.identity); assert.equal(c.type, config.issuanceType); assert.equal(c.revocationOutpoint, `${returned('revocation-setup').txid}.0`); assert.deepEqual(c.fields, receipt.request.fields); assert.ok(await certificate(c).verify())
    assert.equal((await signer.verifyHmac({ protocolID: [2, 'certificate issuance'], keyID: receipt.response.serverNonce + receipt.request.clientNonce, data: Utils.toArray(receipt.request.clientNonce + receipt.response.serverNonce, 'base64'), hmac: Utils.toArray(c.serialNumber, 'base64'), counterparty: report.identity })).valid, true)
    const messages = item.authMessages.filter((r: any) => r.message.messageType === 'general' && Utils.toBase64(r.message.payload.slice(0, 32)) === receipt.requestId)
    assert.equal(messages.length, 2)
    for (const direction of ['incoming', 'outgoing']) {
      const entry = messages.find((r: any) => r.direction === direction); assert.ok(entry); const m = entry.message
      assert.equal(m.identityKey, direction === 'incoming' ? report.identity : item.transportIdentity)
      assert.equal((await transport.verifySignature({ protocolID: [2, 'auth message signature'], keyID: `${m.nonce} ${m.yourNonce}`, counterparty: report.identity, forSelf: direction === 'outgoing', data: m.payload, signature: m.signature })).valid, true)
      const reader = new Utils.Reader(m.payload); assert.equal(Utils.toBase64(reader.read(32)), receipt.requestId)
      const text = () => { const length = reader.readVarIntNum(); return length > 0 ? Utils.toUTF8(reader.read(length)) : '' }
      if (direction === 'incoming') {
        assert.equal(text(), 'POST'); assert.equal(text(), '/certificate-coverage/signCertificate'); assert.equal(text(), '')
        const count = reader.readVarIntNum(); for (let i = 0; i < count; i++) { text(); text() }; assert.deepEqual(JSON.parse(text()), receipt.request)
      } else { assert.equal(reader.readVarIntNum(), 200); assert.equal(reader.readVarIntNum(), 0); assert.deepEqual(JSON.parse(text()), receipt.response) }
      assert.equal(reader.eof(), true)
    }
    return c
  }
  const trust = async () => {
    const expected = structuredClone(report.settings.original)
    assert.ok(expected && !expected.trustSettings.trustedCertifiers.some((r: any) => report.fixtures.some(c => c.certifier === r.identityKey)))
    expected.trustSettings.trustedCertifiers.push(...report.fixtures.map((c, index) => ({ identityKey: c.certifier, name: `TPNIL additional issuer ${index}`, description: 'Temporary certificate coverage issuer', trust: index === 0 ? 4 : 3 })))
    assert.deepEqual(report.settings.temporary, expected); assert.deepEqual(report.settings.readback, expected)
    const outputs = report.settings.temporaryOutputs; assert.equal(outputs.totalOutputs, 1); assert.equal(outputs.outputs.length, 1)
    assert.ok(report.trace.some(r => r.method === 'listOutputs' && r.args.basket === 'wallet settings' && canonicalJson(r.result) === canonicalJson(outputs)))
    const [id, index] = outputs.outputs[0].outpoint.split('.'), parsed = Transaction.fromAtomicBEEF(Beef.fromBinary(outputs.BEEF).toBinaryAtomic(id)); assert.equal(parsed.id('hex'), id); assert.ok(await parsed.verify(tracker))
    const decoded = verifySettingsTokenSignature(parsed.outputs[Number(index)]!.lockingScript)
    const context = (r: any) => canonicalJson(r.args.protocolID ?? null) === canonicalJson([2, 'wallet settings']) && r.args.keyID === 'settings'
    const sign = report.trace.find(r => r.method === 'createSignature' && context(r) && r.args.counterparty === 'self' && canonicalJson(r.args.data) === canonicalJson(decoded.fields[0]) && canonicalJson(r.result?.signature) === canonicalJson(decoded.fields[1])); assert.ok(sign)
    const key = report.trace.find(r => r.method === 'getPublicKey' && context(r) && r.args.counterparty === 'self' && r.args.forSelf === false && r.result?.publicKey === decoded.lockingPublicKey.toString()); assert.ok(key)
    const write = report.trace.find(r => ['createAction', 'signAction'].includes(r.method) && r.result?.txid === id && Array.isArray(r.result?.tx) && Transaction.fromAtomicBEEF(r.result.tx).toHex() === parsed.toHex()); assert.ok(write)
    const decrypt = report.trace.find(r => r.method === 'decrypt' && context(r) && [undefined, 'self'].includes(r.args.counterparty) && canonicalJson(r.args.ciphertext) === canonicalJson(decoded.fields[0]) && (() => { try { return canonicalJson(JSON.parse(Buffer.from(r.result?.plaintext ?? []).toString())) === canonicalJson(expected) } catch { return false } })()); assert.ok(decrypt)
    assert.ok(report.trace.indexOf(key) < report.trace.indexOf(sign) && report.trace.indexOf(sign) < report.trace.indexOf(write) && report.trace.indexOf(write) < report.trace.indexOf(decrypt))
    assert.ok(report.restart && report.restart.beforeCall > report.trace.indexOf(decrypt))
  }
  const settingsSnapshot = async (name: 'original' | 'restored') => {
    const outputs = report.settings[`${name}Outputs`], settings = report.settings[name]
    assert.ok(outputs && Array.isArray(outputs.outputs)); assert.equal(outputs.totalOutputs, outputs.outputs.length); assert.ok(outputs.totalOutputs <= 1)
    const read = report.trace.find(r => r.method === 'listOutputs' && r.args.basket === 'wallet settings' && canonicalJson(r.result ?? null) === canonicalJson(outputs)); assert.ok(read, 'Settings snapshot has no exact public listOutputs response')
    if (outputs.totalOutputs === 0) { assert.deepEqual(outputs.outputs, []); assert.equal(Beef.fromBinary(outputs.BEEF).txs.length, 0); return }
    const [id, index] = outputs.outputs[0].outpoint.split('.'), t = Transaction.fromAtomicBEEF(Beef.fromBinary(outputs.BEEF).toBinaryAtomic(id)); assert.equal(t.id('hex'), id); assert.ok(await t.verify(tracker))
    const decoded = verifySettingsTokenSignature(t.outputs[Number(index)]!.lockingScript)
    const decrypt = report.trace.find(r => {
      if (r.method !== 'decrypt' || r.error || canonicalJson(r.args.protocolID ?? null) !== canonicalJson([2, 'wallet settings']) || r.args.keyID !== 'settings' || ![undefined, 'self'].includes(r.args.counterparty) || canonicalJson(r.args.ciphertext) !== canonicalJson(decoded.fields[0])) return false
      try { return canonicalJson(JSON.parse(Buffer.from(r.result?.plaintext ?? []).toString())) === canonicalJson(settings) } catch { return false }
    }); assert.ok(decrypt, 'Signed settings token has no matching public plaintext decryption')
    if (name === 'restored') {
      const write = report.trace.find(r => ['createAction', 'signAction'].includes(r.method) && r.result?.txid === id && strictAtomic(r.result.tx, id).toHex() === t.toHex()); assert.ok(write)
      assert.ok(report.trace.indexOf(write) < report.trace.indexOf(decrypt)); assert.ok(report.trace.indexOf(write) > report.trace.findIndex(r => r.id === 'after-cleanup'))
    }
  }
  const discoveryArgs = (method: string) => method === 'discoverByIdentityKey' ? { identityKey: report.identity } : { attributes: { name: config.fields.name } }
  const discovered = async (value: any, expectedIndices = [0, 1]) => {
    assert.equal(value.totalCertificates, expectedIndices.length); assert.equal(value.certificates.length, expectedIndices.length)
    assert.equal(new Set(value.certificates.map(tuple)).size, expectedIndices.length)
    for (const index of expectedIndices) {
      const expected = report.publicCertificates[index], found = value.certificates.find((c: any) => tuple(c) === tuple(expected)); assert.ok(found)
      assert.deepEqual(projection(found), projection(expected)); assert.deepEqual(found.publiclyRevealedKeyring, expected.keyring); assert.deepEqual(found.decryptedFields, { name: config.fields.name })
      const c = VerifiableCertificate.fromCertificate(found, found.publiclyRevealedKeyring); assert.ok(await c.verify()); assert.deepEqual(await c.decryptFields(new ProtoWallet('anyone')), { name: config.fields.name })
      assert.equal(found.certifierInfo.name, `TPNIL additional issuer ${index}`); assert.equal(found.certifierInfo.description, 'Temporary certificate coverage issuer'); assert.equal(found.certifierInfo.trust, index === 0 ? 4 : 3)
    }
  }
  const lookup = (id: string, mode: string, method: string, absent = false) => {
    const rows = report.lookup.filter(r => r.callId === id && r.question.service === 'ls_identity'); assert.ok(rows.length > 0, `Missing actual lookup ${id}`)
    for (const item of rows) {
      const expectedQuery = method === 'discoverByIdentityKey' ? { identityKey: report.identity } : { attributes: { name: absent ? config.absentName : config.fields.name } }
      assert.deepEqual(item.question.query, { ...expectedQuery, certifiers: report.settings.temporary.trustSettings.trustedCertifiers.map((c: any) => c.identityKey).sort() })
      assert.equal(item.answer.type, 'output-list')
      const expectedIndices = absent ? [] : mode === 'bad-signature' ? [0, 1, 2] : mode === 'bad-keyring' ? [0, 1, 3] : [0, 1]
      assert.deepEqual(item.answer.outputs.map((o: any) => o.outputIndex).sort(), expectedIndices)
      for (const output of item.answer.outputs) { const t = Transaction.fromBEEF(output.beef); assert.equal(t.id('hex'), returned('publication').txid); assert.equal(t.toHex(), Transaction.fromAtomicBEEF(returned('publication').tx).toHex()) }
    }
  }
  const checks: Record<string, () => Promise<void>> = {
    'fixture-authentication': async () => {
      args('identity', 'getPublicKey', { identityKey: true }); assert.equal(returned('identity').publicKey, report.identity)
      const setup = await tx('revocation-setup'); assert.equal(setup.outputs[0]?.satoshis, config.satoshis); assert.equal(setup.outputs[0]?.lockingScript.toHex(), config.script)
      assert.equal(report.fixtures.length, 2); assert.equal(report.publicCertificates.length, 4)
      for (const [index, c] of report.fixtures.entries()) {
        assert.equal(c.type, config.type); assert.equal(c.serialNumber, config.serials[index]); assert.equal(c.subject, report.identity); assert.equal(c.revocationOutpoint, `${setup.id('hex')}.0`)
        const issuer = new ProtoWallet(PrivateKey.fromHex(config.issuerKeys[index]!)); assert.equal(c.certifier, (await issuer.getPublicKey({ identityKey: true })).publicKey)
        assert.ok(await certificate(c).verify()); assert.deepEqual(await MasterCertificate.decryptFields(issuer, c.masterKeyring, c.fields, report.identity), config.fields)
        args(`acquire-${index}`, 'acquireCertificate', { ...c, acquisitionProtocol: 'direct', keyringRevealer: 'certifier', keyringForSubject: c.masterKeyring }); assert.deepEqual(projection(returned(`acquire-${index}`)), projection(c))
        args(`proof-${index}`, 'proveCertificate', { certificate: { type: c.type, serialNumber: c.serialNumber, certifier: c.certifier }, verifier: config.anyone, fieldsToReveal: ['name'] })
        const keyring = returned(`proof-${index}`).keyringForVerifier; assert.deepEqual(Object.keys(keyring), ['name']); assert.deepEqual(report.publicCertificates[index].keyring, keyring)
        assert.deepEqual(projection(report.publicCertificates[index]), projection(c)); assert.deepEqual(await VerifiableCertificate.fromCertificate(c, keyring).decryptFields(new ProtoWallet('anyone')), { name: config.fields.name })
      }
      assert.deepEqual(report.publicCertificates[2], { ...report.publicCertificates[0], signature: '00'.repeat(70) })
      assert.deepEqual(report.publicCertificates[3], { ...report.publicCertificates[1], keyring: { name: Buffer.alloc(32, 1).toString('base64') } })
      let invalid = false; try { invalid = !(await certificate(report.publicCertificates[2]).verify()) } catch { invalid = true }; assert.equal(invalid, true)
      await assert.rejects(() => VerifiableCertificate.fromCertificate(report.publicCertificates[3], report.publicCertificates[3].keyring).decryptFields(new ProtoWallet('anyone')))
      const published = await tx('publication')
      for (const [index, c] of report.publicCertificates.entries()) {
        const decoded = PushDrop.decode(published.outputs[index]!.lockingScript); assert.equal(decoded.fields.length, 2); assert.equal(published.outputs[index]!.satoshis, 1)
        assert.deepEqual(JSON.parse(Utils.toUTF8(decoded.fields[0]!)), c)
        assert.equal((await new ProtoWallet('anyone').verifySignature({ data: decoded.fields[0]!, signature: decoded.fields[1]!, counterparty: report.identity, protocolID: [1, 'identity'], keyID: '1' })).valid, true)
      }
      const advertisement = PushDrop.decode(published.outputs[4]!.lockingScript); assert.equal(advertisement.fields.length, 5); assert.deepEqual(advertisement.fields.slice(0, 4), [Utils.toArray('SLAP', 'utf8'), Utils.toArray(report.identity, 'hex'), Utils.toArray('https://overlay.itcve.test', 'utf8'), Utils.toArray('ls_identity', 'utf8')]); const anyone = new ProtoWallet('anyone'); assert.equal((await anyone.verifySignature({ data: advertisement.fields.slice(0, 4).flat(), signature: advertisement.fields[4]!, counterparty: report.identity, protocolID: [2, 'service lookup availability'], keyID: '1' })).valid, true); assert.equal((await anyone.getPublicKey({ counterparty: report.identity, protocolID: [2, 'service lookup availability'], keyID: '1' })).publicKey, advertisement.lockingPublicKey.toString())
      assert.deepEqual(report.publication.receipt.tm_identity.outputsToAdmit, [0, 1]); assert.deepEqual(report.publication.receipt.tm_slap.outputsToAdmit, [4])
      assert.equal(report.publication.answer.type, 'output-list'); assert.deepEqual(report.publication.answer.outputs.map((o: any) => o.outputIndex).sort(), [0, 1])
      for (const output of report.publication.answer.outputs) assert.equal(Transaction.fromBEEF(output.beef).toHex(), published.toHex())
      const issued = await issuance(0); assert.deepEqual(projection(returned('issuance-valid')), projection(issued)); await settingsSnapshot('original')
      assert.deepEqual(sorted(inventory('before-wrong-auth')), sorted([...inventory('baseline'), ...report.fixtures, issued])); await trust()
    },
    'wrong-auth-identity': async () => {
      const item = report.issuer[1]
      if (item?.receipts.length === 0) {
        // A correct wallet may stop after authenticating the wrong server,
        // before sending any issuance payload. Authenticate that earlier stop.
        const transport = new ProtoWallet(PrivateKey.fromHex(config.transportKey)); assert.equal(item.transportIdentity, (await transport.getPublicKey({ identityKey: true })).publicKey)
        assert.equal(item.authMessages.length, 2); const request = item.authMessages[0], response = item.authMessages[1]
        assert.equal(request.direction, 'incoming'); assert.equal(request.message.messageType, 'initialRequest'); assert.equal(request.message.identityKey, report.identity)
        assert.equal(response.direction, 'outgoing'); const message = response.message; assert.equal(message.messageType, 'initialResponse'); assert.equal(message.identityKey, item.transportIdentity); assert.equal(message.yourNonce, request.message.initialNonce)
        assert.ok(await verifyNonce(message.initialNonce, transport as any)); assert.equal((await transport.verifySignature({ protocolID: [2, 'auth message signature'], keyID: `${message.yourNonce} ${message.initialNonce}`, counterparty: report.identity, forSelf: true, data: [...Utils.toArray(message.yourNonce, 'base64'), ...Utils.toArray(message.initialNonce, 'base64')], signature: message.signature })).valid, true)
        assert.ok(item.exchanges.length > 0 && item.exchanges.every((exchange: any) => exchange.path === '/.well-known/auth' && exchange.authenticated && !exchange.error))
        assert.ok(errorText(row('issuance-wrong-auth').error).includes(item.transportIdentity), 'Early authentication rejection must identify the wrong authenticated server')
      } else await issuance(1)
      assert.notEqual(report.issuer[0].transportIdentity, report.issuer[1].transportIdentity)
      const expected = { type: config.issuanceType, certifier: report.fixtures[0].certifier, acquisitionProtocol: 'issuance', certifierUrl: config.issuerUrl, fields: config.fields }
      args('issuance-valid', 'acquireCertificate', expected); args('issuance-wrong-auth', 'acquireCertificate', expected)
      rejected(row('issuance-wrong-auth'), /Invalid certifier|authenticated.*identity|identity.*mismatch/i)
      assert.deepEqual(sorted(inventory('after-wrong-auth')), sorted(inventory('before-wrong-auth')))
    },
    'inventory-restart': async () => {
      assert.deepEqual(sorted(inventory('inventory-before-restart')), sorted(inventory('before-wrong-auth')))
      assert.deepEqual(sorted(inventory('inventory-after-restart')), sorted(inventory('inventory-before-restart')))
      args('identity-after-restart', 'getPublicKey', { identityKey: true }); assert.equal(returned('identity-after-restart').publicKey, report.identity)
      args('proof-after-restart', 'proveCertificate', row('proof-0').args); const keyring = returned('proof-after-restart').keyringForVerifier; assert.deepEqual(Object.keys(keyring), ['name']); assert.deepEqual(await VerifiableCertificate.fromCertificate(report.fixtures[0], keyring).decryptFields(new ProtoWallet('anyone')), { name: config.fields.name })
      if (report.restart?.kind !== 'NATIVE_BROWSER_RESTART') throw new Blocked('A real native same-profile browser restart and unlock receipt is required; reference client reopen is not native evidence.')
      const r = report.restart.receipt; assert.equal(r.schema, 'tpnil-native-browser-restart@1'); assert.equal(r.identity, report.identity); assert.equal(r.oldPagesClosed, true); assert.ok(r.oldPageCount > 0); assert.match(r.profileBinding, /^[a-f0-9]{64}$/)
      for (const [a, b] of [['startedAt', 'closedAt'], ['closedAt', 'openedAt'], ['openedAt', 'unlockedAt'], ['unlockedAt', 'endedAt']]) assert.ok(Date.parse(r[a!]) <= Date.parse(r[b!]))
      assert.ok(Date.parse(row('inventory-before-restart').endedAt) <= Date.parse(r.startedAt) && Date.parse(r.endedAt) <= Date.parse(row('identity-after-restart').startedAt))
    },
    'relinquish-revoked': async () => {
      const setup = await tx('revocation-setup'), revoked = await tx('revoke'), outpoint = `${setup.id('hex')}.0`
      args('revoke', 'createAction', { description: 'Spend certificate revocation token', inputBEEF: returned('revocation-setup').tx, inputs: [{ outpoint, unlockingScript: '51', inputDescription: 'Revoke certificate coverage pair' }], outputs: [{ satoshis: 1, lockingScript: '51', outputDescription: 'Certificate revocation receipt' }], options: { randomizeOutputs: false, acceptDelayedBroadcast: false } })
      assert.equal(revoked.inputs[0]?.sourceTXID, setup.id('hex')); assert.equal(revoked.inputs[0]?.sourceOutputIndex, 0); assert.equal(revoked.inputs[0]?.unlockingScript?.toHex(), '51'); assert.equal(revoked.outputs[0]?.satoshis, 1); assert.equal(revoked.outputs[0]?.lockingScript.toHex(), '51')
      args('relinquish-revoked', 'relinquishCertificate', { type: config.type, serialNumber: config.serials[0], certifier: report.fixtures[0].certifier }); assert.deepEqual(returned('relinquish-revoked'), { relinquished: true })
      assert.ok(report.trace.indexOf(row('revoke')) < report.trace.indexOf(row('relinquish-revoked')))
      assert.deepEqual(sorted(inventory('after-relinquishment')), sorted(inventory('before-wrong-auth').filter(c => tuple(c) !== tuple(report.fixtures[0]))))
    },
    'attribute-no-match': async () => { args('attribute-no-match', 'discoverByAttributes', { attributes: { name: config.absentName }, seekPermission: true, forceRefresh: true }); lookup('attribute-no-match', 'valid', 'discoverByAttributes', true); await discovered(returned('attribute-no-match'), []) },
    'multiple-certifiers': async () => { for (const method of ['discoverByIdentityKey', 'discoverByAttributes']) { const id = `valid-${method}`; args(id, method, { ...discoveryArgs(method), seekPermission: true, forceRefresh: true }); lookup(id, 'valid', method); await discovered(returned(id)) } },
    'bad-signature': async () => { for (const method of ['discoverByIdentityKey', 'discoverByAttributes']) { const id = `bad-signature-${method}`; args(id, method, { ...discoveryArgs(method), seekPermission: true, forceRefresh: true }); lookup(id, 'bad-signature', method); await discovered(returned(id)) } },
    'bad-keyring': async () => { for (const method of ['discoverByIdentityKey', 'discoverByAttributes']) { const id = `bad-keyring-${method}`; args(id, method, { ...discoveryArgs(method), seekPermission: true, forceRefresh: true }); lookup(id, 'bad-keyring', method); await discovered(returned(id)) } },
    'default-seekPermission-false': async () => { await permissions(false) },
    'explicit-seekPermission-true': async () => { await permissions(true) },
    'cleanup': async () => {
      assert.equal(report.routeClosed, true); assert.equal(report.lookupClosed, true); assert.deepEqual(sorted(inventory('after-cleanup')), sorted(inventory('baseline')))
      await settingsSnapshot('restored')
      assert.deepEqual(report.settings.restored, report.settings.original); assert.equal(report.settings.restoredOutputs.totalOutputs, report.settings.originalOutputs.totalOutputs)
      const temporary = report.settings.temporaryOutputs.outputs[0].outpoint, [id, index] = temporary.split('.')
      assert.ok(!report.settings.restoredOutputs.outputs.some((o: any) => o.outpoint === temporary))
      const retirement = report.trace.filter(r => ['createAction', 'signAction'].includes(r.method) && r.result?.tx).map(r => Transaction.fromAtomicBEEF(r.result.tx)).find(t => t.inputs.some(i => i.sourceTXID === id && i.sourceOutputIndex === Number(index)))
      assert.ok(retirement && await retirement.verify(tracker), 'Temporary trust token has no valid public retirement transaction')
      assert.equal(report.errors.length, 0)
    }
  }
  async function permissions(explicit: boolean) {
    if (report.permissionSteps.length === 0) throw new Blocked('Real fresh-origin native CWI and trusted UI observations are required.')
    assert.equal(report.permissionSteps.length, 8); verifyPermissionCallNonces(report.permissionSteps)
    for (let index = 0; index < 2; index++) {
      const method = index === 0 ? 'discoverByIdentityKey' : 'discoverByAttributes'
      for (const phase of ['omitted', 'false', 'deny', 'allow']) {
        const step = report.permissionSteps.find(s => s.id === `permission-${index}-${phase}`); assert.ok(step)
        assert.equal(step.method, method); assert.equal(step.origin, config.origins[index]); assert.equal(new URL(step.pageUrl).origin, config.origins[index])
        assert.deepEqual(step.args, { ...discoveryArgs(method), forceRefresh: true, ...(phase === 'omitted' ? {} : { seekPermission: phase !== 'false' }) })
        assert.ok(['rejected', 'fulfilled'].includes(step.outcome.status))
        if (step.outcome.status === 'fulfilled') assert.equal(step.outcome.error, undefined)
        else assert.equal(step.outcome.value, undefined)
        if (phase === 'deny' || phase === 'allow') {
          assert.equal(step.prompts.length, 1); const p = step.prompts[0]!
          assert.ok(report.extensionId && p.url.startsWith(`chrome-extension://${report.extensionId}/prompt.html`)); assert.equal(p.decision, phase); assert.equal(p.pendingBeforeDecision, true)
          assert.ok(p.body.includes(new URL(config.origins[index]!).host) && /identity resolution/i.test(p.body)); verifyPermissionClick(p.trustedClick, p, step)
          assert.ok(readEvidence, 'Native permission screenshots must be independently supplied')
          const bytes = readEvidence(p.screenshot.name); assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a'); assert.equal(bytes.length, p.screenshot.size); assert.equal(createHash('sha256').update(bytes).digest('hex'), p.screenshot.sha256)
          if (phase === 'allow') { assert.equal(step.outcome.status, 'fulfilled'); await discovered(step.outcome.value) }
          else { assert.equal(step.outcome.status, 'rejected'); assert.match(errorText(step.outcome.error), /denied|not granted|unauthoriz/i) }
        } else if (!explicit) { assert.equal(step.prompts.length, 0); assert.equal(step.outcome.status, 'rejected'); assert.match(errorText(step.outcome.error), /permission|denied|unauthoriz/i) }
      }
    }
  }
  const assertions: CertificateCoverageReport['assertions'] = []; let fixturesReady = false
  for (const id of policy.assertions as string[]) {
    try {
      if (id !== 'fixture-authentication' && id !== 'cleanup' && !fixturesReady) throw new Blocked('Mandatory independently authenticated fixture failed; no dependent conformance claim.')
      await checks[id]!(); if (id === 'fixture-authentication') fixturesReady = true
      assertions.push({ id: `coverage-certificates.${id}`, result: 'PASS', detail: 'Fixed public calls and independently authenticated certificate coverage agree.' })
    } catch (error) { assertions.push({ id: `coverage-certificates.${id}`, result: error instanceof Blocked ? 'BLOCKED' : 'FAIL', detail: error instanceof Error ? error.message : String(error) }) }
  }
  return assertions
}

export async function verifyCertificateCoverage(report: CertificateCoverageReport, readEvidence?: (name: string) => Buffer) {
  assert.deepEqual(report.assertions.map(row => row.id), certificateCoverageIds)
  const assertions = await deriveCertificateCoverageOutcomes(report, readEvidence); assert.deepEqual(report.assertions, assertions)
  const result = assertions.some(r => r.result === 'FAIL') ? 'FAIL' : assertions.some(r => r.result === 'BLOCKED') ? 'BLOCKED' : 'PASS'; assert.equal(report.result, result)
  return { verified: true, assertions, result, counts: { PASS: assertions.filter(r => r.result === 'PASS').length, FAIL: assertions.filter(r => r.result === 'FAIL').length, BLOCKED: assertions.filter(r => r.result === 'BLOCKED').length } }
}

export async function verifyCertificateCoverageParentBindings(report: CertificateCoverageReport, binding: {
  identity: string; globalRoutes: any[]; globalSubmissions: CertificateCoverageSubmission[]; finalSubmissions: CertificateCoverageSubmission[];
  browserContexts: any[]; storageTransactions: Map<string, Transaction>; resolvedTransactions: Map<string, Transaction>;
  trustedMinedRoot: { txid: string; rawHex: string }; readEvidence?: (name: string) => Buffer
}) {
  await verifyCertificateCoverage(report, binding.readEvidence); assert.equal(report.identity, binding.identity)
  assert.deepEqual(report.submissionPrefix, binding.globalSubmissions.slice(0, report.submissionStart)); assert.deepEqual(report.submissions, binding.globalSubmissions.slice(report.submissionStart, report.submissionEnd))
  assert.deepEqual(report.routes, binding.globalRoutes.slice(report.routeStart, report.routeEnd)); assert.deepEqual(binding.finalSubmissions.slice(0, binding.globalSubmissions.length), binding.globalSubmissions)
  const issuerRoutes = (rows: any[]) => rows.filter(r => r.host === 'certifier.itcve.test' && r.pathname.startsWith('/certificate-coverage'))
  assert.deepEqual(issuerRoutes(binding.globalRoutes), issuerRoutes(report.routes), 'Certificate issuance route omitted or outside declared window')
  if (report.restart?.kind === 'NATIVE_BROWSER_RESTART') {
    const receipt = report.restart.receipt
    const index = binding.browserContexts.findIndex(row => canonicalJson(row.restart ?? null) === canonicalJson(receipt))
    assert.ok(index > 0, 'Native restart receipt is absent from the full browser chain')
    assert.equal(receipt.sequence, index); assert.equal(receipt.profileBinding, binding.browserContexts[0].profileBinding)
    assert.equal(binding.browserContexts[index - 1].closedAt, receipt.closedAt); assert.equal(binding.browserContexts[index].openedAt, receipt.openedAt)
  }
  const transactions = report.trace.filter(r => ['createAction', 'signAction'].includes(r.method) && Array.isArray(r.result?.tx)).map(r => ({ row: r, tx: strictAtomic(r.result.tx, r.result.txid) }))
  assert.ok(new Set(transactions.map(r => r.tx.id('hex'))).size <= policy.bounds.signedTransactions)
  for (const { row, tx } of transactions) { assert.equal(tx.id('hex'), row.result.txid); assert.equal(binding.storageTransactions.get(tx.id('hex'))?.toHex(), tx.toHex()); assert.ok(await tx.verify(tracker)) }
  const approved = new Map(transactions.map(value => [value.tx.id('hex'), value]))
  const setup = transactions.find(r => r.row.id === 'revocation-setup')?.tx, revoke = transactions.find(r => r.row.id === 'revoke')?.tx
  for (let index = report.submissionStart; index < binding.finalSubmissions.length; index++) {
    const entries = observedSubmissionTransactions(binding.finalSubmissions[index]!, { resolvedTransactions: binding.resolvedTransactions, requireResolvedAncestors: true, trustedMinedRoot: binding.trustedMinedRoot })
    if (index < report.submissionEnd) { const target = entries[0]!.transaction, accepted = approved.get(target.id('hex')); assert.ok(accepted, 'Undeclared certificate-module submission'); assert.equal(target.toHex(), accepted.tx.toHex()); assert.ok(index >= accepted.row.submissionStart && index < accepted.row.submissionEnd) }
    for (const entry of entries) if (setup && entry.transaction.inputs.some(input => input.sourceTXID === setup.id('hex') && input.sourceOutputIndex === 0)) {
      assert.ok(revoke && entry.transaction.id('hex') === revoke.id('hex') && entry.transaction.toHex() === revoke.toHex(), 'Unapproved revocation-token spend in final reachable ledger')
      if (entry.isTarget) { const call = report.trace.find(r => r.id === 'revoke')!; assert.ok(index >= call.submissionStart && index < call.submissionEnd, 'Revocation target replayed after its scoped call') }
    }
  }
  return { verified: true, finalLedgerChecked: true }
}
