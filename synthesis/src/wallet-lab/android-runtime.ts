import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import {
  ControlledWalletServices,
  type TeranodeFundingObservation,
  type TeranodeWalletFundingFixture
} from './services.js'

const wabSourceRevision = '6e53b215c43af5ea2e50bcdb7f136e23ee7da080'
const wabVersion = '1.8.2'
const wabRootKeyHex = '77'.repeat(32)
const adminToken = 'tpnil-admin-boundary-fixture-2026-09-20-0001'
const demoAuthSecret = 'tpnil-demo-auth-fixture-secret-2026-09-20-0001'
const demoPhone = '+15550102030'

function fail(message: string): never {
  process.stderr.write(`${message}\n`)
  process.exit(2)
}

async function freePort(): Promise<number> {
  const server = net.createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Unable to allocate WAB port')
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  return address.port
}

function wabEnvironment(port: number, storageUrl: string, proxyUrl: string, caCertificate: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(port),
    BSV_NETWORK: 'main',
    SERVER_PRIVATE_KEY: wabRootKeyHex,
    STORAGE_URL: storageUrl,
    SHARE_ENCRYPTION_KEY: 'tpnil-share-encryption-fixture-2026',
    COMMISSION_FEE: '1000',
    DEV_CONSOLE_AUTH_METHOD_ENABLED: 'false',
    WAB_ADMIN_TOKEN: adminToken,
    WAB_DEMO_AUTH_SECRET: demoAuthSecret,
    WAB_STRICT_TRANSPORT_SECURITY: 'false',
    OTEL_CONSOLE_EXPORTERS: 'false',
    OTEL_EXPORTER_OTLP_ENDPOINT: '',
    LOG_LEVEL: 'info',
    NODE_USE_ENV_PROXY: '1',
    HTTP_PROXY: proxyUrl,
    HTTPS_PROXY: proxyUrl,
    NO_PROXY: '127.0.0.1,localhost',
    NODE_EXTRA_CA_CERTS: caCertificate
  }
}

async function waitForWab(port: number, child: ChildProcess): Promise<void> {
  const url = `http://127.0.0.1:${port}/demo/info`
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`WAB exited ${child.exitCode} before becoming ready`)
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Startup races are bounded by the loop.
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('WAB did not become ready within 30 seconds')
}

