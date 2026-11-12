import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { MerklePath, PrivateKey, ProtoWallet, PushDrop, Transaction, Utils, type WalletInterface } from '@bsv/sdk'
import { Setup } from '@bsv/wallet-toolbox'
import { ControlledWalletServices, type TeranodeWalletFundingFixture } from '../src/wallet-lab/services.js'
import { selectComponents, validateGoBuild, validateComponentIdentity, validateStorageSyncGoBuild, GoServices } from '../src/wallet-lab/go-services.js'

function request(origin: string, route: string, host = 'fixture.itcve.test', body?: Buffer, headers: Record<string, string> = {}): Promise<{ status: number; bytes: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = http.request(`${origin}${route}`, { method: body === undefined ? 'GET' : 'POST', headers: { host, ...headers, ...(body === undefined ? {} : { 'content-length': String(body.length) }) }, timeout: 20000 }, res => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(Buffer.from(chunk)))
      res.on('end', () => resolve({ status: res.statusCode!, bytes: Buffer.concat(chunks) }))
      res.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error('Controlled request timed out')))
    req.on('error', reject); req.end(body)
  })
}

it('selects TypeScript by default and rejects unsupported component configurations', () => {
  expect(selectComponents()).toEqual({ overlay: 'typescript', chaintracks: 'typescript', storage: 'typescript' })
  expect(() => selectComponents({ storage: 'rust' } as never)).toThrow(/Unsupported/)
  expect(() => selectComponents({ unknown: 'go' } as never)).toThrow(/Unsupported/)
  expect(() => selectComponents(null as never)).toThrow(/Invalid/)
})

it('rejects Go build provenance drift before serving a selected role', () => {
  const lock = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../go/components.lock.json'), 'utf8'))
  const build = { toolchain: lock.toolchain, dependencies: Object.fromEntries(lock.components.map((pin: { module: string; version: string; sum: string }) => [pin.module, { version: pin.version, sum: pin.sum }])) }
  expect(() => validateGoBuild(build)).not.toThrow()
  expect(() => validateGoBuild({ ...build, toolchain: 'go0.0.0' })).toThrow(/toolchain/)
  const drift = structuredClone(build)
  drift.dependencies[lock.components[0].module].version = 'v0.0.0'
  expect(() => validateGoBuild(drift)).toThrow(/differs from lock/)
  const replaced = structuredClone(build)
  replaced.dependencies['unreviewed'] = { version: 'v1.0.0', sum: 'h1:fake', replacementModule: '/tmp/local', replacementVersion: '', replacementSum: '' }
  expect(() => validateGoBuild(replaced)).toThrow(/Unadmitted/)
})

