import fs from 'node:fs';
import path from 'node:path';
import { canonical, digest, hashJson, parseJson } from './json.mjs';

const CLAIM = 'LAB_REFERENCE_PROFILE_ONLY';
const VERSION = '1.0.0';
const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));

function bytes(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Expected regular file: ${file}`);
  return fs.readFileSync(file);
}

function put(objects, value) {
  const hash = digest(value), target = path.join(objects, hash);
  if (fs.existsSync(target)) {
    if (!bytes(target).equals(Buffer.from(value))) throw new Error('Content-addressed object collision');
  } else fs.writeFileSync(target, value, { flag: 'wx', mode: 0o644 });
  return hash;
}

function load(objects, hash) {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid reference object hash');
  const value = bytes(path.join(objects, hash));
  if (digest(value) !== hash) throw new Error(`Reference object digest mismatch: ${hash}`);
  return value;
}

function validate(profileBytes, lockBytes, resultBytes) {
  const profile = parseJson(profileBytes);
  const lock = parseJson(lockBytes);
  const result = parseJson(resultBytes);
  if (profile.claim !== CLAIM || result.claim !== CLAIM) throw new Error('Reference claim mismatch');
  if (result.schema !== profile.resultSchema || result.profile !== 'reference' || result.outcome !== 'PASS')
    throw new Error('Reference result identity mismatch');
  if (result.seed !== profile.seed || Date.parse(result.startedAt) / 1000 !== Number(profile.startTime))
    throw new Error('Reference deterministic inputs mismatch');
  if (canonical(result.standards) !== canonical(profile.standards)) throw new Error('Reference standards mismatch');
  const assertions = Object.entries(result.assertions ?? {});
  if (assertions.length === 0 || assertions.some(([, value]) => value !== true))
    throw new Error('Reference result contains an unmet assertion');
  if (result.evidence.overlayStateDigest !== result.evidence.replayStateDigest)
    throw new Error('Reference overlay replay diverged');
  for (const [name, minimum] of Object.entries(profile.minimums)) {
    if (!Number.isSafeInteger(result.evidence[name]) || result.evidence[name] < minimum)
      throw new Error(`Reference minimum not met: ${name}`);
  }
  for (const name of ['assetId', 'plaintextSha256', 'lchSha256', 'firstPostTxid', 'updateTxid', 'overlayStateDigest', 'replayStateDigest', 'paymentTxid', 'uhrpStateDigest']) {
    if (!/^[a-f0-9]{64}$/.test(result.evidence[name])) throw new Error(`Reference digest is invalid: ${name}`);
  }
  if (lock.name !== '@tpnil/synthesis' || lock.version !== profile.version || lock.lockfileVersion !== 3)
    throw new Error('Reference package lock mismatch');
  return { profile, result, assertions: assertions.length };
}

export function archiveReferenceQualification(resultFile, output) {
  if (fs.existsSync(output)) throw new Error('Reference qualification output already exists');
  const profileBytes = bytes(path.join(ROOT, 'synthesis/reference-profile.json'));
  const lockBytes = bytes(path.join(ROOT, 'synthesis/package-lock.json'));
  const resultBytes = bytes(resultFile);
  const checked = validate(profileBytes, lockBytes, resultBytes);
  fs.mkdirSync(output, { recursive: true });
  const objects = path.join(output, 'objects'); fs.mkdirSync(objects);
  const record = {
    schemaVersion: VERSION,
    kind: 'reference-protocol-qualification',
    claim: CLAIM,
    profile: checked.profile.id,
    profileVersion: checked.profile.version,
    deterministicStartedAt: checked.result.startedAt,
    archivedAt: new Date().toISOString(),
    profileHash: put(objects, profileBytes),
    packageLockHash: put(objects, lockBytes),
    resultHash: put(objects, resultBytes)
  };
  fs.writeFileSync(path.join(output, 'record.json'), `${canonical(record)}\n`, { flag: 'wx', mode: 0o644 });
  return { archived: true, claim: CLAIM, recordHash: hashJson(record), assertions: checked.assertions };
}

export function verifyReferenceQualification(output) {
  const objects = path.join(output, 'objects');
  const record = parseJson(bytes(path.join(output, 'record.json')));
  if (record.kind !== 'reference-protocol-qualification' || record.claim !== CLAIM)
    throw new Error('Reference record claim mismatch');
  const checked = validate(
    load(objects, record.profileHash),
    load(objects, record.packageLockHash),
    load(objects, record.resultHash)
  );
  if (record.profile !== checked.profile.id || record.profileVersion !== checked.profile.version ||
      record.deterministicStartedAt !== checked.result.startedAt)
    throw new Error('Reference record metadata mismatch');
  return {
    verified: true,
    claim: CLAIM,
    outcome: checked.result.outcome,
    recordHash: hashJson(record),
    assertions: checked.assertions,
    profile: checked.profile.id,
    version: checked.profile.version
  };
}
