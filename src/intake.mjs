import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT, readJson, checkSchema, unique, safeRelative } from './core.mjs';
import { digest, hashJson, parseJson } from './json.mjs';

const required = ['artifact-identity', 'production-fidelity', 'runner-isolation', 'service-coverage', 'initial-state', 'observation-coverage', 'repeatability', 'retention-rights'];

function evidenceFile(root, relative) {
  safeRelative(relative);
  let file = fs.realpathSync(root);
  for (const part of relative.split('/')) {
    file = path.join(file, part);
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error('Symlink evidence path');
  }
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > 16777216) throw new Error('Evidence size/type mismatch');
  return fs.readFileSync(file);
}

function validateRecord(record, loadEvidence) {
  checkSchema('intake', record);
  unique(record.criteria.map(c => c.id), 'intake criterion');
  unique(record.evidence.map(e => e.id), 'evidence ID');
  if (record.criteria.length !== required.length || required.some(id => !record.criteria.some(c => c.id === id))) throw new Error('Incomplete intake criteria');
  const evidence = new Map();
  for (const item of record.evidence) {
    if (digest(loadEvidence(item)) !== item.sha256) throw new Error(`Evidence digest mismatch: ${item.id}`);
    evidence.set(item.id, item);
  }
  for (const criterion of record.criteria) {
    unique(criterion.evidenceIds, 'criterion evidence reference');
    for (const id of criterion.evidenceIds) if (!evidence.has(id)) throw new Error(`Unknown evidence reference: ${id}`);
    if (criterion.status === 'verified') {
      const kind = criterion.id === 'artifact-identity' ? 'release-metadata' : criterion.id === 'retention-rights' ? 'rights-record' : 'runtime-observation';
      if (!criterion.evidenceIds.some(id => evidence.get(id).kind === kind)) throw new Error(`Verified ${criterion.id} requires ${kind}`);
    }
  }
}

function summary(record) {
  const unmet = record.criteria.filter(c => c.status !== 'verified').map(c => ({ id: c.id, status: c.status, finding: c.finding }));
  return { schemaVersion: '1.0.0', claim: 'INTAKE_REVIEW_ONLY', recordHash: hashJson(record), artifactSha256: record.artifact.sha256, readiness: unmet.length ? 'BLOCKED' : 'READY_FOR_EXECUTION', unmet };
}

export async function reviewIntake(record, artifactPath, evidenceRoot = ROOT) {
  validateRecord(record, item => evidenceFile(evidenceRoot, item.path));
  const stat = fs.lstatSync(artifactPath);
  if (!stat.isFile() || stat.size !== record.artifact.size) throw new Error('Candidate artifact size/type mismatch');
  const hash = createHash('sha256'); let size = 0;
  for await (const chunk of fs.createReadStream(artifactPath)) { hash.update(chunk); size += chunk.length; }
  if (size !== record.artifact.size || hash.digest('hex') !== record.artifact.sha256) throw new Error('Candidate artifact digest mismatch');
  return summary(record);
}

export async function reviewIntakeFile(recordPath, artifactPath) {
  return reviewIntake(readJson(recordPath), artifactPath);
}


export function verifyIntakeReview(reportPath, objectsRoot) {
  const report = readJson(reportPath);
  if (!/^[a-f0-9]{64}$/.test(report.recordHash ?? '')) throw new Error('Invalid intake record hash');
  const record = parseJson(evidenceFile(objectsRoot, report.recordHash));
  if (hashJson(record) !== report.recordHash) throw new Error('Archived intake record digest mismatch');
  validateRecord(record, item => evidenceFile(objectsRoot, item.sha256));
  if (hashJson(report) !== hashJson(summary(record))) throw new Error('Intake report differs from retained record');
  return { verified: true, claim: 'INTAKE_REVIEW_ONLY', artifactBytesRehashed: false };
}
