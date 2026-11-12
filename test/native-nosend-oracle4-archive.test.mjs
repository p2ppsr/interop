import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { verifyNativeNoSendOracle4Archive, verifyNoSendOracle4Dependencies, requireNoSendOracle4Receipt, noSendOracle4FrozenSource, noSendOracle4Journal } from '../scripts/verify-native-nosend-oracle4-archive.mjs'

const root = path.resolve(import.meta.dirname, '..')
function temporary(operation) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-oracle4-test-')))
  try { return operation(directory) } finally { fs.rmSync(directory, { recursive: true, force: true }) }
}
let replay = { verified: true, claim: 'ENGINEERING_OBSERVATION_ONLY', nativeLinuxQualification: false, results: ['typescript-reference.json.gz', 'go-reference.json.gz', 'native-macos-engineering.json.gz'].map((name, index) => ({ name, txid: '11'.repeat(32), assertions: [{ id: 'input.createAction.options.noSendChange.0', result: 'PASS' }, { id: 'output.createAction.noSendChange-final-outpoints', result: index === 2 ? 'FAIL' : 'PASS' }] })) }

test('replays all three retained reports with their original checker despite incompatible current selector files', { skip: !fs.existsSync(path.join(root, 'synthesis/node_modules/.package-lock.json')) }, () => temporary(directory => {
  const synthesis = path.join(directory, 'synthesis'); fs.mkdirSync(synthesis)
  for (const name of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(root, 'synthesis', name), path.join(synthesis, name))
  fs.symlinkSync(fs.realpathSync(path.join(root, 'synthesis/node_modules')), path.join(synthesis, 'node_modules'), 'dir')
  const current = path.join(synthesis, 'src/wallet-lab/native'); fs.mkdirSync(current, { recursive: true })
  for (const name of ['conformance-clauses.ts', 'verify-conformance-clauses.ts']) fs.writeFileSync(path.join(current, name), 'throw new Error("Current selectors must not execute during historical replay")')
  replay = verifyNativeNoSendOracle4Archive({ root: directory, repository: root, directory: path.join(root, noSendOracle4Journal) })
  assert.equal(replay.frozenCheckerSource, noSendOracle4FrozenSource); assert.equal(replay.verified, true); assert.equal(replay.semantic, true)
  assert.equal(replay.nativeLinuxQualification, false); assert.equal(replay.results.length, 3)
  assert.deepEqual(replay.results.map(row => row.assertions.map(item => item.result)), [['PASS', 'PASS'], ['PASS', 'PASS'], ['PASS', 'FAIL']])
  assert.ok(replay.dependencies.installedPackages > 0)
}))

test('rejects changed historical journal bytes instead of replaying a substituted report', () => temporary(directory => {
  fs.cpSync(path.join(root, noSendOracle4Journal), path.join(directory, 'journal'), { recursive: true })
  fs.appendFileSync(path.join(directory, 'journal/preflight-review.json'), '\n')
  assert.throws(() => verifyNativeNoSendOracle4Archive({ directory: path.join(directory, 'journal') }), /Historical journal changed/)
}))

test('requires a complete semantic receipt and preserves the genuine native FAIL', () => {
  assert.ok(replay)
  for (const change of [
    row => { row.verified = false },
    row => { row.results.pop() },
    row => { row.results[2].assertions[1].result = 'PASS' },
    row => { row.nativeLinuxQualification = true }
  ]) {
    const modified = structuredClone(replay); change(modified)
    assert.throws(() => requireNoSendOracle4Receipt(JSON.stringify(modified)))
  }
  for (const stdout of ['', 'process exited successfully', '{"verified":true,"results":[']) assert.throws(() => requireNoSendOracle4Receipt(stdout))
})

test('rejects stale installed lock metadata, missing required packages and wrong on-disk package versions', () => temporary(directory => {
  const synthesis = path.join(directory, 'synthesis'), modules = path.join(synthesis, 'node_modules'), packageDirectory = path.join(modules, 'fixture')
  fs.mkdirSync(packageDirectory, { recursive: true })
  fs.mkdirSync(path.join(modules, 'optional'))
  fs.writeFileSync(path.join(modules, 'optional/package.json'), JSON.stringify({ name: 'optional', version: '1.0.0' }))
  const entry = { version: '1.0.0', resolved: 'https://registry.npmjs.org/fixture/-/fixture-1.0.0.tgz', integrity: 'sha512-fixed', dependencies: {} }
  fs.writeFileSync(path.join(synthesis, 'package.json'), '{}')
  fs.writeFileSync(path.join(synthesis, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: { '': {}, 'node_modules/fixture': entry, 'node_modules/optional': { ...entry, optional: true } } }))
  const reset = () => {
    fs.writeFileSync(path.join(modules, '.package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: { 'node_modules/fixture': entry } }))
    fs.writeFileSync(path.join(packageDirectory, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0' }))
  }
  reset(); assert.equal(verifyNoSendOracle4Dependencies(directory, synthesis).installedPackages, 1)
  for (const change of [
    lock => { lock.packages['node_modules/fixture'].integrity = 'sha512-other' },
    lock => { lock.packages['node_modules/unpinned'] = entry },
    lock => { delete lock.packages['node_modules/fixture']; lock.packages['node_modules/optional'] = { ...entry, optional: true } }
  ]) {
    reset(); const file = path.join(modules, '.package-lock.json'), lock = JSON.parse(fs.readFileSync(file)); change(lock); fs.writeFileSync(file, JSON.stringify(lock))
    assert.throws(() => verifyNoSendOracle4Dependencies(directory, synthesis))
  }
  reset(); fs.writeFileSync(path.join(packageDirectory, 'package.json'), JSON.stringify({ name: 'fixture', version: '2.0.0' }))
  assert.throws(() => verifyNoSendOracle4Dependencies(directory, synthesis), /Installed dependency version differs/)
}))
