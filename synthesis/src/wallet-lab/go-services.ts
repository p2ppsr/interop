import fs from 'node:fs'
import path from 'node:path'
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { createHash, randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { canonicalJson } from '../determinism.js'
import type { HeaderRecord } from './services.js'

const componentLock = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../go/components.lock.json', import.meta.url)), 'utf8')) as {
  toolchain: string
  moduleFiles: Record<string, string>
  components: Array<{ module: string; version: string; sum: string }>
  replacements: Array<{ module: string; version: string; sum: string }>
}
interface GoBuild {
  toolchain?: string
  dependencies?: Record<string, { version: string; sum: string; replacementModule?: string; replacementVersion?: string; replacementSum?: string }>
}
export function validateGoBuild(build: GoBuild): void {
  if (build.toolchain !== componentLock.toolchain) throw new Error('Go toolchain differs from component lock')
  for (const pin of componentLock.components) {
    const actual = build.dependencies?.[pin.module]
    if (actual?.version !== pin.version || actual.sum !== pin.sum || actual.replacementModule !== undefined)
      throw new Error(`Go component build differs from lock: ${pin.module}`)
  }
  for (const [name, actual] of Object.entries(build.dependencies ?? {})) {
    if (actual.replacementModule === undefined) continue
    const pin = componentLock.replacements.find(pin => pin.module === name)
    if (pin === undefined || actual.replacementModule !== pin.module || actual.replacementVersion !== pin.version || actual.replacementSum !== pin.sum)
      throw new Error(`Unadmitted Go dependency replacement: ${name}`)
  }
}

export function validateStorageSyncGoBuild(build: GoBuild, binarySha256: string, manifest: Record<string, unknown>): void {
  const lockBytes = fs.readFileSync(fileURLToPath(new URL('../../../infra/adapters/storage-sync/patch.lock.json', import.meta.url)))
  const lock = JSON.parse(lockBytes.toString()) as { module: string; version: string; sum: string; patchSha256: string }
  const expectedUpstream = { module: lock.module, version: lock.version, sum: lock.sum }
  if (manifest.schema !== 'tpnil-storage-sync-go-build@1.0.0' || manifest.binarySha256 !== binarySha256 ||
      manifest.patchLockSha256 !== createHash('sha256').update(lockBytes).digest('hex') || manifest.patchSha256 !== lock.patchSha256 ||
      manifest.toolchain !== componentLock.toolchain || canonicalJson(manifest.upstream) !== canonicalJson(expectedUpstream) ||
      typeof manifest.replacementModule !== 'string' || !path.isAbsolute(manifest.replacementModule))
    throw new Error('Storage sync compatibility build manifest differs from frozen inputs')
  const normalized = structuredClone(build)
  const actual = normalized.dependencies?.[lock.module]
  if (actual?.version !== lock.version || actual.replacementModule !== manifest.replacementModule || !['', '(devel)'].includes(actual.replacementVersion ?? ''))
    throw new Error('Storage sync compatibility source replacement differs from manifest')
  normalized.dependencies![lock.module] = { version: lock.version, sum: lock.sum }
  validateGoBuild(normalized)
}

export interface ComponentSelection {
  overlay?: 'typescript' | 'go'
  chaintracks?: 'typescript' | 'go'
  storage?: 'typescript' | 'go'
}
export interface GoServiceOptions {
  binary?: string
  mongoUri?: string
  /** Separate prospective storage-sync build; historical native profiles reject it. */
  storageSyncPatch?: boolean
}
export function selectComponents(value: ComponentSelection = {}): Required<ComponentSelection> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid component selection')
  for (const [role, language] of Object.entries(value)) {
    if (!['overlay', 'chaintracks', 'storage'].includes(role) || !['typescript', 'go'].includes(language))
      throw new Error(`Unsupported ITCVE component: ${role}=${String(language)}`)
  }
  return { overlay: 'typescript', chaintracks: 'typescript', storage: 'typescript', ...value }
}
export function validateComponentIdentity(value: Record<string, unknown>, profile?: 'ITCVE-1@1.3.0'): void {
  const components = selectComponents(value.components as ComponentSelection)
  if (!Object.values(components).includes('go')) throw new Error('Go profile omitted Go selection')
  const go = value.go as Record<string, unknown> | undefined
  if (go?.schema !== 'tpnil-go-services@1.0.0' || canonicalJson(go.components) !== canonicalJson(components) ||
      typeof go.binarySha256 !== 'string' || !/^[a-f0-9]{64}$/.test(go.binarySha256) ||
      (profile !== 'ITCVE-1@1.3.0' && go.compatibilityPatch !== undefined) ||
      go.goModSha256 !== componentLock.moduleFiles['go.mod'] || go.goSumSha256 !== componentLock.moduleFiles['go.sum'] ||
      canonicalJson(go.dependencies) !== canonicalJson(componentLock))
    throw new Error('Go service component identity is incomplete or differs from lock')
  if (profile === 'ITCVE-1@1.3.0') {
    const manifest = go.compatibilityPatch as Record<string, unknown> | undefined
    const bytes = fs.readFileSync(fileURLToPath(new URL('../../../infra/adapters/storage-sync/patch.lock.json', import.meta.url)))
    const lock = JSON.parse(bytes.toString())
    if (manifest?.schema !== 'tpnil-storage-sync-go-build@1.0.0' || manifest.binarySha256 !== go.binarySha256 || manifest.patchLockSha256 !== createHash('sha256').update(bytes).digest('hex') || manifest.patchSha256 !== lock.patchSha256 || manifest.toolchain !== componentLock.toolchain || canonicalJson(manifest.upstream) !== canonicalJson({ module: lock.module, version: lock.version, sum: lock.sum }))
      throw new Error('Integrated native compatibility identity differs from its pinned source')
  }
}

