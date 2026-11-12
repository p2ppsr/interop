import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from '../src/core.mjs';
import { createHash } from 'node:crypto';

test('publication guard rejects locally present but ignored evidence and incorrect staged bytes', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-publication-index-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-b', 'main'); git('config', 'user.name', 'TPNIL test fixture'); git('config', 'user.email', 'fixture@example.test'); git('config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(dir, '.gitignore'), '*.log\n');
  const folder = 'journals/integrated-native-attempts/fixture/run';
  fs.mkdirSync(path.join(dir, folder), { recursive: true });
  const bytes = Buffer.from('retained original failed execution\n'), file = path.join(dir, folder, 'failure.log');
  fs.writeFileSync(file, bytes);
  fs.writeFileSync(path.join(dir, folder, 'attempt.json'), JSON.stringify({ schema: 'tpnil-integration-attempt@1', files: [{ name: 'failure.log', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }] }));
  git('add', '.'); git('commit', '-m', 'fixture omitted ignored log');
  const base = git('rev-parse', 'HEAD').trim();
  const check = () => execFileSync(process.execPath, [path.join(ROOT, 'scripts/check-journal-history.mjs'), base], { cwd: dir, stdio: 'pipe' });
  assert.throws(check, /absent from Git index/);
  git('add', '-f', folder + '/failure.log'); assert.doesNotThrow(check);
  fs.writeFileSync(file, 'different staged bytes'); git('add', '-f', folder + '/failure.log'); assert.throws(check, /bytes differ in Git index/);
  fs.writeFileSync(file, bytes); git('add', '-f', folder + '/failure.log'); assert.doesNotThrow(check);
});

test('history guard permits additions but rejects modifications, deletions and type changes', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-history-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-b', 'main');
  // Fixture-only identity in an isolated temporary repository.
  git('config', 'user.name', 'TPNIL test fixture'); git('config', 'user.email', 'fixture@example.test'); git('config', 'commit.gpgsign', 'false');
  fs.mkdirSync(path.join(dir, 'journals'));
  const file = path.join(dir, 'journals', 'entry'); fs.writeFileSync(file, 'original');
  git('add', '.'); git('commit', '-m', 'fixture baseline'); const base = git('rev-parse', 'HEAD').trim();
  const check = () => execFileSync(process.execPath, [path.join(ROOT, 'scripts/check-journal-history.mjs'), base], { cwd: dir, stdio: 'pipe' });
  fs.writeFileSync(path.join(dir, 'journals', 'new'), 'addition'); git('add', '.'); git('commit', '-m', 'fixture addition'); assert.doesNotThrow(check);
  fs.writeFileSync(file, 'changed'); git('add', '.'); git('commit', '-m', 'fixture modification'); assert.throws(check);
  fs.unlinkSync(file); git('add', '.'); git('commit', '-m', 'fixture deletion'); assert.throws(check);
  fs.symlinkSync('new', file); git('add', '.'); git('commit', '-m', 'fixture type change'); assert.throws(check);
});

test('replacement root preserves prior journal bytes; later history requires an ancestor', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-genesis-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-b', 'main');
  git('config', 'user.name', 'TPNIL test fixture'); git('config', 'user.email', 'fixture@example.test'); git('config', 'commit.gpgsign', 'false');
  fs.mkdirSync(path.join(dir, 'journals'));
  fs.writeFileSync(path.join(dir, 'journals', 'old'), 'retained fixture');
  git('add', '.'); git('commit', '-m', 'prior foundation'); const base = git('rev-parse', 'HEAD').trim();
  git('checkout', '--orphan', 'replacement'); git('rm', '-rf', '.');
  fs.mkdirSync(path.join(dir, 'journals'));
  fs.writeFileSync(path.join(dir, 'journals', 'README.md'), 'Journal policy');
  fs.writeFileSync(path.join(dir, 'journals', 'old'), 'retained fixture');
  git('add', '.'); git('commit', '-m', 'new foundation');
  const check = () => execFileSync(process.execPath, [path.join(ROOT, 'scripts/check-journal-history.mjs'), base], { cwd: dir, stdio: 'pipe' });
  assert.doesNotThrow(check);
  fs.writeFileSync(path.join(dir, 'journals', 'old'), 'rewritten evidence');
  git('add', '.'); git('commit', '--amend', '--no-edit'); assert.throws(check);
  fs.unlinkSync(path.join(dir, 'journals', 'old'));
  git('add', '.'); git('commit', '--amend', '--no-edit'); assert.throws(check);
  fs.writeFileSync(path.join(dir, 'journals', 'old'), 'retained fixture');
  git('add', '.'); git('commit', '--amend', '--no-edit');
  const genesis = git('rev-parse', 'HEAD').trim();
  fs.writeFileSync(path.join(dir, 'journals', 'entry'), 'new evidence');
  git('add', '.'); git('commit', '-m', 'first result');
  assert.throws(check);
  assert.doesNotThrow(() => execFileSync(process.execPath, [path.join(ROOT, 'scripts/check-journal-history.mjs'), genesis], { cwd: dir, stdio: 'pipe' }));
});

test('a clean replacement root establishes a baseline without discarded objects; descendants require their base', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-clean-root-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-b', 'main');
  git('config', 'user.name', 'TPNIL test fixture'); git('config', 'user.email', 'fixture@example.test'); git('config', 'commit.gpgsign', 'false');
  fs.mkdirSync(path.join(dir, 'journals'));
  fs.writeFileSync(path.join(dir, 'journals', 'entry'), 'retained evidence fixture');
  git('add', '.'); git('commit', '-m', 'replacement baseline');
  const check = base => execFileSync(process.execPath, [path.join(ROOT, 'scripts/check-journal-history.mjs'), base], { cwd: dir, stdio: 'pipe' });
  const unavailable = '1234567890123456789012345678901234567890';
  assert.match(check(unavailable).toString(), /prior Git history unavailable/);
  const root = git('rev-parse', 'HEAD').trim();
  fs.writeFileSync(path.join(dir, 'new'), 'later source');
  git('add', '.'); git('commit', '-m', 'source change');
  assert.throws(() => check(unavailable));
  assert.doesNotThrow(() => check(root));
});
