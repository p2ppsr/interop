import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canonical, digest, hashJson, parseJson, validate } from '../src/json.mjs';
import { ROOT, artifactBytes, checkCatalog, checkPlan, checkRepository, evaluate, readJson } from '../src/core.mjs';
import { demoPlan, runDemo } from '../src/demo.mjs';
import { appendRun, verifyJournal, verifyPrefix } from '../src/journal.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const a = '2026-09-17T00:00:00.000Z', b = '2026-09-17T00:00:01.000Z';
function temp(t) { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-test-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; }
function bundle(t) {
  const dir = path.join(temp(t), 'journal'); const { plan, observations } = demoPlan();
  appendRun(dir, plan, observations, ROOT, a, b); return { dir, plan, observations };
}

test('canonical encoding has a fixed known answer and preserves array order', () => {
  assert.equal(canonical({ z: [2, 1], a: 'é' }), '{"a":"é","z":[2,1]}');
  assert.equal(digest('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(hashJson({ b: 2, a: 1 }), hashJson({ a: 1, b: 2 }));
  assert.notEqual(hashJson([1, 2]), hashJson([2, 1]));
});
test('strict parser rejects ambiguous keys, Unicode, numbers and trailing data', () => {
  for (const value of ['{"x":1,"x":2}', '{"x":1,"\\u0078":2}', '{"x":-0}', '[1.2]', '[9007199254740992]', '[1e400]', '"\\ud800"', '[1,]', '{"a":1,}', '{} false', '\ufeff{}']) {
    assert.throws(() => parseJson(value), undefined, value);
  }
  assert.throws(() => parseJson(Buffer.from([0xff])));
  assert.equal(canonical(parseJson('{"__proto__":{"x":1}}')), '{"__proto__":{"x":1}}');
  assert.equal(canonical(parseJson('"🌍"')), '"🌍"');
});
test('unsupported schema keywords fail closed', () => assert.throws(() => validate({ allOf: [] }, {}), /Unsupported/));
test('catalogs distinguish executable vectors from design-only vectors', () => {
  assert.deepEqual(checkRepository(), { catalogs: 4, draftVectors: 26, executableSutVectors: 6 });
  const c = clone(readJson(path.join(ROOT, 'programs/ISI-4/0.1.0/catalog.json')));
  c.vectors[0].executable = true; checkCatalog(c);
  c.vectors[1].id = c.vectors[0].id; assert.throws(() => checkCatalog(c), /Duplicate/);
});
test('plans reject unknown fields, empty suites, repeated IDs and SUT claims', () => {
  const { plan } = demoPlan();
  for (const mutation of [p => p.claim = 'CERTIFIED', p => p.program.id = 'ISI-4', p => p.assertions = [], p => p.artifacts = [], p => p.extra = true, p => p.assertions.push(p.assertions[0])]) {
    const bad = clone(plan); mutation(bad); assert.throws(() => checkPlan(bad));
  }
});
test('missing evidence blocks; an explicit observed mismatch fails', () => {
  const { plan, observations } = demoPlan();
  assert.equal(evaluate(plan, observations).overall, 'PASS');
  delete observations.values.sum;
  assert.equal(evaluate(plan, observations).overall, 'BLOCKED');
  observations.values.sorted = [1, 2, 4];
  assert.equal(evaluate(plan, observations).overall, 'FAIL');
});
test('JSON pointer escaping and null evidence are precise', () => {
  const { plan, observations } = demoPlan();
  plan.assertions = [{ id: 'x', requirementId: 'r', path: '/a~1b/~0/null', expected: null }];
  observations.values = { 'a/b': { '~': { null: null } } };
  assert.equal(evaluate(plan, observations).overall, 'PASS');
  plan.assertions[0].path = '/a~1b/~0/missing';
  assert.equal(evaluate(plan, observations).overall, 'BLOCKED');
});
test('array pointer cannot claim array length or leading-zero index', () => {
  const { plan, observations } = demoPlan();
  for (const p of ['/sorted/length', '/sorted/00']) {
    plan.assertions = [{ id: 'x', requirementId: 'r', path: p, expected: 3 }];
    assert.equal(evaluate(plan, observations).overall, 'BLOCKED');
  }
});
test('artifact verification rejects changed bytes, path traversal and symlinks', t => {
  const root = temp(t); fs.writeFileSync(path.join(root, 'a'), 'good');
  const artifact = { path: 'a', sha256: digest('good'), size: 4 };
  assert.equal(artifactBytes(root, artifact).toString(), 'good');
  fs.writeFileSync(path.join(root, 'a'), 'evil'); assert.throws(() => artifactBytes(root, artifact), /digest/);
  for (const p of ['../a', '/a', 'a/../b', 'C:/a', 'a\\b']) assert.throws(() => artifactBytes(root, { ...artifact, path: p }), /Unsafe/);
  fs.symlinkSync('a', path.join(root, 'link')); assert.throws(() => artifactBytes(root, { ...artifact, path: 'link' }), /Symlink/);
});
test('journal replay retains exact scoped result and immutable objects', t => {
  const { dir, plan, observations } = bundle(t); const state = verifyJournal(dir);
  assert.equal(state.entries.length, 1);
  assert.equal(canonical(state.results[0]), canonical(evaluate(plan, observations)));
  assert.equal(state.results[0].claim, 'LAB_SELF_TEST_ONLY');
});
test('timestamps change record identity without changing semantic result', t => {
  const { dir, plan, observations } = bundle(t);
  const first = verifyJournal(dir);
  appendRun(dir, plan, observations, ROOT, b, '2026-09-17T00:00:02.000Z');
  const state = verifyJournal(dir);
  assert.equal(hashJson(state.results[0]), hashJson(state.results[1]));
  assert.notEqual(state.entries[0].recordHash, state.entries[1].recordHash);
  assert.equal(state.entries[1].previousHash, first.head);
});
test('tampering with an archived artifact fails replay', t => {
  const { dir, plan } = bundle(t); const p = path.join(dir, 'objects', plan.artifacts[0].sha256);
  fs.writeFileSync(p, 'changed'); assert.throws(() => verifyJournal(dir), /digest/);
});
test('missing archived objects fail replay', t => {
  const { dir, plan } = bundle(t); fs.unlinkSync(path.join(dir, 'objects', plan.artifacts[0].sha256));
  assert.throws(() => verifyJournal(dir), /ENOENT/);
});
test('journal truncation and chain rewrites are detected', t => {
  const { dir } = bundle(t); const p = path.join(dir, 'journal.jsonl'), raw = fs.readFileSync(p);
  fs.writeFileSync(p, raw.subarray(0, raw.length - 1)); assert.throws(() => verifyJournal(dir), /interrupted/);
  const entry = parseJson(raw); entry.previousHash = '0'.repeat(64);
  fs.writeFileSync(p, canonical(entry) + '\n'); assert.throws(() => verifyJournal(dir), /chain/);
});
test('known prior journal prefix cannot be replaced by another valid run', t => {
  const { dir } = bundle(t); const other = path.join(temp(t), 'other'); const { plan, observations } = demoPlan();
  observations.values.sum = 7; appendRun(other, plan, observations, ROOT, a, b);
  assert.equal(verifyJournal(other).results[0].overall, 'FAIL');
  assert.throws(() => verifyPrefix(dir, other), /prefix/);
});
test('appending retains the prior prefix and duplicate run is rejected', t => {
  const { dir, plan, observations } = bundle(t); const copy = path.join(temp(t), 'copy'); fs.cpSync(dir, copy, { recursive: true });
  assert.throws(() => appendRun(dir, plan, observations, ROOT, a, b), /Duplicate/);
  appendRun(dir, plan, observations, ROOT, b, '2026-09-17T00:00:02.000Z');
  assert.deepEqual(verifyPrefix(copy, dir), { retainedEntries: 1, addedEntries: 1 });
});
test('concurrent/stale writers and reversed timestamps fail closed', t => {
  const { dir, plan, observations } = bundle(t); fs.mkdirSync(path.join(dir, '.writer.lock'));
  assert.throws(() => appendRun(dir, plan, observations, ROOT, a, b), /EEXIST/);
  assert.throws(() => appendRun(dir, plan, observations, ROOT, b, a), /before/);
  assert.equal(verifyJournal(dir).entries.length, 1);
});
test('failed and blocked observations remain recorded outcomes', t => {
  const dir = path.join(temp(t), 'j'); const { plan, observations } = demoPlan(); delete observations.values.sum;
  appendRun(dir, plan, observations, ROOT, a, b);
  assert.equal(verifyJournal(dir).results[0].overall, 'BLOCKED');
});
test('schema-invalid evidence cannot be appended', t => {
  const { plan, observations } = demoPlan(); observations.claim = 'CERTIFIED';
  assert.throws(() => appendRun(path.join(temp(t), 'j'), plan, observations, ROOT, a, b), /unexpected/);
});
test('demo cannot overwrite an existing evidence directory', t => {
  const dir = path.join(temp(t), 'demo'); assert.equal(runDemo(dir).outcome, 'PASS');
  assert.throws(() => runDemo(dir), /already exists/);
});