it('requires frozen component identities and a binary digest for Go evidence', () => {
  const lock = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../go/components.lock.json'), 'utf8'))
  const components = selectComponents({ storage: 'go' })
  const identity = { components, go: { schema: 'tpnil-go-services@1.0.0', components, binarySha256: 'ab'.repeat(32), dependencies: lock, goModSha256: lock.moduleFiles['go.mod'], goSumSha256: lock.moduleFiles['go.sum'] } }
  expect(() => validateComponentIdentity(identity)).not.toThrow()
  expect(() => validateComponentIdentity({ components })).toThrow(/identity/)
  expect(() => validateComponentIdentity({ ...identity, go: { ...identity.go, binarySha256: '' } })).toThrow(/identity/)
  expect(() => validateComponentIdentity({ ...identity, go: { ...identity.go, goSumSha256: '00'.repeat(32) } })).toThrow(/identity/)
  const patchBytes = fs.readFileSync(path.resolve(import.meta.dirname, '../../infra/adapters/storage-sync/patch.lock.json'))
  const patch = JSON.parse(patchBytes.toString())
  const compatibilityPatch = { schema: 'tpnil-storage-sync-go-build@1.0.0', binarySha256: identity.go.binarySha256,
    patchLockSha256: createHash('sha256').update(patchBytes).digest('hex'), patchSha256: patch.patchSha256, toolchain: lock.toolchain,
    upstream: { module: patch.module, version: patch.version, sum: patch.sum } }
  const prospective = { ...identity, go: { ...identity.go, compatibilityPatch } }
  expect(() => validateComponentIdentity(prospective)).toThrow(/identity/)
  expect(() => validateComponentIdentity(prospective, 'ITCVE-1@1.3.0')).not.toThrow()
  const terminal = { ...prospective, go: { ...prospective.go, fixtureSubmissionPolicy: 'terminal-rejection-v1' } }
  expect(() => validateComponentIdentity(terminal, 'ITCVE-1@1.4.0')).not.toThrow()
  for (const profile of ['ITCVE-1@1.5.0', 'ITCVE-1@2.0.0', 'ITCVE-1@4.0.0'] as const) expect(() => validateComponentIdentity(terminal, profile)).toThrow(/ancestry export/)
  const portabilityBytes = fs.readFileSync(path.resolve(import.meta.dirname, '../../infra/adapters/storage-portability/patch.lock.json'))
  const portability = JSON.parse(portabilityBytes.toString())
  const coverage = { ...terminal, go: { ...terminal.go, compatibilityPatch: { ...compatibilityPatch, schema: 'tpnil-storage-portability-go-build@1.0.0', parentPatchLockSha256: portability.parentSha256, patchLockSha256: createHash('sha256').update(portabilityBytes).digest('hex'), patchSha256: portability.patchSha256 } } }
  for (const profile of ['ITCVE-1@1.5.0', 'ITCVE-1@2.0.0'] as const) {
    expect(() => validateComponentIdentity(coverage, profile)).not.toThrow()
    expect(() => validateComponentIdentity({ ...coverage, go: { ...coverage.go, compatibilityPatch: { ...coverage.go.compatibilityPatch, parentPatchLockSha256: '00'.repeat(32) } } }, profile)).toThrow(/compatibility/)
  }
  expect(() => validateComponentIdentity(coverage, 'ITCVE-1@4.0.0')).toThrow(/listActions/)
  const listActionsBytes = fs.readFileSync(path.resolve(import.meta.dirname, '../../infra/adapters/storage-list-actions/patch.lock.json'))
  const listActions = JSON.parse(listActionsBytes.toString())
  const revised = { ...coverage, go: { ...coverage.go, compatibilityPatch: { ...coverage.go.compatibilityPatch, schema: 'tpnil-storage-list-actions-go-build@1.0.0', parentPatchLockSha256: listActions.parentSha256, patchLockSha256: createHash('sha256').update(listActionsBytes).digest('hex'), patchSha256: listActions.patchSha256 } } }
  expect(() => validateComponentIdentity(revised, 'ITCVE-1@4.0.0')).not.toThrow()
  for (const profile of [undefined, 'ITCVE-1@1.3.0', 'ITCVE-1@1.4.0', 'ITCVE-1@1.5.0', 'ITCVE-1@2.0.0'] as const) expect(() => validateComponentIdentity(revised, profile)).toThrow()
  for (const field of ['binarySha256', 'parentPatchLockSha256', 'patchLockSha256', 'patchSha256', 'toolchain'] as const) expect(() => validateComponentIdentity({ ...revised, go: { ...revised.go, compatibilityPatch: { ...revised.go.compatibilityPatch, [field]: 'wrong' } } }, 'ITCVE-1@4.0.0')).toThrow(/compatibility/)
  expect(() => validateComponentIdentity(terminal, 'ITCVE-1@1.3.0')).toThrow(/identity/)
  expect(() => validateComponentIdentity(terminal)).toThrow(/identity/)
  expect(() => validateComponentIdentity(prospective, 'ITCVE-1@1.4.0')).toThrow(/identity/)
  expect(() => validateComponentIdentity(identity, 'ITCVE-1@1.3.0')).toThrow(/compatibility/)
  expect(() => validateComponentIdentity({ ...prospective, go: { ...prospective.go, compatibilityPatch: { ...compatibilityPatch, patchSha256: '00'.repeat(32) } } }, 'ITCVE-1@1.3.0')).toThrow(/compatibility/)
})

