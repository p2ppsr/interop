import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createFixtureWallet } from '../src/storage-sync/fixture-wallet.js'
import { ControlledWalletServices } from '../src/wallet-lab/services.js'
import { GoServices, selectComponents, validateComponentIdentity, validateStorageSyncGoBuild } from '../src/wallet-lab/go-services.js'

const root = path.resolve(import.meta.dirname, '../..')
const binary = process.env.TPNIL_CALLER_KNOWN_GO_BINARY ?? path.join(root, 'out/itcve-go-storage-caller-known-inputs')
const components = selectComponents({ storage: 'go' })
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

it('rejects simultaneous caller-known and historical compatibility selectors before startup', () => {
  for (const other of ['storageSyncPatch', 'storagePortabilityPatch', 'storageListActionsPatch', 'storageNativeContractsPatch', 'storageBatchSubjectsPatch', 'storageDustAccountingPatch', 'storageMergeAccountingPatch', 'storageInputAncestryPatch', 'storageSQLiteRetryPatch']) {
    expect(() => new GoServices('/unused', components, { storageCallerKnownInputsPatch: true, [other]: true })).toThrow(/Conflicting/)
  }
})

// This gate consumes the actual prepared binary and its unmodified receipt.
// Ordinary offline CI does not silently substitute a synthetic build manifest.
describe.skipIf(process.env.TPNIL_CALLER_KNOWN_GO_TESTS !== '1')('actual prospective Go admission and authenticated output observation', () => {
  let manifest: any, identity: any, build: any, binarySha256: string
  beforeAll(async () => {
    manifest = JSON.parse(fs.readFileSync(`${binary}.json`, 'utf8')); binarySha256 = sha(fs.readFileSync(binary))
    const lock = JSON.parse(fs.readFileSync(path.join(root, 'synthesis/go/components.lock.json'), 'utf8'))
    build = { toolchain: lock.toolchain, dependencies: Object.fromEntries(lock.components.map((pin: any) => [pin.module, { version: pin.version, sum: pin.sum }])) }
    build.dependencies[manifest.sdkReplacement.module] = { version: manifest.sdkReplacement.version, sum: '', replacementModule: manifest.sdkReplacement.source, replacementVersion: '(devel)' }
    build.dependencies[manifest.upstream.module] = { version: manifest.upstream.version, sum: '', replacementModule: manifest.replacementModule, replacementVersion: '(devel)' }
    const webroot = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-coverage-go-admission-'))
    const services = new ControlledWalletServices({ webroot, components, go: { binary, storageCallerKnownInputsPatch: true, terminalRejectionReceipts: true } })
    let wallet: Awaited<ReturnType<typeof createFixtureWallet>> | undefined
    const failures: unknown[] = []
    try {
      await services.start() // Validates the real subprocess build and binary before any control request.
      identity = structuredClone(services.componentIdentity)
      wallet = await createFixtureWallet(services, '78'.repeat(32))
      const publicIdentity = (await wallet.getPublicKey({ identityKey: true })).publicKey
      const snapshot = await services.nativeOutputSnapshots(publicIdentity)
      expect(snapshot.identityKey).toBe(publicIdentity)
      expect(snapshot.providers).toHaveLength(1)
      expect(snapshot.providers[0]!.id).toBe('source')
      expect(snapshot.providers[0]!.snapshot).toMatchObject({ schema: 'tpnil-native-output-snapshot@2.0.0', identityKey: publicIdentity, providerIdentityKey: services.identityKey, outputs: [] })
      expect(services.nativeOutputSnapshotObservations).toHaveLength(1)
      expect(services.nativeOutputSnapshotObservations[0]!.snapshots).toEqual(snapshot)
      expect(services.nativeOutputProviderRegistry).toEqual([{ id: 'source', identityKey: services.identityKey, componentIdentity: identity }])
      const certificates = await services.nativeCertificateInventories(publicIdentity)
      expect(certificates.providers).toHaveLength(1)
      expect(certificates.providers[0]!.snapshot).toMatchObject({ schema: 'tpnil-native-certificate-inventory@1.0.0', identityKey: publicIdentity, providerIdentityKey: services.identityKey, certificates: [], fields: [] })
      expect(services.nativeCertificateInventoryObservations[0]!.snapshots).toEqual(certificates)
      expect(services.nativeCertificateInventoryObservations[0]!.registry).toEqual(services.nativeOutputProviderRegistry)
      await wallet.listActions({ labels: [], limit: 10 })
      const actionCuts = await services.nativeActionQueryCuts(publicIdentity)
      expect(actionCuts.providers[0]!.snapshot.entries).toHaveLength(1)
      expect(actionCuts.providers[0]!.snapshot.entries[0]).toMatchObject({ rpcProviderBound: true, cwiJoin: 'UNAVAILABLE' })
      if (process.env.TPNIL_ACTION_LEDGER_CAPTURE) fs.writeFileSync(path.join(process.env.TPNIL_ACTION_LEDGER_CAPTURE, 'live.json'), JSON.stringify(actionCuts.providers[0]!.snapshot, null, 2) + '\n')
      const knowledge = await services.nativeTransactionKnowledgeInventories()
      expect(knowledge.providers).toHaveLength(1)
      expect(knowledge.providers[0]!.snapshot).toMatchObject({ schema: 'tpnil-native-transaction-knowledge-inventory@1.0.0', scope: 'PROVIDER_GLOBAL_ALL_STATUSES_ALL_USERS_INCLUDING_DELETED', providerIdentityKey: services.identityKey })
      expect(services.nativeTransactionKnowledgeInventoryObservations[0]!.snapshots).toEqual(knowledge)
      expect(services.nativeTransactionKnowledgeInventoryObservations[0]!.registry).toEqual(services.nativeOutputProviderRegistry)
      await expect(services.nativeOutputSnapshots('02' + 'ff'.repeat(32))).rejects.toThrow()
      expect(services.nativeOutputSnapshotObservations[1]!.error).toBeDefined()
    } catch (error) { failures.push(error) }
    finally {
      try { await wallet?.destroy() } catch (error) { failures.push(error) }
      try { await services.close() } catch (error) { failures.push(error) }
      try {
        expect(services.nativeFinalActionQueryLedgers).toHaveLength(1)
        const final = services.nativeFinalActionQueryLedgers[0]!
        expect(final.error).toBeUndefined(); expect(final.ledger?.final).toMatchObject({ finalized: true, inFlight: 0, terminalErrors: [], entryCount: 1 })
        if (process.env.TPNIL_ACTION_LEDGER_CAPTURE) fs.writeFileSync(path.join(process.env.TPNIL_ACTION_LEDGER_CAPTURE, 'final.json'), JSON.stringify(final.ledger, null, 2) + '\n')
      } catch (error) { failures.push(error) }
      try { fs.rmSync(webroot, { recursive: true, force: true }) } catch (error) { failures.push(error) }
    }
    if (failures.length) throw new AggregateError(failures, 'Real prospective Go admission or cleanup failed')
  }, 30000)
  const admit = (candidate: any, actualBinary = binarySha256) => validateStorageSyncGoBuild(build, actualBinary, candidate, false, false, false, false, false, false, false, false, true)
  const publicIdentity = (candidate: any) => ({ ...identity, go: { ...identity.go, compatibilityPatch: candidate } })

  it.each(['ITCVE-1@4.5.0'] as const)('admits only the exact final source and binary for%s', profile => {
    expect(identity.go.binarySha256).toBe(binarySha256)
    expect(identity.go.compatibilityPatch).toEqual(manifest)
    expect(() => admit(manifest)).not.toThrow()
    expect(() => validateComponentIdentity(identity, profile)).not.toThrow()
    for (const profile of ['ITCVE-1@1.3.0', 'ITCVE-1@1.4.0', 'ITCVE-1@1.5.0', 'ITCVE-1@2.0.0', 'ITCVE-1@4.0.0', 'ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.3.0', 'ITCVE-1@4.4.0'] as const) expect(() => validateComponentIdentity(identity, profile)).toThrow()
  })
  it.each(['inputs', 'patchInputs', 'generatedHost'] as const)('rejects missing, changed and surplus%s inventory entries in both admission paths', field => {
    for (const mode of ['missing', 'changed', 'surplus', 'absent']) {
      const altered = structuredClone(manifest), key = Object.keys(altered[field])[0]!
      if (mode === 'absent') delete altered[field]
      else if (mode === 'missing') delete altered[field][key]
      else if (mode === 'changed') altered[field][key] = '00'.repeat(32)
      else altered[field]['unreviewed-source'] = 'ab'.repeat(32)
      expect(() => admit(altered)).toThrow()
      expect(() => validateComponentIdentity(publicIdentity(altered), 'ITCVE-1@4.5.0')).toThrow()
    }
  })
  it.each(['schema', 'binarySha256', 'patchLockSha256', 'parentPatchLockSha256', 'patchSha256', 'toolchain', 'upstream'] as const)('rejects changed%s identity in both admission paths', field => {
    const altered = structuredClone(manifest); altered[field] = field === 'upstream' ? { ...altered.upstream, version: 'v0.0.0' } : 'unreviewed'
    expect(() => admit(altered)).toThrow()
    expect(() => validateComponentIdentity(publicIdentity(altered), 'ITCVE-1@4.5.0')).toThrow()
  })
  it.each(['module', 'version', 'sum', 'source', 'patchSha256', 'postimages'])('rejects SDK %s substitution in both admission paths', field => {
    const altered = structuredClone(manifest)
    altered.sdkReplacement[field] = field === 'postimages' ? {} : 'unreviewed'
    expect(() => admit(altered)).toThrow()
    expect(() => validateComponentIdentity(publicIdentity(altered), 'ITCVE-1@4.5.0')).toThrow()
  })
  it('rejects compiler SDK replacement not declared by the source receipt', () => {
    const altered = structuredClone(build)
    altered.dependencies[manifest.sdkReplacement.module].replacementModule = '/unreviewed/sdk'
    expect(() => validateStorageSyncGoBuild(altered, binarySha256, manifest, false, false, false, false, false, false, false, false, true)).toThrow(/SDK replacement/)
  })
  it.each(['hostMod', 'hostSum', 'toolboxMod', 'toolboxSum'])('rejects generated %s changes in both admission paths', field => {
    const altered = structuredClone(manifest); altered.generatedModuleFiles[field] = '00'.repeat(32)
    expect(() => admit(altered)).toThrow()
    expect(() => validateComponentIdentity(publicIdentity(altered), 'ITCVE-1@4.5.0')).toThrow()
  })
  it('rejects a different executable or compiler source replacement', () => {
    expect(() => admit(manifest, '00'.repeat(32))).toThrow()
    expect(() => admit({ ...manifest, replacementModule: '/unreviewed/source' })).toThrow()
    expect(() => admit({ ...manifest, replacementModule: 'relative/source' })).toThrow()
  })
  it('rejects final manifests under old selectors, and conflicting direct validator selectors', () => {
    expect(() => validateStorageSyncGoBuild(build, binarySha256, manifest)).toThrow()
    for (let index = 0; index < 8; index++) {
      const flags = Array(9).fill(false); flags[index] = true
      expect(() => validateStorageSyncGoBuild(build, binarySha256, manifest, ...flags as [boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean])).toThrow()
    }
    expect(() => validateStorageSyncGoBuild(build, binarySha256, manifest, false, false, true, false, false, false, false, false, true)).toThrow(/Conflicting/)
  })
})
