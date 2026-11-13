import { validateComponentIdentity } from './go-services.js'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { canonicalJson, sha256Hex } from '../determinism.js'
import { identifiesYoursCandidate, matchesYoursCandidate, type WalletLabResult } from './model.js'

const secretKeys = new Set([
  'mnemonic',
  'password',
  'privatekey',
  'rootkey',
  'rootkeyhex',
  'seed',
  'authorization',
  'cookie',
  'set-cookie',
  'auth_token'
])

export function redactEvidence(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactEvidence)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        secretKeys.has(key.toLowerCase()) ? '[REDACTED]' : redactEvidence(item)
      ])
    )
  }
  return value
}

export class EvidenceBundle {
  private readonly files = new Map<string, Uint8Array>()

  constructor(readonly directory: string) {}

  addJson(name: string, value: unknown): void {
    this.addBytes(name, Buffer.from(`${canonicalJson(redactEvidence(value))}\n`))
  }

  addText(name: string, value: string): void {
    this.addBytes(name, Buffer.from(value))
  }

  addBytes(name: string, value: Uint8Array): void {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(name) || name.includes('..'))
      throw new TypeError(`Invalid evidence name: ${name}`)
    this.files.set(name, Uint8Array.from(value))
  }

  /** Read an already captured observation without exposing mutable storage. */
  readBytes(name: string): Buffer {
    const value = this.files.get(name)
    if (value === undefined) throw new Error(`Evidence has not been captured: ${name}`)
    return Buffer.from(value)
  }

  flush(): WalletLabResult['evidence'] {
    fs.mkdirSync(this.directory, { recursive: true })
    const evidence = [...this.files.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, bytes]) => {
        const destination = path.join(this.directory, 'evidence', name)
        fs.mkdirSync(path.dirname(destination), { recursive: true })
        fs.writeFileSync(destination, bytes)
        return { name, sha256: sha256Hex(bytes), size: bytes.length }
      })
    return evidence
  }

  write(result: Omit<WalletLabResult, 'evidence'>): WalletLabResult {
    const complete: WalletLabResult = { ...result, evidence: this.flush() }
    fs.writeFileSync(path.join(this.directory, 'record.json'), `${canonicalJson(complete)}\n`)
    return complete
  }
}

