import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { verifyComponentQualification } from '../src/component-qualification.mjs';
import { verifyRuntimeQualification } from '../src/runtime-qualification.mjs';
import { verifyReferenceQualification } from '../src/reference-qualification.mjs';
import { verifySynthesisStackQualification } from '../src/synthesis-stack-qualification.mjs';

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));

function copied(relative) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-evidence-'));
  const target = path.join(temporary, 'record');
  fs.cpSync(path.join(ROOT, relative), target, { recursive: true });
  return { temporary, target };
}

test('published joined Arcade, Teranode, and Merkle evidence verifies offline', () => {
  const directory = path.join(ROOT, 'journals/component-qualification/2026-09-20/arcade-real-teranode-merkle');
  const result = verifyComponentQualification(directory);
  assert.equal(result.overall, 'PASS');
  assert.equal(result.assertions, 5);
});

test('published Synthesis Board transaction-services evidence verifies offline', () => {
  const directory = path.join(ROOT, 'journals/component-qualification/2026-09-20/arcade-synthesis-board-teranode-merkle');
  const result = verifyComponentQualification(directory);
  assert.equal(result.overall, 'PASS');
  assert.equal(result.assertions, 5);
});

test('component evidence rejects a changed retained observation', t => {
  const { temporary, target } = copied('journals/component-qualification/2026-09-20/arcade-real-teranode-merkle');
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const record = JSON.parse(fs.readFileSync(path.join(target, 'record.json')));
  fs.appendFileSync(path.join(target, 'objects', record.observationHash), '\nchanged');
  assert.throws(() => verifyComponentQualification(target), /digest mismatch/i);
});

test('published Teranode runtime evidence verifies offline', () => {
  const directory = path.join(ROOT, 'journals/runtime-qualification/2026-09-20/teranode-synthesis-board-v0.15.9-arm64');
  const result = verifyRuntimeQualification(directory);
  assert.equal(result.outcome, 'PASS');
  assert.equal(result.assertions, 9);
});

test('runtime evidence rejects a changed retained result', t => {
  const { temporary, target } = copied('journals/runtime-qualification/2026-09-20/teranode-synthesis-board-v0.15.9-arm64');
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const record = JSON.parse(fs.readFileSync(path.join(target, 'record.json')));
  fs.appendFileSync(path.join(target, 'objects', record.resultHash), '\nchanged');
  assert.throws(() => verifyRuntimeQualification(target), /digest mismatch/i);
});

test('published synthesis reference evidence verifies offline', () => {
  const directory = path.join(ROOT, 'journals/reference-qualification/2026-09-20/synthesis-board-v0.1.0');
  const result = verifyReferenceQualification(directory);
  assert.equal(result.outcome, 'PASS');
  assert.equal(result.assertions, 8);
});

test('reference evidence rejects a changed retained result', t => {
  const { temporary, target } = copied('journals/reference-qualification/2026-09-20/synthesis-board-v0.1.0');
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const record = JSON.parse(fs.readFileSync(path.join(target, 'record.json')));
  fs.appendFileSync(path.join(target, 'objects', record.resultHash), '\nchanged');
  assert.throws(() => verifyReferenceQualification(target), /digest mismatch/i);
});

test('published orchestrated synthesis stack verifies every linked transaction offline', () => {
  const directory = path.join(ROOT, 'journals/synthesis-stack-qualification/2026-09-20/repetition-2');
  const result = verifySynthesisStackQualification(directory);
  assert.equal(result.outcome, 'PASS');
  assert.equal(result.stages, 4);
  assert.equal(result.assertions, 6);
});

test('synthesis stack rejects a changed linked fixture', t => {
  const { temporary, target } = copied('journals/synthesis-stack-qualification/2026-09-20/repetition-2');
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  fs.appendFileSync(path.join(target, 'fixtures', 'uhrp.json'), '\nchanged');
  assert.throws(() => verifySynthesisStackQualification(target), /digest mismatch/i);
});
