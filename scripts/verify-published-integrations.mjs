import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { inflateRawSync, crc32 } from 'node:zlib'
import { spawnSync } from 'node:child_process'
import { prepareFrozenComponentReplay, requireVerifierReceipt } from './frozen-component-replay.mjs'

const repository = path.resolve(import.meta.dirname, '..')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
function safeName(name, directory = false) {
  assert.equal(typeof name, 'string')
  assert(name.length > 0 && name.length <= 1024 && !name.includes('\\') && !name.includes('\0') && !name.startsWith('/'), `Unsafe archive path: ${name}`)
  assert(/^[A-Za-z0-9_.@/-]+$/.test(name), `Unsupported archive path: ${name}`)
  const parts = (directory && name.endsWith('/') ? name.slice(0, -1) : name).split('/')
  assert(parts.every(part => part !== '' && part !== '.' && part !== '..'), `Unsafe archive path: ${name}`)
  return parts.join('/')
}
function filesUnder(directory) {
  assert(fs.lstatSync(directory).isDirectory() && !fs.lstatSync(directory).isSymbolicLink(), `Invalid journal directory: ${directory}`)
  const files = []
  function walk(current) {
    for (const item of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, item.name)
      assert(!item.isSymbolicLink(), `Journal symlink: ${target}`)
      if (item.isDirectory()) walk(target)
      else { assert(item.isFile(), `Unsupported journal entry: ${target}`); files.push(path.relative(directory, target).split(path.sep).join('/')) }
    }
  }
  walk(directory); return files.sort()
}

/** Bounded ZIP32 extraction with no shell, external packages or link creation.
 * Both local/central paths are checked before writing, and every decoded entry
 * must match its CRC and declared length. ZIP64/multipart/encrypted archives fail
 * closed; published evidence packs fit the explicit 512 MiB extraction bound. */
