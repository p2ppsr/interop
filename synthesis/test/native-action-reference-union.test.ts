import fs from 'node:fs'
import { PrivateKey } from '@bsv/sdk'
import { afterEach, expect, it, vi } from 'vitest'
import { ControlledWalletServices } from '../src/wallet-lab/services.js'

// The real ownership registry and collector run here; only external Go control
// RPCs are fixtures. This regression makes no native conformance claim.
const identity = PrivateKey.fromHex('77'.repeat(32)).toPublicKey().toString()
const services: ControlledWalletServices[] = []
const row = (index: number) => ({ txid: index.toString(16).padStart(64, '0'), reference: Buffer.from(`action-${index}`).toString('base64') })
function provider(rows: unknown) {
  const service = new ControlledWalletServices({ webroot: import.meta.dirname, components: { storage: 'go' } }); services.push(service)
  vi.spyOn(service, 'storageUrl', 'get').mockReturnValue(`http://127.0.0.1:${41000 + services.length}`)
  const actionReferences = vi.fn(async (_identity: string) => structuredClone(rows))
  ;(service as any).goServices = { actionReferences }
  return { service, actionReferences }
}
function own(parent: ControlledWalletServices, child: ControlledWalletServices) {
  const host = `storage-${services.indexOf(child)}.itcve.test`
  parent.registerStorageCounterpart(host, child.storageUrl, child); return host
}
afterEach(() => { for (const service of services.splice(0)) fs.rmSync(service.temporaryDirectory, { recursive: true, force: true }); vi.restoreAllMocks() })

it('collects the switched provider when the original has no actions, preserving exact wallet scope', async () => {
  const primary = provider([]), replacement = provider([row(2), row(1)]); own(primary.service, replacement.service)
  expect(await primary.service.nativeActionReferences(identity)).toEqual([row(1), row(2)])
  expect(primary.actionReferences.mock.calls).toEqual([[identity]]); expect(replacement.actionReferences.mock.calls).toEqual([[identity]])
})
it('deduplicates synchronized copies deterministically and retains withdrawn and nested owners', async () => {
  const primary = provider([row(3), row(1)]), replacement = provider([row(2), row(1)]), nested = provider([row(4)])
  const host = own(primary.service, replacement.service); own(replacement.service, nested.service); primary.service.unregisterStorageCounterpart(host)
  expect(await primary.service.nativeActionReferences(identity)).toEqual([row(1), row(2), row(3), row(4)])
})
it('does not query unowned endpoints or repeatedly recurse through ownership', async () => {
  const primary = provider([row(1)]), replacement = provider([row(2)])
  primary.service.registerStorageCounterpart('unowned.itcve.test', 'http://127.0.0.1:49999')
  own(primary.service, replacement.service); own(replacement.service, primary.service)
  expect(await primary.service.nativeActionReferences(identity)).toEqual([row(1), row(2)])
  expect(primary.actionReferences).toHaveBeenCalledTimes(1); expect(replacement.actionReferences).toHaveBeenCalledTimes(1)
})
it.each([
  ['same transaction, different reference', { ...row(1), reference: row(2).reference }],
  ['same reference, different transaction', { ...row(2), reference: row(1).reference }]
])('rejects conflicting %s across owners', async (_name, conflict) => {
  const primary = provider([row(1)]), replacement = provider([conflict]); own(primary.service, replacement.service)
  await expect(primary.service.nativeActionReferences(identity)).rejects.toThrow('disagree')
})
it.each([
  ['object', {}], ['null', null], ['null row', [null]], ['invalid txid', [{ ...row(1), txid: 'invalid' }]],
  ['unknown field', [{ ...row(1), owner: identity }]], ['empty reference', [{ ...row(1), reference: '' }]],
  ['noncanonical base64', [{ ...row(1), reference: 'YQ' }]], ['reference over bound', [{ ...row(1), reference: Buffer.alloc(226).toString('base64') }]],
  ['duplicate local identity', [row(1), row(1)]], ['rows over bound', Array.from({ length: 2049 }, (_, i) => row(i))]
])('rejects malformed counterpart response: %s', async (_name, response) => {
  const primary = provider([row(1)]), replacement = provider(response); own(primary.service, replacement.service)
  await expect(primary.service.nativeActionReferences(identity)).rejects.toThrow()
})
it('enforces the aggregate bound after deduplication', async () => {
  const rows = Array.from({ length: 2048 }, (_, i) => row(i))
  const primary = provider(rows), replacement = provider(rows); own(primary.service, replacement.service)
  expect(await primary.service.nativeActionReferences(identity)).toHaveLength(2048)
  replacement.actionReferences.mockResolvedValueOnce([row(2048)])
  await expect(primary.service.nativeActionReferences(identity)).rejects.toThrow('Combined')
})
it('rejects malformed wallet identities before querying providers', async () => {
  const primary = provider([])
  for (const invalid of ['', '02' + 'ff'.repeat(32), identity.toUpperCase()]) await expect(primary.service.nativeActionReferences(invalid)).rejects.toThrow()
  expect(primary.actionReferences).not.toHaveBeenCalled()
})
it('propagates failed owned snapshots without admitting partial evidence', async () => {
  const primary = provider([row(1)]), replacement = provider([]); own(primary.service, replacement.service)
  replacement.actionReferences.mockRejectedValueOnce(new Error('authenticated control snapshot failed'))
  await expect(primary.service.nativeActionReferences(identity)).rejects.toThrow('authenticated control snapshot failed')
})
