import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runQualification, verifyQualification } from '../src/qualification.mjs';
import { digest } from '../src/json.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function fixture() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-qualification-test-'));
  const webroot = path.join(work, 'webroot'); fs.mkdirSync(webroot);
  const index = Buffer.from('<!doctype html><script src="/app.js"></script>\n');
  const script = Buffer.from('globalThis.fixture = true;\n');
  const manifest = Buffer.from('{"metanet":{"brcs":["BRC-100"]}}\n');
  fs.writeFileSync(path.join(webroot, 'index.html'), index);
  fs.writeFileSync(path.join(webroot, 'app.js'), script);
  fs.writeFileSync(path.join(webroot, 'manifest.json'), manifest);
  const archive = path.join(work, 'fixture.tgz');
  execFileSync('python3', [path.join(root, 'scripts/package-webroot.py'), webroot, archive]);
  const archiveBytes = fs.readFileSync(archive);
  const plan = {
    schemaVersion: '1.0.0', id: 'TPNIL-TEST-QUALIFICATION', claim: 'INFRASTRUCTURE_QUALIFICATION_ONLY',
    logicalOrigin: 'https://fixture.itcve.test',
    artifact: { id: 'fixture', path: 'fixture.tgz', sha256: digest(archiveBytes), size: archiveBytes.length },
    assertions: [
      { id: 'INDEX', kind: 'response', path: '/', status: 200, contentType: 'text/html; charset=utf-8', bodySha256: digest(index) },
      { id: 'MANIFEST', kind: 'json-equals', path: '/manifest.json', pointer: '/metanet/brcs', expected: ['BRC-100'] },
      { id: 'ASSETS', kind: 'reference-closure', path: '/' },
      { id: 'REPEAT', kind: 'repeat-equal', path: '/manifest.json' }
    ]
  };
  const planFile = path.join(work, 'plan.json'); fs.writeFileSync(planFile, JSON.stringify(plan));
  return { work, planFile };
}

test('portable qualification executes, retains raw evidence, and verifies offline', async t => {
  const { work, planFile } = fixture(); t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const output = path.join(work, 'run');
  const executed = await runQualification(planFile, work, output, 'test-runner');
  assert.equal(executed.overall, 'PASS');
  assert.equal(executed.outcomes.length, 4);
  const verified = verifyQualification(output);
  assert.equal(verified.verified, true);
  assert.equal(verified.overall, 'PASS');
  assert.equal(verified.assertions, 4);
});

test('qualification verifier rejects modified retained evidence', async t => {
  const { work, planFile } = fixture(); t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const output = path.join(work, 'run');
  await runQualification(planFile, work, output, 'test-runner');
  const record = JSON.parse(fs.readFileSync(path.join(output, 'record.json')));
  const evidence = path.join(output, 'objects', record.evidenceHashes[0]);
  fs.appendFileSync(evidence, 'changed');
  assert.throws(() => verifyQualification(output), /digest mismatch/);
});

test('qualification records assertion failures without issuing conformance', async t => {
  const { work, planFile } = fixture(); t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const plan = JSON.parse(fs.readFileSync(planFile));
  plan.assertions[0].bodySha256 = '0'.repeat(64);
  fs.writeFileSync(planFile, JSON.stringify(plan));
  const output = path.join(work, 'run');
  const executed = await runQualification(planFile, work, output, 'test-runner');
  assert.equal(executed.overall, 'FAIL');
  const verified = verifyQualification(output);
  assert.equal(verified.claim, 'INFRASTRUCTURE_QUALIFICATION_ONLY');
  assert.equal(verified.overall, 'FAIL');
});
