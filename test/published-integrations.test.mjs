import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { crc32 } from 'node:zlib'
import { extractZipSafely, readIntegrationArchive, verifyIntegrationArchive, verifyPublishedIntegrations, verifyArchiveSemantics, componentArchiveSummary, requireArchiveVerifierReceipt } from '../scripts/verify-published-integrations.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
function temporary(run) { const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-published-test-')); try { return run(directory) } finally { fs.rmSync(directory, { recursive: true, force: true }) } }
function zip(entries) {
  const locals = [], central = []; let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name), localName = Buffer.from(entry.localName ?? entry.name), body = Buffer.from(entry.body ?? ''), size = entry.size ?? body.length, checksum = entry.checksum ?? crc32(body)
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt32LE(checksum, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(size, 22); local.writeUInt16LE(localName.length, 26)
    const record = Buffer.alloc(46); record.writeUInt32LE(0x02014b50); record.writeUInt16LE(0x0314, 4); record.writeUInt16LE(20, 6); record.writeUInt32LE(checksum, 16); record.writeUInt32LE(body.length, 20); record.writeUInt32LE(size, 24); record.writeUInt16LE(name.length, 28); record.writeUInt32LE(((entry.mode ?? 0o100644) << 16) >>> 0, 38); record.writeUInt32LE(offset, 42)
    locals.push(local, localName, body); central.push(record, name); offset += local.length + localName.length + body.length
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}
function bundle(directory, archive = zip([{ name: 'result.json', body: '{}' }])) {
  fs.mkdirSync(directory, { recursive: true })
  const source = 'ab'.repeat(20)
  fs.writeFileSync(path.join(directory, 'integrated-lab.zip'), archive)
  fs.writeFileSync(path.join(directory, 'qualification.json'), JSON.stringify({ schema: 'tpnil-integrated-component-qualification@1', claim: 'INFRASTRUCTURE_QUALIFICATION_ONLY', profile: 'ITCVE-1@1.3.0', source }))
  const provenance = { schema: 'tpnil-integrated-component-archive@1', source, files: ['qualification.json', 'integrated-lab.zip'].map(name => { const bytes = fs.readFileSync(path.join(directory, name)); return { path: name, size: bytes.length, sha256: hash(bytes) } }) }
  fs.writeFileSync(path.join(directory, 'provenance.json'), JSON.stringify(provenance)); return provenance
}
function splitNativeBundle(directory) {
  const source = 'ab'.repeat(20), bytes = zip([{ name: 'observed.json', body: '{"retained":true}' }])
  const qualification = { schema: 'tpnil-native-integrated-qualification@2', claim: 'ENGINEERING_OBSERVATION_ONLY', profile: 'ITCVE-1@4.5.0', program: 'ISI-4@5.5.0', source, qualifiedEnvironment: true, completeBRC100Conformance: false }
  fs.writeFileSync(path.join(directory, 'qualification.json'), JSON.stringify(qualification))
  const parts = ['native-integrated.zip.part-000', 'native-integrated.zip.part-001'], cut = Math.floor(bytes.length / 2)
  fs.writeFileSync(path.join(directory, parts[0]), bytes.subarray(0, cut)); fs.writeFileSync(path.join(directory, parts[1]), bytes.subarray(cut))
  const manifest = { schema: 'tpnil-integrated-native-archive@1', source, files: ['qualification.json', ...parts].map(name => { const b = fs.readFileSync(path.join(directory, name)); return { path: name, size: b.length, sha256: hash(b) } }), archiveParts: { path: 'native-integrated.zip', size: bytes.length, sha256: hash(bytes), parts } }
  fs.writeFileSync(path.join(directory, 'provenance.json'), JSON.stringify(manifest))
  return { manifest, bytes, qualification }
}
test('completion archives reassemble the exact original ZIP from digest-bound parts', () => temporary(directory => {
  const { manifest, bytes } = splitNativeBundle(directory)
  assert.equal(verifyIntegrationArchive(directory).kind, 'native')
  assert.deepEqual(readIntegrationArchive(directory, 'native-integrated.zip', manifest), bytes)
  const extracted = path.join(directory, 'extracted'); fs.mkdirSync(extracted)
  assert.deepEqual(extractZipSafely(readIntegrationArchive(directory, 'native-integrated.zip', manifest), extracted), { entries: 1, bytes: 17 })
  assert.equal(fs.readFileSync(path.join(extracted, 'observed.json'), 'utf8'), '{"retained":true}')
}))
test('split archive checks reject changed bytes, reordered parts and ambiguous unsplit copies', () => temporary(directory => {
  const { manifest, bytes } = splitNativeBundle(directory), spec = manifest.archiveParts
  spec.parts.reverse(); assert.throws(() => readIntegrationArchive(directory, 'native-integrated.zip', manifest)); spec.parts.reverse()
  const name = spec.parts[0], file = path.join(directory, name), before = fs.readFileSync(file), changed = Buffer.from(before); changed[0] ^= 1
  fs.writeFileSync(file, changed); manifest.files.find(row => row.path === name).sha256 = hash(changed)
  assert.throws(() => readIntegrationArchive(directory, 'native-integrated.zip', manifest), /Reassembled/)
  fs.writeFileSync(file, before); manifest.files.find(row => row.path === name).sha256 = hash(before)
  fs.writeFileSync(path.join(directory, 'native-integrated.zip'), bytes)
  assert.throws(() => readIntegrationArchive(directory, 'native-integrated.zip', manifest), /Both split/)
}))
test('split archives preserve size bounds and the versioned completion scope', () => temporary(directory => {
  const { manifest, qualification } = splitNativeBundle(directory), size = manifest.archiveParts.size
  manifest.archiveParts.size = 512 * 1024 * 1024 + 1
  assert.throws(() => readIntegrationArchive(directory, 'native-integrated.zip', manifest))
  manifest.archiveParts.size = size
  qualification.profile = 'ITCVE-1@4.4.0'; qualification.program = 'ISI-4@5.4.0'
  fs.writeFileSync(path.join(directory, 'qualification.json'), JSON.stringify(qualification))
  const entry = manifest.files.find(row => row.path === 'qualification.json'), raw = fs.readFileSync(path.join(directory, 'qualification.json')); entry.size = raw.length; entry.sha256 = hash(raw)
  fs.writeFileSync(path.join(directory, 'provenance.json'), JSON.stringify(manifest))
  assert.throws(() => verifyIntegrationArchive(directory))
}))
test('published archive integrity binds every byte and complete file set without external dependencies', () => temporary(directory => {
  bundle(directory); assert.equal(verifyIntegrationArchive(directory).kind, 'component')
  fs.appendFileSync(path.join(directory, 'qualification.json'), ' ')
  assert.throws(() => verifyIntegrationArchive(directory))
}))
for (const [profile, program] of [['ITCVE-1@1.4.0', 'ISI-4@2.0.0'], ['ITCVE-1@1.5.0', 'ISI-4@3.0.0'], ['ITCVE-1@2.0.0', 'ISI-4@4.0.0'], ['ITCVE-1@4.0.0', 'ISI-4@5.0.0']]) test(`${profile} publication binds its program and preserves incomplete conformance`, () => temporary(directory => {
  const source = 'ab'.repeat(20)
  fs.writeFileSync(path.join(directory, 'native-integrated.zip'), zip([{ name: 'result.json', body: '{}' }]))
  const qualification = { schema: 'tpnil-native-integrated-qualification@2', claim: 'EXPERIMENTAL_CONFORMANCE_RESULT', profile, program, source, qualifiedEnvironment: true, completeBRC100Conformance: false }
  const publish = () => {
    fs.writeFileSync(path.join(directory, 'qualification.json'), JSON.stringify(qualification))
    fs.writeFileSync(path.join(directory, 'provenance.json'), JSON.stringify({ schema: 'tpnil-integrated-native-archive@1', source, files: ['qualification.json', 'native-integrated.zip'].map(name => { const bytes = fs.readFileSync(path.join(directory, name)); return { path: name, size: bytes.length, sha256: hash(bytes) } }) }))
  }
  publish(); assert.equal(verifyIntegrationArchive(directory).kind, 'native')
  qualification.completeBRC100Conformance = true; publish(); assert.throws(() => verifyIntegrationArchive(directory))
  qualification.completeBRC100Conformance = false
  qualification.schema = 'tpnil-native-integrated-qualification@1'; publish(); assert.throws(() => verifyIntegrationArchive(directory))
  qualification.schema = 'tpnil-native-integrated-qualification@2'
  qualification.program = 'ISI-4@1.0.0'; publish(); assert.throws(() => verifyIntegrationArchive(directory))
  qualification.program = program === 'ISI-4@3.0.0' ? 'ISI-4@2.0.0' : 'ISI-4@3.0.0'; publish(); assert.throws(() => verifyIntegrationArchive(directory))
  qualification.program = program
  qualification.profile = 'ITCVE-1@1.3.0'; publish(); assert.throws(() => verifyIntegrationArchive(directory))
}))
test('unlisted files and duplicate inventory entries cannot verify', () => temporary(directory => {
  const provenance = bundle(directory)
  fs.writeFileSync(path.join(directory, 'unlisted.txt'), 'extra'); assert.throws(() => verifyIntegrationArchive(directory)); fs.unlinkSync(path.join(directory, 'unlisted.txt'))
  provenance.files.push(provenance.files[0]); fs.writeFileSync(path.join(directory, 'provenance.json'), JSON.stringify(provenance))
  assert.throws(() => verifyIntegrationArchive(directory), /Duplicate/)
}))
test('removing a whole provenance manifest cannot hide a published archive', () => temporary(root => {
  const directory = path.join(root, 'journals/integrated-component-qualification/2026-11-06/1')
  bundle(directory); assert.equal(verifyPublishedIntegrations({ root }).verifiedPublishedIntegrationArchives, 1)
  fs.unlinkSync(path.join(directory, 'provenance.json')); assert.throws(() => verifyPublishedIntegrations({ root }), /Unmanifested/)
}))
test('observer build failures cannot claim native wallet execution', () => temporary(directory => {
  const bytes = Buffer.from('Compiler unavailable\n'); fs.writeFileSync(path.join(directory, 'failure.log'), bytes)
  const attempt = { schema: 'tpnil-integration-attempt@1', source: 'ab'.repeat(20), claim: 'OBSERVER_BUILD_ERROR', walletExecuted: false, files: [{ name: 'failure.log', size: bytes.length, sha256: hash(bytes) }] }
  const filename = path.join(directory, 'attempt.json'); fs.writeFileSync(filename, JSON.stringify(attempt))
  assert.equal(verifyIntegrationArchive(directory).kind, 'attempt')
  attempt.walletExecuted = true; fs.writeFileSync(filename, JSON.stringify(attempt)); assert.throws(() => verifyIntegrationArchive(directory))
}))
test('safe ZIP extraction preserves bytes and rejects CRC damage', () => temporary(directory => {
  assert.deepEqual(extractZipSafely(zip([{ name: 'a/file.json', body: '{"ok":true}' }]), directory), { entries: 1, bytes: 11 })
  assert.equal(fs.readFileSync(path.join(directory, 'a/file.json'), 'utf8'), '{"ok":true}')
  fs.rmSync(path.join(directory, 'a'), { recursive: true }); assert.throws(() => extractZipSafely(zip([{ name: 'a', body: 'data', checksum: 0 }]), directory), /CRC/)
}))
for (const [name, entries] of [
  ['traversal', [{ name: '../escape', body: 'bad' }]],
  ['absolute path', [{ name: '/escape' }]],
  ['symlink', [{ name: 'link', body: '/outside', mode: 0o120777 }]],
  ['local/central name disagreement', [{ name: 'safe', localName: 'evil' }]],
  ['duplicate names', [{ name: 'a' }, { name: 'a' }]],
  ['case-colliding names', [{ name: 'A' }, { name: 'a' }]],
  ['file/directory collision', [{ name: 'a' }, { name: 'a/b' }]],
  ['expansion overflow', [{ name: 'large', size: 256 * 1024 * 1024 + 1 }]]
]) test(`ZIP ${name} is rejected before publication`, () => temporary(directory => { assert.throws(() => extractZipSafely(zip(entries), directory)) }))
test('failed semantic extraction removes its uniquely owned temporary directory', () => temporary(directory => {
  bundle(directory, zip([{ name: '../escape' }]))
  const before = fs.readdirSync(os.tmpdir()).filter(name => name.startsWith('tpnil-published-integration-')).sort()
  assert.throws(() => verifyArchiveSemantics(verifyIntegrationArchive(directory)))
  assert.deepEqual(fs.readdirSync(os.tmpdir()).filter(name => name.startsWith('tpnil-published-integration-')).sort(), before)
}))
test('component counts distinguish outer repetitions and isolated storage runs', () => temporary(directory => {
  fs.mkdirSync(path.join(directory, 'storage')); fs.writeFileSync(path.join(directory, 'storage/result.json'), JSON.stringify({ runs: [{}, {}, {}] }))
  fs.writeFileSync(path.join(directory, 'run-lock.json'), JSON.stringify({ source: 'ab'.repeat(20) }))
  const run = (result, status) => ({ result, assertions: [{ id: 'predicate', implementation: 'go', result: status }], exitCode: 0, timedOut: false })
  fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify({ lanes: [{ id: 'storage-sync', runs: [run('storage/result.json', 'PASS')] }, { id: 'messaging', runs: [run('one/result.json', 'FAIL'), run('two/result.json', 'FAIL')] }] }))
  const actual = componentArchiveSummary(directory)
  assert.equal(actual.laneRuns, 3); assert.equal(actual.isolatedExecutions, 5)
  assert.deepEqual(actual.assertions, { total: 3, outcomes: { PASS: 1, FAIL: 2 } }); assert.deepEqual(actual.findings.map(item => item.repetition), [1, 2])
}))