export function verifyEvidenceBundle(directory: string): WalletLabResult {
  const recordPath = path.join(directory, 'record.json')
  const parsed = JSON.parse(fs.readFileSync(recordPath, 'utf8')) as WalletLabResult
  if (parsed.schema !== 'tpnil-isi4-wallet-run@1.0.0') throw new Error('Unsupported wallet-run evidence schema')
  if (!['EXPERIMENTAL_CONFORMANCE_RESULT', 'ENGINEERING_OBSERVATION_ONLY'].includes(parsed.claim) || parsed.program !== (parsed.itcve === 'ITCVE-1@4.8.0' ? 'ISI-4@5.8.0' : parsed.itcve === 'ITCVE-1@4.7.0' ? 'ISI-4@5.7.0' : parsed.itcve === 'ITCVE-1@4.6.0' ? 'ISI-4@5.6.0' : parsed.itcve === 'ITCVE-1@4.5.0' ? 'ISI-4@5.5.0' : parsed.itcve === 'ITCVE-1@4.4.0' ? 'ISI-4@5.4.0' : parsed.itcve === 'ITCVE-1@4.2.0' ? 'ISI-4@5.2.0' : parsed.itcve === 'ITCVE-1@4.1.0' ? 'ISI-4@5.1.0' : parsed.itcve === 'ITCVE-1@4.0.0' ? 'ISI-4@5.0.0' : parsed.itcve === 'ITCVE-1@2.0.0' ? 'ISI-4@4.0.0' : parsed.itcve === 'ITCVE-1@1.5.0' ? 'ISI-4@3.0.0' : parsed.itcve === 'ITCVE-1@1.4.0' ? 'ISI-4@2.0.0' : 'ISI-4@1.0.0') || !['ITCVE-1@1.0.0', 'ITCVE-1@1.1.0', 'ITCVE-1@1.3.0', 'ITCVE-1@1.4.0', 'ITCVE-1@1.5.0', 'ITCVE-1@2.0.0', 'ITCVE-1@4.0.0', 'ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0', 'ITCVE-1@4.8.0'].includes(parsed.itcve))
    throw new Error('Unexpected wallet-run claim or program boundary')
  if (parsed.itcve === 'ITCVE-1@4.1.0' || parsed.itcve === 'ITCVE-1@4.2.0' || parsed.itcve === 'ITCVE-1@4.4.0' || ['ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0', 'ITCVE-1@4.8.0'].includes(parsed.itcve)) {
    if (parsed.claim !== 'ENGINEERING_OBSERVATION_ONLY' || parsed.profile !== 'candidate-wallet-native-engineering' || parsed.walletCandidate?.officialRelease !== false || !matchesYoursCandidate(parsed.artifacts.wallet, parsed.itcve)) throw new Error('Candidate wallet requires its explicit engineering boundary')
  } else if (identifiesYoursCandidate(parsed.artifacts.wallet) || parsed.walletCandidate !== undefined || parsed.profile === 'candidate-wallet-native-engineering') throw new Error('Candidate wallet identity cannot enter a release profile')
  const selection = parsed.configuration.serviceComponents?.components
  if (selection !== null && typeof selection === 'object' && Object.values(selection).includes('go') && !['ITCVE-1@1.1.0', 'ITCVE-1@1.3.0', 'ITCVE-1@1.4.0', 'ITCVE-1@1.5.0', 'ITCVE-1@2.0.0', 'ITCVE-1@4.0.0', 'ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0', 'ITCVE-1@4.8.0'].includes(parsed.itcve))
    throw new Error('Go service selection requires the Go component profile')
  if (['ITCVE-1@1.1.0', 'ITCVE-1@1.3.0', 'ITCVE-1@1.4.0', 'ITCVE-1@1.5.0', 'ITCVE-1@2.0.0', 'ITCVE-1@4.0.0', 'ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0', 'ITCVE-1@4.8.0'].includes(parsed.itcve)) {
    if (parsed.claim !== 'ENGINEERING_OBSERVATION_ONLY' || parsed.configuration.serviceComponents === undefined)
      throw new Error('Go component profile requires engineering claim and component identities')
    validateComponentIdentity(parsed.configuration.serviceComponents, parsed.itcve === 'ITCVE-1@1.3.0' || parsed.itcve === 'ITCVE-1@1.4.0' || parsed.itcve === 'ITCVE-1@1.5.0' || parsed.itcve === 'ITCVE-1@2.0.0' || parsed.itcve === 'ITCVE-1@4.0.0' || parsed.itcve === 'ITCVE-1@4.1.0' || parsed.itcve === 'ITCVE-1@4.2.0' || parsed.itcve === 'ITCVE-1@4.4.0' || (parsed.itcve === 'ITCVE-1@4.6.0' || parsed.itcve === 'ITCVE-1@4.7.0' || parsed.itcve === 'ITCVE-1@4.8.0') || parsed.itcve === 'ITCVE-1@4.5.0' ? parsed.itcve : undefined)
    const identity = JSON.parse(fs.readFileSync(path.join(directory, 'evidence/service-components.json'), 'utf8'))
    if (canonicalJson(identity) !== canonicalJson(parsed.configuration.serviceComponents))
      throw new Error('Service component evidence differs from configuration')
  }
  if (!Array.isArray(parsed.vectors) || parsed.vectors.length !== 8)
    throw new Error('A wallet run must score all eight vectors')
  if (!Array.isArray(parsed.evidence) || parsed.evidence.length === 0)
    throw new Error('Wallet-run evidence is empty')
  const names = parsed.evidence.map(item => item.name)
  if (new Set(names).size !== names.length) throw new Error('Evidence names are not unique')
  const evidenceRoot = path.join(directory, 'evidence')
  const actual: string[] = []
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`Evidence contains a symlink: ${entry.name}`)
      if (entry.isDirectory()) walk(absolute)
      else if (entry.isFile()) actual.push(path.relative(evidenceRoot, absolute).split(path.sep).join('/'))
      else throw new Error(`Unsupported evidence entry: ${entry.name}`)
    }
  }
  walk(evidenceRoot)
  if (canonicalJson([...names].sort()) !== canonicalJson(actual.sort()))
    throw new Error('Evidence file set differs from the record')
  for (const item of parsed.evidence) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(item.name) || item.name.includes('..'))
      throw new Error(`Invalid evidence name: ${item.name}`)
    const file = path.join(directory, 'evidence', item.name)
    const stat = fs.statSync(file)
    if (stat.size !== item.size) throw new Error(`Evidence size mismatch: ${item.name}`)
    const digest = createHash('sha256').update(fs.readFileSync(file)).digest('hex')
    if (digest !== item.sha256) throw new Error(`Evidence digest mismatch: ${item.name}`)
  }
  return parsed
}

