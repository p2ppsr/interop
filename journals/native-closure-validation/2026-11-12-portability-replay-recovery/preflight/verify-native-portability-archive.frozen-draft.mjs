#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
// The final producer bytes were first retained at this commit. They are
// historical evidence, not a requirement that future producers stop evolving.
// The semantic verifier, proof helper and oracle must still match exactly.
export const portabilityArchiveSource = 'd059d4e2794a83600610c0bccb82d86b69fe6c7d';
const sourceBindings = [
  ['synthesis/src/wallet-lab/native/conformance-portability.ts', 25152, '137f7e786080f2088f0516317dccac08a4201bdc7b3a2a0039d23bc0ad7e33ea', '89bf8709273210457d7d6c93cc5b1a62c8873fc4', 'producer'],
  ['synthesis/src/wallet-lab/native/verify-conformance-portability.ts', 23810, 'ae0fd49a3c5ace7b84c0f43e04db061ca8b32962db0dd5cde581c85aba8f0ad2', 'e98390593d27a7250fef9628521fd1110c1d0eec', 'verifier'],
  ['synthesis/src/wallet-lab/native/portability-proof.ts', 3031, 'ced0e10136e91fc10f0caff87842b6cc9eebc5ad9123557da768754489d60fb8', '0a973a45673a45888c96b260c8e4392eaa326c71', 'proof'],
  ['programs/ISI-4/profiles/native-conformance-3.0.0/portability-oracle-3.0.0.json', 2490, '266c34829ec30f343bfe6d4899f139d27f0eb30b6fdbe84919b6850a1a47893f', '7ec97bc1c1f84955363779bec942b510f9e625d7', 'oracle']
];
export function verifyNativePortabilitySourceBindings(files, readCurrent = name => fs.readFileSync(path.join(root, name))) {
  for (const [name, size, sha256, gitBlob, role] of sourceBindings) {
    const retained = files.get(name);
    assert.ok(retained, `Missing retained source: ${name}`);
    const bytes = Buffer.from(retained.content);
    assert.equal(bytes.length, size, `Historical source size differs: ${name}`);
    assert.equal(digest(bytes), sha256, `Historical source bytes differ: ${name}`);
    assert.equal(retained.sha256, sha256, `Historical source metadata differs: ${name}`);
    assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), gitBlob, `Historical Git blob differs: ${name}`);
    if (role !== 'producer') assert.equal(digest(readCurrent(name)), sha256, `Semantic replay source differs from retained preflight: ${name}`);
  }
  return { historicalSource: portabilityArchiveSource, sourceBindings: sourceBindings.length, currentSemanticBindings: 3 };
}
/** The historical verifier imports values from the producer. Replay their
 * complete Git source together; using the current producer would change the
 * transitive oracle. Only synthesis dependencies are needed by this archive. */
export function preparePortabilityReplay(directory, { repository = root, dependencyRoot = root } = {}) {
  assert.ok(!fs.existsSync(directory), 'Frozen replay requires a new owned directory');
  const tree = execFileSync('git', ['ls-tree', '-r', '-l', '-z', portabilityArchiveSource], { cwd: repository, maxBuffer: 8 * 1024 * 1024, timeout: 30000 }).toString().split('\0').filter(Boolean);
  assert.ok(tree.length > 0 && tree.length <= 10000);
  const members = new Map(); let contentBytes = 0;
  for (const line of tree) {
    const match = /^(100(?:644|755)) blob ([a-f0-9]{40}) +([0-9]+)\t([\s\S]+)$/.exec(line);
    assert.ok(match, 'Historical source contains a non-file Git object');
    const [, mode, blob, length, name] = match, size = Number(length);
    assert.ok(!path.isAbsolute(name) && !name.includes('\\') && name.split('/').every(part => part && part !== '.' && part !== '..'));
    assert.ok(Number.isSafeInteger(size) && size >= 0 && size <= 128 * 1024 * 1024);
    assert.ok(!members.has(name)); members.set(name, { mode, blob, size }); contentBytes += size;
  }
  assert.ok(contentBytes <= 256 * 1024 * 1024, 'Historical source exceeds replay budget');
  fs.mkdirSync(directory); directory = fs.realpathSync(directory);
  const scratch = fs.mkdtempSync(path.join(path.dirname(directory), 'portability-git-'));
  try {
    const tar = path.join(scratch, 'source.tar');
    execFileSync('git', ['archive', '--format=tar', `--output=${tar}`, portabilityArchiveSource], { cwd: repository, timeout: 60000, maxBuffer: 1024 * 1024 });
    assert.ok(fs.statSync(tar).size <= 300 * 1024 * 1024, 'Historical archive exceeds replay budget');
    const extracted = spawnSync('tar', ['-xf', tar, '-C', directory], { timeout: 60000, maxBuffer: 1024 * 1024 });
    assert.equal(extracted.status, 0, String(extracted.error ?? extracted.stderr));
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
  const actual = [];
  const walk = current => { for (const row of fs.readdirSync(current, { withFileTypes: true })) { const target = path.join(current, row.name); assert.ok(!row.isSymbolicLink()); if (row.isDirectory()) walk(target); else { assert.ok(row.isFile()); actual.push(path.relative(directory, target)); } } };
  walk(directory); assert.deepEqual(actual.sort(), [...members.keys()].sort());
  for (const [name, expected] of members) {
    const file = path.join(directory, name), stat = fs.statSync(file), bytes = fs.readFileSync(file);
    assert.equal(bytes.length, expected.size); assert.equal(Boolean(stat.mode & 0o111), expected.mode === '100755');
    assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), expected.blob, `Historical Git blob differs: ${name}`);
  }
  assert.equal(process.versions.node, fs.readFileSync(path.join(directory, '.nvmrc'), 'utf8').trim().replace(/^v/, ''), 'Use the historical Node runtime');
  assert.equal(digest(fs.readFileSync(path.join(dependencyRoot, 'synthesis/package-lock.json'))), digest(fs.readFileSync(path.join(directory, 'synthesis/package-lock.json'))), 'Install the frozen synthesis dependencies');
  const modules = fs.realpathSync(path.join(dependencyRoot, 'synthesis/node_modules')); assert.ok(fs.statSync(modules).isDirectory());
  fs.symlinkSync(modules, path.join(directory, 'synthesis/node_modules'), 'dir');
  return { directory, source: portabilityArchiveSource, files: members.size, bytes: contentBytes, dependencyClosure: 'synthesis/package-lock.json' };
}

