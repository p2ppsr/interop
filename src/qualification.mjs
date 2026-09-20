import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { ROOT, artifactBytes, checkSchema, readJson, safeRelative, unique } from './core.mjs';
import { canonical, digest, hashJson, parseJson } from './json.mjs';

const CLAIM = 'INFRASTRUCTURE_QUALIFICATION_ONLY';
const VERSION = '1.0.0';

function plainFile(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Expected regular file: ${file}`);
  return fs.readFileSync(file);
}

function utcNow() { return new Date().toISOString(); }

function pointer(value, raw) {
  let current = value;
  for (const part of raw.slice(1).split('/')) {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, key)) return { found: false };
    current = current[key];
  }
  return { found: true, value: current };
}

function contentType(file) {
  const types = new Map([
    ['.css', 'text/css; charset=utf-8'], ['.html', 'text/html; charset=utf-8'],
    ['.ico', 'image/x-icon'], ['.js', 'text/javascript; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'], ['.png', 'image/png']
  ]);
  return types.get(path.extname(file).toLowerCase()) ?? 'application/octet-stream';
}

function resolveRequest(root, requestPath) {
  const decoded = decodeURIComponent(new URL(requestPath, 'http://loopback.invalid').pathname);
  const relative = decoded === '/' ? 'index.html' : decoded.slice(1);
  safeRelative(relative);
  const candidate = path.join(root, ...relative.split('/'));
  const realRoot = fs.realpathSync(root);
  const real = fs.realpathSync(candidate);
  if (path.dirname(real) !== realRoot && !path.dirname(real).startsWith(`${realRoot}${path.sep}`)) throw new Error('Request escaped web root');
  return real;
}

async function startServer(root, logicalOrigin, requestLog) {
  const expectedHost = new URL(logicalOrigin).hostname;
  const server = http.createServer((request, response) => {
    try {
      if (request.method !== 'GET' || request.headers.host !== expectedHost) {
        response.writeHead(request.method === 'GET' ? 421 : 405).end();
        return;
      }
      const file = resolveRequest(root, request.url ?? '/');
      const body = plainFile(file);
      const headers = { 'content-type': contentType(file), 'content-length': String(body.length), 'cache-control': 'no-store' };
      response.writeHead(200, headers).end(body);
      requestLog.push({ method: 'GET', path: request.url, status: 200, bodySha256: digest(body), size: body.length });
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found\n');
      requestLog.push({ method: 'GET', path: request.url, status: 404, bodySha256: digest(Buffer.from('not found\n')), size: 10 });
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return server;
}

async function request(server, logicalOrigin, requestPath) {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Server did not expose a TCP address');
  return await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: address.port, path: requestPath, method: 'GET', headers: { host: new URL(logicalOrigin).hostname } }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.once('error', reject); req.end();
  });
}

function close(server) { return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }

function checkPlan(plan) {
  checkSchema('qualification-plan', plan);
  unique(plan.assertions.map(assertion => assertion.id), 'qualification assertion ID');
  safeRelative(plan.artifact.path);
  for (const assertion of plan.assertions) {
    if (assertion.kind === 'response' && assertion.status === undefined) throw new Error(`${assertion.id}: response requires status`);
    if (assertion.kind === 'json-equals' && (assertion.pointer === undefined || !Object.hasOwn(assertion, 'expected'))) throw new Error(`${assertion.id}: json-equals requires pointer and expected`);
  }
}

function putObject(objects, bytes) {
  const hash = digest(bytes), target = path.join(objects, hash);
  if (fs.existsSync(target)) {
    if (!plainFile(target).equals(Buffer.from(bytes))) throw new Error('Content-addressed object collision');
  } else fs.writeFileSync(target, bytes, { flag: 'wx', mode: 0o644 });
  return hash;
}

function hostRecord(runnerId) {
  let revision = 'unavailable', dirty = true;
  try {
    revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim() !== '';
  } catch {}
  return { runnerId, platform: process.platform, architecture: process.arch, osRelease: os.release(), node: process.version, sourceRevision: revision, sourceDirty: dirty };
}

export async function runQualification(planFile, artifactRoot, output, runnerId) {
  if (fs.existsSync(output)) throw new Error('Qualification output already exists');
  const startedAt = utcNow();
  const plan = readJson(planFile); checkPlan(plan);
  const bytes = artifactBytes(artifactRoot, plan.artifact);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-qualification-'));
  const webroot = path.join(work, 'webroot'); fs.mkdirSync(webroot);
  let server;
  try {
    const rawInventory = execFileSync('python3', [path.join(ROOT, 'scripts/extract-webroot.py'), path.join(fs.realpathSync(artifactRoot), plan.artifact.path), webroot], { encoding: 'utf8' });
    const inventory = parseJson(Buffer.from(rawInventory.trim()));
    const requestLog = [], evidence = new Map(), outcomes = [];
    server = await startServer(webroot, plan.logicalOrigin, requestLog);
    const fetch = async requestPath => {
      const response = await request(server, plan.logicalOrigin, requestPath);
      evidence.set(digest(response.body), response.body);
      return response;
    };
    for (const assertion of plan.assertions) {
      try {
        const first = await fetch(assertion.path);
        let actual;
        if (assertion.kind === 'response') {
          actual = { status: first.status, contentType: first.headers['content-type'], bodySha256: digest(first.body) };
          const expected = { status: assertion.status, ...(assertion.contentType ? { contentType: assertion.contentType } : {}), ...(assertion.bodySha256 ? { bodySha256: assertion.bodySha256 } : {}) };
          const selected = Object.fromEntries(Object.keys(expected).map(key => [key, actual[key]]));
          if (canonical(selected) !== canonical(expected)) throw new Error(`response mismatch: ${canonical(selected)}`);
        } else if (assertion.kind === 'json-equals') {
          const parsed = parseJson(first.body), selected = pointer(parsed, assertion.pointer);
          actual = selected.found ? selected.value : null;
          if (!selected.found || canonical(selected.value) !== canonical(assertion.expected)) throw new Error(`JSON assertion mismatch at ${assertion.pointer}`);
        } else if (assertion.kind === 'repeat-equal') {
          const second = await fetch(assertion.path);
          actual = { first: digest(first.body), second: digest(second.body) };
          if (first.status !== second.status || !first.body.equals(second.body)) throw new Error('Repeated response changed');
        } else if (assertion.kind === 'reference-closure') {
          const html = first.body.toString('utf8');
          const references = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map(match => match[1]).sort();
          if (!references.length) throw new Error('No absolute asset references found');
          const fetched = [];
          for (const reference of references) {
            const response = await fetch(reference);
            fetched.push({ path: reference, status: response.status, bodySha256: digest(response.body) });
            if (response.status !== 200) throw new Error(`Unresolved reference ${reference}`);
          }
          actual = fetched;
        }
        outcomes.push({ id: assertion.id, status: 'PASS', actual });
      } catch (error) {
        outcomes.push({ id: assertion.id, status: 'FAIL', reason: error.message });
      }
    }
    await close(server); server = undefined;
    const endedAt = utcNow();
    const observations = { schemaVersion: VERSION, claim: CLAIM, startedAt, endedAt, host: hostRecord(runnerId), logicalOrigin: plan.logicalOrigin, artifact: { id: plan.artifact.id, sha256: digest(bytes), size: bytes.length }, inventory, requests: requestLog };
    const result = { schemaVersion: VERSION, claim: CLAIM, planHash: hashJson(plan), observationsHash: hashJson(observations), overall: outcomes.every(item => item.status === 'PASS') ? 'PASS' : 'FAIL', outcomes };
    fs.mkdirSync(output, { recursive: false });
    const objects = path.join(output, 'objects'); fs.mkdirSync(objects);
    const artifactHash = putObject(objects, bytes);
    for (const [hash, body] of evidence) if (putObject(objects, body) !== hash) throw new Error('Evidence digest mismatch');
    const planHash = putObject(objects, canonical(plan));
    const observationsHash = putObject(objects, canonical(observations));
    const resultHash = putObject(objects, canonical(result));
    const record = { schemaVersion: VERSION, kind: 'infrastructure-qualification', claim: CLAIM, startedAt, endedAt, planHash, observationsHash, resultHash, artifactHash, evidenceHashes: [...evidence.keys()].sort() };
    fs.writeFileSync(path.join(output, 'record.json'), canonical(record) + '\n', { flag: 'wx', mode: 0o644 });
    return { recordHash: hashJson(record), overall: result.overall, outcomes };
  } finally {
    if (server) await close(server).catch(() => {});
    fs.rmSync(work, { recursive: true, force: true });
  }
}

export function verifyQualification(output) {
  const record = parseJson(plainFile(path.join(output, 'record.json')));
  const objects = path.join(output, 'objects');
  const load = hash => {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid object hash');
    const bytes = plainFile(path.join(objects, hash));
    if (digest(bytes) !== hash) throw new Error(`Object digest mismatch: ${hash}`);
    return bytes;
  };
  const plan = parseJson(load(record.planHash)), observations = parseJson(load(record.observationsHash)), result = parseJson(load(record.resultHash));
  checkPlan(plan);
  if (record.claim !== CLAIM || record.kind !== 'infrastructure-qualification' || result.claim !== CLAIM || observations.claim !== CLAIM) throw new Error('Qualification claim mismatch');
  if (hashJson(plan) !== result.planHash || hashJson(observations) !== result.observationsHash) throw new Error('Run binding mismatch');
  const artifact = load(record.artifactHash);
  if (artifact.length !== observations.artifact.size || digest(artifact) !== observations.artifact.sha256) throw new Error('Artifact observation mismatch');
  for (const hash of record.evidenceHashes) load(hash);
  const referenced = new Set(observations.requests.map(item => item.bodySha256));
  for (const hash of referenced) if (!record.evidenceHashes.includes(hash)) throw new Error(`Missing request evidence: ${hash}`);
  if (!['PASS', 'FAIL'].includes(result.overall) || result.outcomes.some(item => !['PASS', 'FAIL'].includes(item.status))) throw new Error('Invalid qualification result');
  return { verified: true, claim: CLAIM, recordHash: hashJson(record), overall: result.overall, assertions: result.outcomes.length, sourceRevision: observations.host.sourceRevision, sourceDirty: observations.host.sourceDirty };
}