for (const [profile, schema] of [['ITCVE-1@1.3.0','tpnil-integrated-component-qualification@1'],['ITCVE-1@3.0.0','tpnil-integrated-component-qualification@2']]) test(`${profile} component publication requires its own schema and cannot become native`, () => temporary(directory => {
  const provenance=bundle(directory), filename=path.join(directory,'qualification.json'), qualification=JSON.parse(fs.readFileSync(filename));qualification.profile=profile;qualification.schema=schema
  const publish=()=>{fs.writeFileSync(filename,JSON.stringify(qualification));provenance.files[0]={path:'qualification.json',size:fs.statSync(filename).size,sha256:hash(fs.readFileSync(filename))};fs.writeFileSync(path.join(directory,'provenance.json'),JSON.stringify(provenance))}
  publish();assert.equal(verifyIntegrationArchive(directory).kind,'component')
  qualification.schema=schema.endsWith('@2')?'tpnil-integrated-component-qualification@1':'tpnil-integrated-component-qualification@2';publish();assert.throws(()=>verifyIntegrationArchive(directory))
  qualification.schema=schema;qualification.profile='ITCVE-1@2.0.0';publish();assert.throws(()=>verifyIntegrationArchive(directory))
}))

test('component3 cannot be published as a native qualification',()=>temporary(directory=>{
  const provenance=bundle(directory);fs.renameSync(path.join(directory,'integrated-lab.zip'),path.join(directory,'native-integrated.zip'))
  const q={schema:'tpnil-native-integrated-qualification@2',claim:'EXPERIMENTAL_CONFORMANCE_RESULT',profile:'ITCVE-1@3.0.0',program:'ISI-4@4.0.0',source:provenance.source,qualifiedEnvironment:true,completeBRC100Conformance:false}
  fs.writeFileSync(path.join(directory,'qualification.json'),JSON.stringify(q));provenance.schema='tpnil-integrated-native-archive@1';provenance.files=['qualification.json','native-integrated.zip'].map(name=>{const b=fs.readFileSync(path.join(directory,name));return {path:name,size:b.length,sha256:hash(b)}});fs.writeFileSync(path.join(directory,'provenance.json'),JSON.stringify(provenance));assert.throws(()=>verifyIntegrationArchive(directory))
}))