export async function verifyNativePortabilityArchive(directory = path.join(root, 'journals/native-portability-reference/2026-11-09/signed-completion-v3')) {
  const summary = JSON.parse(fs.readFileSync(path.join(directory, 'summary.json'), 'utf8'));
  assert.equal(summary.schema, 'tpnil-native-portability-preflight@1'); assert.equal(summary.claim, 'ENGINEERING_OBSERVATION_ONLY');
  assert.equal(summary.artifact.path, 'evidence.json.gz');
  const bytes = fs.readFileSync(path.join(directory, summary.artifact.path));
  assert.equal(bytes.length, summary.artifact.bytes); assert.equal(digest(bytes), summary.artifact.sha256);
  const archive = JSON.parse(gunzipSync(bytes, { maxOutputLength: 128 * 1024 * 1024 }).toString());
  assert.equal(archive.schema, 'tpnil-engineering-evidence-files@1');
  const files = new Map();
  for (const file of archive.files) {
    assert.equal(typeof file.path, 'string'); assert.ok(!path.isAbsolute(file.path) && !file.path.includes('\\') && file.path.split('/').every(part => part && part !== '.' && part !== '..'));
    assert.ok(!files.has(file.path)); const content = Buffer.from(file.content);
    assert.equal(content.length, file.size); assert.equal(digest(content), file.sha256); files.set(file.path, file);
  }
  assert.deepEqual(archive.files.map(({ content, ...meta }) => meta), summary.files);
  const sources = verifyNativePortabilitySourceBindings(files);
  assert.deepEqual(summary.runs.map(run => run.result), ['FAIL', 'FAIL', 'PASS']);
  for (const run of summary.runs) {
    const report = JSON.parse(files.get(`${run.directory}/evidence/conformance/portability.json`).content);
    assert.equal(report.result, run.result);
    const result = JSON.parse(files.get(`${run.directory}/result.json`).content);
    assert.deepEqual(result.cleanup, { browser: true, services: true, profile: true });
    if (run.result === 'PASS') {
      assert.equal(report.schema, 'tpnil-native-storage-portability@3');
      assert.equal(report.assertions.length, 9);
    }
  }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-portability-replay-'));
  let frozen;
  try {
    frozen = preparePortabilityReplay(path.join(temporary, 'source'));
    // Re-check the four retained source files against the extracted immutable
    // tree before importing anything. No current producer is executed.
    for (const [name] of sourceBindings) assert.equal(digest(fs.readFileSync(path.join(frozen.directory, name))), files.get(name).sha256);
    const report = files.get(`${summary.runs[2].directory}/evidence/conformance/portability.json`).content;
    const reportPath = path.join(temporary, 'report.json'); fs.writeFileSync(reportPath, report);
    const runner = path.join(frozen.directory, 'portability-archive-replay.mjs');
    fs.writeFileSync(runner, `import assert from 'node:assert/strict'; import fs from 'node:fs'; import {verifyNativePortability} from './synthesis/src/wallet-lab/native/verify-conformance-portability.ts'; const result=await verifyNativePortability(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))); assert.equal(result.result,'PASS'); assert.equal(result.assertions.length,9); console.log(JSON.stringify({verified:true,result:result.result,assertions:result.assertions.length}));\n`);
    const replay = spawnSync(process.execPath, ['--import', path.join(frozen.directory, 'synthesis/node_modules/tsx/dist/loader.mjs'), runner, reportPath], { cwd: frozen.directory, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
    assert.equal(replay.status, 0, `${replay.error ?? ''}\n${replay.stderr}\n${replay.stdout}`);
    const receipts = replay.stdout.split('\n').flatMap(line => { try { const value = JSON.parse(line); return value.verified === true ? [value] : []; } catch { return []; } });
    assert.deepEqual(receipts, [{ verified: true, result: 'PASS', assertions: 9 }], 'Missing or ambiguous historical semantic replay receipt');
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  return { verified: true, claim: summary.claim, attempts: 3, retainedFailures: 2, nativeEngineeringAssertions: 9, ...sources, semanticSourceFiles: frozen.files, semanticSource: frozen.source, frozenSynthesisDependencies: true, currentProducerExecuted: false, replayCleanup: true };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) console.log(JSON.stringify(await verifyNativePortabilityArchive(process.argv[2])));
