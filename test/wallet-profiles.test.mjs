import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { digest, hashJson } from '../src/json.mjs';
import { ROOT, readJson, checkCatalog, checkSchema } from '../src/core.mjs';
import { evaluateWalletProfiles, WALLET_PROFILE_CATALOG } from '../src/wallet-profiles.mjs';
import { createWalletProfileSelfTest } from '../src/wallet-profile-self-test.mjs';
function fixture(t) { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-isi6-')); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return createWalletProfileSelfTest(path.join(root, 'new')); }
function mutate(f, number, change) { const item = f.record.cases[number - 1], file = path.join(f.directory, item.projection.path); const value = readJson(file); change(value); const bytes = Buffer.from(JSON.stringify(value)); fs.writeFileSync(file, bytes); item.projection.sha256 = digest(bytes); item.projection.size = bytes.length; }
const evaluate = f => evaluateWalletProfiles(f.plan, f.record, f.directory);
function rebindPlan(f) {
  f.record.planHash = hashJson(f.plan);
  const file = path.join(f.directory, f.record.oracle.path), oracle = readJson(file);
  oracle.planHash = f.record.planHash;
  const bytes = Buffer.from(JSON.stringify(oracle)); fs.writeFileSync(file, bytes);
  f.record.oracle.sha256 = digest(bytes); f.record.oracle.size = bytes.length;
}


test('optional ISI-6 has ten complete vectors; old index/catalog schemas retain their namespace', () => {
  const catalog = readJson(path.join(ROOT, WALLET_PROFILE_CATALOG)); checkCatalog(catalog);
  assert.equal(catalog.vectors.length, 10);
  assert.ok(catalog.vectors.every(vector => vector.applicability.includes('independent of ISI-4')));
  assert.throws(() => checkSchema('program-index', { schemaVersion: '0.1.0', programs: [{ id: 'ISI-6', version: '0.1.0' }] }));
  assert.equal(readJson(path.join(ROOT, 'programs/ISI-4/1.0.0/catalog.json')).vectors.length, 8);
});
test('complete synthetic observations pass only LAB_SELF_TEST_ONLY and engineering cannot issue conformance', t => {
  const f = fixture(t), result = evaluate(f);
  assert.equal(result.overall, 'PASS'); assert.equal(result.outcomes.length, 10); assert.equal(result.claim, 'LAB_SELF_TEST_ONLY');
  assert.ok(result.outcomes.every(outcome => outcome.assertions.length > 5));
  f.plan.mode = 'engineering'; rebindPlan(f);
  assert.throws(() => evaluate(f), /cannot be promoted/);
  f.plan.mode = 'CERTIFIED'; assert.throws(() => evaluate(f));
});
const regressions = [
  [1, 'success before durable commit', o => { o.successRevision = 1; }],
  [2, 'UI selects secondary but BRC100 serves root', o => { o.freshIdentity = o.before.identity; }],
  [2, 'old profile response escapes', o => { o.oldReply.status = 'served'; }],
  [2, 'concurrent switches disappear', o => { o.activatedSwitches = []; }],
  [2, 'empty concurrency trace', o => { o.requestedSwitches = o.activatedSwitches = []; }],
  [2, 'financial call races switching', o => { o.busyFinancialSwitch = 'allowed'; }],
  [2, 'old read cache reused', o => { o.oldCacheReused = true; }],
  [3, 'Home gesture substitutes for process death', o => { o.lifecycle.kind = 'background'; }],
  [3, 'default restored on relaunch', o => { o.after = { ...o.after, selected: 'root' }; }],
  [4, 'third creation resets active key', o => { o.after = { ...o.after, identity: o.after.root }; }],
  [4, 'third creation duplicates financial action', o => { o.newActionIds.push('duplicate'); }],
  [5, 'lookup failure recreates account', o => { o.unavailable.newAccountCreated = true; }],
  [5, 'stale token accepted as current', o => { o.reconciled = { ...o.reconciled, ump: o.stale.ump }; }],
  [6, 'failed save reports ready', o => { o.afterFailure = { ...o.afterFailure, ready: true }; }],
  [6, 'refresh omits retrying the save', o => { o.afterRetry = { ...o.afterRetry, revision: o.before.revision }; }],
  [7, 'receipt has wrong owner', o => { o.receipt.ownerIdentity = o.before.identity; }],
  [7, 'receipt consumes the wrong predecessor', o => { o.receipt.predecessor = o.after.ump; }],
  [7, 'receipt publishes a different outpoint', o => { o.receipt.outpoint = o.before.ump; }],
  [7, 'receipt changes the intended inventory', o => { o.receipt.profiles = ['root']; }],
  [7, 'replacement receipt broadcast', o => { o.replayedReceiptSha256s.push('ff'.repeat(32)); }],
  [7, 'uncertain admission creates replacement action', o => { o.withoutReceipt.newActionCount = 1; }],
  [7, 'uncertain checkpoint silently discarded', o => { o.withoutReceipt.checkpointRetained = false; }],
  [8, 'missing profile silently falls back', o => { o.removed.identityCall = 'served'; }],
  [8, 'late account callback poisons identity', o => { o.afterLateCallback.identity = o.failedBuild.identity; }],
  [8, 'failed builder still serves API', o => { o.failedBuild.identityCall = 'served'; }],
  [9, 'cached authenticated root peer reused', o => { o.explicitLogin.peerIdentity = o.initialServerIdentity; }],
  [9, 'relogin keeps root server account', o => { o.explicitLogin.userId = o.rootUserId; }],
  [9, 'login retries payment', o => { o.paymentReplayCount = 1; }],
  [10, 'stale mirror wins', o => { o.selectedRevision = o.staleMirrorRevision; }],
  [10, 'logout resurrects legacy account', o => { o.logout.oldSnapshotRestored = true; }],
  [10, 'background consumes logged-out identity', o => { o.backgroundAfterLogout = 'accepted'; }]
];
for (const [number, name, change] of regressions) test(`reject regression: ${name}`, t => { const f = fixture(t); mutate(f, number, change); const result = evaluate(f); assert.equal(result.overall, 'FAIL'); assert.equal(result.outcomes[number - 1].status, 'FAIL'); });
test('each omitted vector and each required evidence role blocks full compatibility', t => {
  const f = fixture(t);
  for (let i = 0; i < 10; i++) { const missing = structuredClone(f); missing.record.cases.splice(i, 1); assert.equal(evaluate(missing).overall, 'BLOCKED'); }
  for (const item of f.record.cases) for (let i = 0; i < item.evidence.length; i++) { const missing = structuredClone(f); missing.record.cases.find(row => row.id === item.id).evidence.splice(i, 1); assert.equal(evaluate(missing).overall, 'BLOCKED'); }
});
test('missing semantic fact or absent raw artifact blocks instead of passing', t => {
  const f = fixture(t); mutate(f, 3, o => { delete o.lifecycle.processExited; }); assert.equal(evaluate(f).overall, 'BLOCKED');
  fs.unlinkSync(path.join(f.directory, f.record.cases[0].evidence[0].path)); assert.equal(evaluate(f).outcomes[0].status, 'BLOCKED');
});
test('tamper, symlinks, duplicates, unknown vectors and wrong plan/catalog binding fail the evidence contract', t => {
  const f = fixture(t);
  for (const change of [x => { x.record.planHash = '00'.repeat(32); }, x => { x.plan.profileHash = '00'.repeat(32); }, x => { x.record.cases.push(x.record.cases[0]); }, x => { x.record.cases[0].id = 'ISI-6-V999'; }, x => { x.record.cases[0].projection.path = '../escape'; }, x => { x.record.finishedAt = '2026-11-15T00:00:00.000Z'; }]) { const invalid = structuredClone(f); change(invalid); assert.throws(() => evaluate(invalid)); }
  const file = path.join(f.directory, f.record.cases[0].projection.path); fs.appendFileSync(file, ' '); assert.throws(() => evaluate(f), /size|digest/i);
  fs.unlinkSync(file); fs.symlinkSync('oracle.json', file); assert.throws(() => evaluate(f), /Symlink/);
});
test('CLI reports FAIL/BLOCKED as lab data and reserves error exit for invalid evidence', t => {
  const f = fixture(t); const run = () => spawnSync(process.execPath, ['bin/tpnil.mjs', 'evaluate-wallet-profiles', path.join(f.directory, 'plan.json'), path.join(f.directory, 'record.json'), f.directory], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(run().status, 0); mutate(f, 9, o => { o.paymentReplayCount = 1; }); fs.writeFileSync(path.join(f.directory, 'record.json'), JSON.stringify(f.record)); const result = run(); assert.equal(result.status, 0); assert.equal(JSON.parse(result.stdout).overall, 'FAIL'); f.record.planHash = 'ff'.repeat(32); fs.writeFileSync(path.join(f.directory, 'record.json'), JSON.stringify(f.record)); assert.equal(run().status, 2);
});

test('single-store and absent background consumers have explicit frozen scope rather than mandatory extra components', t => {
  const f = fixture(t); f.plan.optionalConsumers = { mirrors: false, background: false }; rebindPlan(f);
  mutate(f, 10, o => { o.consumerInventory = f.plan.optionalConsumers; o.mirrorConsumer = o.backgroundConsumer = 'absent'; delete o.canonicalRevision; delete o.backgroundAfterLogout; });
  assert.equal(evaluate(f).overall, 'PASS');
  mutate(f, 10, o => { o.consumerInventory.background = true; }); assert.equal(evaluate(f).overall, 'FAIL');
});
test('declared profile-scoped notification identity is preserved independently of root-scoped implementations', t => {
  const f = fixture(t); f.plan.notificationIdentityRole = 'active-profile'; rebindPlan(f);
  assert.equal(evaluate(f).outcomes[9].status, 'FAIL');
  mutate(f, 10, o => { o.notificationIdentityAfterSwitch = f.oracle.secondary.identity; }); assert.equal(evaluate(f).overall, 'PASS');
});

test('profile inventory ordering cannot invent a semantic mismatch', t => {
  const f = fixture(t); mutate(f, 3, o => { o.after = { ...o.after, profiles: [...o.after.profiles].reverse() }; });
  assert.equal(evaluate(f).overall, 'PASS');
});

test('derived keys bind the pre-frozen observer/root and original UMP evidence without predetermined profile entropy', t => {
  const f = fixture(t), file = path.join(f.directory, f.record.oracle.path);
  const original = readJson(file);
  for (const change of [o => { o.observerSha256 = 'ff'.repeat(32); }, o => { o.planHash = 'ff'.repeat(32); }, o => { o.root.identity = o.secondary.identity; }, o => { o.sources.third.sha256 = 'ff'.repeat(32); }, o => { o.sources.third = o.sources.secondary; }]) {
    const oracle = structuredClone(original); change(oracle); const bytes = Buffer.from(JSON.stringify(oracle));
    fs.writeFileSync(file, bytes); f.record.oracle.sha256 = digest(bytes); f.record.oracle.size = bytes.length;
    assert.throws(() => evaluate(f));
  }
});

test('verified rollback may serve the previously committed identity while unresolved writes remain refused', t => {
  const f = fixture(t); mutate(f, 6, o => { o.failureOutcome = 'verified-rollback'; o.afterFailure.ready = true; o.afterFailureAccess.identityCall = 'served-previous'; o.afterFailureAccess.identity = o.before.identity; });
  assert.equal(evaluate(f).overall, 'PASS');
  mutate(f, 6, o => { o.afterFailureAccess.identity = o.before.root; }); assert.equal(evaluate(f).overall, 'FAIL');
});
