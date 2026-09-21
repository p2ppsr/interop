import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { packageSutEvidence, verifyNativeObservation, verifyWalletRunSeries } from '../src/sut-evidence.mjs';

test('native observation packaging retains and verifies every evidence byte', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-sut-evidence-'));
  const input = path.join(root, 'input');
  fs.mkdirSync(input);
  fs.writeFileSync(path.join(input, 'observation.txt'), 'observed\n');
  const summary = path.join(root, 'summary.json');
  const vector = id => ({ id, outcome: 'BLOCKED', assertions: [], limitations: ['prerequisite unavailable'] });
  fs.writeFileSync(summary, JSON.stringify({
    schema: 'tpnil-isi4-native-observation@1.0.0',
    claim: 'INTAKE_QUALIFICATION_ONLY',
    program: 'ISI-4@1.0.0',
    itcve: 'ITCVE-1@1.0.0',
    runId: 'fixture',
    outcome: 'BLOCKED',
    vectors: Array.from({ length: 8 }, (_, index) => vector(`ISI-4-V00${index + 1}`))
  }));
  const output = path.join(root, 'output');
  packageSutEvidence(summary, input, output);
  assert.equal(verifyNativeObservation(output).runId, 'fixture');
  fs.appendFileSync(path.join(output, 'evidence', 'observation.txt'), 'tampered');
  assert.throws(() => verifyNativeObservation(output), /size mismatch/);
});

test('published wallet series binds both repetition records and their semantic result', () => {
  const directory = path.join(
    path.dirname(path.dirname(fileURLToPath(import.meta.url))),
    'journals/wallet-runs/2026-09-20/yours-wallet-5.1.0-todo-controlled-services'
  );
  const result = verifyWalletRunSeries(directory);
  assert.equal(result.repetitions.length, 2);
  assert.equal(result.repetitionMatch, true);
  assert.equal(result.outcome, 'FAIL');
});