export function extractZipSafely(bytes, directory, { maxEntries = 100000, maxBytes = 512 * 1024 * 1024, maxFileBytes = 256 * 1024 * 1024 } = {}) {
  assert(Buffer.isBuffer(bytes)); assert(bytes.length >= 22 && bytes.length <= maxBytes)
  assert.deepEqual(fs.readdirSync(directory), [], 'Extraction directory must be empty')
  assert(fs.lstatSync(directory).isDirectory() && !fs.lstatSync(directory).isSymbolicLink())
  let end = -1
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (bytes.readUInt32LE(offset) === 0x06054b50 && offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length) { end = offset; break }
  }
  assert(end >= 0, 'ZIP end record missing')
  assert.equal(bytes.readUInt16LE(end + 4), 0, 'Multipart ZIP rejected'); assert.equal(bytes.readUInt16LE(end + 6), 0)
  const count = bytes.readUInt16LE(end + 10), centralSize = bytes.readUInt32LE(end + 12), centralOffset = bytes.readUInt32LE(end + 16)
  assert(count > 0 && count !== 0xffff && count <= maxEntries, 'ZIP entry count exceeds limit')
  assert.equal(bytes.readUInt16LE(end + 8), count)
  assert(centralSize !== 0xffffffff && centralOffset !== 0xffffffff && centralOffset + centralSize === end, 'ZIP64 or invalid central directory rejected')
  const entries = [], names = new Set(), foldedNames = new Set(), ranges = []
  let cursor = centralOffset, total = 0
  for (let index = 0; index < count; index++) {
    assert(cursor + 46 <= end && bytes.readUInt32LE(cursor) === 0x02014b50, 'Invalid ZIP central entry')
    const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10), checksum = bytes.readUInt32LE(cursor + 16)
    const compressed = bytes.readUInt32LE(cursor + 20), size = bytes.readUInt32LE(cursor + 24), nameLength = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30), comment = bytes.readUInt16LE(cursor + 32)
    const attributes = bytes.readUInt32LE(cursor + 38), local = bytes.readUInt32LE(cursor + 42)
    assert(cursor + 46 + nameLength + extra + comment <= end)
    assert.equal(bytes.readUInt16LE(cursor + 34), 0, 'Multipart ZIP rejected')
    assert((flags & ~0x080e) === 0 && (flags & 1) === 0, 'Unsupported ZIP flags')
    assert([0, 8].includes(method), 'Unsupported ZIP compression')
    assert(compressed !== 0xffffffff && size !== 0xffffffff && local !== 0xffffffff, 'ZIP64 rejected')
    const rawName = bytes.subarray(cursor + 46, cursor + 46 + nameLength), name = rawName.toString('utf8'), isDirectory = name.endsWith('/')
    assert(Buffer.from(name).equals(rawName), 'Invalid UTF-8 ZIP name')
    const canonical = safeName(name, isDirectory), fileType = (attributes >>> 16) & 0xf000
    assert(fileType === 0 || fileType === (isDirectory ? 0x4000 : 0x8000), 'ZIP links and special files rejected')
    assert(!names.has(canonical) && !foldedNames.has(canonical.toLowerCase()), `Duplicate or case-colliding ZIP entry: ${canonical}`)
    names.add(canonical); foldedNames.add(canonical.toLowerCase())
    total += size; assert(size <= maxFileBytes && total <= maxBytes, 'ZIP expansion exceeds limit')
    assert(local + 30 <= centralOffset && bytes.readUInt32LE(local) === 0x04034b50, 'Invalid ZIP local entry')
    assert.equal(bytes.readUInt16LE(local + 6), flags); assert.equal(bytes.readUInt16LE(local + 8), method)
    const localNameLength = bytes.readUInt16LE(local + 26), localExtra = bytes.readUInt16LE(local + 28), start = local + 30 + localNameLength + localExtra
    assert(start + compressed <= centralOffset && bytes.subarray(local + 30, local + 30 + localNameLength).equals(rawName), 'Local ZIP path or data boundary differs')
    if ((flags & 8) === 0) { assert.equal(bytes.readUInt32LE(local + 14), checksum); assert.equal(bytes.readUInt32LE(local + 18), compressed); assert.equal(bytes.readUInt32LE(local + 22), size) }
    if (isDirectory) assert.equal(size, 0)
    ranges.push([local, start + compressed]); entries.push({ name: canonical, isDirectory, start, compressed, size, checksum, method })
    cursor += 46 + nameLength + extra + comment
  }
  assert.equal(cursor, end)
  ranges.sort((a, b) => a[0] - b[0]); for (let i = 1; i < ranges.length; i++) assert(ranges[i][0] >= ranges[i - 1][1], 'Overlapping ZIP entries')
  const fileNames = new Set(entries.filter(entry => !entry.isDirectory).map(entry => entry.name.toLowerCase()))
  for (const entry of entries) {
    const parents = entry.name.split('/').slice(0, -1)
    for (let i = 1; i <= parents.length; i++) assert(!fileNames.has(parents.slice(0, i).join('/').toLowerCase()), 'ZIP file/directory collision')
  }
  for (const entry of entries) {
    const target = path.join(directory, entry.name)
    const compressed = bytes.subarray(entry.start, entry.start + entry.compressed)
    const content = entry.method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: Math.max(1, entry.size) })
    assert.equal(content.length, entry.size, 'ZIP decoded size differs'); assert.equal(crc32(content), entry.checksum, 'ZIP CRC differs')
    if (entry.isDirectory) { fs.mkdirSync(target, { recursive: true }); continue }
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content, { flag: 'wx', mode: 0o600 })
  }
  return { entries: count, bytes: total }
}