function publishCandidate(directory, change = {}) {
  const qualification = { schema: 'tpnil-native-integrated-qualification@2', claim: 'ENGINEERING_OBSERVATION_ONLY', profile: 'ITCVE-1@4.1.0', program: 'ISI-4@5.1.0', source: 'ab'.repeat(20), qualifiedEnvironment: true, completeBRC100Conformance: false, ...change }
  fs.writeFileSync(path.join(directory, 'qualification.json'), JSON.stringify(qualification))
  fs.writeFileSync(path.join(directory, 'native-integrated.zip'), zip([{ name: 'result.json', body: '{}' }]))
  const files = ['qualification.json', 'native-integrated.zip'].map(name => { const bytes = fs.readFileSync(path.join(directory, name)); return { path: name, size: bytes.length, sha256: hash(bytes) } })
  fs.writeFileSync(path.join(directory, 'provenance.json'), JSON.stringify({ schema: 'tpnil-integrated-native-archive@1', source: qualification.source, files }))
  return qualification
}

test('candidate publication admits only its engineering claim, exact program and incomplete conformance', () => temporary(directory => {
  publishCandidate(directory)
  assert.equal(verifyIntegrationArchive(directory).qualification.profile, 'ITCVE-1@4.1.0')
  for (const change of [
    { claim: 'EXPERIMENTAL_CONFORMANCE_RESULT' }, { claim: 'INFRASTRUCTURE_QUALIFICATION_ONLY' },
    { program: 'ISI-4@5.0.0' }, { program: 'ISI-4@4.0.0' }, { program: undefined },
    { profile: 'ITCVE-1@4.0.0' }, { profile: 'ITCVE-1@2.0.0' },
    { schema: 'tpnil-native-integrated-qualification@1' }, { completeBRC100Conformance: true }
  ]) {
    publishCandidate(directory, change)
    assert.throws(() => verifyIntegrationArchive(directory), JSON.stringify(change))
  }
  publishCandidate(directory, { profile: 'ITCVE-1@4.0.0', program: 'ISI-4@5.0.0' })
  assert.throws(() => verifyIntegrationArchive(directory), 'Official release profile cannot inherit a candidate engineering claim')
}))

