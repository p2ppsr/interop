import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, readJson } from '../src/core.mjs';
import { digest } from '../src/json.mjs';
import { reviewIntake } from '../src/intake.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-intake-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const record = structuredClone(readJson(path.join(ROOT, 'suts/intake/bsv-desktop-2.8.5.json')));
  record.artifact.sha256 = digest('fixture'); record.artifact.size = 7;
  fs.writeFileSync(path.join(root, 'artifact'), 'fixture');
  for (const e of record.evidence) {
    const file = path.join(root, e.path); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'evidence'); e.sha256 = digest('evidence');
  }
  return { root, record, artifact: path.join(root, 'artifact') };
}

test('source-only intake remains blocked and cannot issue a conformance claim', async t => {
  const {root,record,artifact}=fixture(t);
  const result=await reviewIntake(record,artifact,root);
  assert.equal(result.claim,'INTAKE_REVIEW_ONLY');
  assert.equal(result.readiness,'BLOCKED');
  assert.equal(result.unmet.length,7);
  assert.deepEqual(await reviewIntake(record,artifact,root),result);
});
test('verified runtime criteria require runtime evidence, not source inspection', async t => {
  const {root,record,artifact}=fixture(t);
  record.criteria.find(c=>c.id==='production-fidelity').status='verified';
  await assert.rejects(reviewIntake(record,artifact,root),/requires runtime-observation/);
});
test('intake rejects omitted criteria, live-broadcast scope changes, and unknown references', async t => {
  const {root,record,artifact}=fixture(t);
  const missing=structuredClone(record);missing.criteria.pop();
  await assert.rejects(reviewIntake(missing,artifact,root),/Incomplete/);
  const live=structuredClone(record);live.publicMainnetBroadcast=true;
  await assert.rejects(reviewIntake(live,artifact,root));
  record.criteria[0].evidenceIds=['missing'];
  await assert.rejects(reviewIntake(record,artifact,root),/Unknown evidence/);
});
test('intake detects altered artifacts and altered referenced evidence', async t => {
  const {root,record,artifact}=fixture(t);
  fs.writeFileSync(artifact,'changed');
  await assert.rejects(reviewIntake(record,artifact,root),/artifact digest/);
  fs.writeFileSync(artifact,'fixture');fs.writeFileSync(path.join(root,record.evidence[0].path),'changed');
  await assert.rejects(reviewIntake(record,artifact,root),/Evidence digest/);
});
test('intake rejects evidence traversal and symlink substitution', async t => {
  const {root,record,artifact}=fixture(t);
  const bad=structuredClone(record);bad.evidence[0].path='../outside';
  await assert.rejects(reviewIntake(bad,artifact,root),/Unsafe/);
  const file=path.join(root,record.evidence[0].path);fs.unlinkSync(file);fs.symlinkSync(artifact,file);
  await assert.rejects(reviewIntake(record,artifact,root),/Symlink/);
});