export class GoServices {
  private process?: ChildProcess
  private origin = ''
  private readonly token = randomBytes(32).toString('hex')
  private readonly database = `tpnil_${randomBytes(12).toString('hex')}`
  private lastHeaders = ''
  private headerWrite: Promise<void> = Promise.resolve()
  private stderr = ''
  private executableSha256 = ''
  private admitted = false
  private compatibilityPatch?: Record<string, unknown>
  get diagnostics(): string { return this.stderr }
  readonly binary: string
  constructor(readonly state: string, readonly components: Required<ComponentSelection>, readonly options: GoServiceOptions = {}) {
    this.binary = path.resolve(options.binary ?? process.env.TPNIL_GO_BINARY ?? fileURLToPath(new URL('../../../out/itcve-go-services', import.meta.url)))
  }
  get identity(): Record<string, unknown> {
    return { schema: 'tpnil-go-services@1.0.0', ...(this.compatibilityPatch === undefined ? {} : { compatibilityPatch: this.compatibilityPatch }), components: this.components, binarySha256: this.executableSha256, dependencies: componentLock, goModSha256: createHash('sha256').update(fs.readFileSync(fileURLToPath(new URL('../../go/go.mod', import.meta.url)))).digest('hex'), goSumSha256: createHash('sha256').update(fs.readFileSync(fileURLToPath(new URL('../../go/go.sum', import.meta.url)))).digest('hex') }
  }
  async start(fixtures: string, rootKey: string): Promise<void> {
    const args = ['--state', this.state, '--fixtures', fixtures, '--control-token', this.token, '--root-key', rootKey]
    if (this.components.storage === 'go') args.push('--storage')
    if (this.components.overlay === 'go') {
      const mongo = this.options.mongoUri ?? process.env.TPNIL_GO_MONGO_URI
      if (mongo === undefined) throw new Error('Go Overlay Services requires TPNIL_GO_MONGO_URI for a disposable loopback Mongo replica set')
      args.push('--overlay', '--mongo', mongo, '--database', this.database)
    }
    this.origin = ''
    this.stderr = ''
    this.executableSha256 = createHash('sha256').update(fs.readFileSync(this.binary)).digest('hex')
    if (this.options.storageSyncPatch) {
      this.compatibilityPatch = JSON.parse(fs.readFileSync(`${this.binary}.json`, 'utf8')) as Record<string, unknown>
    }
    const child = spawn(this.binary, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    this.process = child
    child.stderr!.on('data', data => { this.stderr = (this.stderr + String(data)).slice(-64000) })
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Go service startup deadline exceeded')), 60_000)
      const failed = (error: Error): void => { clearTimeout(timer); reject(error) }
      child.once('error', failed)
      child.once('exit', code => failed(new Error(`Go service exited during startup (${code}): ${this.stderr}`)))
      let pending = ''
      child.stdout!.on('data', data => {
        pending += String(data)
        if (pending.length > 64000) return failed(new Error('Go startup output exceeded limit'))
        let newline: number
        while ((newline = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, newline); pending = pending.slice(newline + 1)
          try {
            const message = JSON.parse(line) as GoBuild & { schema?: string; origin?: string }
            if (message.schema !== 'tpnil-go-services@1.0.0') continue
            try {
              if (this.compatibilityPatch === undefined) validateGoBuild(message)
              else validateStorageSyncGoBuild(message, this.executableSha256, this.compatibilityPatch)
            } catch (error) { return failed(error as Error) }
            const url = new URL(message.origin!)
            if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port) return failed(new Error('Invalid Go service origin'))
            this.origin = url.origin
            this.admitted = true
            clearTimeout(timer); child.removeListener('error', failed); resolve()
          } catch { /* Dependency diagnostics are retained in the process log. */ }
        }
      })
    }).catch(async error => { await this.close(); throw error })
  }
  async syncHeaders(headers: HeaderRecord[]): Promise<void> {
    const bytes = JSON.stringify(headers.map(header => {
      const raw = Buffer.alloc(80)
      raw.writeInt32LE(header.version, 0)
      Buffer.from(header.previousHash, 'hex').reverse().copy(raw, 4)
      Buffer.from(header.merkleRoot, 'hex').reverse().copy(raw, 36)
      raw.writeUInt32LE(header.time, 68); raw.writeUInt32LE(header.bits, 72); raw.writeUInt32LE(header.nonce, 76)
      return { hex: raw.toString('hex'), hash: header.hash, height: header.height }
    }))
    if (bytes === this.lastHeaders) return this.headerWrite
    this.lastHeaders = bytes
    this.headerWrite = this.headerWrite.then(async () => {
      const response = await fetch(`${this.origin}/control/headers`, {
        method: 'POST', headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: bytes, redirect: 'error', signal: AbortSignal.timeout(15_000)
      })
      if (!response.ok) throw new Error(`Go header fixture rejected: HTTP ${response.status}`)
      await response.arrayBuffer()
    })
    return this.headerWrite
  }
  async forward(request: IncomingMessage, response: ServerResponse, route: string, transform?: (body: Buffer, status: number) => Buffer): Promise<{ input: Buffer; output: Buffer; status: number }> {
    if (this.process?.exitCode !== null || this.process?.signalCode !== null) throw new Error('Go service is not running')
    return new Promise((resolve, reject) => {
      const input: Buffer[] = [], output: Buffer[] = []
      let inputSize = 0, outputSize = 0
      request.on('data', chunk => { inputSize += chunk.length; if (inputSize <= 4 * 1024 * 1024) input.push(Buffer.from(chunk)) })
      const headers = { ...request.headers, host: new URL(this.origin).host }
      // Native authentication signatures cover the original URI. Storage is
      // mounted behind a prefix only inside this loopback host.
      const target = http.request(`${this.origin}${route}`, { method: request.method, headers, timeout: 30_000 }, result => {
        if (transform === undefined) response.writeHead(result.statusCode ?? 502, result.headers)
        result.on('data', chunk => { outputSize += chunk.length; if (outputSize <= 4 * 1024 * 1024) output.push(Buffer.from(chunk)) })
        result.on('error', reject)
        result.on('end', () => {
          try {
            const raw = Buffer.concat(output), status = result.statusCode ?? 502
            if (transform !== undefined) {
              if (outputSize > 4 * 1024 * 1024) throw new Error('Go response exceeds limit')
              const body = transform(raw, status)
              const headers = { ...result.headers, 'content-length': String(body.length) }
              delete headers['transfer-encoding']
              response.writeHead(status, headers); response.end(body)
            }
            resolve({ input: Buffer.concat(input), output: raw, status })
          } catch (error) { reject(error) }
        })
        if (transform === undefined) result.pipe(response)
      })
      target.on('timeout', () => target.destroy(new Error('Go service response deadline exceeded')))
      target.on('error', reject)
      request.on('aborted', () => target.destroy(new Error('Client aborted')))
      request.pipe(target)
    })
  }
  async synchronizeOverlay(peer: string): Promise<void> {
    const response = await fetch(`${this.origin}/control/sync`, { method: 'POST', headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ peer }), redirect: 'error', signal: AbortSignal.timeout(25000) })
    if (response.status !== 204) throw new Error(`Go GASP sync failed: HTTP ${response.status}: ${await response.text()}`)
  }
  async transactions(): Promise<Array<{ txid: string; rawTxHex: string }>> {
    const response = await fetch(`${this.origin}/control/transactions`, { headers: { authorization: `Bearer ${this.token}` }, redirect: 'error', signal: AbortSignal.timeout(15000) })
    if (!response.ok) throw new Error(`Go transaction snapshot failed: HTTP ${response.status}`)
    return response.json() as Promise<Array<{ txid: string; rawTxHex: string }>>
  }
  async dispose(): Promise<void> {
    try {
      if (this.admitted && this.components.overlay === 'go' && (this.process?.exitCode !== null || this.process?.signalCode !== null))
        throw new Error(`Go overlay database cleanup unverified: ${this.database}`)
      if (this.origin !== '' && this.process?.exitCode === null && this.process?.signalCode === null) {
        const response = await fetch(`${this.origin}/control/destroy`, { method: 'POST', headers: { authorization: `Bearer ${this.token}` }, redirect: 'error', signal: AbortSignal.timeout(15_000) })
        if (response.status !== 204) throw new Error(`Go fixture cleanup failed: HTTP ${response.status}`)
      }
    } finally { await this.close() }
  }
  async close(): Promise<void> {
    const child = this.process
    if (child === undefined || child.exitCode !== null || child.signalCode !== null) return
    const exited = once(child, 'exit').catch(() => undefined)
    child.kill('SIGTERM')
    let forced = false
    const timer = setTimeout(() => { forced = true; child.kill('SIGKILL') }, 7000)
    await exited; clearTimeout(timer)
    if (forced) throw new Error('Go service required forced termination')
  }
}