test('native child receipt binds profile, program and claim and rejects jointly relabeled candidate metadata', () => temporary(directory => {
  const candidate = publishCandidate(directory), bundle = verifyIntegrationArchive(directory)
  const stdout = value => 'independent verifier diagnostic\n' + JSON.stringify(value) + '\n'
  assert.deepEqual(requireArchiveVerifierReceipt(stdout(candidate), bundle), candidate)
  for (const field of ['profile', 'program', 'claim']) {
    const missing = { ...candidate }; delete missing[field]
    assert.throws(() => requireArchiveVerifierReceipt(stdout(missing), bundle), new RegExp(field))
  }
  for (const change of [
    { profile: 'ITCVE-1@4.0.0' }, { program: 'ISI-4@5.0.0' }, { claim: 'EXPERIMENTAL_CONFORMANCE_RESULT' }
  ]) assert.throws(() => requireArchiveVerifierReceipt(stdout({ ...candidate, ...change }), bundle))
  // Recomputing all manifest digests cannot turn the frozen candidate receipt
  // into a release receipt, even when the relabeled outer tuple is well formed.
  const official = publishCandidate(directory, { profile: 'ITCVE-1@4.0.0', program: 'ISI-4@5.0.0', claim: 'EXPERIMENTAL_CONFORMANCE_RESULT' })
  const releaseBundle = verifyIntegrationArchive(directory)
  assert.throws(() => requireArchiveVerifierReceipt(stdout(candidate), releaseBundle), /profile/)
  assert.throws(() => requireArchiveVerifierReceipt(stdout(official), bundle), /profile/)
  assert.deepEqual(requireArchiveVerifierReceipt(stdout(official), releaseBundle), official)
  assert.throws(() => requireArchiveVerifierReceipt('', bundle), /complete JSON receipt/)
  assert.throws(() => requireArchiveVerifierReceipt('{"nested":\n  ' + JSON.stringify(candidate), bundle), /complete JSON receipt/)
}))

