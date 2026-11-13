import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { test } from 'node:test'
import { gunzipSync } from 'node:zlib'
import { execFileSync } from 'node:child_process'
import { portabilityArchiveSource, preparePortabilityReplay, verifyNativePortabilitySourceBindings } from '../scripts/verify-native-portability-archive.mjs'

const root = path.resolve(import.meta.dirname, '..')
const archivePath = path.join(root, 'journals/native-portability-reference/2026-11-09/signed-completion-v3/evidence.json.gz')
const files = new Map(JSON.parse(gunzipSync(fs.readFileSync(archivePath)).toString()).files.map(row => [row.path, row]))
const producer = 'synthesis/src/wallet-lab/native/conformance-portability.ts'
const semantics = ['synthesis/src/wallet-lab/native/verify-conformance-portability.ts', 'synthesis/src/wallet-lab/native/portability-proof.ts', 'programs/ISI-4/profiles/native-conformance-3.0.0/portability-oracle-3.0.0.json']
const digest = bytes => createHash('sha256').update(bytes).digest('hex')

test('portability archive pins the original Git producer while replaying the exact retained semantics', () => {
  const original = execFileSync('git', ['show', `${portabilityArchiveSource}:${producer}`], { cwd: root })
  assert.equal(original.toString(), files.get(producer).content)
  const result = verifyNativePortabilitySourceBindings(files)
  assert.equal(result.historicalSource, portabilityArchiveSource)
  assert.equal(result.sourceBindings, 4)
  assert.equal(result.currentSemanticBindings, 0)
  assert.equal(result.retainedSemanticBindings, 3)
  assert.equal(result.frozenSemanticBindings, 0)
})

test('source bindings use retained semantics even when the current verifier has evolved', () => {
  const current = fs.readFileSync(path.join(root, semantics[0]))
  assert.notEqual(digest(current), files.get(semantics[0]).sha256, 'This counterfactual requires an actual independently evolved verifier')
  const result = verifyNativePortabilitySourceBindings(files)
  assert.equal(result.currentSemanticBindings, 0)
  assert.equal(result.retainedSemanticBindings, 3)
})

test('rewriting producer bytes and all corresponding metadata cannot replace the historical Git identity', () => {
  const changed = new Map(files), row = structuredClone(files.get(producer))
  row.content = row.content.replace('import', 'Import') // same size, different blob
  row.size = Buffer.byteLength(row.content); row.sha256 = digest(row.content)
  changed.set(producer, row)
  assert.throws(() => verifyNativePortabilitySourceBindings(changed), /Historical source bytes differ/)
})

test('retained producer omission is rejected independently of a rewritten inventory', () => {
  const changed = new Map(files); changed.delete(producer)
  assert.throws(() => verifyNativePortabilitySourceBindings(changed), /Missing retained source/)
})

for (const name of semantics) {
  test(`changed extracted semantic source remains rejected: ${name}`, () => {
    assert.throws(() => verifyNativePortabilitySourceBindings(files, item => item === name ? Buffer.from('changed') : Buffer.from(files.get(item).content)), /Frozen replay source differs/)
  })
  test(`rewritten retained semantic source remains rejected: ${name}`, () => {
    const changed = new Map(files), row = structuredClone(files.get(name))
    row.content += '\n'; row.size = Buffer.byteLength(row.content); row.sha256 = digest(row.content); changed.set(name, row)
    assert.throws(() => verifyNativePortabilitySourceBindings(changed), /Historical source size differs/)
  })
}