export function verifyIntegrationArchive(directory) {
  const attempt = fs.existsSync(path.join(directory, 'attempt.json'))
  const manifestName = attempt ? 'attempt.json' : 'provenance.json', manifest = readJson(path.join(directory, manifestName))
  const kinds = { 'tpnil-integrated-component-archive@1': 'component', 'tpnil-integrated-native-archive@1': 'native', 'tpnil-integration-attempt@1': 'attempt', 'tpnil-native-integrated-reevaluation-archive@1': 'reevaluation' }
  const kind = kinds[manifest.schema]; assert(kind, `Unrecognized integration archive: ${manifest.schema}`)
  assert.equal(attempt, kind === 'attempt'); assert.match(manifest.source, /^[a-f0-9]{40}$/)
  assert(Array.isArray(manifest.files) && manifest.files.length > 0)
  const names = manifest.files.map(item => safeName(attempt ? item.name : item.path))
  assert.equal(new Set(names).size, names.length, 'Duplicate archive inventory entry')
  assert.deepEqual(names.slice().sort(), filesUnder(directory).filter(name => name !== manifestName), 'Published archive file set differs')
  for (const [index, item] of manifest.files.entries()) {
    assert(Number.isSafeInteger(item.size) && item.size >= 0); assert.match(item.sha256, /^[a-f0-9]{64}$/)
    const bytes = fs.readFileSync(path.join(directory, names[index])); assert.equal(bytes.length, item.size); assert.equal(sha256(bytes), item.sha256, names[index])
  }
  if (attempt) {
    assert(['OBSERVER_BUILD_ERROR', 'OBSERVER_STARTUP_ERROR', 'OBSERVER_EXECUTION_ERROR', 'OBSERVER_VERIFICATION_ERROR'].includes(manifest.claim))
    if (manifest.claim === 'OBSERVER_BUILD_ERROR') assert.equal(manifest.walletExecuted, false)
    return { kind, directory, source: manifest.source, files: names.length, claim: manifest.claim }
  }
  if (kind === 'reevaluation') {
    const qualification=readJson(path.join(directory,'reevaluation.json')),archive='native-reevaluation.zip'
    assert.equal(qualification.schema,'tpnil-native-integrated-reevaluation@1');assert.equal(qualification.claim,'RETAINED_NATIVE_EVIDENCE_REEVALUATION')
    assert.equal(qualification.evaluatorSource,manifest.source);assert.equal(qualification.qualifiedRetainedEvidence,true);assert.equal(qualification.newNativeSessions,0);assert.equal(qualification.originalMembersUnchanged,true);assert.equal(qualification.completeBRC100Conformance,false)
    assert.equal(qualification.original.profile,'ITCVE-1@2.0.0');assert.equal(qualification.original.program,'ISI-4@4.0.0');assert.match(qualification.original.source,/^[a-f0-9]{40}$/);assert.match(qualification.original.sha256,/^[a-f0-9]{64}$/)
    assert.deepEqual(qualification.repetitions.map(row=>row.index),[1,2]);assert.equal(qualification.rustOutcome,'PASS')
    for(const row of qualification.repetitions){assert.equal(row.native.assertions,280);assert.equal(row.assertions.length,77);assert.equal(row.rust.corpus,'tpnil-rust-corpus@3');assert.equal(row.rust.assertions,48);assert.equal(row.rust.outcome,'PASS');assert.deepEqual(row.rust.counts,{PASS:48,FAIL:0,BLOCKED:0});assert.equal(row.rust.inputs.length,4)}
    assert.ok(names.includes(archive));return {kind,directory,source:manifest.source,files:names.length,archive,qualification}
  }
  const qualification = readJson(path.join(directory, 'qualification.json'))
  assert.equal(qualification.source, manifest.source)
  const exactHistory = kind === 'component' && qualification.profile === 'ITCVE-1@3.0.0'
  const candidate = kind === 'native' && ['ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.3.0'].includes(qualification.profile)
  const expanded = candidate && qualification.profile === 'ITCVE-1@4.3.0'
  const observer3 = candidate && qualification.profile === 'ITCVE-1@4.2.0'
  const wallet511 = candidate || kind === 'native' && qualification.profile === 'ITCVE-1@4.0.0'
  const closure = wallet511 || kind === 'native' && qualification.profile === 'ITCVE-1@2.0.0'
  const coverage = closure || kind === 'native' && qualification.profile === 'ITCVE-1@1.5.0'
  const conformance = coverage || (kind === 'native' && qualification.profile === 'ITCVE-1@1.4.0')
  assert.equal(qualification.profile, exactHistory ? 'ITCVE-1@3.0.0' : expanded ? 'ITCVE-1@4.3.0' : observer3 ? 'ITCVE-1@4.2.0' : candidate ? 'ITCVE-1@4.1.0' : wallet511 ? 'ITCVE-1@4.0.0' : closure ? 'ITCVE-1@2.0.0' : coverage ? 'ITCVE-1@1.5.0' : conformance ? 'ITCVE-1@1.4.0' : 'ITCVE-1@1.3.0')
  const archive = kind === 'component' ? 'integrated-lab.zip' : 'native-integrated.zip'
  assert(names.includes(archive))
  if (kind === 'component') { assert.equal(qualification.schema, exactHistory ? 'tpnil-integrated-component-qualification@2' : 'tpnil-integrated-component-qualification@1'); assert.equal(qualification.claim, 'INFRASTRUCTURE_QUALIFICATION_ONLY') }
  else {
    assert.equal(qualification.schema, conformance ? 'tpnil-native-integrated-qualification@2' : 'tpnil-native-integrated-qualification@1')
    assert.equal(qualification.claim, candidate ? 'ENGINEERING_OBSERVATION_ONLY' : 'EXPERIMENTAL_CONFORMANCE_RESULT'); assert.equal(qualification.qualifiedEnvironment, true)
    if (conformance) { assert.equal(qualification.program, expanded ? 'ISI-4@5.3.0' : observer3 ? 'ISI-4@5.2.0' : candidate ? 'ISI-4@5.1.0' : wallet511 ? 'ISI-4@5.0.0' : closure ? 'ISI-4@4.0.0' : coverage ? 'ISI-4@3.0.0' : 'ISI-4@2.0.0'); assert.equal(qualification.completeBRC100Conformance, false) }
  }
  if (qualification.workflowRun !== undefined) assert.equal(qualification.workflowRun, manifest.workflowRun)
  if (qualification.artifact !== undefined) {
    const entry = manifest.files.find(item => item.path === archive)
    assert.equal(qualification.artifact.id, manifest.artifactId); assert.equal(qualification.artifact.size, entry.size); assert.equal(qualification.artifact.sha256, entry.sha256)
  }
  return { kind, directory, source: manifest.source, files: names.length, archive, qualification }
}

