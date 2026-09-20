import fs from 'node:fs';
import path from 'node:path';
import { canonical, digest, hashJson, parseJson } from './json.mjs';

const CLAIM = 'TERANODE_REGTEST_RUNTIME_QUALIFICATION';
const VERSION = '1.0.0';

function fileBytes(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Expected regular file: ${file}`);
  return fs.readFileSync(file);
}

function putObject(objects, bytes) {
  const hash = digest(bytes), target = path.join(objects, hash);
  if (fs.existsSync(target)) {
    if (!fileBytes(target).equals(Buffer.from(bytes))) throw new Error('Content-addressed object collision');
  } else fs.writeFileSync(target, bytes, { flag: 'wx', mode: 0o644 });
  return hash;
}

function loadObject(objects, hash) {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid object hash');
  const bytes = fileBytes(path.join(objects, hash));
  if (digest(bytes) !== hash) throw new Error(`Object digest mismatch: ${hash}`);
  return bytes;
}

function validate(profileBytes, runtimeBytes, resultBytes) {
  const profile = parseJson(profileBytes);
  const runtime = parseJson(runtimeBytes);
  const result = parseJson(resultBytes);
  if (result.claim !== CLAIM || result.outcome !== 'PASS') throw new Error('Runtime result is not a passing qualification');
  if (result.schema !== 'tpnil-teranode-probe-result@1.0.0') throw new Error('Unsupported runtime result schema');
  if (profile.id !== runtime.profile || profile.id !== result.profile) throw new Error('Runtime profile identity mismatch');
  const profileSha256 = digest(profileBytes);
  if (runtime.profileSha256 !== profileSha256 || result.profileSha256 !== profileSha256)
    throw new Error('Runtime profile digest mismatch');
  if (
    profile.source.repository !== runtime.source.repository ||
    profile.source.commit !== runtime.source.commit ||
    profile.source.repository !== result.source.repository ||
    profile.source.commit !== result.source.commit
  ) throw new Error('Runtime source pin mismatch');
  if (
    profile.image.reference !== result.image.configuredReference ||
    profile.image.indexDigest !== result.image.configuredIndexDigest
  ) throw new Error('Runtime image pin mismatch');
  const assertions = Object.entries(result.assertions ?? {});
  if (assertions.length === 0 || assertions.some(([, value]) => value !== true))
    throw new Error('Runtime qualification contains an unmet assertion');
  return { profile, runtime, result, profileSha256, assertionCount: assertions.length };
}

export function archiveRuntimeQualification(profileFile, runtimeFile, resultFile, output) {
  if (fs.existsSync(output)) throw new Error('Runtime qualification output already exists');
  const profileBytes = fileBytes(profileFile);
  const runtimeBytes = fileBytes(runtimeFile);
  const resultBytes = fileBytes(resultFile);
  const checked = validate(profileBytes, runtimeBytes, resultBytes);
  fs.mkdirSync(output, { recursive: true });
  const objects = path.join(output, 'objects'); fs.mkdirSync(objects);
  const profileHash = putObject(objects, profileBytes);
  const runtimeHash = putObject(objects, runtimeBytes);
  const resultHash = putObject(objects, resultBytes);
  const record = {
    schemaVersion: VERSION,
    kind: 'runtime-qualification',
    claim: CLAIM,
    completedAt: checked.result.completedAt,
    profile: checked.profile.id,
    profileHash,
    runtimeHash,
    resultHash
  };
  fs.writeFileSync(path.join(output, 'record.json'), `${canonical(record)}\n`, { flag: 'wx', mode: 0o644 });
  return { archived: true, claim: CLAIM, recordHash: hashJson(record), assertions: checked.assertionCount };
}

export function verifyRuntimeQualification(output) {
  const objects = path.join(output, 'objects');
  const record = parseJson(fileBytes(path.join(output, 'record.json')));
  if (record.kind !== 'runtime-qualification' || record.claim !== CLAIM) throw new Error('Runtime record claim mismatch');
  const checked = validate(
    loadObject(objects, record.profileHash),
    loadObject(objects, record.runtimeHash),
    loadObject(objects, record.resultHash)
  );
  if (record.profile !== checked.profile.id || record.completedAt !== checked.result.completedAt)
    throw new Error('Runtime record metadata mismatch');
  return {
    verified: true,
    claim: CLAIM,
    outcome: checked.result.outcome,
    recordHash: hashJson(record),
    assertions: checked.assertionCount,
    sourceCommit: checked.result.source.commit,
    transactionId: checked.result.evidence.acceptedTxid
  };
}