// This materialization control needs no installed packages; the empty module
// directory contains package metadata only and is never executed. The required CI CLI performs semantic replay
// after npm ci installs the exact synthesis lock.
function materializationFixture(operation) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-portability-source-test-'))
  try {
    const dependencyRoot = path.join(temporary, 'current')
    fs.mkdirSync(path.join(dependencyRoot, 'synthesis/node_modules'), { recursive: true })
    for (const name of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(root, 'synthesis', name), path.join(dependencyRoot, 'synthesis', name))
    const locked = JSON.parse(fs.readFileSync(path.join(dependencyRoot, 'synthesis/package-lock.json')))
    const packages = Object.fromEntries(Object.entries(locked.packages).filter(([name]) => name))
    fs.writeFileSync(path.join(dependencyRoot, 'synthesis/node_modules/.package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages }))
    for (const [name, entry] of Object.entries(packages)) { const destination = path.join(dependencyRoot, 'synthesis', name); fs.mkdirSync(destination, { recursive: true }); fs.writeFileSync(path.join(destination, 'package.json'), JSON.stringify({ version: entry.version })); }
    for (const name of [producer, ...semantics]) { fs.mkdirSync(path.dirname(path.join(dependencyRoot, name)), { recursive: true }); fs.writeFileSync(path.join(dependencyRoot, name), 'throw new Error("current source must never execute in historical replay")') }
    operation({ temporary, dependencyRoot })
  } finally { fs.rmSync(temporary, { recursive: true, force: true }) }
}

test('frozen replay materializes the historical producer and transitive modules with synthesis-only dependencies', () => materializationFixture(({ temporary, dependencyRoot }) => {
  const prepared = preparePortabilityReplay(path.join(temporary, 'replay'), { dependencyRoot })
  assert.equal(prepared.source, portabilityArchiveSource)
  assert.equal(prepared.files, 1520)
  const bindings = verifyNativePortabilitySourceBindings(files, name => fs.readFileSync(path.join(prepared.directory, name)))
  assert.equal(bindings.currentSemanticBindings, 0); assert.equal(bindings.frozenSemanticBindings, 3)
  for (const name of [producer, ...semantics, 'synthesis/src/storage-sync/projection.ts', 'synthesis/src/storage-sync/compatibility.ts', 'synthesis/src/determinism.ts', 'synthesis/src/wallet-lab/services.ts', 'fixtures/teranode/wab-funding-v1.json']) {
    assert.deepEqual(fs.readFileSync(path.join(prepared.directory, name)), execFileSync('git', ['show', `${portabilityArchiveSource}:${name}`], { cwd: root }))
    assert.equal(fs.lstatSync(path.join(prepared.directory, name)).isSymbolicLink(), false)
  }
  assert.equal(fs.existsSync(path.join(dependencyRoot, 'components/transport/node_modules')), false)
  assert.equal(fs.existsSync(path.join(dependencyRoot, 'integrations/services/node_modules')), false)
  fs.appendFileSync(path.join(prepared.directory, semantics[0]), '\n')
  assert.throws(() => verifyNativePortabilitySourceBindings(files, name => fs.readFileSync(path.join(prepared.directory, name))), /Frozen replay source differs/)
}))

test('frozen replay rejects a changed synthesis lock before any semantic module executes', () => materializationFixture(({ temporary, dependencyRoot }) => {
  fs.appendFileSync(path.join(dependencyRoot, 'synthesis/package-lock.json'), '\n')
  assert.throws(() => preparePortabilityReplay(path.join(temporary, 'replay'), { dependencyRoot }), /Install exact frozen synthesis dependencies/)
}))

for (const variant of ['hidden-lock-integrity', 'package-version', 'missing-required']) test(`frozen replay rejects installed dependency mismatch: ${variant}`, () => materializationFixture(({ temporary, dependencyRoot }) => {
  const file = path.join(dependencyRoot, 'synthesis/node_modules/.package-lock.json'), lock = JSON.parse(fs.readFileSync(file))
  const name = Object.keys(lock.packages).find(name => !lock.packages[name].optional)
  if (variant === 'hidden-lock-integrity') lock.packages[name].integrity = 'sha512-substituted'
  if (variant === 'missing-required') delete lock.packages[name]
  if (variant === 'package-version') fs.writeFileSync(path.join(dependencyRoot, 'synthesis', name, 'package.json'), '{"version":"0.0.0-substituted"}')
  fs.writeFileSync(file, JSON.stringify(lock))
  assert.throws(() => preparePortabilityReplay(path.join(temporary, 'replay'), { dependencyRoot }), /Installed dependency|Required installed dependency/)
}))
