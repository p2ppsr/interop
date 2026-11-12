#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from '../synthesis/node_modules/tsx/dist/esm/api/index.mjs';
register();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { verifyNativePortability } = await import('../synthesis/src/wallet-lab/native/verify-conformance-portability.ts');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
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
  const sourcePaths = ['synthesis/src/wallet-lab/native/conformance-portability.ts', 'synthesis/src/wallet-lab/native/verify-conformance-portability.ts', 'synthesis/src/wallet-lab/native/portability-proof.ts', 'programs/ISI-4/profiles/native-conformance-3.0.0/portability-oracle-3.0.0.json'];
  for (const source of sourcePaths) assert.equal(digest(fs.readFileSync(path.join(root, source))), files.get(source)?.sha256, `Source differs from retained preflight: ${source}`);
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
  return { verified: true, claim: summary.claim, attempts: 3, retainedFailures: 2, nativeEngineeringAssertions: 9, sourceBindings: sourcePaths.length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) console.log(JSON.stringify(await verifyNativePortabilityArchive(process.argv[2])));