test('historical native receipts preserve their original profile, claim and optional program', () => {
  const directory = new URL('../journals/integrated-native-qualification/', import.meta.url)
  const qualifications = fs.readdirSync(directory, { recursive: true }).filter(name => name.endsWith('/qualification.json'))
  assert.ok(qualifications.length > 0)
  for (const name of qualifications) {
    const qualification = JSON.parse(fs.readFileSync(new URL(name, directory)))
    const bundle = { kind: 'native', source: qualification.source, qualification }
    assert.deepEqual(requireArchiveVerifierReceipt(JSON.stringify(qualification), bundle), qualification)
  }
})

test('observer3 publication requires its new profile/program pair and engineering limits', () => temporary(directory => {
  const profile = { profile: 'ITCVE-1@4.2.0', program: 'ISI-4@5.2.0' }
  publishCandidate(directory, profile)
  assert.equal(verifyIntegrationArchive(directory).qualification.profile, profile.profile)
  for (const change of [{ program: 'ISI-4@5.1.0' }, { claim: 'EXPERIMENTAL_CONFORMANCE_RESULT' }, { completeBRC100Conformance: true }]) {
    publishCandidate(directory, { ...profile, ...change })
    assert.throws(() => verifyIntegrationArchive(directory))
  }
}))


test('expanded publication requires its4.3/5.3 pair and engineering limits', () => temporary(directory => {
  const profile = { profile: 'ITCVE-1@4.3.0', program: 'ISI-4@5.3.0' }
  const qualification = publishCandidate(directory, profile), bundle = verifyIntegrationArchive(directory)
  assert.equal(bundle.qualification.profile, profile.profile)
  assert.deepEqual(requireArchiveVerifierReceipt(JSON.stringify(qualification), bundle), qualification)
  for (const change of [{ program: 'ISI-4@5.2.0' }, { program: 'ISI-4@5.1.0' }, { claim: 'EXPERIMENTAL_CONFORMANCE_RESULT' }, { completeBRC100Conformance: true }]) {
    publishCandidate(directory, { ...profile, ...change })
    assert.throws(() => verifyIntegrationArchive(directory))
  }
  for (const change of [{ profile: 'ITCVE-1@4.2.0' }, { program: 'ISI-4@5.2.0' }, { claim: 'EXPERIMENTAL_CONFORMANCE_RESULT' }]) assert.throws(() => requireArchiveVerifierReceipt(JSON.stringify({ ...qualification, ...change }), bundle))
}))