function outcomes(assertions) {
  const result = {}
  for (const assertion of assertions) { assert(['PASS', 'FAIL', 'BLOCKED'].includes(assertion.result)); result[assertion.result] = (result[assertion.result] ?? 0) + 1 }
  return result
}
export function componentArchiveSummary(directory) {
  const result = readJson(path.join(directory, 'result.json')), lock = readJson(path.join(directory, 'run-lock.json'))
  const all = [], findings = []; let laneRuns = 0, isolatedExecutions = 0
  const lanes = result.lanes.map(lane => ({ id: lane.id, runs: lane.runs.map((run, index) => {
    safeName(run.result); all.push(...run.assertions); laneRuns++
    isolatedExecutions += ['storage-sync','descendant-storage-sync'].includes(lane.id) ? readJson(path.join(directory, run.result)).runs.length : 1
    findings.push(...run.assertions.filter(item => item.result !== 'PASS').map(item => ({ lane: lane.id, repetition: index + 1, resultPath: run.result, implementation: item.implementation, id: item.id, result: item.result })))
    return { repetition: index + 1, resultPath: run.result, assertions: run.assertions.length, outcomes: outcomes(run.assertions), exitCode: run.exitCode, timedOut: run.timedOut }
  }) }))
  return { source: lock.source, profile: result.profile, laneCount: lanes.length, laneRuns, isolatedExecutions, assertions: { total: all.length, outcomes: outcomes(all) }, lanes, findings }
}
export function requireArchiveVerifierReceipt(stdout, bundle) {
  const expected = bundle.kind === 'native'
    ? { schema: bundle.qualification.schema, source: bundle.source, qualifiedEnvironment: true,
        profile: bundle.qualification.profile, claim: bundle.qualification.claim,
        ...(bundle.qualification.program === undefined ? {} : { program: bundle.qualification.program }) }
    : bundle.kind === 'component'
      ? { verified: true, childOraclesVerified: true, source: bundle.source, profile: bundle.qualification.profile }
      : { verified: true, claim: 'RETAINED_NATIVE_EVIDENCE_REEVALUATION', evaluatorSource: bundle.source }
  return requireVerifierReceipt(stdout, expected)
}
export function verifyArchiveSemantics(bundle, { root = repository } = {}) {
  if (bundle.kind === 'attempt') return { semantic: false, reason: 'Failed observer attempt issues no wallet qualification' }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-published-integration-'))
  let frozenSource
  try {
    const extracted = extractZipSafely(fs.readFileSync(path.join(bundle.directory, bundle.archive)), temporary)
    const lock = readJson(path.join(temporary, 'run-lock.json')); assert.equal(bundle.kind==='reevaluation'?lock.evaluatorSource:lock.source, bundle.source)
    const script = bundle.kind === 'component' ? 'verify-integrated-lab.mjs' : bundle.kind === 'reevaluation' ? 'verify-native-reevaluation.mjs' : 'verify-native-integrated.mjs'
    frozenSource=fs.mkdtempSync(path.join(os.tmpdir(),'tpnil-integration-source-'));fs.rmdirSync(frozenSource)
    const replayRoot=prepareFrozenComponentReplay(root,bundle.source,frozenSource).root
    const child = spawnSync(process.execPath, [path.join(replayRoot, 'scripts', script), temporary], { cwd: replayRoot, env:{...process.env,RUSTUP_TOOLCHAIN:'1.88.0',TPNIL_REPLAY_GIT_ROOT:process.env.TPNIL_REPLAY_GIT_ROOT??root}, encoding: 'utf8', timeout: 600000, maxBuffer: 16 * 1024 * 1024 })
    assert.equal(child.status, 0, `${script} failed: ${child.stderr}\n${child.stdout}`)
    requireArchiveVerifierReceipt(child.stdout, bundle)
    if (bundle.kind === 'component') {
      const summary = componentArchiveSummary(temporary)
      for (const [name, value] of Object.entries(summary)) assert.deepEqual(bundle.qualification[name], value, `Published component ${name} differs from verified evidence`)
      return { semantic: true, extracted, source: summary.source, assertions: summary.assertions, isolatedExecutions: summary.isolatedExecutions }
    }
    if(bundle.kind==='reevaluation') {
      const observed=readJson(path.join(temporary,'reevaluation.json'));assert.deepEqual(bundle.qualification,observed,'Published re-evaluation differs from independently verified evidence')
      return {semantic:true,extracted,source:observed.evaluatorSource,originalNativeSource:observed.original.source,newNativeSessions:0,repetitions:2,nativeOutcome:observed.nativeOutcome,rustAssertions:96}
    }
    const observed = readJson(path.join(temporary, 'integrated-qualification.json'))
    assert.deepEqual(bundle.qualification, observed, 'Published native qualification differs from regenerated qualification')
    return { semantic: true, extracted, source: observed.source, repetitions: observed.repetitions.length, assertions: { total: observed.repetitions.reduce((n, repetition) => n + repetition.assertions.length, 0), outcomes: outcomes(observed.repetitions.flatMap(repetition => repetition.assertions)) } }
  } finally { fs.rmSync(temporary, { recursive: true, force: true });if(frozenSource)fs.rmSync(frozenSource,{recursive:true,force:true}) }
}

