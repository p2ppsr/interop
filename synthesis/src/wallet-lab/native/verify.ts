import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { Beef, LockingScript, P2PKH, PublicKey, PushDrop, Transaction, Utils } from '@bsv/sdk'
import { canonicalJson, sha256Hex } from '../../determinism.js'
import { aggregateOutcome } from '../model.js'
import { verifyEvidenceBundle } from '../evidence.js'

export function verifyHostReceipt(observation: Record<string, any>, image: string): void {
  assert.equal(observation.image, image); assert.equal(observation.networkMode, 'none'); assert.equal(observation.privileged, false)
  assert.equal(observation.readonly, true); assert.equal(observation.init, true); assert.equal(observation.pidMode, '')
  assert.deepEqual(observation.capDrop, ['ALL']); assert.ok(!observation.capAdd?.length)
  assert.match(observation.user, /^[1-9]\d*:[1-9]\d*$/)
  assert.deepEqual(observation.mounts.filter((mount: { type: string }) => mount.type === 'bind').map((mount: { destination: string }) => mount.destination), ['/evidence'])
  assert.ok(Object.keys(observation.networks).every(name => name === 'none'))
}

export async function verifyNativeWallet(directory: string) {
  const read = (name: string) => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'))
  const lock = read('run-lock.json'), plan = lock.plan
  assert.equal(lock.schema, 'tpnil-native-wallet-run-lock@1.0.0')
  const trustedIdentity = plan.id === 'YOURS-5.1.0-GO-ITCVE-1.3.0-TRUSTED-IDENTITY'
  const integrated = trustedIdentity || plan.id === 'YOURS-5.1.0-GO-ITCVE-1.3.0'
  const frozen = JSON.parse(fs.readFileSync(fileURLToPath(new URL(trustedIdentity ? '../../../../infra/native/integrated/plan-trusted.json' : integrated ? '../../../../infra/native/integrated/plan.json' : '../../../../infra/native/yours-go/plan.json', import.meta.url)), 'utf8'))
  assert.equal(canonicalJson(plan), canonicalJson(frozen))
  assert.equal(plan.id, trustedIdentity ? 'YOURS-5.1.0-GO-ITCVE-1.3.0-TRUSTED-IDENTITY' : integrated ? 'YOURS-5.1.0-GO-ITCVE-1.3.0' : 'YOURS-5.1.0-GO-ITCVE-1.2.0')
  if (integrated) {
    const root = path.resolve(import.meta.dirname, '../../../..')
    if (trustedIdentity) {
      assert.equal(plan.identityTrust, 'public-settings-token')
      assert.equal(sha256Hex(fs.readFileSync(path.join(root, plan.identityTrustProfile))), plan.identityTrustProfileSha256)
    }
    assert.equal(sha256Hex(fs.readFileSync(path.join(root, plan.compatibilityPatch))), plan.compatibilityPatchSha256)
    assert.equal(sha256Hex(fs.readFileSync(path.join(root, plan.boundaryProfile))), plan.boundaryProfileSha256)
  }
  assert.equal(sha256Hex(Buffer.from(JSON.stringify(plan, null, 2) + '\n')), lock.planSha256)
  assert.equal(lock.image.os, 'linux'); assert.equal(lock.image.architecture, 'amd64')
  assert.equal(lock.runner.platform, 'linux'); assert.equal(lock.runner.architecture, 'x64')
  assert.match(lock.source, /^[a-f0-9]{40}$/)
  const userns = read('host-userns.json')
  assert.equal(userns.active, '0'); assert.equal(userns.restored, userns.before); assert.equal(userns.restoredSuccessfully, true)
  const results = []
  const containers = new Set<string>()
  for (let index = 1; index <= 2; index++) {
    const before = read(`host-repetition-${index}-before.json`), after = read(`host-repetition-${index}-after.json`), cleanup = read(`host-repetition-${index}-cleanup.json`)
    assert.equal(before.id, after.id); assert.equal(before.id, cleanup.id); assert.ok(!containers.has(before.id)); containers.add(before.id)
    for (const observation of [before, after]) {
      verifyHostReceipt(observation, lock.image.id)
    }
    assert.equal(after.state.Running, false); assert.equal(after.state.Status, 'exited'); assert.equal(after.state.Pid, 0)
    assert.equal(after.state.ExitCode, 0); assert.equal(after.state.OOMKilled, false); assert.equal(cleanup.removed, true)
    const rep = path.join(directory, `repetition-${index}`)
    const record = verifyEvidenceBundle(rep)
    assert.equal(record.itcve, integrated ? 'ITCVE-1@1.3.0' : 'ITCVE-1@1.1.0')
    const evidence = (name: string) => JSON.parse(fs.readFileSync(path.join(rep, 'evidence', name), 'utf8'))
    const installed = read(`repetition-${index}/installed-artifacts.json`)
    assert.equal(installed.exactArchiveContents, true)
    assert.match(installed.walletDirectorySha256, /^[a-f0-9]{64}$/); assert.match(installed.applicationDirectorySha256, /^[a-f0-9]{64}$/)
    assert.deepEqual(record.artifacts.wallet, plan.wallet); assert.deepEqual(record.artifacts.application, plan.application)
    assert.deepEqual(record.configuration.serviceComponents?.components, plan.components)
    assert.deepEqual(record.vectors.map(vector => vector.id), Array.from({ length: 8 }, (_, i) => `ISI-4-V00${i+1}`))
    for (const vector of record.vectors) assert.equal(record.semanticProjection[vector.id.toLowerCase().replace('isi-4-', '')], vector.outcome)
    assert.equal(record.runner.architecture, 'x64')
    assert.equal(record.observations.walletVersion, 'yours-wallet-5.1.0'); assert.equal(record.observations.walletNetwork, 'mainnet'); assert.equal(record.observations.authenticated, true)
    assert.match(fs.readFileSync(path.join(rep, 'browser-version.txt'), 'utf8'), /151\.0\.7922\.34/)
    const worker = read(`repetition-${index}/worker.json`)
    const mongoCleanup = read(`repetition-${index}/mongo-cleanup.json`)
    assert.equal(mongoCleanup.clean, true); assert.equal(mongoCleanup.forced, false); assert.equal(mongoCleanup.code, 0)
    assert.equal(worker.completed, true); assert.equal(worker.cleanWalletAndServiceShutdown, true)
    assert.equal(worker.recordSha256, sha256Hex(fs.readFileSync(path.join(rep, 'record.json'))))
    assert.equal(worker.planSha256, lock.planSha256)
    for (const phase of ['before', 'after']) {
      const network = read(`repetition-${index}/network-${phase}.json`)
      assert.ok(Object.values(network.interfaces as Record<string, Array<{ internal: boolean }>>).flat().every(address => address.internal))
      assert.match(network.capabilities, /^CapEff:\s+0+$/)
      assert.equal(network.probes.length, 2)
      assert.ok(network.probes.every((probe: { code: string }) => ['ENETUNREACH', 'EHOSTUNREACH', 'EPERM', 'EACCES'].includes(probe.code)))
    }
    const sandbox = fs.readFileSync(path.join(rep, 'evidence/native-sandbox.txt'), 'utf8')
    assert.match(sandbox, /PID namespaces\s+Yes/); assert.match(sandbox, /Seccomp-BPF sandbox\s+Yes/)
    assert.equal(sha256Hex(Buffer.from(sandbox)), worker.sandboxSha256)
    assert.match(fs.readFileSync(path.join(rep, 'evidence/native-trust.txt'), 'utf8'), /ITCVE controlled CA/)
    const source = evidence('mined-funding-source.json'), fixture = source.fixture
    const header = Buffer.from(fixture.blockHeaderHex, 'hex')
    assert.equal(header.length, 80)
    assert.equal(createHash('sha256').update(createHash('sha256').update(header).digest()).digest().reverse().toString('hex'), fixture.fundingBlockHash)
    assert.equal(Buffer.from(header.subarray(36, 68)).reverse().toString('hex'), fixture.merkleRoot)
    assert.equal(sha256Hex(Buffer.from(canonicalJson(fixture))), plan.fundingFixtureCanonicalSha256)
    const ancestor = Transaction.fromAtomicBEEF(Utils.toArray(fixture.atomicBeefHex, 'hex'))
    assert.equal(ancestor.id('hex'), fixture.txid); assert.equal(ancestor.toHex(), fixture.rawHex)
    assert.equal(sha256Hex(Buffer.from(fixture.atomicBeefHex, 'hex')), fixture.atomicBeefSha256)
    assert.ok(fixture.maturityDepth >= 100)
    const tracker = { currentHeight: async () => 900100, isValidRootForHeight: async (root: string, height: number) => root === fixture.merkleRoot && height === fixture.fundingHeight }
    assert.ok(await ancestor.verify(tracker))
    const funding = Transaction.fromAtomicBEEF([...fs.readFileSync(path.join(rep, 'evidence/funding.atomicbeef'))])
    const transactions = new Map<string, Transaction>()
    function add(tx: Transaction, depth = 0) { assert.ok(depth < 32); if (transactions.has(tx.id('hex'))) return; transactions.set(tx.id('hex'), tx); for (const input of tx.inputs) if (input.sourceTransaction) add(input.sourceTransaction, depth + 1) }
    add(funding)
    const created = evidence('created-output.json')
    const create = Transaction.fromAtomicBEEF(Beef.fromBinary([...fs.readFileSync(path.join(rep, 'evidence/create.beef'))]).toBinaryAtomic(record.observations.createTxid!)); add(create)
    for (const item of evidence('native-transactions.json')) { const tx = Transaction.fromHex(item.rawTxHex); assert.equal(tx.id('hex'), item.txid); if (!transactions.has(item.txid)) transactions.set(item.txid, tx) }
    for (const tx of transactions.values()) for (const input of tx.inputs) if (!input.sourceTransaction) input.sourceTransaction = transactions.get(input.sourceTXID!)
    function ancestry(tx: Transaction, target: string, depth = 0): boolean { assert.ok(depth < 32); return tx.inputs.some(input => input.sourceTXID === target || (input.sourceTransaction !== undefined && ancestry(input.sourceTransaction, target, depth + 1))) }
    assert.ok(ancestry(funding, fixture.txid)); assert.ok(ancestry(create, funding.id('hex')))
    assert.ok(await funding.verify(tracker)); assert.ok(await create.verify(tracker))
    const script = new P2PKH().lock(PublicKey.fromString(source.publicKey).toAddress())
    assert.equal(funding.outputs[0]?.lockingScript.toHex(), script.toHex()); assert.equal(funding.outputs[0]?.satoshis, 10000)
    const outputIndex = Number(String(created.created.outputs.find((output: { outpoint: string }) => output.outpoint.startsWith(create.id('hex'))).outpoint).split(/[._]/)[1])
    const output = create.outputs[outputIndex]!
    assert.equal(output.satoshis, plan.amount)
    assert.equal(output.lockingScript.toHex(), created.lockingScript)
    assert.equal(Utils.toUTF8(PushDrop.decode(LockingScript.fromHex(output.lockingScript.toHex())).fields[0]!), '1ToDoDtKreEzbHYKFjmoBuduFmSXXUGZG')
    assert.equal(created.plaintext, plan.task)
    const reload = evidence('cold-reload.json'); assert.equal(reload.localStorageCleared, true); assert.equal(reload.taskVisible, true)
    const outpoint = `${create.id('hex')}.${outputIndex}`
    assert.ok(reload.afterReload.outputs.some((item: { outpoint: string }) => item.outpoint.replace('_', '.') === outpoint))
    const redeem = evidence('redeem.json')
    assert.ok(!redeem.afterRedeem.outputs.some((item: { outpoint: string }) => item.outpoint.replace('_', '.') === outpoint))
    const spend = [...transactions.values()].find(tx => tx.inputs.some(input => input.sourceTXID === create.id('hex') && input.sourceOutputIndex === outputIndex))
    assert.ok(spend, 'serialized redemption spend absent from Go storage')
    assert.ok(await spend.verify(tracker))
    let inputs = 0; for (const input of spend.inputs) { const sourceOutput = input.sourceTransaction?.outputs[input.sourceOutputIndex!]; assert.ok(sourceOutput?.satoshis !== undefined); inputs += sourceOutput.satoshis }
    const outputs = spend.outputs.reduce((sum, item) => sum + (item.satoshis ?? 0), 0); assert.ok(inputs >= outputs)
    const vectors = structuredClone(record.vectors)
    for (const vector of vectors.slice(0, 4)) assert.equal(vector.outcome, 'PASS')
    const permission = evidence('permissions.json')
    const explicitDenial = (value: { rejected?: boolean; independentlyPrompted?: boolean; message?: string }) =>
      (value.rejected === true || value.independentlyPrompted === true) && /permission|denied|user reject|not authori[sz]ed/i.test(value.message ?? '') && !/timeout|network error|fetch failed|500|502|503/i.test(value.message ?? '')
    const deniedPrompt = (origin: string) => permission.permissions.some((item: { origin: string; decision: string }) => item.origin.includes(origin) && item.decision === 'deny')
    vectors[4]!.outcome = explicitDenial(permission.denial) && explicitDenial(permission.crossOrigin) && deniedPrompt('deny.itcve.test') && deniedPrompt('alternate.itcve.test') ? 'PASS' : 'FAIL'
    const lifecycle = evidence('broadcast-lifecycle.json')
    const acceptedCount = lifecycle.accepted.outputs?.totalOutputs
    const accepted = lifecycle.accepted.submission?.verdict === 'ACCEPTED_BY_NETWORK' && lifecycle.accepted.body.includes('Task successfully created!')
    const rejected = lifecycle.rejected.submission?.verdict === 'REJECTED' && acceptedCount !== undefined && lifecycle.rejected.outputs?.totalOutputs === acceptedCount
    const recovered = lifecycle.recovered.submission?.verdict === 'ACCEPTED_BY_NETWORK' && acceptedCount !== undefined && lifecycle.recovered.outputs?.totalOutputs === acceptedCount + 1
    vectors[5]!.outcome = accepted && rejected && recovered ? 'PASS' : 'FAIL'
    assert.equal(vectors[6]!.outcome, 'BLOCKED'); assert.equal(vectors[7]!.outcome, 'BLOCKED')
    results.push({ record, vectors, recordSha256: worker.recordSha256, independent: { funding: funding.id('hex'), create: create.id('hex'), redemption: spend.id('hex'), valueConserved: true, fee: inputs - outputs } })
  }
  assert.equal(canonicalJson(results[0]!.vectors.map(vector => vector.outcome)), canonicalJson(results[1]!.vectors.map(vector => vector.outcome)))
  assert.equal(canonicalJson(results[0]!.record.semanticProjection), canonicalJson(results[1]!.record.semanticProjection))
  return { schema: 'tpnil-native-wallet-qualification@1.0.0', claim: 'EXPERIMENTAL_CONFORMANCE_RESULT', itcve: plan.itcve, program: plan.program, lane: plan.lane, planSha256: lock.planSha256, source: lock.source, image: lock.image, qualifiedEnvironment: true, artifact: plan.wallet, vectors: results[0]!.vectors, outcome: aggregateOutcome(results[0]!.vectors), repetitionMatch: true, repetitions: results.map((result, index) => ({ runId: `repetition-${index + 1}`, recordSha256: result.recordSha256, independent: result.independent })) }
}
if (process.argv[1]?.endsWith('/native/verify.ts')) {
  const directory = path.resolve(process.argv[2] ?? '')
  const result = await verifyNativeWallet(directory)
  const target = path.join(directory, 'qualification.json')
  if (fs.existsSync(target)) assert.equal(canonicalJson(JSON.parse(fs.readFileSync(target, 'utf8'))), canonicalJson(result))
  else fs.writeFileSync(target, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
  process.stdout.write(JSON.stringify({ verified: true, qualifiedEnvironment: true, claim: result.claim, outcome: result.outcome, vectors: result.vectors.map(vector => ({ id: vector.id, outcome: vector.outcome })) }) + '\n')
}
