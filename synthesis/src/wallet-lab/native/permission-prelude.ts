import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import type { NativeScenarioContext } from '../yours-driver.js'
import { runNativePermissionCoverage } from './conformance-permission-coverage.js'
import { runPermissionExtension } from './coverage-permissions-driver.js'

/** This profile runs spending controls before other customer transactions can
 * populate the default basket with small, fee-sensitive change outputs. Funding
 * remains the three declared upfront payments; no refill or storage mutation. */
export async function runNativePermissionPrelude(context: NativeScenarioContext): Promise<void> {
  const { services, evidence } = context
  const reserves = JSON.parse(evidence.readBytes('conformance/funding-reserves.json').toString())
  const startedAt = new Date().toISOString(), submissionStart = services.submissions.length
  const snapshots = await services.nativeOutputSnapshots(reserves.identity)
  assert.equal(snapshots.providers.length, 1); assert.equal(snapshots.providers[0]!.id, 'source')
  const initialOutputs = snapshots.providers[0]!.snapshot.outputs
  assert.equal(initialOutputs.length, 3, 'Permission prelude requires only the three upfront native funding outputs')
  for (const output of initialOutputs) { assert.equal(output.satoshis, 10_000); assert.equal(output.spendable, true); assert.equal(output.basketName, 'default') }
  assert.equal(new Set(initialOutputs.map(output => output.outpoint)).size, 3)
  assert.equal(services.submissions.length, submissionStart)
  const observation = services.nativeOutputSnapshotObservations.at(-1)!
  const prelude = { schema: 'tpnil-native-permission-prelude@1.0.0', prerequisite: 'fresh-managed-funding', identity: reserves.identity,
    startedAt, endedAt: new Date().toISOString(), submissionStart, submissionEnd: submissionStart, initialOutputs,
    outputObservationSequence: observation.sequence }
  evidence.addJson('conformance/permission-prelude.json', prelude)
  const sha = (name: string) => createHash('sha256').update(evidence.readBytes(name)).digest('hex')
  const coverage = await context.manualPrompt(() => runNativePermissionCoverage(context, 5))
  await context.manualPrompt(() => runPermissionExtension(context, coverage))
  evidence.addJson('conformance/permission-prelude-completion.json', { schema: 'tpnil-native-permission-prelude-completion@1.0.0', identity: reserves.identity,
    startedAt: prelude.endedAt, endedAt: new Date().toISOString(), submissionStart, submissionEnd: services.submissions.length,
    initialSha256: sha('conformance/permission-prelude.json'), coverageSha256: sha('conformance/permission-coverage.json'), extensionSha256: sha('conformance/permission-extension.json') })
  evidence.flush()
}
