#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
  const { register } = await import('../synthesis/node_modules/tsx/dist/esm/api/index.mjs');
  register();
  const { verifyNativePortability } = await import('../synthesis/src/wallet-lab/native/verify-conformance-portability.ts');
  assert.deepEqual(summary.runs.map(run => run.result), ['FAIL', 'FAIL', 'PASS']);
  for (const run of summary.runs) {
    const report = JSON.parse(files.get(`${run.directory}/evidence/conformance/portability.json`).content);
    assert.equal(report.result, run.result);
    const result = JSON.parse(files.get(`${run.directory}/result.json`).content);
    assert.deepEqual(result.cleanup, { browser: true, services: true, profile: true });
    if (run.result === 'PASS') {
      assert.equal(report.schema, 'tpnil-native-storage-portability@3');
      assert.equal((await verifyNativePortability(report)).result, 'PASS'); assert.equal(report.assertions.length, 9);
    }
  }
  return { verified: true, claim: summary.claim, attempts: 3, retainedFailures: 2, nativeEngineeringAssertions: 9, ...sources };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) console.log(JSON.stringify(await verifyNativePortabilityArchive(process.argv[2])));
