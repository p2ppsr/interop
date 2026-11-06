import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { corpusSources, evaluateRustCorpus } from './rust-corpus.mjs'
const root = path.resolve(import.meta.dirname, '..')
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
export function verifyRust(directory, expectedInputs, { offline = true } = {}) {
  const read = name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'))
  const report = read('result.json'), calls = read('calls.json')
  assert.equal(report.schema, 'tpnil-component-result@1'); assert.equal(report.corpus, 'tpnil-rust-corpus@2')
  assert.equal(report.claim, 'INFRASTRUCTURE_QUALIFICATION_ONLY')
  assert.equal(report.components.rustSdk.repository, 'bsv-blockchain/rs-sdk')
  assert.equal(report.components.rustSdk.commit, '99d2313f2ede48a465aa8be1907d26d098aac8fd')
  assert.equal(report.components.typescriptSdk, '4.0.1')
  assert.deepEqual(Object.keys(report.sources).sort(), [...corpusSources].sort())
  for (const file of corpusSources) assert.equal(report.sources[file], digest(fs.readFileSync(path.join(root, file))), `Frozen Rust corpus input differs: ${file}`)
  assert.equal(report.components.cargoLockSha256, report.sources['components/rust/Cargo.lock'])
  assert.match(report.components.binarySha256, /^[a-f0-9]{64}$/)
  assert.equal(report.inputs.length, expectedInputs.length, 'Caller must supply every original joined input in order')
  const inputReports = []
  for (const [index, entry] of report.inputs.entries()) {
    assert.equal(entry.path, `input-${index + 1}.json`)
    const original = fs.readFileSync(expectedInputs[index]), retained = fs.readFileSync(path.join(directory, entry.path))
    assert.equal(entry.sha256, digest(original), `Parent input ${index + 1} differs`)
    assert.equal(digest(retained), entry.sha256); assert.equal(entry.sourceName, path.basename(expectedInputs[index]))
    inputReports.push(JSON.parse(retained))
  }
  const expectedEvidence = ['calls.json', 'build.txt', ...report.inputs.map(item => item.path)]
  assert.deepEqual(report.evidence.map(item => item.path).sort(), [...expectedEvidence].sort())
  for (const item of report.evidence) assert.equal(digest(fs.readFileSync(path.join(directory, item.path))), item.sha256)
  assert.deepEqual(report.cleanup, { childProcessesExited: true })
  const build = spawnSync('cargo', ['build', ...(offline ? ['--offline'] : []), '--locked', '--manifest-path', path.join(root, 'components/rust/Cargo.toml')], { encoding: 'utf8', timeout: 300_000 })
  assert.equal(build.status, 0, build.stderr)
  const binary = path.join(root, 'components/rust/target/debug/tpnil-rust-participant')
  const replay = spawnSync(binary, [], { input: JSON.stringify(calls.map(item => item.request)), encoding: 'utf8', timeout: 60_000, maxBuffer: 16*1024*1024 })
  assert.equal(replay.status, 0, replay.stderr)
  const responses = JSON.parse(replay.stdout)
  assert.deepEqual(responses, calls.map(item => item.response), 'Rust observations do not replay')
  let cursor = 0
  const mismatches = []
  const evaluated = evaluateRustCorpus(request => {
    const index = cursor++
    try { assert.deepEqual(request, calls[index]?.request) }
    catch { mismatches.push(index) }
    return responses[index]
  }, inputReports)
  assert.deepEqual(mismatches, [], 'Expected Rust requests differ from retained calls')
  assert.equal(cursor, calls.length, 'Unexpected or omitted Rust calls')
  assert.deepEqual(report.assertions, evaluated.assertions, 'Rust assertion verdicts or evidence were altered')
  assert.equal(report.outcome, evaluated.outcome, 'Rust aggregate outcome was altered')
  return { verified: true, outcome: evaluated.outcome, calls: calls.length, assertions: evaluated.assertions.length, independentReplay: true, parentInputsBound: expectedInputs.length }
}
if (process.argv[1] === import.meta.filename) console.log(JSON.stringify(verifyRust(path.resolve(process.argv[2]), process.argv.slice(3).map(file => path.resolve(file)))))
