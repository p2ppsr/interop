import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { canonical, digest, hashJson, parseJson } from './json.mjs';
import { ROOT, VERSION } from './core.mjs';
import { appendRun, verifyJournal } from './journal.mjs';

export function demoPlan() {
  const bytes = fs.readFileSync(path.join(ROOT, 'fixtures/self-test.json'));
  let sourceCommit = 'uncommitted', workspaceState = 'unversioned';
  try {
    sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    workspaceState = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim() ? 'dirty' : 'clean';
  } catch { /* Explicit uncommitted provenance for local bootstrap. */ }
  const plan = {
    schemaVersion: VERSION, claim: 'LAB_SELF_TEST_ONLY',
    program: { id: 'LAB-SELF-TEST', version: VERSION }, itcve: { id: 'LAB-OFFLINE-SELF-TEST', version: VERSION },
    profile: 'foundation-self-test', runnerVersion: VERSION, oracleVersion: VERSION,
    sourceCommit, workspaceState, platform: { os: process.platform, architecture: process.arch, runtime: process.version },
    determinismLevel: 'D0', seed: 'fixed-input-no-randomness',
    artifacts: [{ id: 'synthetic-input', kind: 'laboratory-fixture', path: 'fixtures/self-test.json', sha256: digest(bytes), size: bytes.length }],
    assertions: [
      { id: 'LAB-V001-A1', requirementId: 'LAB-R001', path: '/sum', expected: 6 },
      { id: 'LAB-V001-A2', requirementId: 'LAB-R002', path: '/sorted', expected: [1, 2, 3] },
      { id: 'LAB-V001-A3', requirementId: 'LAB-R003', path: '/encoding', expected: '{"a":1,"b":2}' }
    ]
  };
  const input = parseJson(bytes);
  const observations = { schemaVersion: VERSION, producer: `tpnil-foundation-self-test@${VERSION}`, values: {
    sum: input.values.reduce((a, b) => a + b, 0), sorted: [...input.values].sort((a, b) => a - b), encoding: canonical(input.object)
  } };
  return { plan, observations };
}
export function runDemo(root) {
  if (fs.existsSync(root)) throw new Error('Demo output already exists; use a new directory');
  const startedAt = new Date().toISOString();
  const { plan, observations } = demoPlan();
  const completed = appendRun(root, plan, observations, ROOT, startedAt, new Date().toISOString());
  verifyJournal(root);
  return { claim: completed.result.claim, outcome: completed.result.overall, recordHash: completed.entry.recordHash, semanticResultHash: hashJson(completed.result), directory: path.resolve(root) };
}