it('requires the new binary and actual source replacement manifest only with its explicit selector', () => {
  const lock = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../go/components.lock.json'), 'utf8'))
  const patchBytes = fs.readFileSync(path.resolve(import.meta.dirname, '../../infra/adapters/storage-list-actions/patch.lock.json'))
  const patch = JSON.parse(patchBytes.toString())
  const replacementModule = '/tmp/tpnil-reviewed-storage-source'
  const build = { toolchain: lock.toolchain, dependencies: Object.fromEntries(lock.components.map((pin: { module: string; version: string; sum: string }) => [pin.module, { version: pin.version, sum: pin.sum }])) }
  build.dependencies[patch.module] = { version: patch.version, sum: '', replacementModule, replacementVersion: '(devel)' }
  const binarySha256 = 'ab'.repeat(32)
  const manifest = { schema: 'tpnil-storage-list-actions-go-build@1.0.0', binarySha256, patchLockSha256: createHash('sha256').update(patchBytes).digest('hex'), parentPatchLockSha256: patch.parentSha256, patchSha256: patch.patchSha256, upstream: { module: patch.module, version: patch.version, sum: patch.sum }, toolchain: lock.toolchain, replacementModule }
  expect(() => validateStorageSyncGoBuild(build, binarySha256, manifest, false, true)).not.toThrow()
  expect(() => validateStorageSyncGoBuild(build, binarySha256, manifest)).toThrow(/manifest/)
  expect(() => validateStorageSyncGoBuild(build, binarySha256, manifest, true)).toThrow(/manifest/)
  expect(() => validateStorageSyncGoBuild(build, '00'.repeat(32), manifest, false, true)).toThrow(/manifest/)
  expect(() => validateStorageSyncGoBuild(build, binarySha256, { ...manifest, replacementModule: '/tmp/unreviewed' }, false, true)).toThrow(/replacement/)
  expect(() => new GoServices('/tmp/unused', selectComponents(), { storageListActionsPatch: true, storagePortabilityPatch: true })).toThrow(/Conflicting/)
})

