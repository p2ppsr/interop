import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { canonical, digest, hashJson, parseJson } from './json.mjs';
import { checkSchema, readJson, unique } from './core.mjs';

const CLAIM = 'INFRASTRUCTURE_QUALIFICATION_ONLY';
const VERSION = '1.0.0';
const LAB_ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));

function plainFile(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Expected regular file: ${file}`);
  return fs.readFileSync(file);
}

function putObject(objects, bytes) {
  const hash = digest(bytes), target = path.join(objects, hash);
  if (fs.existsSync(target)) {
    if (!plainFile(target).equals(Buffer.from(bytes))) throw new Error('Content-addressed object collision');
  } else fs.writeFileSync(target, bytes, { flag: 'wx', mode: 0o644 });
  return hash;
}

function loadObject(objects, hash) {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid object hash');
  const bytes = plainFile(path.join(objects, hash));
  if (digest(bytes) !== hash) throw new Error(`Object digest mismatch: ${hash}`);
  return bytes;
}

function checkPlan(plan) {
  checkSchema('component-qualification-plan', plan);
  unique(plan.requiredOutput, 'required output assertion');
  if (plan.command.some(value => value.includes('\0'))) throw new Error('Command contains a null byte');
  for (const key of Object.keys(plan.environment ?? {})) {
    if (!/^[A-Z][A-Z0-9_]+$/.test(key)) throw new Error(`Invalid environment variable name: ${key}`);
  }
  for (const adapter of plan.adapters ?? []) {
    const file = path.resolve(LAB_ROOT, adapter.path);
    if (!file.startsWith(`${LAB_ROOT}${path.sep}`)) throw new Error('Adapter path escapes the laboratory repository');
    if (digest(plainFile(file)) !== adapter.sha256) throw new Error(`Adapter digest mismatch: ${adapter.path}`);
  }
  for (const input of plan.inputs ?? []) {
    if (plan.environment?.[input.environment] === undefined)
      throw new Error(`Input environment is not declared: ${input.environment}`);
  }
}

function sourceState(sourceRoot, expected) {
  const real = fs.realpathSync(sourceRoot);
  if (!fs.statSync(real).isDirectory()) throw new Error('Component source is not a directory');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: real, encoding: 'utf8' }).trim();
  const origin = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: real, encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: real, encoding: 'utf8' }).trim() !== '';
  if (commit !== expected.commit) throw new Error(`Component source commit ${commit} does not match ${expected.commit}`);
  if (origin !== expected.repository) throw new Error(`Component source origin ${origin} does not match ${expected.repository}`);
  if (dirty) throw new Error('Component source has tracked modifications');
  return { root: real, commit, origin, trackedState: 'clean' };
}

function evaluate(plan, observation) {
  const combined = `${observation.stdout}\n${observation.stderr}`;
  const outcomes = plan.requiredOutput.map(expected => ({
    expected,
    status: combined.includes(expected) ? 'PASS' : 'FAIL'
  }));
  outcomes.unshift({ expected: 'process exit code 0', status: observation.exitCode === 0 ? 'PASS' : 'FAIL' });
  return {
    schemaVersion: VERSION,
    claim: CLAIM,
    overall: outcomes.every(item => item.status === 'PASS') ? 'PASS' : 'FAIL',
    outcomes
  };
}

export function runComponentQualification(planFile, sourceRoot, output, runnerId) {
  if (fs.existsSync(output)) throw new Error('Qualification output already exists');
  const plan = readJson(planFile); checkPlan(plan);
  const source = sourceState(sourceRoot, plan.source);
  const execution = prepareExecution(source.root, plan.adapters ?? []);
  const planRoot = path.dirname(path.resolve(planFile));
  let configuredEnvironment, inputs, startedAt, endedAt, run;
  try {
    configuredEnvironment = Object.fromEntries(Object.entries(plan.environment ?? {}).map(([key, value]) => [
      key,
      value.replaceAll('${LAB_ROOT}', LAB_ROOT).replaceAll('${SOURCE_ROOT}', execution.root).replaceAll('${PLAN_ROOT}', planRoot)
    ]));
    inputs = (plan.inputs ?? []).map(input => {
      const file = configuredEnvironment[input.environment];
      const bytes = plainFile(file);
      if (digest(bytes) !== input.sha256) throw new Error(`Qualification input digest mismatch: ${input.environment}`);
      return { ...input, bytes, size: bytes.length };
    });
    startedAt = new Date().toISOString();
    run = spawnSync(plan.command[0], plan.command.slice(1), {
      cwd: execution.root,
      encoding: 'utf8',
      timeout: plan.timeoutSeconds * 1000,
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, ...configuredEnvironment, TESTCONTAINERS_RYUK_DISABLED: 'true', NO_COLOR: '1' }
    });
    endedAt = new Date().toISOString();
  } finally {
    execution.cleanup();
  }
  const observation = {
    schemaVersion: VERSION,
    claim: CLAIM,
    startedAt,
    endedAt,
    runner: {
      id: runnerId,
      platform: process.platform,
      architecture: process.arch,
      osRelease: os.release(),
      node: process.version,
      docker: commandVersion('docker', ['version', '--format', '{{.Server.Version}}']),
      go: commandVersion('go', ['version'])
    },
    source: {
      repository: source.origin,
      commit: source.commit,
      trackedState: source.trackedState,
      execution: execution.kind,
      adapters: execution.adapters
    },
    environment: plan.environment ?? {},
    inputs: inputs.map(({ bytes, ...input }) => input),
    command: plan.command,
    exitCode: run.status ?? (run.signal === null ? 255 : 254),
    signal: run.signal,
    timedOut: run.error?.code === 'ETIMEDOUT',
    stdout: run.stdout ?? '',
    stderr: `${run.stderr ?? ''}${run.error === undefined ? '' : `\n${run.error.message}`}`
  };
  const result = evaluate(plan, observation);
  fs.mkdirSync(output, { recursive: true });
  const objects = path.join(output, 'objects'); fs.mkdirSync(objects);
  const planHash = putObject(objects, canonical(plan));
  const inputHashes = inputs.map(input => putObject(objects, input.bytes));
  const observationHash = putObject(objects, canonical(observation));
  const resultHash = putObject(objects, canonical(result));
  const record = {
    schemaVersion: VERSION,
    kind: 'external-component-qualification',
    claim: CLAIM,
    startedAt,
    endedAt,
    planHash,
    inputHashes,
    observationHash,
    resultHash
  };
  fs.writeFileSync(path.join(output, 'record.json'), `${canonical(record)}\n`, { flag: 'wx', mode: 0o644 });
  return { recordHash: hashJson(record), overall: result.overall, outcomes: result.outcomes };
}

function prepareExecution(sourceRoot, adapters) {
  if (adapters.length === 0) return { root: sourceRoot, kind: 'pinned-source', adapters: [], cleanup() {} };
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-component-'));
  try {
    const archive = execFileSync('git', ['archive', '--format=tar', 'HEAD'], {
      cwd: sourceRoot,
      maxBuffer: 256 * 1024 * 1024
    });
    const archiveFile = path.join(temporary, 'source.tar');
    const root = path.join(temporary, 'source');
    fs.writeFileSync(archiveFile, archive);
    fs.mkdirSync(root);
    execFileSync('tar', ['-xf', archiveFile, '-C', root]);
    const recorded = [];
    for (const adapter of adapters) {
      const file = path.resolve(LAB_ROOT, adapter.path);
      execFileSync('git', ['apply', '--check', file], { cwd: root, encoding: 'utf8' });
      execFileSync('git', ['apply', file], { cwd: root, encoding: 'utf8' });
      recorded.push({ path: adapter.path, sha256: adapter.sha256, purpose: adapter.purpose });
    }
    return {
      root,
      kind: 'pinned-source-with-declared-adapters',
      adapters: recorded,
      cleanup() { fs.rmSync(temporary, { recursive: true, force: true }); }
    };
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

export function verifyComponentQualification(output) {
  const objects = path.join(output, 'objects');
  const record = parseJson(plainFile(path.join(output, 'record.json')));
  const plan = parseJson(loadObject(objects, record.planHash)); checkPlan(plan);
  const observation = parseJson(loadObject(objects, record.observationHash));
  const result = parseJson(loadObject(objects, record.resultHash));
  const inputHashes = record.inputHashes ?? [];
  if (inputHashes.length !== (plan.inputs ?? []).length) throw new Error('Component qualification input count mismatch');
  inputHashes.forEach((hash, index) => {
    const input = plan.inputs[index];
    const bytes = loadObject(objects, hash);
    if (hash !== input.sha256 || bytes.length !== observation.inputs[index].size)
      throw new Error(`Component qualification input mismatch at index ${index}`);
  });
  const replay = evaluate(plan, observation);
  if (canonical(replay) !== canonical(result)) throw new Error('Component qualification replay diverged');
  if (record.kind !== 'external-component-qualification' || record.claim !== CLAIM || result.claim !== CLAIM)
    throw new Error('Component qualification claim mismatch');
  return {
    verified: true,
    claim: CLAIM,
    recordHash: hashJson(record),
    overall: result.overall,
    assertions: result.outcomes.length,
    sourceCommit: observation.source.commit
  };
}

function commandVersion(executable, args) {
  try { return execFileSync(executable, args, { encoding: 'utf8', timeout: 10_000 }).trim(); }
  catch { return 'unavailable'; }
}
