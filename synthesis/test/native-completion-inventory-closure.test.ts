// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { PrivateKey } from '@bsv/sdk'
import { expect, it } from 'vitest'
import { closeCompletionInventoryLedger, observeCompletionInventoryClosure, captureCompletionInventoryLedger, completionInventoryClosureFile, completionInventoryLedgerFile, verifyCompletionInventoryClosure } from '../src/wallet-lab/native/completion-observer-ledger.js'

// LAB_SELF_TEST_ONLY: structural closure controls. Source/build, real storage,
// browser and transaction admission remain separate mandatory native gates.
const bytes = (value: unknown) => Buffer.from(JSON.stringify(value))
const digest = (value: Buffer) => ({ bytes: value.length, sha256: createHash('sha256').update(value).digest('hex') })
function fixture() {
  const live = JSON.parse(fs.readFileSync(new URL('./fixtures/native-action-query-ledger/live.json', import.meta.url)).toString())
  const actualFinal = JSON.parse(fs.readFileSync(new URL('./fixtures/native-action-query-ledger/final.json', import.meta.url)).toString())
  const base = Date.parse(live.entries[0].endedAt)
  const time = (n: number) => new Date(base + [-1000, -800, -700, 10, 15, 20, 60, 65, 70, 75][n]!).toISOString()
  const identity = live.identityKey
  const registry = ['11', '12'].map((key, index) => ({ id: index ? 'source/replacement-wallet.itcve.test' : 'source', identityKey: PrivateKey.fromHex(key.repeat(32)).toPublicKey().toString(), componentIdentity: { testOnly: key } }))
  const row = (certificate: boolean): any => ({ sequence: 0, startedAt: time(1), endedAt: time(2), registry,
    ...(certificate ? { identityKey: identity } : {}), snapshots: {
      schema: certificate ? 'tpnil-native-owned-certificate-inventories@1.0.0' : 'tpnil-native-owned-transaction-knowledge-inventories@1.0.0',
      ...(certificate ? { identityKey: identity } : {}), providers: registry.map(provider => ({ id: provider.id, componentIdentity: provider.componentIdentity,
        snapshot: certificate ? { schema: 'tpnil-native-certificate-inventory@1.0.0', identityKey: identity, providerIdentityKey: provider.identityKey, certificates: [], fields: [] }
          : { schema: 'tpnil-native-transaction-knowledge-inventory@1.0.0', scope: 'PROVIDER_GLOBAL_ALL_STATUSES_ALL_USERS_INCLUDING_DELETED', providerIdentityKey: provider.identityKey, knownCount: 0, transactionCount: 0, known: [], transactions: [] } }))
    } })
  const emptyHash = createHash('sha256').update('[]').digest('hex')
  const actionSummary = (providerIdentityKey: string) => ({ schema: 'tpnil-native-action-query-ledger@1.0.0', providerIdentityKey, entryCount: 0, requestCount: 0, inFlight: 0, finalized: false, entriesSha256: emptyHash, bytes: 0, terminalErrors: [] })
  const actionCut = { sequence: 0, startedAt: time(1), endedAt: time(2), registry, identityKey: identity, snapshots: {
    schema: 'tpnil-native-owned-action-query-cuts@1.0.0', identityKey: identity,
    providers: registry.map(provider => ({ id: provider.id, componentIdentity: provider.componentIdentity, snapshot: {
      ...actionSummary(provider.identityKey), identityKey: identity, from: 1, through: 0, index: [], entries: [], blobs: {}, entryBase64: {}
    } }))
  } }
  actionCut.startedAt = new Date(base + 1).toISOString(); actionCut.endedAt = new Date(base + 2).toISOString()
  actionCut.snapshots.providers[0]!.snapshot = live
  const initial: any = { schema: 'tpnil-native-completion-inventory-ledger@1.0.0', profile: 'ITCVE-1@4.5.0', registry, certificates: [row(true)], transactionKnowledge: [row(false)], actionQueries: [actionCut], capturedAt: time(3) }
  const record = { itcve: 'ITCVE-1@4.5.0', startedAt: time(0), endedAt: time(4) }
  const shutdown: any = { initialProviders: registry.map(({ id }) => ({ id })), providers: registry.map(({ id }) => ({ id })), profile: record.itcve, closureStartedAt: time(5), cleanup: Object.fromEntries(['browser', 'services', 'profile'].map(name => [name, { closed: true, startedAt: time(5), endedAt: time(6) }])), errors: [], capturedAt: time(7) }
  const closure: any = { schema: 'tpnil-native-completion-inventory-closure@1.0.0', profile: record.itcve, final: { ...structuredClone(initial), capturedAt: time(8) }, errors: [], capturedAt: time(9) }
  closure.actionLedgers = registry.map(provider => ({ id: provider.id, providerIdentityKey: provider.identityKey, componentIdentity: provider.componentIdentity, ledger: {
    schema: 'tpnil-native-action-query-final-ledger@1.0.0', capturedAt: time(6), final: { ...actionSummary(provider.identityKey), finalized: true }, journalBase64: '', blobs: {}
  } }))
  closure.actionLedgers[0].ledger = actualFinal
  const readEvidence = (name: string) => {
    if (name === 'service-components.json') return bytes(registry[0]!.componentIdentity)
    if (name === 'conformance/service-counterparts.json') return bytes({ 'replacement-wallet.itcve.test': registry[1]!.componentIdentity })
    throw new Error(name)
  }
  const bind = () => { closure.bindings = { 'record.json': digest(bytes(record)), [`evidence/${completionInventoryLedgerFile}`]: digest(bytes(initial)), 'shutdown-submissions.json': digest(bytes(shutdown)) } }
  const check = () => verifyCompletionInventoryClosure({ initialBytes: bytes(initial), closureBytes: bytes(closure), recordBytes: bytes(record), shutdownBytes: bytes(shutdown), identity, readEvidence })
  bind(); return { initial, closure, shutdown, record, bind, check }
}
it('binds both full provider ledgers across completed cleanup', () => {
  expect(fixture().check()).toEqual({ verified: true, providers: 2, certificates: 1, transactionKnowledge: 1, actionQueries: 1, actionEntries: 1, actionBoundEntries: 1, actionCwiJoin: 'UNAVAILABLE' })
})
for (const [name, mutate] of Object.entries<Record<string, (f: ReturnType<typeof fixture>) => void>[string]>({
  'removed retired provider': f => { f.initial.registry.pop() },
  'sequence gap': f => { f.initial.certificates[0].sequence = 1 },
  'fractional sequence': f => { f.initial.transactionKnowledge[0].sequence = 0.5 },
  'missing entire inventory kind': f => { f.initial.transactionKnowledge = [] },
  'unobserved provider': f => { f.initial.certificates[0].snapshots.providers.pop() },
  'foreign authenticated identity': f => { f.initial.certificates[0].snapshots.identityKey = f.initial.registry[0].identityKey },
  'foreign storage identity': f => { f.initial.transactionKnowledge[0].snapshots.providers[1].snapshot.providerIdentityKey = f.initial.registry[0].identityKey },
  'retained observer error': f => { f.initial.certificates[0].error = { name: 'Error', message: 'cut failed' } },
  'unfinished cut': f => { f.initial.certificates[0].endedAt = '' },
  'cut before run': f => { f.initial.certificates[0].startedAt = '2020-01-01T00:00:00.000Z' },
  'late cleanup cut': f => { f.closure.final.certificates.push({ ...f.closure.final.certificates[0], sequence: 1 }) },
  'rewritten final cut': f => { f.closure.final.transactionKnowledge[0].endedAt = f.initial.capturedAt },
  'cleanup failure': f => { f.shutdown.cleanup.services.closed = false },
  'observer capture before cleanup': f => { f.closure.final.capturedAt = f.initial.capturedAt },
  'live journal prefix hash': f => { f.initial.actionQueries[0].snapshots.providers[0].snapshot.entriesSha256 = '0'.repeat(64) },
  'live exact entry bytes': f => { f.initial.actionQueries[0].snapshots.providers[0].snapshot.entryBase64['1'] = Buffer.from('{}').toString('base64') },
  'live cut before retained response': f => { f.initial.actionQueries[0].endedAt = f.record.startedAt },
  'changed final journal bytes': f => { f.closure.actionLedgers[0].ledger.journalBase64 = Buffer.from('{}\n').toString('base64') },
  'unfinished action ledger': f => { f.closure.actionLedgers[0].ledger.final.finalized = false },
  'action observer terminal failure': f => { f.closure.actionLedgers[1].ledger.final.terminalErrors = ['retention failure'] },
  'raw action failure with suppressed error': f => { f.closure.actionLedgers[1].rawFailure = { schema: 'tpnil-native-action-query-raw-failure@1.0.0' } },
  'action call still in flight': f => { f.closure.actionLedgers[0].ledger.final.inFlight = 1 },
  'action provider omitted': f => { f.closure.actionLedgers.pop() },
  'wrong action provider': f => { f.closure.actionLedgers[1].providerIdentityKey = f.initial.registry[0].identityKey },
  'action cut missing': f => { f.initial.actionQueries = [] },
  'wrong profile': f => { f.closure.profile = 'ITCVE-1@4.4.0' }
})) it(`rejects ${name} even with recomputed content hashes`, () => {
  const f = fixture(); mutate(f); f.bind(); expect(f.check).toThrow()
})
it('rejects a coherently empty observer for the nonempty fixed native program', () => {
  const f = fixture(), emptyHash = createHash('sha256').update('[]').digest('hex')
  for (const ledger of [f.initial, f.closure.final]) for (const provider of ledger.actionQueries[0].snapshots.providers) {
    Object.assign(provider.snapshot, { entryCount: 0, requestCount: 0, through: 0, index: [], entries: [], entryBase64: {}, blobs: {}, entriesSha256: emptyHash, bytes: 0 })
  }
  for (const row of f.closure.actionLedgers) {
    Object.assign(row.ledger.final, { entryCount: 0, requestCount: 0, entriesSha256: emptyHash, bytes: 0 })
    row.ledger.journalBase64 = ''; row.ledger.blobs = {}
  }
  f.bind(); expect(f.check).toThrow('must retain an authenticated wallet action query')
})
it('rejects changed hash binding', () => {
  const f = fixture(); f.closure.bindings['record.json'].sha256 = '0'.repeat(64); expect(f.check).toThrow()
})
it('retains postcleanup capture failure and missing bindings, without rewriting an earlier receipt', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-inventory-closure-'))
  try {
    const source: any = { get nativeOutputProviderRegistry() { throw new Error('controlled retained-ledger failure') } }
    const closed = closeCompletionInventoryLedger(directory, source)
    expect(closed.errors).toHaveLength(4)
    const file = path.join(directory, completionInventoryClosureFile), raw = fs.readFileSync(file)
    expect(JSON.parse(raw.toString()).errors[0]).toContain('controlled retained-ledger failure')
    expect(() => closeCompletionInventoryLedger(directory, source)).toThrow()
    expect(fs.readFileSync(file)).toEqual(raw)
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

it('retains retired ownership while still observing late ledger appends', () => {
  const source: any = { nativeOutputProviderRegistry: [{ id: 'source' }, { id: 'retired' }], nativeCertificateInventoryObservations: [], nativeTransactionKnowledgeInventoryObservations: [] }
  const observed = observeCompletionInventoryClosure(source)
  source.nativeOutputProviderRegistry.pop()
  source.nativeCertificateInventoryObservations.push({ sequence: 0 })
  expect(observed.nativeOutputProviderRegistry).toHaveLength(2)
  expect(observed.nativeCertificateInventoryObservations).toHaveLength(1)
  observed.nativeOutputProviderRegistry.pop()
  expect(observed.nativeOutputProviderRegistry).toHaveLength(2)
})

it('preserves explicit4.7 identity across retired ownership and late journal capture',()=>{
 const source:any={submissionOrdering:'tpnil-owned-submission-order@1',nativeOutputProviderRegistry:[{id:'source'},{id:'retired'}],nativeCertificateInventoryObservations:[],nativeTransactionKnowledgeInventoryObservations:[],nativeActionQueryObservations:[],nativeFinalActionQueryLedgers:[]}
 const observer=observeCompletionInventoryClosure(source,'ITCVE-1@4.7.0')
 source.nativeOutputProviderRegistry=[];source.nativeCertificateInventoryObservations.push({sequence:0})
 const captured=captureCompletionInventoryLedger(observer)
 expect(captured.profile).toBe('ITCVE-1@4.7.0');expect(captured.registry).toHaveLength(2);expect(captured.certificates).toHaveLength(1)
 expect(captureCompletionInventoryLedger({...source,submissionOrdering:'tpnil-owned-submission-order@1'}).profile).toBe('ITCVE-1@4.6.0')
})
