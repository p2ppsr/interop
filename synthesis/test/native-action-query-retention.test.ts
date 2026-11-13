import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { GoServices, selectComponents } from '../src/wallet-lab/go-services.js'
import { ControlledWalletServices } from '../src/wallet-lab/services.js'
import { readNativeActionQueryFinalLedger, readNativeActionQueryFailureBundle, validateNativeActionQueryFinalLedger } from '../src/wallet-lab/native-action-query-ledger.js'

const final = JSON.parse(fs.readFileSync(new URL('./fixtures/native-action-query-ledger/final.json', import.meta.url), 'utf8'))
function writeFixture(directory: string): void {
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, 'final.json'), JSON.stringify(final.final))
  fs.writeFileSync(path.join(directory, 'entries.jsonl'), Buffer.from(final.journalBase64, 'base64'))
  for (const [name, encoded] of Object.entries(final.blobs)) fs.writeFileSync(path.join(directory, `${name}.blob`), Buffer.from(encoded as string, 'base64'))
}
function scratch(run: (directory: string) => void): void {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'action-retention-'))
  try { writeFixture(directory); run(directory) } finally { fs.rmSync(directory, { recursive: true, force: true }) }
}
it('retains exact terminal-error bytes and requires consistency with the final summary', () => scratch(directory => {
  const terminal = Buffer.from('[ "controlled post-retention error" ]\n')
  const summary = structuredClone(final.final); summary.terminalErrors = ['controlled post-retention error', 'provider duplicate']
  fs.writeFileSync(path.join(directory, 'final.json'), JSON.stringify(summary)); fs.writeFileSync(path.join(directory, 'terminal-errors.json'), terminal)
  const captured = readNativeActionQueryFinalLedger(directory)
  expect(Buffer.from(captured.terminalErrorsBase64!, 'base64')).toEqual(terminal)
  expect(captured.final.terminalErrors).toEqual(summary.terminalErrors)
  const mutation = structuredClone(captured); mutation.final.terminalErrors = []
  expect(() => validateNativeActionQueryFinalLedger(mutation)).toThrow()
}))
it.each(['final', 'journal', 'terminal'])('retains malformed %s bytes exactly for failed replay', kind => scratch(directory => {
  const name = kind === 'final' ? 'final.json' : kind === 'journal' ? 'entries.jsonl' : 'terminal-errors.json'
  const malformed = Buffer.from('{"truncated":\xff', 'binary'); fs.writeFileSync(path.join(directory, name), malformed)
  expect(() => readNativeActionQueryFinalLedger(directory)).toThrow()
  const capture = readNativeActionQueryFailureBundle(directory), member = capture.files.find(file => file.name === name)!
  expect(member.complete).toBe(true); expect(Buffer.from(member.base64, 'base64')).toEqual(malformed)
  expect(capture.files.find(file => file.name === 'entries.jsonl')).toBeDefined()
}))
it('records truncation without claiming complete oversized metadata retention', () => scratch(directory => {
  const bytes = Buffer.alloc(70 * 1024, 97); fs.writeFileSync(path.join(directory, 'final.json'), bytes)
  const member = readNativeActionQueryFailureBundle(directory).files.find(file => file.name === 'final.json')!
  expect(member.observedBytes).toBe(bytes.length); expect(member.retainedBytes).toBe(64 * 1024); expect(member.complete).toBe(false)
  expect(Buffer.from(member.base64, 'base64')).toEqual(bytes.subarray(0, 64 * 1024)); expect(member.error).toMatch(/truncated/)
}))
it('does not read symlink targets or unknown filenames into the diagnostic bundle', () => scratch(directory => {
  fs.unlinkSync(path.join(directory, 'final.json')); fs.symlinkSync(path.join(directory, 'entries.jsonl'), path.join(directory, 'final.json'))
  fs.writeFileSync(path.join(directory, 'unexpected-secret'), 'must-not-be-copied')
  const capture = readNativeActionQueryFailureBundle(directory)
  for (const name of ['final.json', 'unexpected-secret']) { const member = capture.files.find(file => file.name === name)!; expect(member.retainedBytes).toBe(0); expect(member.complete).toBe(false); expect(member.error).toBeDefined() }
}))
it('preserves malformed files through actual ControlledWalletServices cleanup and defensive getters', async () => {
  // LAB_SELF_TEST_ONLY: process already exited; real cleanup/lifecycle code reads
  // actual files. This makes no claim of a native or subprocess execution.
  const webroot = fs.mkdtempSync(path.join(os.tmpdir(), 'action-cleanup-'))
  const services = new ControlledWalletServices({ webroot, components: { storage: 'go' }, go: { storageCallerKnownInputsPatch: true } })
  const state = (services as any).temporaryDirectory as string, ledgerDirectory = path.join(state, 'action-query-ledger')
  const go = new GoServices(state, selectComponents({ storage: 'go' }), { storageCallerKnownInputsPatch: true })
  Object.assign(go as any, { admitted: true, process: { exitCode: 1, signalCode: null } }); (services as any).goServices = go
  writeFixture(ledgerDirectory); const malformed = Buffer.from('{"truncatedFinal":'); fs.writeFileSync(path.join(ledgerDirectory, 'final.json'), malformed)
  fs.writeFileSync(path.join(ledgerDirectory, 'terminal-errors.json'), '["controlled final write failure"]')
  try {
    await expect(services.close()).rejects.toThrow('Controlled service cleanup failed')
    expect(fs.existsSync(state)).toBe(false)
    const retained = services.nativeFinalActionQueryLedgers[0]!
    expect(retained.error).toBeDefined(); expect(retained.ledger).toBeUndefined()
    expect(Buffer.from(retained.rawFailure!.files.find(file => file.name === 'final.json')!.base64, 'base64')).toEqual(malformed)
    expect(retained.rawFailure!.files.find(file => file.name === 'terminal-errors.json')!.complete).toBe(true)
    retained.rawFailure!.files.length = 0
    expect(services.nativeFinalActionQueryLedgers[0]!.rawFailure!.files.length).toBeGreaterThan(2)
    await expect(services.close()).rejects.toThrow() // cached failure survives idempotent cleanup too
    expect(services.nativeFinalActionQueryLedgers[0]!.rawFailure!.files.length).toBeGreaterThan(2)
  } finally { fs.rmSync(webroot, { recursive: true, force: true }) }
})
it('rejects action-observed restart before destroying clients or closing the current epoch', async () => {
  const webroot = fs.mkdtempSync(path.join(os.tmpdir(), 'action-restart-')), services = new ControlledWalletServices({ webroot, components: { storage: 'go' } })
  let calls = 0
  ;(services as any).goServices = { actionObserverActive: true, close: async () => { calls++ }, start: async () => { calls++ } }
  ;(services as any).faucetWallet = { destroy: async () => { calls++ } }
  try { await expect(services.restartStorage()).rejects.toThrow(/separately retained lifecycle epoch/); expect(calls).toBe(0) }
  finally { fs.rmSync((services as any).temporaryDirectory, { recursive: true, force: true }); fs.rmSync(webroot, { recursive: true, force: true }) }
})
