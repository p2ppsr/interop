import fs from 'node:fs'
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
const walletVersion = process.env.TPNIL_NATIVE_WALLET_VERSION ?? '5.1.0'
if (!['5.1.0', '5.1.1'].includes(walletVersion)) throw new Error('Unknown native wallet release')
const wallet511 = walletVersion === '5.1.1'
const closure = process.env.TPNIL_NATIVE_CLOSURE === '1'
if (wallet511 && !closure) throw new Error('Yours5.1.1 requires its separately frozen closure profile')
const coverage = closure || process.env.TPNIL_NATIVE_COVERAGE === '1'
const conformance = process.env.TPNIL_NATIVE_CONFORMANCE === '1'
if (coverage && !conformance) throw new Error('Coverage qualification requires conformance mode')
const integrated = process.env.TPNIL_NATIVE_INTEGRATED === '1'
const trustedIdentity = process.env.TPNIL_NATIVE_IDENTITY_TRUST === '1'
if (conformance && (!integrated || !trustedIdentity)) throw new Error('Conformance qualification requires integrated trusted native mode')
if (trustedIdentity && !integrated) throw new Error('Trusted identity qualification requires integrated native mode')
const planFile = path.join(root, wallet511 ? 'infra/native/conformance/plan-5.1.1.json' : closure ? 'infra/native/conformance/plan-coverage-closure.json' : coverage ? 'infra/native/conformance/plan-coverage.json' : conformance ? 'infra/native/conformance/plan.json' : trustedIdentity ? 'infra/native/integrated/plan-trusted.json' : integrated ? 'infra/native/integrated/plan.json' : 'infra/native/yours-go/plan.json')
const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'))
if (plan.wallet.version !== walletVersion) throw new Error('Wallet release differs from selected plan')
const walletRoot = path.join(root, 'out/sut-artifacts', `yours-wallet-v${walletVersion}`)
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
  assertArtifact(path.join(walletRoot, `pw-v${walletVersion}.zip`), plan.wallet)
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
    applicationArtifact: plan.application,
    headless: false,
    task: plan.task,
    amount: plan.amount,
    nativeQualification: { fundingFixture: fixture, sandbox: true },
    ...(closure && plan.shutdownSubmissionPolicy ? { shutdownSubmissionPolicy: plan.shutdownSubmissionPolicy } : {}),
    ...(conformance ? { prepareScenario: (await import('./conformance-reserves.js')).prepareNativeConformanceReserves, additionalScenario: async (context: import('../yours-driver.js').NativeScenarioContext) => (await import('./conformance.js')).runNativeConformance(context, coverage, closure, wallet511 ? 'yours-5.1.1' : 'legacy'), integratedProfile: wallet511 ? 'ITCVE-1@4.0.0' : closure ? 'ITCVE-1@2.0.0' : coverage ? 'ITCVE-1@1.5.0' : 'ITCVE-1@1.4.0', go: wallet511 ? { binary: '/opt/tpnil/itcve-go-storage-list-actions', storageListActionsPatch: true, terminalRejectionReceipts: true } : { binary: '/opt/tpnil/itcve-go-storage-portability', storagePortabilityPatch: true, terminalRejectionReceipts: true } } as const : integrated ? { additionalScenario: (await import('./integrated.js')).runNativeIntegration, integratedProfile: 'ITCVE-1@1.3.0', go: { binary: '/opt/tpnil/itcve-go-storage-sync', storageSyncPatch: true } } as const : {})
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
  save('worker.json', { schema: 'tpnil-native-wallet-worker@1.0.0', completed: true, startedAt, endedAt: new Date().toISOString(), platform: process.platform, architecture: process.arch, os: os.release(), node: process.version, planSha256: sha256Hex(fs.readFileSync(planFile)), recordSha256: sha256Hex(fs.readFileSync(path.join(output, 'record.json'))), cleanWalletAndServiceShutdown: true, ...(closure && plan.shutdownSubmissionPolicy ? { shutdownSubmissionsSha256: sha256Hex(fs.readFileSync(path.join(output, 'shutdown-submissions.json'))) } : {}), vectorOutcomes: record.vectors.map(vector => ({ id: vector.id, outcome: vector.outcome })), sandboxSha256: sha256Hex(fs.readFileSync(evidenceFile('native-sandbox.txt'))) })
} catch (error) {
  failure = error
  save('worker-failure.json', { startedAt, endedAt: new Date().toISOString(), message: error instanceof Error ? error.message : String(error) })
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
