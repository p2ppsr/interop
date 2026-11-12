import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import type { ControlledWalletServices } from '../services.js'

export const shutdownSubmissionPolicy = 'tpnil-native-shutdown-submissions@1.0.0' as const
export const shutdownCoveragePolicy = 'tpnil-native-shutdown-submissions@2.0.0' as const
export const shutdownOrderedPolicy = 'tpnil-native-shutdown-submissions@3.0.0' as const
export const orderedSubmissionDescription = 'Observed append-only owner journal; pre-registration history is adopted at registration; provider-local positions are complete and increasing.' as const
export const shutdownSubmissionFilename = 'shutdown-submissions.json' as const
export type SubmissionClosureObserver = ReturnType<ControlledWalletServices['observeSubmissionClosure']>
export type ShutdownSubmission = { txid: string; verdict: string; beefHex: string }
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const now = () => new Date().toISOString()

/** Called only by the prospective driver. Cleanup failures are retained before
 * they are rethrown; no pre-shutdown report is rewritten or promoted. */
export async function closeWithSubmissionReceipt(options: {
  directory: string; observer: SubmissionClosureObserver; initialCapturedAt: string
  profile?: 'ITCVE-1@2.0.0' | 'ITCVE-1@4.0.0' | 'ITCVE-1@4.1.0' | 'ITCVE-1@4.2.0' | 'ITCVE-1@4.3.0' | 'ITCVE-1@4.4.0' | 'ITCVE-1@4.5.0' | 'ITCVE-1@4.6.0' | 'ITCVE-1@4.7.0'
  closeBrowser(): Promise<unknown>; closeServices(): Promise<unknown>; removeProfile(): unknown
}) {
  const profile = options.profile ?? 'ITCVE-1@2.0.0'
  if (!['ITCVE-1@2.0.0', 'ITCVE-1@4.0.0', 'ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.3.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(profile ?? '')) throw new Error('Unknown shutdown profile')
  const ordered = ['ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(profile)
  const policy = ordered ? shutdownOrderedPolicy : ['ITCVE-1@4.0.0', 'ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.3.0', 'ITCVE-1@4.4.0'].includes(profile ?? '') ? shutdownCoveragePolicy : shutdownSubmissionPolicy
  const cleanupErrors: unknown[] = [], evidenceErrors: unknown[] = [], stages: Record<string, any> = {}
  const closureStartedAt = now()
  for (const [name, close] of [['browser', options.closeBrowser], ['services', options.closeServices], ['profile', options.removeProfile]] as const) {
    const stage: any = { startedAt: now(), closed: false }; stages[name] = stage
    try { await close(); stage.closed = true } catch (error) { cleanupErrors.push(error); stage.error = String(error) }
    stage.endedAt = now()
  }
  const providers = options.observer.readFinalProviders()
  const journal = ordered ? options.observer.journal : undefined
  const finalJournal = (() => {
    try {
      if (ordered && journal?.ordering !== 'tpnil-owned-submission-order@1') throw new Error('Ordered shutdown requires the declared producer journal')
      return journal?.readFinal()
    } catch (error) { evidenceErrors.push(error); return undefined }
  })()
  const provenance = finalJournal?.provenance ?? options.observer.initialProviders.flatMap(provider => provider.submissions.map((_row, providerIndex) => ({ provider: provider.id, providerIndex })))
  const submissions: ShutdownSubmission[] = finalJournal?.submissions ?? structuredClone(options.observer.initialSubmissions)
  if (!ordered) for (const [index, provider] of providers.entries()) for (let providerIndex = options.observer.initialProviders[index]!.submissions.length; providerIndex < provider.submissions.length; providerIndex++) {
    submissions.push(provider.submissions[providerIndex]!); provenance.push({ provider: provider.id, providerIndex })
  }
  const binding = (name: string) => {
    try { const bytes = fs.readFileSync(path.join(options.directory, name)); return { path: name, bytes: bytes.length, sha256: sha(bytes) } }
    catch (error) { evidenceErrors.push(error); return { path: name, error: String(error) } }
  }
  const report = { schema: policy, policy, profile,
    claim: 'ENGINEERING_OBSERVATION_ONLY', initialCapturedAt: options.initialCapturedAt, closureStartedAt,
    initialProviders: options.observer.initialProviders, providers, initialCount: options.observer.initialSubmissions.length,
    submissions, provenance, ...(journal ? { initialProvenance: journal.initialProvenance } : {}), cleanup: stages, bindings: { record: binding('record.json'), global: binding('evidence/native-submissions.json'), module: binding('evidence/conformance/permission-lifecycle.json'), counterparts: binding('evidence/conformance/service-counterparts.json'), ...(['ITCVE-1@4.0.0', 'ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.3.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(profile ?? '') ? { coverage: binding('evidence/conformance/permission-coverage.json') } : {}) },
    capturedAt: now(), errors: [...cleanupErrors, ...evidenceErrors].map(String), failureCategories: { cleanup: cleanupErrors.map(String), evidence: evidenceErrors.map(String) }, ordering: ordered ? orderedSubmissionDescription : 'Original global prefix, then per-provider suffixes in declared provider order; no cross-provider chronology claim.' }
  fs.writeFileSync(path.join(options.directory, shutdownSubmissionFilename), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
  return { report, errors: [...cleanupErrors, ...evidenceErrors], cleanupErrors, evidenceErrors }
}
