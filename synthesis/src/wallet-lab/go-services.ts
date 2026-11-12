import fs from 'node:fs'
import path from 'node:path'
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { createHash, randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { canonicalJson } from '../determinism.js'
import { validateBatchBuildInputs, validateCallerKnownSDK } from './go-batch-build.js'
import { assertSnapshotIdentity, validateNativeOutputSnapshot, type NativeOutputSnapshot } from './native-output-snapshot.js'
import { validateNativeCertificateInventory, nativeCertificateInventoryResponseByteLimit, type NativeCertificateInventory } from './native-certificate-inventory.js'
import { validateNativeTransactionKnowledgeInventory, nativeTransactionKnowledgeResponseByteLimit, type NativeTransactionKnowledgeInventory } from './native-transaction-knowledge-inventory.js'
import { readNativeActionQueryFinalLedger, readNativeActionQueryFailureBundle, validateNativeActionQueryCuts, nativeActionQueryResponseByteLimit, type NativeActionQueryCuts, type NativeActionQueryFinalLedger, type NativeActionQueryFailureBundle } from './native-action-query-ledger.js'
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
function validateNativeContractBuildInputs(manifest: Record<string, unknown>): void {
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  const hostSources = fs.readdirSync(path.join(root, 'synthesis/go'), { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.go'))
    .map(entry => path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .filter(name => !name.startsWith('synthesis/go/cmd/itcve-services-coverage-observers/')).sort()
  const names = ['scripts/prepare-storage-native-contracts-go.mjs',
    'infra/adapters/storage-native-contracts/rpc-contract-test.mjs', 'synthesis/package-lock.json',
    'synthesis/go/components.lock.json', 'synthesis/go/go.mod', 'synthesis/go/go.sum', ...hostSources]
  const expected = Object.fromEntries(names.map(name => [name, createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex')]))
  if (manifest.inputs === null || typeof manifest.inputs !== 'object' || Array.isArray(manifest.inputs) || canonicalJson(manifest.inputs) !== canonicalJson(expected))
    throw new Error('Native contract compatibility source inventory or hashes differ from build manifest')
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

export function validateStorageSyncGoBuild(build: GoBuild, binarySha256: string, manifest: Record<string, unknown>, portability = false, listActions = false, nativeContracts = false, batchSubjects = false, dustAccounting = false, mergeAccounting = false, inputAncestry = false, sqliteRetry = false, callerKnownInputs = false): void {
  if ([portability, listActions, nativeContracts, batchSubjects, dustAccounting, mergeAccounting, inputAncestry, sqliteRetry, callerKnownInputs].filter(Boolean).length > 1) throw new Error('Conflicting Go storage compatibility selectors')
  const lockBytes = fs.readFileSync(fileURLToPath(new URL(callerKnownInputs ? '../../../infra/adapters/storage-caller-known-inputs/patch.lock.json' : sqliteRetry ? '../../../infra/adapters/storage-sqlite-retry/patch.lock.json' : inputAncestry ? '../../../infra/adapters/storage-input-ancestry/patch.lock.json' : mergeAccounting ? '../../../infra/adapters/storage-merge-accounting/patch.lock.json' : dustAccounting ? '../../../infra/adapters/storage-dust-accounting/patch.lock.json' : batchSubjects ? '../../../infra/adapters/storage-batch-subjects/patch.lock.json' : nativeContracts ? '../../../infra/adapters/storage-native-contracts/patch.lock.json' : listActions ? '../../../infra/adapters/storage-list-actions/patch.lock.json' : portability ? '../../../infra/adapters/storage-portability/patch.lock.json' : '../../../infra/adapters/storage-sync/patch.lock.json', import.meta.url)))
  const lock = JSON.parse(lockBytes.toString()) as { module: string; version: string; sum: string; patchSha256: string; parentSha256?: string }
  const expectedUpstream = { module: lock.module, version: lock.version, sum: lock.sum }
  if (manifest.schema !== (callerKnownInputs ? 'tpnil-storage-caller-known-inputs-go-build@1.0.0' : sqliteRetry ? 'tpnil-storage-sqlite-retry-go-build@1.0.0' : inputAncestry ? 'tpnil-storage-input-ancestry-go-build@1.0.0' : mergeAccounting ? 'tpnil-storage-merge-accounting-go-build@1.0.0' : dustAccounting ? 'tpnil-storage-dust-accounting-go-build@1.0.0' : batchSubjects ? 'tpnil-storage-batch-subjects-go-build@1.0.0' : nativeContracts ? 'tpnil-storage-native-contracts-go-build@1.0.0' : listActions ? 'tpnil-storage-list-actions-go-build@1.0.0' : portability ? 'tpnil-storage-portability-go-build@1.0.0' : 'tpnil-storage-sync-go-build@1.0.0') || manifest.binarySha256 !== binarySha256 ||
      ((portability || listActions || nativeContracts || batchSubjects || dustAccounting || mergeAccounting || inputAncestry || sqliteRetry || callerKnownInputs) && manifest.parentPatchLockSha256 !== lock.parentSha256) || manifest.patchLockSha256 !== createHash('sha256').update(lockBytes).digest('hex') || manifest.patchSha256 !== lock.patchSha256 ||
      manifest.toolchain !== componentLock.toolchain || canonicalJson(manifest.upstream) !== canonicalJson(expectedUpstream) ||
      typeof manifest.replacementModule !== 'string' || !path.isAbsolute(manifest.replacementModule))
    throw new Error('Storage sync compatibility build manifest differs from frozen inputs')
  if (nativeContracts) validateNativeContractBuildInputs(manifest)
  if (batchSubjects || dustAccounting || mergeAccounting || inputAncestry || sqliteRetry || callerKnownInputs) validateBatchBuildInputs(manifest, dustAccounting, mergeAccounting, inputAncestry, sqliteRetry, callerKnownInputs)
  const normalized = structuredClone(build)
  const actual = normalized.dependencies?.[lock.module]
  if (actual?.version !== lock.version || actual.replacementModule !== manifest.replacementModule || !['', '(devel)'].includes(actual.replacementVersion ?? ''))
    throw new Error('Storage sync compatibility source replacement differs from manifest')
  normalized.dependencies![lock.module] = { version: lock.version, sum: lock.sum }
  if (callerKnownInputs) {
    const sdk = validateCallerKnownSDK(manifest), actualSDK = normalized.dependencies?.[sdk.module]
    if (actualSDK?.version !== sdk.version || actualSDK.replacementModule !== sdk.source || !['', '(devel)'].includes(actualSDK.replacementVersion ?? '')) throw new Error('Compiled SDK replacement differs from the exact tenth-layer manifest')
    normalized.dependencies![sdk.module] = { version: sdk.version, sum: sdk.sum }
  }
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
  /** Prospective native recipient-ancestry export closure; separately pinned. */
  storagePortabilityPatch?: boolean
  /** ITCVE-1@4.0.0 listActions contract revision, layered on portability. */
  storageListActionsPatch?: boolean
  /** Prospective native observer2/candidate public contract fixes, with an immutable parent. */
  storageNativeContractsPatch?: boolean
  /** New profile only: selected batch subjects and scoped output snapshots. */
  storageBatchSubjectsPatch?: boolean
  /** Exact signed debit after omitted dust change; includes batch subjects. */
  storageDustAccountingPatch?: boolean
  /** Atomic credit merge after new owned outputs; includes dust/batch fixes. */
  storageMergeAccountingPatch?: boolean
  /** Complete response ancestry for already-owned explicit inputs. */
  storageInputAncestryPatch?: boolean
  /** Retry a rolled-back SQLite snapshot conflict at the existing owner. */
  storageSQLiteRetryPatch?: boolean
  /** Caller-declared known roots and complete same-host storage inventories. */
  storageCallerKnownInputsPatch?: boolean
  /** Prospective ITCVE-1.4 fixture semantics, never implicit in old profiles. */
  terminalRejectionReceipts?: boolean
}
export function selectComponents(value: ComponentSelection = {}): Required<ComponentSelection> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid component selection')
  for (const [role, language] of Object.entries(value)) {
    if (!['overlay', 'chaintracks', 'storage'].includes(role) || !['typescript', 'go'].includes(language))
      throw new Error(`Unsupported ITCVE component: ${role}=${String(language)}`)
  }
  return { overlay: 'typescript', chaintracks: 'typescript', storage: 'typescript', ...value }
}
export function validateComponentIdentity(value: Record<string, unknown>, profile?: 'ITCVE-1@1.3.0' | 'ITCVE-1@1.4.0' | 'ITCVE-1@1.5.0' | 'ITCVE-1@2.0.0' | 'ITCVE-1@4.0.0' | 'ITCVE-1@4.1.0' | 'ITCVE-1@4.2.0' | 'ITCVE-1@4.3.0' | 'ITCVE-1@4.4.0' | 'ITCVE-1@4.5.0' | 'ITCVE-1@4.6.0' | 'ITCVE-1@4.7.0'): void {
  const components = selectComponents(value.components as ComponentSelection)
  if (!Object.values(components).includes('go')) throw new Error('Go profile omitted Go selection')
  const go = value.go as Record<string, unknown> | undefined
  if (go?.schema !== 'tpnil-go-services@1.0.0' || canonicalJson(go.components) !== canonicalJson(components) ||
      typeof go.binarySha256 !== 'string' || !/^[a-f0-9]{64}$/.test(go.binarySha256) ||
      (!['ITCVE-1@1.3.0', 'ITCVE-1@1.4.0', 'ITCVE-1@1.5.0', 'ITCVE-1@2.0.0', 'ITCVE-1@4.0.0', 'ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.3.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(profile ?? '') && go.compatibilityPatch !== undefined) ||
      (['ITCVE-1@1.4.0', 'ITCVE-1@1.5.0', 'ITCVE-1@2.0.0', 'ITCVE-1@4.0.0', 'ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.3.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(profile ?? '') ? go.fixtureSubmissionPolicy !== 'terminal-rejection-v1' : go.fixtureSubmissionPolicy !== undefined) ||
      go.goModSha256 !== componentLock.moduleFiles['go.mod'] || go.goSumSha256 !== componentLock.moduleFiles['go.sum'] ||
      canonicalJson(go.dependencies) !== canonicalJson(componentLock))
    throw new Error('Go service component identity is incomplete or differs from lock')
  if (profile === 'ITCVE-1@1.3.0' || ['ITCVE-1@1.4.0', 'ITCVE-1@1.5.0', 'ITCVE-1@2.0.0', 'ITCVE-1@4.0.0', 'ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.3.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(profile ?? '')) {
    const manifest = go.compatibilityPatch as Record<string, unknown> | undefined
    const release511 = ['ITCVE-1@4.0.0', 'ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.3.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(profile ?? '')
    const batchSubjects = false
    const dustAccounting = false
    const mergeAccounting = false
    const inputAncestry = false
    const callerKnownInputs = ['ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0'].includes(profile ?? '')
    if (callerKnownInputs && manifest?.schema !== 'tpnil-storage-caller-known-inputs-go-build@1.0.0') throw new Error('Completion profile requires caller-known-inputs compatibility build')
    const sqliteRetry = profile === 'ITCVE-1@4.3.0' || profile === 'ITCVE-1@4.4.0'
    if (sqliteRetry && manifest?.schema !== 'tpnil-storage-sqlite-retry-go-build@1.0.0') throw new Error('Coverage profile requires SQLite retry compatibility build')
    const nativeContracts = release511 && manifest?.schema === 'tpnil-storage-native-contracts-go-build@1.0.0'
    if (['ITCVE-1@4.1.0', 'ITCVE-1@4.2.0'].includes(profile ?? '') && !nativeContracts) throw new Error('Candidate native profile requires the native contract compatibility build')
    const listActions = release511 && !nativeContracts && !batchSubjects && !dustAccounting && !mergeAccounting && !inputAncestry && !sqliteRetry && !callerKnownInputs
    if (listActions && manifest?.schema !== 'tpnil-storage-list-actions-go-build@1.0.0') throw new Error('Native 5.1.1 requires the listActions ancestry export compatibility build')
    const portability = ['ITCVE-1@1.4.0', 'ITCVE-1@1.5.0', 'ITCVE-1@2.0.0'].includes(profile ?? '') && manifest?.schema === 'tpnil-storage-portability-go-build@1.0.0'
    if (['ITCVE-1@1.5.0', 'ITCVE-1@2.0.0'].includes(profile ?? '') && !portability) throw new Error('Native coverage requires the ancestry export compatibility build')
    const bytes = fs.readFileSync(fileURLToPath(new URL(callerKnownInputs ? '../../../infra/adapters/storage-caller-known-inputs/patch.lock.json' : sqliteRetry ? '../../../infra/adapters/storage-sqlite-retry/patch.lock.json' : inputAncestry ? '../../../infra/adapters/storage-input-ancestry/patch.lock.json' : mergeAccounting ? '../../../infra/adapters/storage-merge-accounting/patch.lock.json' : dustAccounting ? '../../../infra/adapters/storage-dust-accounting/patch.lock.json' : batchSubjects ? '../../../infra/adapters/storage-batch-subjects/patch.lock.json' : nativeContracts ? '../../../infra/adapters/storage-native-contracts/patch.lock.json' : listActions ? '../../../infra/adapters/storage-list-actions/patch.lock.json' : portability ? '../../../infra/adapters/storage-portability/patch.lock.json' : '../../../infra/adapters/storage-sync/patch.lock.json', import.meta.url)))
    const lock = JSON.parse(bytes.toString())
    if (manifest?.schema !== (callerKnownInputs ? 'tpnil-storage-caller-known-inputs-go-build@1.0.0' : sqliteRetry ? 'tpnil-storage-sqlite-retry-go-build@1.0.0' : inputAncestry ? 'tpnil-storage-input-ancestry-go-build@1.0.0' : mergeAccounting ? 'tpnil-storage-merge-accounting-go-build@1.0.0' : dustAccounting ? 'tpnil-storage-dust-accounting-go-build@1.0.0' : batchSubjects ? 'tpnil-storage-batch-subjects-go-build@1.0.0' : nativeContracts ? 'tpnil-storage-native-contracts-go-build@1.0.0' : listActions ? 'tpnil-storage-list-actions-go-build@1.0.0' : portability ? 'tpnil-storage-portability-go-build@1.0.0' : 'tpnil-storage-sync-go-build@1.0.0') || manifest.binarySha256 !== go.binarySha256 || ((portability || listActions || nativeContracts || batchSubjects || dustAccounting || mergeAccounting || inputAncestry || sqliteRetry || callerKnownInputs) && manifest.parentPatchLockSha256 !== lock.parentSha256) || manifest.patchLockSha256 !== createHash('sha256').update(bytes).digest('hex') || manifest.patchSha256 !== lock.patchSha256 || manifest.toolchain !== componentLock.toolchain || canonicalJson(manifest.upstream) !== canonicalJson({ module: lock.module, version: lock.version, sum: lock.sum }))
      throw new Error('Integrated native compatibility identity differs from its pinned source')
    if (callerKnownInputs) validateCallerKnownSDK(manifest)
    if (nativeContracts) validateNativeContractBuildInputs(manifest)
    if (batchSubjects || dustAccounting || mergeAccounting || inputAncestry || sqliteRetry || callerKnownInputs) validateBatchBuildInputs(manifest, dustAccounting, mergeAccounting, inputAncestry, sqliteRetry, callerKnownInputs)
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
    if ([options.storageSyncPatch, options.storagePortabilityPatch, options.storageListActionsPatch, options.storageNativeContractsPatch, options.storageBatchSubjectsPatch, options.storageDustAccountingPatch, options.storageMergeAccountingPatch, options.storageInputAncestryPatch, options.storageSQLiteRetryPatch, options.storageCallerKnownInputsPatch].filter(Boolean).length > 1) throw new Error('Conflicting Go storage compatibility selectors')
    this.binary = path.resolve(options.binary ?? process.env.TPNIL_GO_BINARY ?? fileURLToPath(new URL('../../../out/itcve-go-services', import.meta.url)))
  }
  get identity(): Record<string, unknown> {
    return { schema: 'tpnil-go-services@1.0.0', ...(this.compatibilityPatch === undefined ? {} : { compatibilityPatch: this.compatibilityPatch }), ...(this.options.terminalRejectionReceipts ? { fixtureSubmissionPolicy: 'terminal-rejection-v1' } : {}), components: this.components, binarySha256: this.executableSha256, dependencies: componentLock, goModSha256: createHash('sha256').update(fs.readFileSync(fileURLToPath(new URL('../../go/go.mod', import.meta.url)))).digest('hex'), goSumSha256: createHash('sha256').update(fs.readFileSync(fileURLToPath(new URL('../../go/go.sum', import.meta.url)))).digest('hex') }
  }
  async start(fixtures: string, rootKey: string): Promise<void> {
    const args = ['--state', this.state, '--fixtures', fixtures, '--control-token', this.token, '--root-key', rootKey]
    if (this.options.terminalRejectionReceipts) args.push('--terminal-rejection-receipts')
    if (this.components.storage === 'go') args.push('--storage')
    if (this.components.overlay === 'go') {
      const mongo = this.options.mongoUri ?? process.env.TPNIL_GO_MONGO_URI
      if (mongo === undefined) throw new Error('Go Overlay Services requires TPNIL_GO_MONGO_URI for a disposable loopback Mongo replica set')
      args.push('--overlay', '--mongo', mongo, '--database', this.database)
    }
    this.origin = ''
    this.stderr = ''
    this.executableSha256 = createHash('sha256').update(fs.readFileSync(this.binary)).digest('hex')
    if (this.options.storageSyncPatch || this.options.storagePortabilityPatch || this.options.storageListActionsPatch || this.options.storageNativeContractsPatch || this.options.storageBatchSubjectsPatch || this.options.storageDustAccountingPatch || this.options.storageMergeAccountingPatch || this.options.storageInputAncestryPatch || this.options.storageSQLiteRetryPatch || this.options.storageCallerKnownInputsPatch) {
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
              else validateStorageSyncGoBuild(message, this.executableSha256, this.compatibilityPatch, this.options.storagePortabilityPatch, this.options.storageListActionsPatch, this.options.storageNativeContractsPatch, this.options.storageBatchSubjectsPatch, this.options.storageDustAccountingPatch, this.options.storageMergeAccountingPatch, this.options.storageInputAncestryPatch, this.options.storageSQLiteRetryPatch, this.options.storageCallerKnownInputsPatch)
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
  async actionReferences(identity: string): Promise<Array<{ txid: string; reference: string }>> {
    if (!/^(02|03)[0-9a-f]{64}$/.test(identity)) throw new Error('Invalid action-reference identity')
    const response = await fetch(`${this.origin}/control/action-references?identityKey=${encodeURIComponent(identity)}`, { headers: { authorization: `Bearer ${this.token}` }, redirect: 'error', signal: AbortSignal.timeout(15000) })
    if (!response.ok) throw new Error(`Go action-reference snapshot failed: HTTP ${response.status}`)
    return response.json() as Promise<Array<{ txid: string; reference: string }>>
  }
  async outputSnapshot(identity: string): Promise<NativeOutputSnapshot> {
    if (!(this.options.storageBatchSubjectsPatch || this.options.storageDustAccountingPatch || this.options.storageMergeAccountingPatch || this.options.storageInputAncestryPatch || this.options.storageSQLiteRetryPatch || this.options.storageCallerKnownInputsPatch) || !this.admitted) throw new Error('Scoped output observation requires the prospective compatibility host')
    assertSnapshotIdentity(identity)
    const response = await fetch(`${this.origin}/control/v2/native-output-snapshot?identityKey=${encodeURIComponent(identity)}`, {
      headers: { authorization: `Bearer ${this.token}` }, redirect: 'error', signal: AbortSignal.timeout(15000)
    })
    if (!response.ok || !response.body) throw new Error(`Go output snapshot failed: HTTP ${response.status}`)
    const reader = response.body.getReader(), chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const next = await reader.read(); if (next.done) break
        size += next.value.length
        if (size > 72 * 1024 * 1024) throw new Error('Go output snapshot response exceeds limit')
        chunks.push(next.value)
      }
    } finally { await reader.cancel(); reader.releaseLock() }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString())
    validateNativeOutputSnapshot(value, identity)
    return value
  }
  private async readCoverageInventory(route: string, maximumBytes: number): Promise<unknown> {
    if (!this.options.storageCallerKnownInputsPatch || !this.admitted) throw new Error('Complete inventories require the admitted caller-known-inputs host')
    const response = await fetch(`${this.origin}${route}`, { headers: { authorization: `Bearer ${this.token}` }, redirect: 'error', signal: AbortSignal.timeout(15000) })
    if (!response.ok || !response.body) throw new Error(`Go coverage inventory failed: HTTP ${response.status}`)
    const reader = response.body.getReader(), chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > maximumBytes) throw new Error('Go coverage inventory response exceeds limit'); chunks.push(next.value) }
    } finally { await reader.cancel(); reader.releaseLock() }
    return JSON.parse(Buffer.concat(chunks).toString())
  }
  get actionObserverActive(): boolean { return this.admitted && Boolean(this.options.storageCallerKnownInputsPatch) && this.components.storage === 'go' }
  private retainedFinalActionLedger?: NativeActionQueryFinalLedger
  private retainedActionFailureBundle?: NativeActionQueryFailureBundle
  get actionQueryFailureBundle(): NativeActionQueryFailureBundle | undefined { return this.retainedActionFailureBundle === undefined ? undefined : structuredClone(this.retainedActionFailureBundle) }
  get finalActionQueryLedger(): NativeActionQueryFinalLedger | undefined { return this.retainedFinalActionLedger === undefined ? undefined : structuredClone(this.retainedFinalActionLedger) }
  async actionQueryCuts(identity: string): Promise<NativeActionQueryCuts> {
    assertSnapshotIdentity(identity)
    const route = `/control/v1/native-action-query-cuts?identityKey=${encodeURIComponent(identity)}&from=1&through=`
    const initial = validateNativeActionQueryCuts(await this.readCoverageInventory(route + '0', nativeActionQueryResponseByteLimit), identity)
    const result = validateNativeActionQueryCuts(await this.readCoverageInventory(route + initial.entryCount, nativeActionQueryResponseByteLimit), identity)
    if (result.entryCount !== initial.entryCount || result.inFlight !== 0) throw new Error('Action query ledger advanced during complete control observation')
    return result
  }
  async certificateInventory(identity: string): Promise<NativeCertificateInventory> {
    assertSnapshotIdentity(identity)
    const value = await this.readCoverageInventory(`/control/v1/native-certificate-inventory?identityKey=${encodeURIComponent(identity)}`, nativeCertificateInventoryResponseByteLimit)
    return validateNativeCertificateInventory(value)
  }
  async transactionKnowledgeInventory(): Promise<NativeTransactionKnowledgeInventory> {
    const value = await this.readCoverageInventory('/control/v1/transaction-knowledge-inventory', nativeTransactionKnowledgeResponseByteLimit)
    return validateNativeTransactionKnowledgeInventory(value)
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
    if (child === undefined) return
    let forced = false
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit').catch(() => undefined)
      child.kill('SIGTERM')
      const timer = setTimeout(() => { forced = true; child.kill('SIGKILL') }, this.options.storageCallerKnownInputsPatch ? 15000 : 7000)
      await exited; clearTimeout(timer)
    }
    const failures: unknown[] = []
    if (forced) failures.push(new Error('Go service required forced termination'))
    if (this.options.storageCallerKnownInputsPatch && this.admitted && this.components.storage === 'go') {
      try {
        this.retainedFinalActionLedger ??= readNativeActionQueryFinalLedger(path.join(this.state, 'action-query-ledger'))
        const final = this.retainedFinalActionLedger.final
        if (!final.finalized || final.inFlight !== 0 || final.terminalErrors.length !== 0 || child.exitCode !== 0 || child.signalCode !== null)
          throw new Error('Action observer finalization or process exit failed')
      } catch (error) { this.retainedActionFailureBundle ??= readNativeActionQueryFailureBundle(path.join(this.state, 'action-query-ledger')); failures.push(error) }
    }
    if (failures.length) throw new AggregateError(failures, 'Go service shutdown evidence failed')
  }
}
