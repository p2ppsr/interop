// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { requireVerifierReceipt } from './frozen-component-replay.mjs'

const repositoryRoot = path.resolve(import.meta.dirname, '..')
export const noSendOracle4FrozenSource = 'c338a93c97ffebeeef318e679ff82b7dbf309dd5'
export const noSendOracle4Journal = 'journals/native-nosend-change/2026-11-09/oracle4-preflight'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const names = ['typescript-reference.json.gz', 'go-reference.json.gz', 'native-macos-engineering.json.gz']
function files(directory) {
  assert.ok(fs.lstatSync(directory).isDirectory() && !fs.lstatSync(directory).isSymbolicLink())
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    assert.ok(!entry.isSymbolicLink(), 'Historical journal cannot contain links')
    if (entry.isDirectory()) return files(path.join(directory, entry.name)).map(name => `${entry.name}/${name}`)
    assert.ok(entry.isFile()); return entry.name
  }).sort()
}
export function requireNoSendOracle4Receipt(stdout) {
  const receipt = requireVerifierReceipt(stdout, { verified: true, claim: 'ENGINEERING_OBSERVATION_ONLY', nativeLinuxQualification: false })
  assert.deepEqual(receipt.results?.map(row => row.name), names)
  for (const [index, row] of receipt.results.entries()) {
    assert.match(row.txid, /^[a-f0-9]{64}$/)
    assert.deepEqual(row.assertions, [
      { id: 'input.createAction.options.noSendChange.0', result: 'PASS' },
      { id: 'output.createAction.noSendChange-final-outpoints', result: index === 2 ? 'FAIL' : 'PASS' }
    ])
  }
  return receipt
}
/** Verify npm's installed lock and on-disk package versions before reuse.
 * Platform-inapplicable optional packages may be absent; required packages may not. */
export function verifyNoSendOracle4Dependencies(root, frozenSynthesis) {
  for (const name of ['package.json', 'package-lock.json']) assert.equal(hash(fs.readFileSync(path.join(root, 'synthesis', name))), hash(fs.readFileSync(path.join(frozenSynthesis, name))), `Install exact frozen synthesis dependencies: ${name}`)
  const modules = fs.realpathSync(path.join(root, 'synthesis/node_modules')); assert.ok(fs.statSync(modules).isDirectory())
  const expected = JSON.parse(fs.readFileSync(path.join(frozenSynthesis, 'package-lock.json')))
  const bytes = fs.readFileSync(path.join(modules, '.package-lock.json')), installed = JSON.parse(bytes)
  assert.equal(expected.lockfileVersion, 3); assert.equal(installed.lockfileVersion, 3)
  assert.ok(installed.packages && Object.keys(installed.packages).length > 0)
  for (const [name, actual] of Object.entries(installed.packages)) {
    assert.ok(name.startsWith('node_modules/') && !name.split('/').some(part => !part || part === '.' || part === '..'))
    const locked = expected.packages[name]; assert.ok(locked && !locked.link, `Unpinned installed dependency: ${name}`)
    for (const field of ['version', 'resolved', 'integrity', 'dependencies', 'optionalDependencies', 'peerDependencies', 'peerDependenciesMeta']) assert.deepEqual(actual[field], locked[field], `Installed dependency metadata differs: ${name} ${field}`)
    const directory = path.join(modules, name.slice('node_modules/'.length)); assert.ok(fs.lstatSync(directory).isDirectory() && !fs.lstatSync(directory).isSymbolicLink())
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'package.json'))).version, locked.version, `Installed dependency version differs: ${name}`)
  }
  for (const [name, locked] of Object.entries(expected.packages)) if (name && !locked.optional) assert.ok(installed.packages[name], `Required installed dependency is missing: ${name}`)
  return { modules, installedLockSha256: hash(bytes), installedPackages: Object.keys(installed.packages).length }
}
/** Historical evidence and its checker stay immutable. New selectors execute
 * separately; they cannot invalidate or reinterpret the recorded oracle4 run. */
export function verifyNativeNoSendOracle4Archive({ root = repositoryRoot, repository = process.env.TPNIL_REPLAY_GIT_ROOT ?? root, directory = path.join(root, noSendOracle4Journal) } = {}) {
  const paths = ['.nvmrc', 'synthesis', 'programs', 'fixtures', noSendOracle4Journal]
  const tree = execFileSync('git', ['ls-tree', '-r', '-z', noSendOracle4FrozenSource, '--', ...paths], { cwd: repository, maxBuffer: 32 * 1024 * 1024 }).toString().split('\0').filter(Boolean)
  assert.ok(tree.length > 0, 'Frozen oracle4 source is unavailable')
  for (const row of tree) {
    assert.match(row, /^100(?:644|755) blob [a-f0-9]{40}\t/, 'Frozen replay rejects symlinks and non-file objects')
    const name = row.slice(row.indexOf('\t') + 1)
    assert.ok(!path.isAbsolute(name) && name.split('/').every(part => part && part !== '.' && part !== '..'))
  }
  const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-nosend-oracle4-')))
  try {
    const archive = execFileSync('git', ['archive', '--format=tar', noSendOracle4FrozenSource, '--', ...paths], { cwd: repository, maxBuffer: 128 * 1024 * 1024 })
    const unpack = spawnSync('tar', ['-xf', '-', '-C', temporary], { input: archive }); assert.equal(unpack.status, 0, String(unpack.stderr))
    const frozenJournal = path.join(temporary, noSendOracle4Journal)
    const inventory = files(frozenJournal); assert.deepEqual(files(directory), inventory, 'Historical journal inventory changed')
    for (const name of inventory) assert.equal(hash(fs.readFileSync(path.join(directory, name))), hash(fs.readFileSync(path.join(frozenJournal, name))), `Historical journal changed: ${name}`)
    assert.equal(process.versions.node, fs.readFileSync(path.join(temporary, '.nvmrc'), 'utf8').trim().replace(/^v/, ''), 'Use the recorded Node runtime for oracle4 replay')
    const dependencies = verifyNoSendOracle4Dependencies(root, path.join(temporary, 'synthesis'))
    fs.symlinkSync(dependencies.modules, path.join(temporary, 'synthesis/node_modules'), 'dir')
    const child = spawnSync(process.execPath, [path.join(frozenJournal, 'replay.mjs')], { cwd: temporary, encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024 })
    assert.equal(child.status, 0, `${child.error ?? ''}\n${child.stderr}\n${child.stdout}`)
    const receipt = requireNoSendOracle4Receipt(child.stdout)
    return { ...receipt, frozenCheckerSource: noSendOracle4FrozenSource, journalMembers: inventory.length, dependencies: { installedLockSha256: dependencies.installedLockSha256, installedPackages: dependencies.installedPackages }, semantic: true }
  } finally { fs.rmSync(temporary, { recursive: true, force: true }) }
}
if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === import.meta.filename) {
  assert.equal(process.argv.length, 2, 'This historical replay uses its fixed journal and source')
  console.log(JSON.stringify(verifyNativeNoSendOracle4Archive(), null, 2))
}
