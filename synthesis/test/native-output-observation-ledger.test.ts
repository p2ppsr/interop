import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PrivateKey } from '@bsv/sdk'
import { expect, it } from 'vitest'
import { ControlledWalletServices } from '../src/wallet-lab/services.js'
// LAB_SELF_TEST_ONLY: unavailable providers and copy isolation, not a native run.
it('records failed output observations in order and exposes defensive copies', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-output-ledger-'))
  const service = new ControlledWalletServices({ webroot: directory }), identity = PrivateKey.fromHex('1'.padStart(64, '0')).toPublicKey().toString()
  try {
    await expect(service.nativeOutputSnapshots(identity)).rejects.toThrow('not Go storage')
    const first = service.nativeOutputSnapshotObservations
    expect(first).toHaveLength(1); expect(first[0]).toMatchObject({ sequence: 0, identityKey: identity, error: { name: 'Error' } }); expect(first[0]!.snapshots).toBeUndefined()
    expect(Date.parse(first[0]!.startedAt)).toBeLessThanOrEqual(Date.parse(first[0]!.endedAt))
    first[0]!.error!.message = 'forged'; first.length = 0
    expect(service.nativeOutputSnapshotObservations[0]!.error!.message).toContain('not Go storage')
    await expect(service.nativeOutputSnapshots('invalid identity')).rejects.toThrow()
    expect(service.nativeOutputSnapshotObservations.map(row => row.sequence)).toEqual([0, 1])
    expect(service.nativeOutputSnapshotObservations[1]!.identityKey).toBe('invalid identity')
    const registry = service.nativeOutputProviderRegistry; expect(registry).toHaveLength(1); expect(registry[0]!.id).toBe('source')
    registry[0]!.identityKey = identity; registry[0]!.componentIdentity.components = { storage: 'forged' }; registry.push(structuredClone(registry[0]!))
    expect(service.nativeOutputProviderRegistry).toHaveLength(1); expect(service.nativeOutputProviderRegistry[0]!.componentIdentity.components).not.toEqual({ storage: 'forged' })
  } finally { await service.close(); fs.rmSync(directory, { recursive: true, force: true }) }
})