export function verifyPublishedIntegrations({ root = repository, semantic = false } = {}) {
  const bundles = []
  for (const category of ['integrated-component-qualification', 'integrated-native-qualification', 'integrated-native-attempts', 'integrated-component-attempts', 'native-integrated-reevaluation']) {
    const directory = path.join(root, 'journals', category)
    if (!fs.existsSync(directory)) continue
    const files = filesUnder(directory), covered = []
    for (const file of files) if (file.endsWith('/provenance.json') || file.endsWith('/attempt.json')) {
      const bundle = verifyIntegrationArchive(path.dirname(path.join(directory, file)))
      assert.equal(bundle.kind, category === 'integrated-component-qualification' ? 'component' : category === 'integrated-native-qualification' ? 'native' : category === 'native-integrated-reevaluation' ? 'reevaluation' : 'attempt')
      bundles.push({ kind: bundle.kind, path: path.relative(root, bundle.directory).split(path.sep).join('/'), source: bundle.source, files: bundle.files, ...(semantic ? verifyArchiveSemantics(bundle, { root }) : {}) })
      covered.push(file.slice(0, file.lastIndexOf('/') + 1))
    }
    for (const file of files) assert.equal(covered.filter(prefix => file.startsWith(prefix)).length, 1, `Unmanifested or overlapping published integration file: ${category}/${file}`)
  }
  return { verifiedPublishedIntegrationArchives: bundles.filter(item => item.kind !== 'attempt').length, verifiedPublishedIntegrationAttempts: bundles.filter(item => item.kind === 'attempt').length, semantic, bundles }
}
if (process.argv[1] === import.meta.filename) {
  assert(process.argv.slice(2).every(argument => argument === '--semantic'), 'Usage: verify-published-integrations.mjs [--semantic]')
  console.log(JSON.stringify(verifyPublishedIntegrations({ semantic: process.argv.includes('--semantic') }), null, 2))
}
