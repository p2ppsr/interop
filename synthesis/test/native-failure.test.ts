import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { captureWithNativeCleanup, nativeFailureSnapshot, nativeShutdownFailure } from '../src/wallet-lab/native/failure.js'
import { closeWithSubmissionReceipt } from '../src/wallet-lab/native/shutdown-submissions.js'
import { verifyNativeShutdownSubmissions } from '../src/wallet-lab/native/verify-shutdown-submissions.js'

it('retains the original observer cause and every independent cleanup/evidence failure in a JSON round trip', () => {
  const primary = new Error('Native wallet settings page is absent')
  const error = nativeShutdownFailure({ error: primary }, [new Error('browser close rejected')], [new Error('record.json missing'), new Error('global ledger missing')])
  expect(error.cause).toBe(primary)
  const snapshot = JSON.parse(JSON.stringify(nativeFailureSnapshot(error)))
  expect(snapshot.message).toBe('Native wallet settings page is absent; cleanup failed; shutdown evidence is incomplete')
  expect(snapshot.cause.message).toBe(primary.message)
  expect(snapshot.errors.map((item: any) => item.message)).toEqual([primary.message, 'Native wallet cleanup failed', 'Native wallet shutdown evidence is incomplete'])
  expect(snapshot.errors[2].errors.map((item: any) => item.message)).toEqual(['record.json missing', 'global ledger missing'])
})

it('still fails a completed scenario if actual cleanup fails, without inventing a primary scenario failure', () => {
  const error = nativeShutdownFailure(undefined, [new Error('service still running')], [])
  expect(error.message).toBe('Native wallet cleanup failed')
  expect(error.cause).toBeUndefined()
  expect(nativeFailureSnapshot(error).errors?.[0]?.errors?.[0]?.message).toBe('service still running')
  expect(() => nativeShutdownFailure(undefined, [], [])).toThrow('No shutdown failure')
})

it('preserves thrown non-Error values and serializes cyclic causes without losing sibling failures', () => {
  const error = new Error('cycle'); error.cause = error
  const snapshot = nativeFailureSnapshot(nativeShutdownFailure({ error: undefined }, [error], ['write failed']))
  expect(snapshot.cause).toEqual({ name: 'ThrownValue', message: 'undefined' })
  expect(snapshot.errors?.[1]?.errors?.[0]?.cause?.message).toBe('[circular error reference]')
  expect(snapshot.errors?.[2]?.errors?.[0]?.message).toBe('write failed')
})

it.each(['observer-setup', 'final-ledger', 'receipt-write'])('still closes each resource exactly once when %s fails', async phase => {
  const calls: string[] = [], observed = new Error(`${phase} failed`)
  const result = await captureWithNativeCleanup(async close => {
    if (phase === 'observer-setup') throw observed
    await close.closeBrowser(); await close.closeServices(); await close.removeProfile()
    throw observed
  }, {
    closeBrowser: async () => { calls.push('browser') },
    closeServices: async () => { calls.push('services') }, removeProfile: () => { calls.push('profile') }
  })
  expect(calls).toEqual(['browser', 'services', 'profile'])
  expect(result.cleanupErrors).toEqual([])
  expect(result.evidenceErrors).toEqual([observed])
  const original = new Error('original observer failure')
  expect(nativeFailureSnapshot(nativeShutdownFailure({ error: original }, result.cleanupErrors, result.evidenceErrors)).errors?.map(item => item.message)).toEqual([original.message, 'Native wallet shutdown evidence is incomplete'])
})

it('retains failed fallback cleanup while attempting the remaining resources', async () => {
  const calls: string[] = [], closeError = new Error('browser still alive')
  const result = await captureWithNativeCleanup(async () => { throw new Error('observer unavailable') }, {
    closeBrowser: async () => { calls.push('browser'); throw closeError },
    closeServices: async () => { calls.push('services') }, removeProfile: () => { calls.push('profile') }
  })
  expect(calls).toEqual(['browser', 'services', 'profile'])
  expect(result.cleanupErrors).toEqual([closeError])
  expect(result.evidenceErrors).toHaveLength(1)
})

it.each([false, true])('closes every owned resource on an early abort and keeps missing success artifacts fatal (browser failure: %s)', async browserFailure => {
  // LAB_SELF_TEST_ONLY: an aborted run with no successful record or module files.
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-early-abort-'))
  const calls: string[] = []
  try {
    const result = await closeWithSubmissionReceipt({ directory, profile: 'ITCVE-1@4.3.0', initialCapturedAt: new Date().toISOString(),
      observer: { initialProviders: [{ id: 'source', submissions: [] }], initialSubmissions: [], readFinalProviders: () => { calls.push('ledger'); return [{ id: 'source', submissions: [] }] } },
      closeBrowser: async () => { calls.push('browser'); if (browserFailure) throw new Error('browser failed') },
      closeServices: async () => { calls.push('services') }, removeProfile: () => { calls.push('profile') }
    })
    expect(calls).toEqual(['browser', 'services', 'profile', 'ledger'])
    expect(result.cleanupErrors).toHaveLength(browserFailure ? 1 : 0)
    expect(result.evidenceErrors).toHaveLength(5)
    expect(result.report.cleanup.services.closed).toBe(true)
    expect(result.report.cleanup.profile.closed).toBe(true)
    expect(result.report.failureCategories.evidence).toHaveLength(5)
    const bytes = fs.readFileSync(path.join(directory, 'shutdown-submissions.json'))
    await expect(verifyNativeShutdownSubmissions(bytes, {} as any)).rejects.toThrow()
    const primary = new Error('Native wallet settings page is absent')
    const failure = nativeShutdownFailure({ error: primary }, result.cleanupErrors, result.evidenceErrors)
    expect(failure.cause).toBe(primary)
    expect(nativeFailureSnapshot(failure).errors?.at(-1)?.errors).toHaveLength(5)
    expect(fs.existsSync(path.join(directory, 'record.json'))).toBe(false)
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})