interface WalletRunSeries {
  schema: string
  claim: string
  program: string
  repetitions: Array<{ runId: string; outcome: string; recordSha256: string }>
  repetitionMatch: boolean
  semanticProjection: Record<string, string | number | boolean>
  outcome: string
}

export function verifyWalletRunSeries(directory: string): { results: WalletLabResult[]; repetitionMatch: boolean } {
  const series = JSON.parse(fs.readFileSync(path.join(directory, 'series.json'), 'utf8')) as WalletRunSeries
  if (series.schema !== 'tpnil-isi4-wallet-run-series@1.0.0' ||
      !['EXPERIMENTAL_CONFORMANCE_RESULT', 'ENGINEERING_OBSERVATION_ONLY'].includes(series.claim) || series.program !== 'ISI-4@1.0.0')
    throw new Error('Unexpected wallet-run series boundary')
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith('repetition-'))
    .map(entry => entry.name)
    .sort()
  if (entries.length < 2 || entries.length !== series.repetitions.length)
    throw new Error('Wallet-run series repetition set differs from the record')
  const results = entries.map(name => verifyEvidenceBundle(path.join(directory, name)))
  if (results.some(result => result.claim !== series.claim)) throw new Error('Wallet-run series mixes claim boundaries')
  const declared = series.repetitions.map(item => item.runId)
  if (canonicalJson(declared) !== canonicalJson(entries)) throw new Error('Wallet-run series order or identifiers differ')
  for (let index = 0; index < entries.length; index += 1) {
    const bytes = fs.readFileSync(path.join(directory, entries[index]!, 'record.json'))
    const declaration = series.repetitions[index]!
    if (declaration.recordSha256 !== sha256Hex(bytes)) throw new Error(`Wallet-run record digest mismatch: ${declaration.runId}`)
    if (declaration.outcome !== results[index]!.outcome) throw new Error(`Wallet-run outcome mismatch: ${declaration.runId}`)
  }
  if (results.some(result => result.itcve === 'ITCVE-1@1.1.0') && results.some(result =>
    result.itcve !== results[0]!.itcve || canonicalJson(result.configuration.serviceComponents ?? {}) !== canonicalJson(results[0]!.configuration.serviceComponents ?? {})))
    throw new Error('Wallet-run series mixes service component identities')
  const projections = results.map(result => canonicalJson(result.semanticProjection))
  const repetitionMatch = projections.every(projection => projection === projections[0])
  if (series.repetitionMatch !== repetitionMatch) throw new Error('Wallet-run series repeatability finding differs')
  if (canonicalJson(series.semanticProjection) !== projections[0]) throw new Error('Wallet-run series projection differs')
  const expectedOutcome = repetitionMatch ? results[0]!.outcome : 'INCONCLUSIVE'
  if (series.outcome !== expectedOutcome) throw new Error('Wallet-run series outcome differs')
  return { results, repetitionMatch }
}
