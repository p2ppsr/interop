import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonical, digest, hashJson, parseJson, validate, equal } from './json.mjs';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const VERSION = '0.1.0';
export const readJson = file => parseJson(fs.readFileSync(file));
const schemas = new Map();
export function checkSchema(name, value) {
  if (!schemas.has(name)) schemas.set(name, readJson(path.join(ROOT, 'schemas', `${name}.schema.json`)));
  validate(schemas.get(name), value);
}
export function unique(values, label) {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label}`);
}
export function checkPlan(plan) {
  checkSchema('self-test-plan', plan);
  unique(plan.assertions.map(a => a.id), 'assertion ID');
  unique(plan.artifacts.map(a => a.id), 'artifact ID');
  unique(plan.artifacts.map(a => a.path), 'artifact path');
  for (const artifact of plan.artifacts) safeRelative(artifact.path);
}
export function safeRelative(p) {
  if (!p || p.includes('\\') || p.includes('\0') || path.posix.isAbsolute(p) || p.split('/').some(x => !x || x === '.' || x === '..') || /^[A-Za-z]:/.test(p)) {
    throw new Error('Unsafe relative artifact path');
  }
  return p;
}
export function artifactBytes(root, artifact) {
  safeRelative(artifact.path);
  let current = fs.realpathSync(root);
  for (const part of artifact.path.split('/')) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Symlink artifact path');
  }
  const stat = fs.statSync(current);
  if (!stat.isFile() || stat.size !== artifact.size || stat.size > 16777216) throw new Error('Artifact size/type mismatch');
  const bytes = fs.readFileSync(current);
  if (digest(bytes) !== artifact.sha256) throw new Error('Artifact digest mismatch');
  return bytes;
}
function pointer(value, p) {
  if (p === '') return { found: true, value };
  for (const raw of p.slice(1).split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/.test(key)) return { found: false };
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) return { found: false };
    value = value[key];
  }
  return { found: true, value };
}
export function evaluate(plan, observations) {
  checkPlan(plan); checkSchema('self-test-observations', observations);
  const outcomes = plan.assertions.map(assertion => {
    const actual = pointer(observations.values, assertion.path);
    return { id: assertion.id, requirementId: assertion.requirementId,
      status: !actual.found ? 'BLOCKED' : equal(actual.value, assertion.expected) ? 'PASS' : 'FAIL',
      reason: !actual.found ? 'Missing required observation' : 'Canonical equality',
      expected: assertion.expected, ...(actual.found ? { actual: actual.value } : {}) };
  });
  const overall = outcomes.some(x => x.status === 'FAIL') ? 'FAIL' : outcomes.some(x => x.status === 'BLOCKED') ? 'BLOCKED' : 'PASS';
  return { schemaVersion: VERSION, claim: 'LAB_SELF_TEST_ONLY', planHash: hashJson(plan), observationsHash: hashJson(observations), overall, outcomes };
}
export function checkCatalog(catalog) {
  checkSchema('catalog', catalog);
  unique(catalog.vectors.map(v => v.id), 'vector ID');
  unique(catalog.vectors.map(v => v.requirementId), 'requirement ID');
  for (const v of catalog.vectors) {
    if (!v.id.startsWith(`${catalog.id}-V`) || !v.requirementId.startsWith(`${catalog.id}-R`)) throw new Error('Catalog ID namespace mismatch');
    if (v.origin === 'standard' && !/^https:\/\/github\.com\/[^/]+\/[^/]+\/blob\/[0-9a-f]{40}\//.test(v.reference)) throw new Error('Standard reference must pin a source commit');
  }
}
export function checkRepository() {
  const catalogs = [1, 2, 3, 4].map(n => readJson(path.join(ROOT, 'programs', `ISI-${n}`, VERSION, 'catalog.json')));
  catalogs.forEach(checkCatalog);
  const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
  if (version !== VERSION || readJson(path.join(ROOT, 'package.json')).version !== VERSION) throw new Error('Laboratory version mismatch');
  for (const catalog of catalogs) {
    if (catalog.itcve.id !== 'ITCVE-1' || catalog.itcve.version !== VERSION) throw new Error('Unknown environment');
    for (const vector of catalog.vectors) {
      if (!vector.reference.startsWith('https://')) {
        safeRelative(vector.reference);
        if (!fs.existsSync(path.join(ROOT, vector.reference))) throw new Error(`Missing reference ${vector.reference}`);
      }
    }
  }
  return { catalogs: catalogs.length, draftVectors: catalogs.reduce((n, c) => n + c.vectors.length, 0), executableSutVectors: 0 };
}
