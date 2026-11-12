import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { Transaction } from '@bsv/sdk'
import { EvidenceBundle } from '../src/wallet-lab/evidence.js'
import { verifyPermissionPrelude } from '../src/wallet-lab/native/verify-coverage-suite.js'
import { runNativePermissionPrelude } from '../src/wallet-lab/native/permission-prelude.js'
// Actual local4a/Go initial outputs; surrounding journal/UI timing below is
// constructed solely to test joins, never native qualification evidence.
const observedSnapshot = {
  "schema": "tpnil-native-owned-output-snapshots@1.0.0",
  "identityKey": "0217142f69535e4dad0dc7060df645c55a174cc1bfa5b9eb2e59aad2ae96072dfc",
  "providers": [
    {
      "id": "source",
      "componentIdentity": {
        "components": {
          "storage": "go"
        },
        "fixture": "independent-prelude-test"
      },
      "snapshot": {
        "schema": "tpnil-native-output-snapshot@2.0.0",
        "identityKey": "0217142f69535e4dad0dc7060df645c55a174cc1bfa5b9eb2e59aad2ae96072dfc",
        "providerIdentityKey": "034f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa",
        "outputs": [
          {
            "outputId": 11,
            "transactionId": 3,
            "outpoint": "482f6bfe0ac5ba9b8acd84d56088244b09aaecf1ec9f48884162a7178f4a1b12.0",
            "txid": "482f6bfe0ac5ba9b8acd84d56088244b09aaecf1ec9f48884162a7178f4a1b12",
            "rawTx": "0100000001f92c04a4c91f3bf86d4c180f010ffb83e794eb4f2cc092aed958e1c0b9061cf8000000006b483045022100c5de634c30ba0a495c084e5625d4aa95d7a6c31e6fafdd4f17d9eab10b15c71c02206b926783e87a0f6f1ae282f0b76cdc24b2f3e8aaca52a66c0c839f9bcd92d6c9412102c7b07af6ad7d5f05c5c074fab5dc0644a4d1df05f165797d8fa67d71b7c4d13bffffffff0910270000000000001976a9148c5b900efad6ec597baca243dd5db9d2b36579e488ac564a9f19000000001976a914c960b70f1bd0b766ba05f1ad78eb62c341c82b2588ac92fdc127000000001976a91483e615c61087d3214d7ec7c296649ca77759809588ac40697842000000001976a9141f58f9007509ae7ca6b0ae6fe5334a589d1088d488ac14fca917000000001976a914711e0f66de85f5cb315f923b928c65fef2b47c0f88ac9c76d732000000001976a91444c323578836e46801c1d9a9c331b933fcdfa7f488ac70090908000000001976a914afbca370529261ebec2673c7c009bdc1cbf77d5c88ac1e75bf22000000001976a914322775ca3efa378a52f664f6bf3cf75ef69774e088ac5b28e230000000001976a914acfba4a6e8e4c50d75a1b32130a22b450a9b1adb88ac00000000",
            "vout": 0,
            "satoshis": 10000,
            "lockingScript": "76a9148c5b900efad6ec597baca243dd5db9d2b36579e488ac",
            "spendable": true,
            "basketName": "default",
            "tags": [],
            "customInstructions": null
          },
          {
            "outputId": 21,
            "transactionId": 5,
            "outpoint": "40f3e778d8f1c8aee866961b2930b7fd31b351ea7e13dee4e03e54d3858ddb8d.0",
            "txid": "40f3e778d8f1c8aee866961b2930b7fd31b351ea7e13dee4e03e54d3858ddb8d",
            "rawTx": "0100000001121b4a8f17a7624188489fecf1ecaa094b248860d584cd8a9bbac50afe6b2f48060000006b483045022100ef86a6cba1b94a449832e1bd981b03bf2cb86a013cedf82a860e5ffcd5460664022058d7aaf074998b3ec20282fec3a87df92c5d54b4171e3f66ff3e3c6a1d58a633412103005df28992cbb0b5f65de2138a944a4e9718c64d6e5452ca400417dcb04a758dffffffff0910270000000000001976a9148c75290d3290b0fb6b9ef9b04b885f1eb7fa3edc88ac3fd89e00000000001976a9142fed9f0c8b5b5cc1365be69a6cc5b7cfab5887b988acce7d6d01000000001976a914334ec356ca7d4ba848b75896d4f0fecd8bd9f09288ac2ed55a01000000001976a9146c5f02b024f93ec6e84d58652ef0484082ca74f888ac2fba3601000000001976a91418d7a2c6eabcde6c26ed755ce976c8e65556532e88ac5d7ecb00000000001976a91467c4e0bb38164fb19db9d69c69d8d290fef0fd5788ac5e63a700000000001976a9145057e6020acfd241bb22db197663569b23ca7aeb88acbeba9400000000001976a9148afc1f9bdb555e39815bf6e3e0352d13b7dddc0888ac4e606301000000001976a91488985eac70d83f9d869b7bf7299dd9b3fd1a6e7888ac00000000",
            "vout": 0,
            "satoshis": 10000,
            "lockingScript": "76a9148c75290d3290b0fb6b9ef9b04b885f1eb7fa3edc88ac",
            "spendable": true,
            "basketName": "default",
            "tags": [],
            "customInstructions": null
          },
          {
            "outputId": 31,
            "transactionId": 7,
            "outpoint": "f693854d6f83a35c1a6384ac7a9acce05e617e5aeace17eaed6f1b6470ed8c0f.0",
            "txid": "f693854d6f83a35c1a6384ac7a9acce05e617e5aeace17eaed6f1b6470ed8c0f",
            "rawTx": "01000000018ddb8d85d3543ee0e4de137eea51b331fdb730291b9666e8aec8f1d878e7f340070000006a47304402207f6131980af45763d2efd4bfe3edec064e5f35e577c72132af4f7e1987ef5db80220081cab7cac30e5b4090283aaf8dacd444bf4e065c6560be7855e0886fb2f633a4121028566eb52ca9a6b165195970595432b68015d28a9f5d87a51cd6847e319c6cdaeffffffff0910270000000000001976a9140c72d64f35959989da9b67d6d38e018171ff264388ace5a41000000000001976a9143060fce143509549a07495cfd72646efb9cbf53888ac402c0700000000001976a9147e1d43a827401a0f280e150fa89ee6eb5c2d3e4b88ac8a960600000000001976a914b218589236cad6a4dcf6928b5ffed13fc38f32de88ac16ea1700000000001976a914e226863a138c3fb797ea0e6676bb695eea28eac788acc83a0d00000000001976a914e66eded1ffe97d74ede879ab10f4d0b32446d07e88ac548e1e00000000001976a9140fb01d03c770563978d3a4f905bacd4635bafae188ac9ef81d00000000001976a914dac233e5d9701e7331bc3a4b2ba854070d3b5c3e88ac00801400000000001976a9147b7100f8f2dc8ac5d609f8d1a9f836c8d89a9ec988ac00000000",
            "vout": 0,
            "satoshis": 10000,
            "lockingScript": "76a9140c72d64f35959989da9b67d6d38e018171ff264388ac",
            "spendable": true,
            "basketName": "default",
            "tags": [],
            "customInstructions": null
          }
        ]
      }
    }
  ]
}
const moduleCalls = vi.hoisted(() => ({ events: [] as string[] }))
vi.mock('../src/wallet-lab/native/conformance-permission-coverage.js', () => ({ runNativePermissionCoverage: async (context: any, revision: number) => { moduleCalls.events.push(`base:${revision}`); const r = { identity: observedSnapshot.identityKey }; context.evidence.addJson('conformance/permission-coverage.json', r); return r } }))
vi.mock('../src/wallet-lab/native/coverage-permissions-driver.js', () => ({ runPermissionExtension: async (context: any, anchor: any) => { moduleCalls.events.push(`extension:${anchor.identity}`); context.evidence.addJson('conformance/permission-extension.json', anchor) } }))
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
const at = (n: number) => new Date(Date.UTC(2026, 10, 12, 0, 0, n)).toISOString()
function fixture() {
  const snapshot = structuredClone(observedSnapshot), identity = snapshot.identityKey, outputs = snapshot.providers[0]!.snapshot.outputs
  const components = { components: { storage: 'go' }, fixture: 'independent-prelude-test' }; snapshot.providers[0]!.componentIdentity = components as any
  const points = outputs.map(r => r.outpoint!), storage = new Map(outputs.map(r => [r.txid!, Transaction.fromHex(r.rawTx!)]))
  const setup = 'ab'.repeat(32), todo = 'cd'.repeat(32), evidence: Record<string, any> = {
    'funding.json': { fundingTxid: outputs[0]!.txid },
    'conformance/funding-reserves.json': { identity, payments: points.slice(1).map(outpoint => ({ outpoint })) },
    'service-components.json': components,
    'native-output-provider-registry.json': [{ id: 'source', identityKey: outputs.length && snapshot.providers[0]!.snapshot.providerIdentityKey, componentIdentity: components }],
    'native-output-snapshot-observations.json': [{ sequence: 0, identityKey: identity, startedAt: at(2), endedAt: at(3), snapshots: snapshot }],
    'conformance/scenario-start.json': { startedAt: at(0) },
    'conformance/permission-prelude.json': { schema: 'tpnil-native-permission-prelude@1.0.0', prerequisite: 'fresh-managed-funding', identity, startedAt: at(1), endedAt: at(4), submissionStart: 3, submissionEnd: 3, initialOutputs: structuredClone(outputs), outputObservationSequence: 0 },
    'conformance/permission-coverage.json': { startedAt: at(5), endedAt: at(6), submissionWindow: { startIndex: 3, endIndex: 5 }, steps: [{ id: 'setup-basket', outcome: { value: { txid: setup } } }] },
    'conformance/permission-extension.json': { startedAt: at(7), endedAt: at(8), submissionWindow: { startIndex: 5, endIndex: 7 } },
    'conformance/permission-prelude-completion.json': { schema: 'tpnil-native-permission-prelude-completion@1.0.0', identity, startedAt: at(4), endedAt: at(9), submissionStart: 3, submissionEnd: 7 },
    'created-output.json': { createTxid: todo }
  }
  const readEvidence = (name: string) => Buffer.from(JSON.stringify(evidence[name]))
  const seal = () => { const c = evidence['conformance/permission-prelude-completion.json']; for (const [field, file] of [['initialSha256', 'permission-prelude'], ['coverageSha256', 'permission-coverage'], ['extensionSha256', 'permission-extension']]) c[field!] = hash(readEvidence(`conformance/${file}.json`)) }
  seal()
  const globalSubmissions = [...points.map(point => ({ txid: point.split('.')[0] })), { txid: setup }, { txid: '01'.repeat(32) }, { txid: '02'.repeat(32) }, { txid: '03'.repeat(32) }, { txid: todo }]
  return { evidence, seal, binding: { identity, fixture: {}, storageTransactions: storage, resolvedTransactions: storage, declaredNativePayments: points, globalSubmissions, readEvidence } }
}
describe('fresh permission prelude independently joins provider, funding and execution order', () => {
  it('accepts only exactinitial roots with bothpermission modules beforeToDo', () => { const f = fixture(); expect(verifyPermissionPrelude(f.binding)).toEqual({ verified: true, initialFundingOutpoints: [...f.binding.declaredNativePayments].sort(), beforeOtherCustomerTransactions: true }) })
  it.each(['prelude-digest', 'coverage-digest', 'extension-digest'])('rejects changed%s evidence', mode => { const f = fixture(), name = mode === 'prelude-digest' ? 'permission-prelude' : mode === 'coverage-digest' ? 'permission-coverage' : 'permission-extension'; f.evidence[`conformance/${name}.json`].unbound = true; expect(() => verifyPermissionPrelude(f.binding)).toThrow() })
  it.each(['identity', 'provider', 'registry', 'observation-error', 'observation-sequence', 'prelude-sequence', 'extra-output', 'spent', 'amount', 'basket', 'snapshot-swap', 'storage', 'undeclared', 'reserve-swap', 'initial-swap'])('rejects resealed%s provenance', mode => {
    const f = fixture(), p = f.evidence['conformance/permission-prelude.json'], o = f.evidence['native-output-snapshot-observations.json'][0], snapshot = o.snapshots.providers[0].snapshot
    if (mode === 'identity') p.identity = snapshot.providerIdentityKey
    if (mode === 'provider') o.snapshots.providers[0].componentIdentity = { substituted: true }
    if (mode === 'registry') f.evidence['native-output-provider-registry.json'][0].identityKey = f.binding.identity
    if (mode === 'observation-error') o.error = { message: 'snapshot unavailable' }
    if (mode === 'observation-sequence') o.sequence = 1
    if (mode === 'prelude-sequence') p.outputObservationSequence = 1
    if (mode === 'extra-output') p.initialOutputs.push(structuredClone(p.initialOutputs[0]))
    if (mode === 'spent') { p.initialOutputs[0].spendable = false; snapshot.outputs[0].spendable = false }
    if (mode === 'amount') { p.initialOutputs[0].satoshis = 84; snapshot.outputs[0].satoshis = 84 }
    if (mode === 'basket') { p.initialOutputs[0].basketName = 'unrelated'; snapshot.outputs[0].basketName = 'unrelated' }
    if (mode === 'snapshot-swap') snapshot.outputs[0].customInstructions = 'unjoined metadata'
    if (mode === 'storage') f.binding.storageTransactions.delete(p.initialOutputs[0].txid)
    if (mode === 'undeclared') f.binding.declaredNativePayments.pop()
    if (mode === 'reserve-swap') f.evidence['conformance/funding-reserves.json'].payments[0].outpoint = `${'ef'.repeat(32)}.0`
    if (mode === 'initial-swap') f.evidence['funding.json'].fundingTxid = 'ef'.repeat(32)
    f.seal(); expect(() => verifyPermissionPrelude(f.binding)).toThrow()
  })
  it.each(['scenario-after', 'snapshot-late', 'base-early', 'extension-early', 'completion-early', 'gap', 'base-gap', 'overlap', 'setup-not-first', 'todo-before'])('rejects%s ordering', mode => {
    const f = fixture(), p = f.evidence['conformance/permission-prelude.json'], c = f.evidence['conformance/permission-prelude-completion.json'], base = f.evidence['conformance/permission-coverage.json'], extension = f.evidence['conformance/permission-extension.json']
    if (mode === 'scenario-after') f.evidence['conformance/scenario-start.json'].startedAt = at(5)
    if (mode === 'snapshot-late') f.evidence['native-output-snapshot-observations.json'][0].endedAt = at(6)
    if (mode === 'base-early') base.startedAt = at(3)
    if (mode === 'extension-early') extension.startedAt = at(5)
    if (mode === 'completion-early') c.endedAt = at(7)
    if (mode === 'gap') p.submissionEnd++
    if (mode === 'base-gap') base.submissionWindow.startIndex++
    if (mode === 'overlap') extension.submissionWindow.startIndex--
    if (mode === 'setup-not-first') f.binding.globalSubmissions[3]!.txid = '99'.repeat(32)
    if (mode === 'todo-before') f.binding.globalSubmissions[6]!.txid = f.evidence['created-output.json'].createTxid
    f.seal(); expect(() => verifyPermissionPrelude(f.binding)).toThrow()
  })
  it('orchestrates only the two public modules after a verified initial snapshot', async () => {
    moduleCalls.events = []
    const evidence = new EvidenceBundle('/tmp/unused-prelude-unit'), flush = vi.spyOn(evidence, 'flush').mockReturnValue([])
    evidence.addJson('conformance/funding-reserves.json', { identity: observedSnapshot.identityKey })
    const services = { submissions: [], nativeOutputSnapshotObservations: [{ sequence: 0 }], nativeOutputSnapshots: vi.fn(async () => { moduleCalls.events.push('snapshot'); return structuredClone(observedSnapshot) }) }
    let boundaries = 0; await runNativePermissionPrelude({ evidence, services, manualPrompt: async (fn: any) => { boundaries++; return fn() } } as any)
    expect(moduleCalls.events).toEqual(['snapshot', 'base:5', `extension:${observedSnapshot.identityKey}`]); expect(boundaries).toBe(2); expect(flush).toHaveBeenCalledOnce()
    const p = JSON.parse(evidence.readBytes('conformance/permission-prelude.json').toString()), c = JSON.parse(evidence.readBytes('conformance/permission-prelude-completion.json').toString()); expect(p.initialOutputs).toEqual(observedSnapshot.providers[0]!.snapshot.outputs); expect(c.initialSha256).toBe(hash(evidence.readBytes('conformance/permission-prelude.json')))
  })
  it('stops before any permission module if funding snapshot contains a small preexisting output', async () => {
    moduleCalls.events = []; const evidence = new EvidenceBundle('/tmp/unused-prelude-unit'); evidence.addJson('conformance/funding-reserves.json', { identity: observedSnapshot.identityKey }); const bad = structuredClone(observedSnapshot); bad.providers[0]!.snapshot.outputs[0]!.satoshis = 84
    await expect(runNativePermissionPrelude({ evidence, services: { submissions: [], nativeOutputSnapshots: async () => bad }, manualPrompt: async (fn: any) => fn() } as any)).rejects.toThrow(); expect(moduleCalls.events).toEqual([])
  })
})