// Explicit command/CI gate: the ordinary offline suite needs neither Docker nor Go.
describe.skipIf(process.env.TPNIL_GO_TESTS !== '1')('native Go / TypeScript component matrix', () => {
  for (let mask = 0; mask < 8; mask++) {
    const components = selectComponents({ overlay: mask & 1 ? 'go' : 'typescript', chaintracks: mask & 2 ? 'go' : 'typescript', storage: mask & 4 ? 'go' : 'typescript' })
    it(`${components.overlay} overlay / ${components.chaintracks} headers / ${components.storage} storage`, async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-go-matrix-'))
      fs.writeFileSync(path.join(root, 'index.html'), '<title>LAB_SELF_TEST_ONLY</title>')
      const services = new ControlledWalletServices({ webroot: root, components })
      let passed = false
      let failure: unknown
      try {
        await services.start()
        expect(services.componentIdentity.components).toEqual(components)
        const header = await request(services.serviceUrl, '/chaintracks/v2/header/height/0')
        expect(header.status).toBe(200)
        expect(JSON.parse(header.bytes.toString()).hash).toBe('000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f')
        const client = await Setup.createWalletClientNoEnv({ chain: 'main', rootKeyHex: '22'.repeat(32), storageUrl: services.storageUrl })
        try {
          expect(client.storage.getSettings().chain).toBe('main')
          expect((await client.listOutputs({ basket: 'default' })).totalOutputs).toBe(0)
        } finally { await client.destroy() }
        const wallet = new ProtoWallet(PrivateKey.fromHex('33'.repeat(32)))
        const fields = Array.from({ length: 11 }, (_, index) => [index + 1])
        fields[6] = Utils.toArray('55'.repeat(32), 'hex'); fields[7] = Utils.toArray('66'.repeat(32), 'hex')
        const lockingScript = await new PushDrop(wallet as unknown as WalletInterface).lock(fields, [2, 'admin user management token'], '1', 'self', true, true)
        const tx = new Transaction(1, [], [{ satoshis: 1, lockingScript }], 0)
        const txid = tx.id('hex'), height = 900000
        tx.merklePath = new MerklePath(height, [[{ offset: 0, hash: txid, txid: true }]])
        services.registerSyntheticHeader({ version: 1, previousHash: '00'.repeat(32), merkleRoot: txid, time: 1800000000, bits: 486604799, nonce: 0, height })
        const submit = await request(services.serviceUrl, '/submit', 'overlay.itcve.test', Buffer.from(tx.toAtomicBEEF()), { 'content-type': 'application/octet-stream', 'x-topics': 'tm_users' })
        expect(submit.status, submit.bytes.toString()).toBe(200)
        expect(JSON.parse(submit.bytes.toString()), submit.bytes.toString()).toHaveProperty("tm_users.outputsToAdmit", [0])
        const query = await request(services.serviceUrl, '/lookup', 'overlay.itcve.test', Buffer.from(JSON.stringify({ service: 'ls_users', query: { presentationHash: '55'.repeat(32) } })), { 'content-type': 'application/json' })
        expect(query.status, query.bytes.toString()).toBe(200)
        const answer = JSON.parse(query.bytes.toString())
        expect(answer.type).toBe('output-list'); expect(answer.outputs).toHaveLength(1)
        const beef = answer.outputs[0].beef
        const lookupTx = Transaction.fromBEEF(typeof beef === 'string' ? [...Buffer.from(beef, 'base64')] : beef)
        expect(lookupTx.id('hex')).toBe(txid)
        if (mask & 4) {
          const fixture = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../fixtures/teranode/wab-funding-v1.json'), 'utf8')) as TeranodeWalletFundingFixture
          await expect(services.fundRemoteWalletFromTeranode('77'.repeat(32), fixture)).resolves.toMatchObject({ txid: fixture.txid })
          const funded = await Setup.createWalletClientNoEnv({ chain: 'main', rootKeyHex: '77'.repeat(32), storageUrl: services.storageUrl })
          try { expect((await funded.listOutputs({ basket: 'default' })).totalOutputs).toBeGreaterThan(0) } finally { await funded.destroy() }
          const isolated = await Setup.createWalletClientNoEnv({ chain: 'main', rootKeyHex: '22'.repeat(32), storageUrl: services.storageUrl })
          try { expect((await isolated.listOutputs({ basket: 'default' })).totalOutputs).toBe(0) } finally { await isolated.destroy() }
          const faucet = await request(services.serviceUrl, '/demo/faucet/request', 'wab.itcve.test', Buffer.from(JSON.stringify({ presentationKey: '88'.repeat(32) })), { 'content-type': 'application/json' })
          expect(faucet.status, faucet.bytes.toString()).toBe(200)
          expect(JSON.parse(faucet.bytes.toString()).paymentData.amount).toBe(1000)
          expect(services.submissions.some(submission => submission.verdict === 'ACCEPTED_BY_NETWORK')).toBe(true)
        }
        if (mask === 7) {
          const lookup = async () => request(services.serviceUrl, '/lookup', 'overlay.itcve.test', Buffer.from(JSON.stringify({ service: 'ls_users', query: { presentationHash: '55'.repeat(32) } })), { 'content-type': 'application/json' })
          await services.restartGoComponents()
          const persistedWallet = await Setup.createWalletClientNoEnv({ chain: 'main', rootKeyHex: '77'.repeat(32), storageUrl: services.storageUrl })
          try { expect((await persistedWallet.listOutputs({ basket: 'default' })).totalOutputs).toBeGreaterThan(0) } finally { await persistedWallet.destroy() }
          const recoveredFaucet = await request(services.serviceUrl, '/demo/faucet/request', 'wab.itcve.test', Buffer.from(JSON.stringify({ presentationKey: '99'.repeat(32) })), { 'content-type': 'application/json' })
          expect(recoveredFaucet.status, recoveredFaucet.bytes.toString()).toBe(200)
          const nativeTransactions = await services.nativeTransactions()
          expect(nativeTransactions.some(item => item.txid.length === 64 && item.rawTxHex.length > 0)).toBe(true)
          const recovered = await lookup()
          expect(recovered.status, recovered.bytes.toString()).toBe(200)
          expect(JSON.parse(recovered.bytes.toString()).outputs).toHaveLength(1)
          // Change the active branch: retained orphan proof bytes cannot serve.
          services.registerSyntheticHeader({ version: 1, previousHash: '00'.repeat(32), merkleRoot: 'ff'.repeat(32), time: 1800000001, bits: 486604799, nonce: 0, height })
          const orphaned = await lookup()
          expect(orphaned.status, orphaned.bytes.toString()).toBe(200)
          expect(JSON.parse(orphaned.bytes.toString()).outputs ?? []).toHaveLength(0)
          services.registerSyntheticHeader({ version: 1, previousHash: '00'.repeat(32), merkleRoot: txid, time: 1800000000, bits: 486604799, nonce: 0, height })
          const restored = await lookup()
          expect(JSON.parse(restored.bytes.toString()).outputs).toHaveLength(1)
          const legacy = await request(services.serviceUrl, `/findHeaderHexForHeight?height=${height}`)
          expect(JSON.parse(legacy.bytes.toString()).value.merkleRoot).toBe(txid)
          const oneSat = await request(services.serviceUrl, `/1sat/chaintracks/header/height/${height}`, 'api.1sat.app')
          expect(JSON.parse(oneSat.bytes.toString()).merkleRoot).toBe(txid)
          const binary = await request(services.serviceUrl, `/chaintracks/v2/headers.bin?height=${height}&count=1`)
          expect(binary.status).toBe(200)
          expect(binary.bytes.length).toBe(80)
          expect(Buffer.from(binary.bytes.subarray(36, 68)).reverse().toString('hex')).toBe(txid)
          const streamAbort = new AbortController()
          const streamTimeout = setTimeout(() => streamAbort.abort(), 5000)
          try {
            const stream = await fetch(`${services.serviceUrl}/chaintracks/v2/tip/stream`, { signal: streamAbort.signal })
            expect(stream.headers.get('content-type')).toContain('text/event-stream')
            const event = await stream.body!.getReader().read()
            expect(Buffer.from(event.value!).toString()).toContain('"height":900100')
          } finally { clearTimeout(streamTimeout); streamAbort.abort() }
          const corrupt = await request(services.serviceUrl, '/submit', 'overlay.itcve.test', Buffer.from([1,2,3]), { 'content-type': 'application/octet-stream', 'x-topics': 'tm_users' })
          expect([400, 422]).toContain(corrupt.status)
          const unauthorized = await request(services.storageUrl, '/', 'fixture.itcve.test', Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'listOutputs', params: [{ userId: 1 }] })), { 'content-type': 'application/json', origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop' })
          expect([401, 403], unauthorized.bytes.toString()).toContain(unauthorized.status)
          expect(unauthorized.bytes.toString()).not.toContain('CORS origin denied')
        }
        passed = true
      } catch (error) { failure = error; throw error }
      finally {
        try { await services.close() }
        catch (cleanupError) { passed = false; if (failure !== undefined) throw new AggregateError([failure, cleanupError], 'Component case and cleanup failed'); throw cleanupError }
        finally {
          if (process.env.TPNIL_GO_EVIDENCE_DIR !== undefined) {
            const directory = process.env.TPNIL_GO_EVIDENCE_DIR
            fs.mkdirSync(directory, { recursive: true })
            fs.writeFileSync(path.join(directory, `case-${mask}.log`), services.componentDiagnostics)
            fs.writeFileSync(path.join(directory, `case-${mask}.json`), JSON.stringify({ claim: 'LAB_SELF_TEST_ONLY', outcome: passed ? 'PASS' : 'FAIL', components, identity: services.componentIdentity }, null, 2) + '\n')
          }
          fs.rmSync(root, { recursive: true, force: true })
        }
      }
    }, 120000)
  }
})
