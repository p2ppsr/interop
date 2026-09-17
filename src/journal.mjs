import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { canonical, digest, hashJson, parseJson, equal } from './json.mjs';
import { artifactBytes, checkPlan, checkSchema, evaluate, VERSION } from './core.mjs';

function plainFile(file) {
  if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) throw new Error('Journal object must be a regular file');
  return fs.readFileSync(file);
}
function directory(dir) {
  fs.mkdirSync(dir, { recursive: true });
  if (fs.lstatSync(dir).isSymbolicLink() || !fs.statSync(dir).isDirectory()) throw new Error('Journal directory cannot be a symlink');
}
function putObject(root, bytes) {
  const hash = digest(bytes), dest = path.join(root, 'objects', hash);
  if (fs.existsSync(dest)) {
    if (!plainFile(dest).equals(Buffer.from(bytes))) throw new Error('Existing content-addressed object was modified');
    return hash;
  }
  const tmp = path.join(root, 'objects', `.staging-${randomUUID()}`);
  const fd = fs.openSync(tmp, 'wx', 0o644);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try { fs.linkSync(tmp, dest); } finally { fs.unlinkSync(tmp); }
  return hash;
}
function object(root, hash, json = true) {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid object digest');
  if (fs.lstatSync(path.join(root, 'objects')).isSymbolicLink()) throw new Error('Symlink object store');
  const bytes = plainFile(path.join(root, 'objects', hash));
  if (digest(bytes) !== hash) throw new Error('Object digest mismatch');
  if (!json) return bytes;
  const parsed = parseJson(bytes);
  if (canonical(parsed) !== bytes.toString('utf8')) throw new Error('Noncanonical JSON object');
  return parsed;
}
function exactKeys(value, names) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== [...names].sort().join(',')) throw new Error('Unexpected journal fields');
}
function utc(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error('Expected canonical UTC timestamp');
}
function verifyRecord(root, hash) {
  const record = object(root, hash);
  exactKeys(record, ['schemaVersion', 'kind', 'startedAt', 'endedAt', 'planHash', 'observationsHash', 'resultHash', 'artifactHashes']);
  if (record.schemaVersion !== VERSION || record.kind !== 'laboratory-self-test') throw new Error('Unsupported journal record');
  utc(record.startedAt); utc(record.endedAt);
  if (record.startedAt > record.endedAt) throw new Error('Run ends before it starts');
  const plan = object(root, record.planHash), observations = object(root, record.observationsHash), result = object(root, record.resultHash);
  checkPlan(plan); checkSchema('self-test-observations', observations);
  if (!equal(record.artifactHashes, plan.artifacts.map(a => a.sha256))) throw new Error('Artifact closure mismatch');
  for (const artifact of plan.artifacts) {
    if (object(root, artifact.sha256, false).length !== artifact.size) throw new Error('Archived artifact size mismatch');
  }
  if (!equal(evaluate(plan, observations), result)) throw new Error('Report does not match replayed evidence');
  return { record, result };
}
export function verifyJournal(root) {
  if (fs.lstatSync(root).isSymbolicLink()) throw new Error('Symlink journal root');
  const raw = plainFile(path.join(root, 'journal.jsonl')).toString('utf8');
  if (!raw || !raw.endsWith('\n')) throw new Error('Empty or interrupted journal');
  const lines = raw.slice(0, -1).split('\n');
  const entries = [], results = [], seen = new Set(); let previousHash = null;
  for (const [sequence, line] of lines.entries()) {
    const entry = parseJson(line);
    exactKeys(entry, ['sequence', 'timestamp', 'recordHash', 'previousHash', 'hash']);
    if (canonical(entry) !== line) throw new Error('Noncanonical journal entry');
    const { hash, ...body } = entry;
    if (entry.sequence !== sequence || entry.previousHash !== previousHash || hashJson(body) !== hash) throw new Error('Broken journal chain');
    if (seen.has(entry.recordHash)) throw new Error('Duplicate run record');
    seen.add(entry.recordHash); utc(entry.timestamp);
    const { record, result } = verifyRecord(root, entry.recordHash);
    if (entry.timestamp !== record.endedAt) throw new Error('Journal timestamp mismatch');
    entries.push(entry); results.push(result); previousHash = hash;
  }
  return { entries, results, head: previousHash };
}
export function appendRun(root, plan, observations, artifactRoot, startedAt, endedAt) {
  checkPlan(plan); checkSchema('self-test-observations', observations);
  utc(startedAt); utc(endedAt);
  if (startedAt > endedAt) throw new Error('Run ends before it starts');
  const bytes = plan.artifacts.map(a => artifactBytes(artifactRoot, a));
  const result = evaluate(plan, observations);
  directory(root); directory(path.join(root, 'objects'));
  const lock = path.join(root, '.writer.lock');
  fs.mkdirSync(lock); // Fail closed for active or stale writer locks.
  try {
    const journal = path.join(root, 'journal.jsonl');
    const prior = fs.existsSync(journal) ? verifyJournal(root) : { entries: [], head: null };
    const artifactHashes = bytes.map(b => putObject(root, b));
    const planHash = putObject(root, canonical(plan));
    const observationsHash = putObject(root, canonical(observations));
    const resultHash = putObject(root, canonical(result));
    const record = { schemaVersion: VERSION, kind: 'laboratory-self-test', startedAt, endedAt, planHash, observationsHash, resultHash, artifactHashes };
    const recordHash = putObject(root, canonical(record));
    if (prior.entries.some(e => e.recordHash === recordHash)) throw new Error('Duplicate run record');
    const body = { sequence: prior.entries.length, timestamp: endedAt, recordHash, previousHash: prior.head };
    const entry = { ...body, hash: hashJson(body) };
    const fd = fs.openSync(journal, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_APPEND | fs.constants.O_NOFOLLOW, 0o644);
    try { fs.writeFileSync(fd, canonical(entry) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    return { entry, result };
  } finally { fs.rmdirSync(lock); }
}
export function verifyPrefix(oldRoot, newRoot) {
  const oldState = verifyJournal(oldRoot), newState = verifyJournal(newRoot);
  if (newState.entries.length < oldState.entries.length || !equal(oldState.entries, newState.entries.slice(0, oldState.entries.length))) throw new Error('Published journal prefix changed');
  return { retainedEntries: oldState.entries.length, addedEntries: newState.entries.length - oldState.entries.length };
}