async function provisionDemoAccount(port: number): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${port}/admin/demo-accounts`, {
    method: 'POST',
    headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'provision',
      phoneNumber: demoPhone,
      label: 'TPNIL deterministic Android run',
      expiresAtEpochMs: null
    })
  })
  if (!response.ok) throw new Error(`WAB demo provisioning returned HTTP ${response.status}`)
  const result = await response.json() as { code?: unknown }
  if (typeof result.code !== 'string' || !/^\d{6}$/.test(result.code)) {
    throw new Error('WAB demo provisioning did not return a six-digit code')
  }
  return result.code
}

const [wabArgument, webrootArgument, fundingArgument, outputArgument] = process.argv.slice(2)
if (wabArgument === undefined || webrootArgument === undefined || fundingArgument === undefined || outputArgument === undefined) {
  fail('Usage: android-runtime <WAB_SOURCE_DIRECTORY> <WEBROOT> <TERANODE_FUNDING_FIXTURE> <OUTPUT_DIRECTORY>')
}

const wabDirectory = path.resolve(wabArgument)
const webroot = path.resolve(webrootArgument)
const fundingPath = path.resolve(fundingArgument)
const outputDirectory = path.resolve(outputArgument)
if (!fs.existsSync(path.join(wabDirectory, 'package-lock.json'))) fail('WAB source directory is incomplete')
if (!fs.existsSync(path.join(webroot, 'index.html'))) fail('Application webroot is incomplete')
if (!fs.existsSync(fundingPath)) fail('Teranode funding fixture is absent')
const fundingFixture = JSON.parse(fs.readFileSync(fundingPath, 'utf8')) as TeranodeWalletFundingFixture
fs.mkdirSync(outputDirectory, { recursive: true })
fs.chmodSync(outputDirectory, 0o700)
const wabPort = await freePort()
const services = new ControlledWalletServices({ webroot, wabPort })
let wab: ChildProcess | undefined
let closing = false
let funding: TeranodeFundingObservation | undefined

async function close(exitCode: number): Promise<never> {
  if (closing) process.exit(exitCode)
  closing = true
  if (wab?.exitCode === null) wab.kill('SIGTERM')
  if (wab !== undefined && wab.exitCode === null) {
    await Promise.race([
      new Promise(resolve => wab!.once('exit', resolve)),
      new Promise(resolve => setTimeout(resolve, 5_000))
    ])
  }
  if (wab?.exitCode === null) wab.kill('SIGKILL')
  fs.writeFileSync(path.join(outputDirectory, 'controlled-boundary.json'), `${JSON.stringify({
    schema: 'tpnil-isi4-controlled-activation-boundary@1.0.0',
    wab: { version: wabVersion, sourceRevision: wabSourceRevision, baseUrl: 'https://wab.itcve.test/demo' },
    funding,
    overlay: { origin: 'https://overlay.itcve.test', topics: ['tm_users'], services: ['ls_ship', 'ls_slap', 'ls_users'] },
    routes: services.routes,
    overlayObservations: services.overlayObservations,
    walletBridgeObservations: services.walletBridgeObservations,
    storageRpcObservations: services.storageRpcObservations,
    umpRecords: services.umpRecords.map(record => ({
      txid: record.txid,
      outputIndex: record.outputIndex,
      outpoint: record.outpoint,
      presentationHash: record.presentationHash,
      recoveryHash: record.recoveryHash,
      beefSha256: createHash('sha256').update(Buffer.from(record.beef)).digest('hex'),
      beefHex: Buffer.from(record.beef).toString('hex')
    })),
    faucetPayments: services.faucetObservations,
    submissions: services.submissions.map(submission => ({
      txid: submission.txid,
      verdict: submission.verdict,
      byteLength: submission.bytes.length,
      atomicBeefSha256: createHash('sha256').update(submission.bytes).digest('hex'),
      atomicBeefHex: Buffer.from(submission.bytes).toString('hex')
    }))
  }, null, 2)}\n`)
  await services.close()
  process.exit(exitCode)
}

process.once('SIGINT', () => void close(0))
process.once('SIGTERM', () => void close(0))

try {
  await services.start()
  funding = await services.fundRemoteWalletFromTeranode(wabRootKeyHex, fundingFixture)
  const environment = wabEnvironment(
    wabPort,
    services.storageUrl,
    services.proxyUrl,
    path.join(services.caDirectory, 'certs', 'ca.pem')
  )
  const database = path.join(wabDirectory, 'dev.sqlite3')
  fs.rmSync(database, { force: true })
  const wabLog = path.join(outputDirectory, 'wab.log')
  const descriptor = fs.openSync(wabLog, 'a', 0o600)
  wab = spawn('node', ['--require', './dist/telemetry.js', 'dist/server.js'], {
    cwd: wabDirectory,
    env: environment,
    stdio: ['ignore', descriptor, descriptor]
  })
  fs.closeSync(descriptor)
  await waitForWab(wabPort, wab)
  const code = await provisionDemoAccount(wabPort)
  const runtime = {
    schema: 'tpnil-isi4-android-runtime@1.0.0',
    proxyUrl: services.emulatorProxyUrl,
    caCertificate: path.join(services.caDirectory, 'certs', 'ca.pem'),
    wabUrl: 'https://wab.itcve.test/demo',
    storageUrl: 'https://wallet.1sat.app',
    overlayOrigin: 'https://overlay.itcve.test',
    phoneNumber: demoPhone,
    walletNetwork: 'main',
    publicMainnetBroadcast: false,
    funding,
    wab: { version: wabVersion, sourceRevision: wabSourceRevision }
  }
  fs.writeFileSync(path.join(outputDirectory, 'runtime.json'), `${JSON.stringify(runtime, null, 2)}\n`)
  fs.writeFileSync(path.join(outputDirectory, '.activation.json'), `${JSON.stringify({ code })}\n`, { mode: 0o600 })
  process.stdout.write(`${JSON.stringify(runtime)}\n`)
  wab.once('exit', codeValue => {
    if (!closing) void close(codeValue === 0 ? 0 : 1)
  })
  await new Promise(() => undefined)
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  await close(1)
}
