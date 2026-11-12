import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { WalletSettingsManager } from '@bsv/wallet-toolbox'
import { Beef, PrivateKey, ProtoWallet, Transaction, VerifiableCertificate } from '@bsv/sdk'
import { canonicalJson } from '../../determinism.js'
import { getIdentityTrustOracle2Policy, type IdentityTrustOracleOptions } from './identity-trust-oracle2.js'

export const trustAssertionIds = ['initial-exclusion', 'public-settings-token', 'cache-expiry', 'positive-discovery', 'settings-restored', 'temporary-token-spent', 'public-boundary-only', 'cleanup'].map(id => `identity-trust.${id}`)
const issuer = PrivateKey.fromHex('36'.repeat(32)).toPublicKey().toString()
const isFixture = (row: any, certificate: any) => row.certifier === certificate.certifier && row.serialNumber === certificate.serialNumber && row.subject === certificate.subject

/** Public settings tokens are the only configuration surface used here.
 * The unchanged native wallet's private objects and cache are never accessed. */
export class PublicSettingsTrust {
  private readonly observation: any = { schema: 'tpnil-native-identity-trust@1', profile: 'native-public-settings-token@1.0.0', claim: 'ENGINEERING_OBSERVATION_ONLY', trace: [], assertions: [], cleanup: { attempted: false, restored: false } }
  /** Evidence preserves explicit undefined values as null plus JSON Pointer paths.
   * Calls and returned values remain untouched; null arguments stay distinguishable. */
  get report(): any {
    const undefinedPaths: string[] = []
    const copy = (value: any, pointer: string): any => {
      if (value === undefined) { undefinedPaths.push(pointer); return null }
      if (Array.isArray(value)) return value.map((item, index) => copy(item, `${pointer}/${index}`))
      if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item, `${pointer}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`)]))
      return value
    }
    return { ...copy(this.observation, ''), serialization: { encoding: 'null-with-undefined-json-pointers@1', undefinedPaths } }
  }
  private readonly boundary: any
  private readonly manager: WalletSettingsManager
  private writeAttempted = false
  constructor(wallet: any, options: IdentityTrustOracleOptions & { initialDiscoveryConsent?: 'explicit-allow-v1' } = {}) {
    if (options.initialDiscoveryConsent) this.observation.initialDiscoveryConsent = options.initialDiscoveryConsent
    if (options.oracle !== undefined) {
      const selected = getIdentityTrustOracle2Policy(options.oracle)
      this.observation.oracle = options.oracle
      this.observation.oraclePolicySha256 = selected.policySha256
    }
    this.boundary = new Proxy({}, { get: (_target, name) => {
      if (typeof name !== 'string' || name === 'then') return undefined
      return async (...args: any[]) => {
        const entry: any = { method: name, args: structuredClone(args), startedAt: new Date().toISOString() }; this.observation.trace.push(entry)
        try { const result = await wallet[name](...args); entry.result = structuredClone(result); return result }
        catch (error) { entry.error = error instanceof Error ? { name: error.name, message: error.message } : String(error); throw error }
        finally { entry.endedAt = new Date().toISOString() }
      }
    } })
    this.manager = new WalletSettingsManager(this.boundary)
  }
  private outputs() { return this.boundary.listOutputs({ basket: 'wallet settings', tags: ['settings'], tagQueryMode: 'all', include: 'entire transactions' }) }
  private record(id: string, pass: boolean, detail: string) { this.observation.assertions.push({ id: `identity-trust.${id}`, result: pass ? 'PASS' : 'FAIL', detail }) }
  async enable(certificate: any): Promise<void> {
    this.observation.certificate = certificate
    try {
      assert.equal(certificate.certifier, issuer)
      this.observation.originalSettings = await this.manager.get()
      this.observation.originalOutputs = await this.outputs()
      assert.ok(this.observation.originalOutputs.totalOutputs <= 1, 'Ambiguous original settings tokens')
      assert.ok(!this.observation.originalSettings.trustSettings.trustedCertifiers.some((c: any) => c.identityKey === issuer), 'Fixture issuer was already trusted')
      this.observation.initialIdentity = await this.boundary.discoverByIdentityKey({ identityKey: certificate.subject, forceRefresh: true, ...(this.observation.initialDiscoveryConsent ? { seekPermission: true } : {}) })
      this.observation.initialAttributes = await this.boundary.discoverByAttributes({ attributes: { name: 'TPNIL boundary identity' }, forceRefresh: true, ...(this.observation.initialDiscoveryConsent ? { seekPermission: true } : {}) })
      const excluded = [this.observation.initialIdentity, this.observation.initialAttributes].every(r => !r.certificates.some((c: any) => isFixture(c, certificate)))
      this.record('initial-exclusion', excluded, 'Both public discovery methods exclude the published, initially untrusted fixture issuer.')
      assert.ok(excluded)
      const settings = structuredClone(this.observation.originalSettings)
      settings.trustSettings.trustedCertifiers.push({ identityKey: issuer, name: 'TPNIL scoped fixture issuer', description: 'Temporary qualification-only trust', trust: 4 })
      this.observation.temporarySettings = settings
      this.writeAttempted = true
      await this.manager.set(settings)
      this.observation.temporaryOutputs = await this.outputs()
      this.observation.temporaryReadback = await this.manager.get()
      const written = this.observation.temporaryOutputs.totalOutputs === 1 && canonicalJson(this.observation.temporaryReadback) === canonicalJson(settings)
      this.record('public-settings-token', written, 'An encrypted settings PushDrop token was signed through public wallet methods and read back.')
      assert.ok(written)
      const started = performance.now(), startedAt = new Date().toISOString()
      // forceRefresh does not invalidate the unchanged wallet's 120s trust cache.
      // Real elapsed time is required; the timer is never injected or advanced.
      while (performance.now() - started < 121_000) await new Promise(resolve => setTimeout(resolve, Math.min(10_000, 121_000 - (performance.now() - started))))
      this.observation.wait = { startedAt, endedAt: new Date().toISOString(), monotonicElapsedMs: Math.floor(performance.now() - started), requiredMs: 120_000 }
      this.record('cache-expiry', this.observation.wait.monotonicElapsedMs >= 120_000, 'Waited for the native trust cache to expire without modifying its clock or private state.')
    } catch (error) { this.observation.enableError = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error) }
  }
  async finish(corpus: any): Promise<void> {
    const certificate = this.observation.certificate
    const discovery = ['discoverByIdentityKey', 'discoverByAttributes'].map(method => corpus?.trace?.find((r: any) => r.method === method))
    this.observation.positiveDiscovery = discovery
    let positive = Boolean(certificate && discovery.every(r => r?.result?.certificates?.some((c: any) => isFixture(c, certificate))))
    if (this.observation.oracle !== undefined) {
      try {
        const { policy } = getIdentityTrustOracle2Policy(this.observation.oracle)
        const proofs = corpus.trace.filter((r: any) => r.method === 'proveCertificate' && r.args?.verifier === policy.binding.verifier)
        assert.equal(proofs.length, 1)
        assert.deepEqual(proofs[0].args, { certificate: { type: certificate.type, serialNumber: certificate.serialNumber, certifier: certificate.certifier }, fieldsToReveal: policy.binding.fieldsToReveal, verifier: policy.binding.verifier })
        assert.equal(proofs[0].error, undefined); assert.deepEqual(proofs[0].result.keyringForVerifier, certificate.keyring)
        assert.deepEqual(Object.keys(certificate.keyring), policy.binding.fieldsToReveal)
        for (const response of discovery) {
          assert.equal(response?.error, undefined)
          const matches = response?.result?.certificates?.filter((row: any) => isFixture(row, certificate))
          assert.equal(matches?.length, 1)
          const found = matches[0]
          for (const field of ['type', 'serialNumber', 'subject', 'certifier', 'revocationOutpoint', 'fields', 'signature']) assert.deepEqual(found[field], certificate[field])
          assert.deepEqual(found.publiclyRevealedKeyring, certificate.keyring)
          assert.deepEqual(found.decryptedFields, policy.binding.expectedPlaintext)
          const disclosed = VerifiableCertificate.fromCertificate(found, found.publiclyRevealedKeyring)
          assert.equal(await disclosed.verify(), true)
          assert.deepEqual(await disclosed.decryptFields(new ProtoWallet('anyone')), policy.binding.expectedPlaintext)
        }
      } catch { positive = false }
    }
    this.record('positive-discovery', positive, 'The unchanged native wallet discovers the published fixture through both public methods after trust-cache expiry.')
    this.observation.cleanup.attempted = true
    try {
      if (!this.observation.originalSettings || !this.observation.originalOutputs) throw new Error('Original settings snapshot unavailable')
      if (this.writeAttempted) {
        if (this.observation.originalOutputs.totalOutputs === 0) await this.manager.delete()
        else await this.manager.set(this.observation.originalSettings)
      }
      this.observation.restoredSettings = await this.manager.get()
      this.observation.restoredOutputs = await this.outputs()
      this.observation.cleanup.restored = canonicalJson(this.observation.restoredSettings) === canonicalJson(this.observation.originalSettings) && this.observation.restoredOutputs.totalOutputs === this.observation.originalOutputs.totalOutputs
      this.record('settings-restored', this.observation.cleanup.restored, 'Restored the exact original settings; an originally absent token remains absent.')
      const outpoint = this.observation.temporaryOutputs?.outputs?.[0]?.outpoint
      const [txid, vout] = String(outpoint).split('.')
      const transactions = this.observation.trace.filter((r: any) => ['signAction', 'createAction'].includes(r.method) && r.result?.tx).map((r: any) => Transaction.fromAtomicBEEF(r.result.tx))
      const spend = transactions.find((tx: Transaction) => tx.inputs.some(i => i.sourceTXID === txid && i.sourceOutputIndex === Number(vout)))
      if (spend) this.observation.retirementTransaction = { txid: spend.id('hex'), raw: spend.toHex(), beef: spend.toAtomicBEEF() }
      this.record('temporary-token-spent', Boolean(outpoint && spend && !this.observation.restoredOutputs.outputs.some((r: any) => r.outpoint === outpoint)), 'A serialized signed transaction spends the temporary trust token; it is absent from the restored basket.')
    } catch (error) { this.observation.cleanup.error = String(error) }
    const allowed = ['getPublicKey', 'createAction', 'signAction', 'listOutputs', 'encrypt', 'decrypt', 'createSignature', 'discoverByIdentityKey', 'discoverByAttributes']
    this.record('public-boundary-only', this.observation.trace.length > 0 && this.observation.trace.every((r: any) => allowed.includes(r.method)), 'All settings reads, writes, signatures and discovery calls use public wallet methods.')
    this.record('cleanup', Boolean(this.observation.cleanup.restored && this.observation.retirementTransaction), 'Durable temporary trust is retired; the enclosing isolated native container retires any residual in-memory cache.')
    const transactions = new Map<string, Transaction>()
    for (const row of this.observation.trace) if (['createAction', 'signAction'].includes(row.method) && row.result?.tx) {
      const tx = Transaction.fromAtomicBEEF(row.result.tx); transactions.set(tx.id('hex'), tx)
    }
    for (const state of [this.observation.temporaryOutputs, this.observation.restoredOutputs]) if (state?.BEEF) for (const output of state.outputs) {
      const txid = output.outpoint.split('.')[0], tx = Transaction.fromAtomicBEEF(Beef.fromBinary(state.BEEF).toBinaryAtomic(txid)); transactions.set(txid, tx)
    }
    this.observation.transactions = [...transactions.values()].map(tx => ({ txid: tx.id('hex'), rawHex: tx.toHex(), beefHex: Buffer.from(tx.toAtomicBEEF()).toString('hex') }))
    for (const id of trustAssertionIds) if (!this.observation.assertions.some((r: any) => r.id === id)) this.observation.assertions.push({ id, result: 'FAIL', detail: 'A preceding operation prevented this observation.' })
    this.observation.result = this.observation.assertions.every((r: any) => r.result === 'PASS') ? 'PASS' : 'FAIL'
  }
}
