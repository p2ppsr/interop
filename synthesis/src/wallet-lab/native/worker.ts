import { yoursPr368Coverage1Artifact, yoursCandidateArtifactsByProfile } from '../model.js'
import { controlledHeaderFixture } from './controlled-header-fixture.js'
import fs from 'node:fs'
import { nativeFailureSnapshot } from './failure.js'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { spawn, execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { runYoursWallet } from '../yours-driver.js'
import { sha256Hex } from '../../determinism.js'
import { chromium } from 'playwright'
import { verifyEvidenceBundle } from '../evidence.js'
import type { TeranodeWalletFundingFixture } from '../services.js'

const root = '/work'
const output = '/evidence'
const coverageRevision = process.env.TPNIL_NATIVE_COVERAGE_REVISION
if (coverageRevision !== undefined && !['1', '2', '3', '4', '5'].includes(coverageRevision)) throw new Error('Unknown coverage revision')
const replay = coverageRevision === '5'
const followup = replay || coverageRevision === '4'
const completion = followup || coverageRevision === '3'
const coverageArtifact = replay ? yoursCandidateArtifactsByProfile['ITCVE-1@4.7.0'] : followup ? yoursCandidateArtifactsByProfile['ITCVE-1@4.6.0'] : completion ? yoursCandidateArtifactsByProfile['ITCVE-1@4.5.0'] : yoursPr368Coverage1Artifact
if (!coverageArtifact) throw new Error('Completion candidate intake is not frozen')
const recovery = coverageRevision === '2'
const expanded = completion || recovery || coverageRevision === '1'
const walletVersion = process.env.TPNIL_NATIVE_WALLET_VERSION ?? '5.1.0'
if (!['5.1.0', '5.1.1', '5.1.1-pr368.7e39006', '5.1.1-pr368.cb3c2f2', ...(expanded ? [coverageArtifact.version] : [])].includes(walletVersion)) throw new Error('Unknown native wallet release')
if (expanded && (walletVersion !== coverageArtifact.version || !/^[a-f0-9]{64}$/.test(coverageArtifact.sha256) || coverageArtifact.size <= 0)) throw new Error('Coverage candidate intake is not frozen or mismatched')
const observerRevision = process.env.TPNIL_NATIVE_OBSERVER_REVISION
if (observerRevision !== undefined && !((observerRevision === '2' && walletVersion === '5.1.1') || (observerRevision === '3' && (walletVersion === '5.1.1-pr368.cb3c2f2' || expanded)))) throw new Error('Unknown or mismatched native observer revision')
if (expanded && observerRevision !== '3') throw new Error('Coverage requires observer3 corrections')
const candidate = expanded || ['5.1.1-pr368.7e39006', '5.1.1-pr368.cb3c2f2'].includes(walletVersion)
if (walletVersion === '5.1.1-pr368.cb3c2f2' && observerRevision !== '3') throw new Error('The cb3c2f2 candidate requires its explicit observer3 plan')
const wallet511 = candidate || walletVersion === '5.1.1'
const closure = process.env.TPNIL_NATIVE_CLOSURE === '1'
if (wallet511 && !closure) throw new Error('Yours5.1.1 requires its separately frozen closure profile')
const coverage = closure || process.env.TPNIL_NATIVE_COVERAGE === '1'
const conformance = process.env.TPNIL_NATIVE_CONFORMANCE === '1'
if (coverage && !conformance) throw new Error('Coverage qualification requires conformance mode')
const integrated = process.env.TPNIL_NATIVE_INTEGRATED === '1'
const trustedIdentity = process.env.TPNIL_NATIVE_IDENTITY_TRUST === '1'
if (conformance && (!integrated || !trustedIdentity)) throw new Error('Conformance qualification requires integrated trusted native mode')
if (trustedIdentity && !integrated) throw new Error('Trusted identity qualification requires integrated native mode')
const planFile = path.join(root, replay ? 'infra/native/conformance/plan-pr368-coverage-5-source-2.json' : followup ? 'infra/native/conformance/plan-pr368-coverage-4.json' : completion ? 'infra/native/conformance/plan-pr368-coverage-3-source-5.json' : recovery ? 'infra/native/conformance/plan-pr368-coverage-2.json' : expanded ? 'infra/native/conformance/plan-pr368-coverage-1.json' : observerRevision === '3' ? 'infra/native/conformance/plan-pr368-cb3c2f2-observer-3.json' : candidate ? 'infra/native/conformance/plan-pr368-7e39006.json' : observerRevision === '2' ? 'infra/native/conformance/plan-5.1.1-observer-2.json' : wallet511 ? 'infra/native/conformance/plan-5.1.1.json' : closure ? 'infra/native/conformance/plan-coverage-closure.json' : coverage ? 'infra/native/conformance/plan-coverage.json' : conformance ? 'infra/native/conformance/plan.json' : trustedIdentity ? 'infra/native/integrated/plan-trusted.json' : integrated ? 'infra/native/integrated/plan.json' : 'infra/native/yours-go/plan.json')
const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'))
if (observerRevision !== undefined && plan.observerRevision !== Number(observerRevision)) throw new Error('Native observer revision differs from selected plan')
if (expanded && (plan.coverageRevision !== (replay ? 5 : followup ? 4 : completion ? 3 : recovery ? 2 : 1) || plan.itcve !== (replay ? 'ITCVE-1@4.7.0' : followup ? 'ITCVE-1@4.6.0' : completion ? 'ITCVE-1@4.5.0' : recovery ? 'ITCVE-1@4.4.0' : 'ITCVE-1@4.3.0') || plan.program !== (replay ? 'ISI-4@5.7.0' : followup ? 'ISI-4@5.6.0' : completion ? 'ISI-4@5.5.0' : recovery ? 'ISI-4@5.4.0' : 'ISI-4@5.3.0') || (completion ? plan.expectedObservations !== 698 : plan.expectedObservations !== 535) || plan.permissionFixture !== 'fresh-managed-funding-v1' || plan.permissionCoverageOracle !== 'tpnil-native-permission-coverage-oracle@5.0.0' || plan.admissionState !== 'FROZEN')) throw new Error('Coverage plan is not admitted')
if (completion && (plan.observationEncoding !== 'tpnil-coverage-observation@1.0.0' || plan.browserContexts !== 9 || plan.portabilityOracle !== 'tpnil-native-portability-oracle@4.0.0' || plan.clauseOracle !== 'tpnil-brc100-clause-oracle@7.0.0')) throw new Error('Completion observer policy binding differs')
if (plan.wallet.version !== walletVersion) throw new Error('Wallet release differs from selected plan')
const walletRoot = path.join(root, 'out/sut-artifacts', followup ? 'yours-wallet-pr368-e360e67' : completion ? 'yours-wallet-pr368-3e8a97f' : expanded ? 'yours-wallet-pr368-4a954ac' : observerRevision === '3' ? 'yours-wallet-pr368-cb3c2f2' : candidate ? 'yours-wallet-pr368-7e39006' : `yours-wallet-v${walletVersion}`)
fs.mkdirSync(output, { recursive: true })
const save = (name: string, value: unknown) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n')
const evidenceFile = (name: string): string => path.join(output, 'evidence', name)
async function denied(host: string): Promise<{ host: string; code: string }> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port: 443 })
    socket.setTimeout(1500)
    socket.once('connect', () => { socket.destroy(); reject(new Error(`Unexpected egress connection to ${host}`)) })
    socket.once('timeout', () => { socket.destroy(); reject(new Error(`Network probe inconclusive for ${host}`)) })
    socket.once('error', (error: NodeJS.ErrnoException) => {
      if (!['ENETUNREACH', 'EHOSTUNREACH', 'EPERM', 'EACCES'].includes(error.code ?? '')) return reject(error)
      resolve({ host, code: error.code! })
    })
  })
}
async function network(): Promise<Record<string, unknown>> {
  const interfaces = os.networkInterfaces()
  if (Object.values(interfaces).flat().some(address => address !== undefined && !address.internal)) throw new Error('Unexpected non-loopback interface')
  const status = fs.readFileSync('/proc/self/status', 'utf8')
  if (!/^CapEff:\s+0+$/m.test(status)) throw new Error('Worker retained Linux capabilities')
  const route = fs.readFileSync('/proc/net/route', 'utf8')
  if (route.trim().split('\n').slice(1).some(line => !line.startsWith('lo\t'))) throw new Error('Unexpected route')
  return { interfaces, ipv4Routes: route, ipv6Routes: fs.readFileSync('/proc/net/ipv6_route', 'utf8'), capabilities: status.match(/^CapEff:.*$/m)?.[0], probes: await Promise.all([denied('1.1.1.1'), denied('2606:4700:4700::1111')]) }
}
function assertArtifact(file: string, expected: { sha256: string; size: number }): void {
  const bytes = fs.readFileSync(file)
  if (bytes.length !== expected.size || sha256Hex(bytes) !== expected.sha256) throw new Error('Native artifact differs from frozen plan')
}
let mongo: ReturnType<typeof spawn> | undefined
let failure: unknown
const startedAt = new Date().toISOString()
try {
  if (conformance) for (const [name, digest] of Object.entries(plan.conformanceInputs as Record<string, string>)) {
    if (sha256Hex(fs.readFileSync(path.join(root, name))) !== digest) throw new Error(`Conformance input differs: ${name}`)
  }
  if (integrated) {
    if (trustedIdentity && sha256Hex(fs.readFileSync(path.join(root, plan.identityTrustProfile))) !== plan.identityTrustProfileSha256) throw new Error('Trusted identity profile differs from frozen plan')
    if (sha256Hex(fs.readFileSync(path.join(root, plan.compatibilityPatch))) !== plan.compatibilityPatchSha256 || sha256Hex(fs.readFileSync(path.join(root, plan.boundaryProfile))) !== plan.boundaryProfileSha256) throw new Error('Integrated profile inputs differ from frozen plan')
  }
  assertArtifact(path.join(walletRoot, `pw-v${candidate ? '5.1.1' : walletVersion}.zip`), plan.wallet)
  assertArtifact(path.join(root, 'fixtures/artifacts/todo-ts-236733c-webroot.tgz'), plan.application)
  const installed = JSON.parse(execFileSync('python3', [path.join(root, 'infra/native/yours-go/verify-installed.py'), '--wallet-version', walletVersion], { encoding: 'utf8', timeout: 30000 }))
  save('installed-artifacts.json', installed)
  fs.writeFileSync(path.join(output, 'browser-version.txt'), execFileSync(chromium.executablePath(), ['--version'], { encoding: 'utf8', timeout: 10000 }))
  fs.copyFileSync('/opt/tpnil/os-packages.txt', path.join(output, 'os-packages.txt'))
  const before = await network()
  save('network-before.json', before)
  const db = fs.mkdtempSync('/tmp/tpnil-native-mongo-')
  const log = fs.openSync(path.join(output, 'mongo.log'), 'wx')
  mongo = spawn('mongod', ['--replSet', 'tpnil', '--bind_ip', '127.0.0.1', '--port', '27017', '--wiredTigerCacheSizeGB', '0.25', '--dbpath', db], { stdio: ['ignore', log, log] })
  fs.closeSync(log)
  execFileSync('/opt/tpnil/itcve-mongo', [], { stdio: 'inherit', timeout: 45000 })
  const fixture = JSON.parse(fs.readFileSync(path.join(root, plan.fundingFixture), 'utf8')) as TeranodeWalletFundingFixture
  const record = await runYoursWallet({
    extensionDirectory: path.join(walletRoot, 'unpacked/build'),
    components: plan.components,
    webroot: path.join(root, 'out/sut-artifacts/todo-ts-236733c/webroot'),
    outputDirectory: output,
    walletArtifact: plan.wallet,
    ...(candidate ? { walletCandidate: plan.walletCandidate } : {}),
    applicationArtifact: plan.application,
    headless: false,
    task: plan.task,
    amount: plan.amount,
    nativeQualification: { fundingFixture: fixture, sandbox: true },
    ...(closure && plan.shutdownSubmissionPolicy ? { shutdownSubmissionPolicy: plan.shutdownSubmissionPolicy } : {}),
    ...(completion ? { submissionOrdering: plan.submissionOrdering } : {}),
    ...(observerRevision === '3' ? { headerFixture: controlledHeaderFixture } : {}),
    ...(candidate || observerRevision === '2' ? { nativeActionReferenceEvidence: true } : {}),
    ...(conformance ? { prepareScenario: (await import('./conformance-reserves.js')).prepareNativeConformanceReserves, additionalScenario: async (context: import('../yours-driver.js').NativeScenarioContext) => (await import('./conformance.js')).runNativeConformance(context, coverage, closure, replay ? 'pr368-coverage5' : followup ? 'pr368-coverage4' : completion ? 'pr368-coverage3' : recovery ? 'pr368-coverage2' : expanded ? 'pr368-coverage1' : observerRevision === '3' ? 'pr368-observer3' : candidate ? 'pr368-7e39006' : wallet511 ? 'yours-5.1.1' : 'legacy', candidate || observerRevision === '2' ? 2 : 1, observerRevision === '3' ? controlledHeaderFixture : undefined, observerRevision === '3' ? 'tpnil-native-identity-trust-oracle@2.0.0' : undefined), integratedProfile: replay ? 'ITCVE-1@4.7.0' : followup ? 'ITCVE-1@4.6.0' : completion ? 'ITCVE-1@4.5.0' : recovery ? 'ITCVE-1@4.4.0' : expanded ? 'ITCVE-1@4.3.0' : observerRevision === '3' ? 'ITCVE-1@4.2.0' : candidate ? 'ITCVE-1@4.1.0' : wallet511 ? 'ITCVE-1@4.0.0' : closure ? 'ITCVE-1@2.0.0' : coverage ? 'ITCVE-1@1.5.0' : 'ITCVE-1@1.4.0', go: completion ? { binary: '/opt/tpnil/itcve-go-storage-caller-known-inputs', storageCallerKnownInputsPatch: true, terminalRejectionReceipts: true } : expanded ? { binary: '/opt/tpnil/itcve-go-storage-sqlite-retry', storageSQLiteRetryPatch: true, terminalRejectionReceipts: true } : candidate || observerRevision === '2' ? { binary: '/opt/tpnil/itcve-go-storage-native-contracts', storageNativeContractsPatch: true, terminalRejectionReceipts: true } : wallet511 ? { binary: '/opt/tpnil/itcve-go-storage-list-actions', storageListActionsPatch: true, terminalRejectionReceipts: true } : { binary: '/opt/tpnil/itcve-go-storage-portability', storagePortabilityPatch: true, terminalRejectionReceipts: true } } as const : integrated ? { additionalScenario: (await import('./integrated.js')).runNativeIntegration, integratedProfile: 'ITCVE-1@1.3.0', go: { binary: '/opt/tpnil/itcve-go-storage-sync', storageSyncPatch: true } } as const : {})
  })
  verifyEvidenceBundle(output)
  save('network-after.json', await network())
  const processes = fs.readdirSync('/proc').filter(name => /^\d+$/.test(name)).flatMap(pid => {
    try {
      const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8')
      if (/^State:\s+Z/m.test(status)) return []
      return [fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim()]
    } catch { return [] }
  })
  if (processes.some(name => /chrome|chromium|itcve-go-|messagebox-go/.test(name))) throw new Error('Wallet or Go host process survived teardown')
  save('worker.json', { schema: 'tpnil-native-wallet-worker@1.0.0', completed: true, startedAt, endedAt: new Date().toISOString(), platform: process.platform, architecture: process.arch, os: os.release(), node: process.version, planSha256: sha256Hex(fs.readFileSync(planFile)), recordSha256: sha256Hex(fs.readFileSync(path.join(output, 'record.json'))), cleanWalletAndServiceShutdown: true, ...(closure && plan.shutdownSubmissionPolicy ? { shutdownSubmissionsSha256: sha256Hex(fs.readFileSync(path.join(output, 'shutdown-submissions.json'))) } : {}), ...(completion ? { completionInventoryClosureSha256: sha256Hex(fs.readFileSync(path.join(output, 'completion-inventory-closure.json'))) } : {}), vectorOutcomes: record.vectors.map(vector => ({ id: vector.id, outcome: vector.outcome })), sandboxSha256: sha256Hex(fs.readFileSync(evidenceFile('native-sandbox.txt'))) })
} catch (error) {
  failure = error
  save('worker-failure.json', { startedAt, endedAt: new Date().toISOString(), error: nativeFailureSnapshot(error), message: error instanceof Error ? error.message : String(error) })
} finally {
  if (mongo !== undefined && mongo.exitCode === null && mongo.signalCode === null) {
    const exited = once(mongo, 'exit')
    mongo.kill('SIGTERM')
    let forced = false
    const timer = setTimeout(() => { forced = true; mongo?.kill('SIGKILL') }, 7000)
    const [code, signal] = await exited; clearTimeout(timer)
    const clean = !forced && code === 0
    save('mongo-cleanup.json', { clean, forced, code, signal })
    if (!clean) failure ??= new Error('Mongo did not shut down cleanly')
  }
}
if (failure !== undefined) throw failure
