// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import type { ControlledWalletServices } from '../services.js'
import { assertCertificateInventoryIdentity } from '../native-certificate-inventory.js'
import { assertTransactionKnowledgeProvider } from '../native-transaction-knowledge-inventory.js'
import { validateNativeActionQueryCuts, validateNativeActionQueryFinalLedger } from '../native-action-query-ledger.js'
import { nativeCompletionProviders } from './coverage-completion/providers.js'

export const completionInventoryLedgerFile = 'native-completion-inventory-ledger.json'
export const completionInventoryClosureFile = 'completion-inventory-closure.json'
const digest = (bytes: Buffer) => ({ bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
type Source = { integratedProfile?: string; submissionOrdering?: ControlledWalletServices['submissionOrdering'] } & Pick<ControlledWalletServices, 'nativeOutputProviderRegistry' | 'nativeCertificateInventoryObservations' | 'nativeTransactionKnowledgeInventoryObservations' | 'nativeActionQueryObservations' | 'nativeFinalActionQueryLedgers'>

/** Capture ownership before close() deliberately clears route/provider maps.
 * Keep reading the original append-only arrays through their defensive getters.
 * The parent also joins these retained owner IDs to the final shutdown receipt. */
export function observeCompletionInventoryClosure(source: Source, profile?: string): Source {
  const registry = structuredClone(source.nativeOutputProviderRegistry)
  return {
    integratedProfile: profile ?? source.integratedProfile,
    submissionOrdering: source.submissionOrdering,
    get nativeOutputProviderRegistry() { return structuredClone(registry) },
    get nativeCertificateInventoryObservations() { return source.nativeCertificateInventoryObservations },
    get nativeTransactionKnowledgeInventoryObservations() { return source.nativeTransactionKnowledgeInventoryObservations },
    get nativeActionQueryObservations() { return source.nativeActionQueryObservations },
    get nativeFinalActionQueryLedgers() { return source.nativeFinalActionQueryLedgers }
  }
}

/** Snapshot retained control observations without making another storage call.
 * Failed observations are retained; only the independent parent admits them. */
export function captureCompletionInventoryLedger(source: Source, profile?: string) {
  return {
    schema: 'tpnil-native-completion-inventory-ledger@1.0.0', profile: profile ?? source.integratedProfile ?? (source.submissionOrdering ? 'ITCVE-1@4.6.0' : 'ITCVE-1@4.5.0'),
    registry: source.nativeOutputProviderRegistry,
    certificates: source.nativeCertificateInventoryObservations,
    transactionKnowledge: source.nativeTransactionKnowledgeInventoryObservations,
    actionQueries: source.nativeActionQueryObservations,
    capturedAt: new Date().toISOString()
  }
}

/** Runs after browser/services/profile cleanup. Write a separate receipt so the
 * record's original evidence is never rewritten after its digest was captured. */
export function closeCompletionInventoryLedger(directory: string, source: Source) {
  const errors: unknown[] = [], bindings: Record<string, unknown> = {}
  let final: ReturnType<typeof captureCompletionInventoryLedger> | null = null
  let actionLedgers: Source['nativeFinalActionQueryLedgers'] | null = null
  try { final = captureCompletionInventoryLedger(source) } catch (error) { errors.push(error) }
  try { actionLedgers = source.nativeFinalActionQueryLedgers } catch (error) { errors.push(error) }
  for (const name of ['record.json', `evidence/${completionInventoryLedgerFile}`, 'shutdown-submissions.json']) {
    try { bindings[name] = digest(fs.readFileSync(path.join(directory, name))) }
    catch (error) { errors.push(error); bindings[name] = { error: String(error) } }
  }
  const report = { schema: 'tpnil-native-completion-inventory-closure@1.0.0', profile: source.integratedProfile ?? (source.submissionOrdering ? 'ITCVE-1@4.6.0' : 'ITCVE-1@4.5.0'),
    final, actionLedgers, bindings, errors: errors.map(String), capturedAt: new Date().toISOString() }
  fs.writeFileSync(path.join(directory, completionInventoryClosureFile), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
  return { report, errors }
}

const at = (value: string) => { const n = Date.parse(value); assert.equal(new Date(n).toISOString(), value); return n }

export function verifyCompletionInventoryClosure(options: {
  initialBytes: Buffer; closureBytes: Buffer; recordBytes: Buffer; shutdownBytes: Buffer
  identity: string; readEvidence(name: string): Buffer
}) {
  const initial = JSON.parse(options.initialBytes.toString()), closure = JSON.parse(options.closureBytes.toString())
  const shutdown = JSON.parse(options.shutdownBytes.toString()), record = JSON.parse(options.recordBytes.toString())
  const registry = nativeCompletionProviders(options.readEvidence)
  assert.ok(['ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(record.itcve))
  assert.equal(shutdown.profile, record.itcve)
  assert.equal(closure.schema, 'tpnil-native-completion-inventory-closure@1.0.0')
  assert.equal(closure.profile, record.itcve); assert.deepEqual(closure.errors, [])
  for (const key of ['initialProviders', 'providers']) assert.deepEqual(shutdown[key].map((provider: any) => provider.id), registry.map(provider => provider.id))
  assert.deepEqual(closure.bindings, {
    'record.json': digest(options.recordBytes),
    [`evidence/${completionInventoryLedgerFile}`]: digest(options.initialBytes),
    'shutdown-submissions.json': digest(options.shutdownBytes)
  })
  const verify = (ledger: any) => {
    assert.equal(ledger.schema, 'tpnil-native-completion-inventory-ledger@1.0.0'); assert.equal(ledger.profile, record.itcve)
    assert.deepEqual(ledger.registry, registry)
    for (const kind of ['certificates', 'transactionKnowledge', 'actionQueries'] as const) {
      const rows = ledger[kind]; assert.ok(Array.isArray(rows) && rows.length > 0 && rows.length <= 2048)
      let end = at(record.startedAt)
      for (const [sequence, row] of rows.entries()) {
        assert.equal(row.sequence, sequence); assert.equal(row.error, undefined)
        assert.ok(at(row.startedAt) >= end); end = at(row.endedAt); assert.ok(end >= at(row.startedAt))
        assert.ok(end <= at(ledger.capturedAt)); assert.deepEqual(row.registry, registry)
        assert.ok(row.snapshots); assert.equal(row.snapshots.providers.length, registry.length)
        if (kind === 'certificates') {
          assert.equal(row.identityKey, options.identity)
          assert.equal(row.snapshots.schema, 'tpnil-native-owned-certificate-inventories@1.0.0')
          assert.equal(row.snapshots.identityKey, options.identity)
        } else if (kind === 'transactionKnowledge') {
          assert.equal(row.identityKey, undefined)
          assert.equal(row.snapshots.schema, 'tpnil-native-owned-transaction-knowledge-inventories@1.0.0')
        } else {
          assert.equal(row.identityKey, options.identity)
          assert.equal(row.snapshots.schema, 'tpnil-native-owned-action-query-cuts@1.0.0')
          assert.equal(row.snapshots.identityKey, options.identity)
        }
        for (const [index, provider] of row.snapshots.providers.entries()) {
          const expected = registry[index]!
          assert.equal(provider.id, expected.id); assert.deepEqual(provider.componentIdentity, expected.componentIdentity)
          if (kind === 'certificates') assertCertificateInventoryIdentity(provider.snapshot, options.identity, expected.identityKey)
          else if (kind === 'transactionKnowledge') assertTransactionKnowledgeProvider(provider.snapshot, expected.identityKey)
          else {
            const snapshot = validateNativeActionQueryCuts(provider.snapshot, options.identity, expected.identityKey)
            assert.deepEqual(snapshot.terminalErrors, [])
            assert.equal(snapshot.from, 1); assert.equal(snapshot.through, snapshot.entryCount)
            for (const entry of snapshot.entries) assert.ok(Date.parse(entry.endedAt) <= end)
          }
        }
      }
    }
  }
  verify(initial); verify(closure.final)
  // Control observations are driven only by the completed, awaited scenario.
  // Any new, removed or changed cut during cleanup invalidates its parent join.
  for (const key of ['registry', 'certificates', 'transactionKnowledge', 'actionQueries']) assert.deepEqual(closure.final[key], initial[key])
  assert.ok(at(initial.capturedAt) <= at(record.endedAt))
  assert.ok(at(record.endedAt) <= at(shutdown.closureStartedAt))
  for (const stage of Object.values(shutdown.cleanup) as any[]) {
    assert.equal(stage.closed, true); assert.equal(stage.error, undefined)
    assert.ok(at(stage.endedAt) <= at(closure.final.capturedAt))
  }
  assert.deepEqual(shutdown.errors, [])
  assert.ok(at(shutdown.capturedAt) <= at(closure.final.capturedAt))
  assert.ok(at(closure.final.capturedAt) <= at(closure.capturedAt))
  assert.ok(Array.isArray(closure.actionLedgers)); assert.equal(closure.actionLedgers.length, registry.length)
  let actionEntries = 0, actionBoundEntries = 0
  for (const [index, retained] of closure.actionLedgers.entries()) {
    const provider = registry[index]!
    assert.equal(retained.id, provider.id); assert.equal(retained.providerIdentityKey, provider.identityKey)
    assert.deepEqual(retained.componentIdentity, provider.componentIdentity); assert.equal(retained.error, undefined); assert.equal(retained.rawFailure, undefined)
    const ledger = validateNativeActionQueryFinalLedger(retained.ledger, provider.identityKey)
    assert.equal(ledger.final.finalized, true); assert.equal(ledger.final.inFlight, 0); assert.deepEqual(ledger.final.terminalErrors, [])
    assert.ok(ledger.final.requestCount >= ledger.final.entryCount)
    assert.ok(Date.parse(ledger.capturedAt) >= at(shutdown.cleanup.services.startedAt))
    assert.ok(Date.parse(ledger.capturedAt) <= at(shutdown.cleanup.services.endedAt))
    const raw = Buffer.from(ledger.journalBase64, 'base64').toString()
    const lines: string[] = raw.length ? raw.slice(0, -1).split('\n') : []
    actionEntries += lines.length
    for (const line of lines) {
      const entry = JSON.parse(line)
      assert.ok(Date.parse(entry.startedAt) >= at(record.startedAt))
      assert.ok(Date.parse(entry.endedAt) <= Date.parse(ledger.capturedAt))
      if (entry.identityKey === options.identity && entry.rpcProviderBound) actionBoundEntries++
    }
    for (const observation of initial.actionQueries) {
      const snapshot = observation.snapshots.providers[index].snapshot
      assert.ok(snapshot.entryCount <= ledger.final.entryCount && snapshot.requestCount <= ledger.final.requestCount)
      const prefix = `[${lines.slice(0, snapshot.entryCount).join(',')}]`
      assert.equal(createHash('sha256').update(prefix).digest('hex'), snapshot.entriesSha256)
      for (const row of snapshot.index) {
        const line = lines[row.sequence - 1]!, entry = JSON.parse(line)
        assert.equal(createHash('sha256').update(line).digest('hex'), row.sha256)
        assert.equal(entry.identityKey, row.identityKey)
      }
      for (const entry of snapshot.entries) assert.deepEqual(entry, JSON.parse(lines[entry.sequence - 1]!))
      for (const [key, value] of Object.entries(snapshot.blobs)) assert.equal(ledger.blobs[key], value)
    }
  }
  assert.ok(actionBoundEntries > 0, 'The fixed native program must retain an authenticated wallet action query')
  return { verified: true as const, providers: registry.length,
    certificates: initial.certificates.length, transactionKnowledge: initial.transactionKnowledge.length,
    actionQueries: initial.actionQueries.length, actionEntries, actionBoundEntries, actionCwiJoin: 'UNAVAILABLE' as const }
}
