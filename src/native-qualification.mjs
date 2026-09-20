import fs from 'node:fs';
import path from 'node:path';
import { checkSchema, readJson, safeRelative } from './core.mjs';
import { canonical, digest, equal, hashJson, parseJson } from './json.mjs';

const CLAIM = 'INFRASTRUCTURE_QUALIFICATION_ONLY';
const VERSION = '1.0.0';
const REQUIRED = [
  'app-first-launch.log', 'app-qualified-launch.log', 'app-version.txt', 'artifact.txt',
  'authenticated-ui.json', 'authenticated-ui.png', 'bridge-manifest.json',
  'certificate-verify.txt', 'codesign-details.txt', 'codesign-verify.txt',
  'create-wallet.json', 'direct-key-ui.json', 'environment.txt', 'gatekeeper.txt',
  'getNetwork.json', 'getVersion.json', 'hdiutil-attach.txt', 'hdiutil-detach.txt',
  'initial-ui.json', 'isAuthenticated.json', 'pre-trust-ui.json', 'processes.txt',
  'run-metadata.json', 'screenshot.json', 'vault-confirm.json', 'vault-create.json',
  'vault-fill.json', 'vault-ui.json', 'wallet-key-fill.json', 'wallet-login.json'
];

function plainFile(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Expected regular file: ${file}`);
  return fs.readFileSync(file);
}

function keyValues(bytes) {
  const result = {};
  for (const line of bytes.toString('utf8').split('\n').filter(Boolean)) {
    const index = line.indexOf('=');
    if (index > 0) result[line.slice(0, index)] = line.slice(index + 1);
    else {
      const match = /^([^:]+):\s*(.*)$/.exec(line);
      if (match) result[match[1]] = match[2];
    }
  }
  return result;
}

function evidenceFiles(root) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  if (entries.some(entry => !entry.isFile() || entry.isSymbolicLink())) throw new Error('Native evidence must be a flat regular-file directory');
  const names = entries.map(entry => entry.name).filter(name => name !== 'SHA256SUMS').sort();
  for (const name of names) safeRelative(name);
  for (const name of REQUIRED) if (!names.includes(name)) throw new Error(`Missing native evidence: ${name}`);
  const lines = plainFile(path.join(root, 'SHA256SUMS')).toString('utf8').trimEnd().split('\n');
  if (!lines.length || [...lines].sort().join('\n') !== lines.join('\n')) throw new Error('Native checksum inventory is not sorted');
  const inventory = new Map();
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9_.-]+)$/.exec(line);
    if (!match || inventory.has(match[2])) throw new Error('Invalid native checksum inventory');
    inventory.set(match[2], match[1]);
  }
  if (!equal([...inventory.keys()].sort(), names)) throw new Error('Native checksum inventory does not cover the evidence directory');
  const files = new Map();
  for (const name of names) {
    const bytes = plainFile(path.join(root, name));
    if (digest(bytes) !== inventory.get(name)) throw new Error(`Native evidence digest mismatch: ${name}`);
    files.set(name, bytes);
  }
  return files;
}

function parseEvidence(plan, files) {
  const text = name => files.get(name).toString('utf8');
  const json = name => parseJson(files.get(name));
  const environment = keyValues(files.get('environment.txt'));
  const artifact = keyValues(files.get('artifact.txt'));
  const version = keyValues(Buffer.from(`appVersion=${text('app-version.txt').split('\n')[0]}\n${text('app-version.txt').split('\n').slice(1).join('\n')}`));
  const signing = keyValues(files.get('codesign-details.txt'));
  const gatekeeper = text('gatekeeper.txt');
  const metadata = json('run-metadata.json');
  if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/[0-9]+$/.test(metadata.runUrl ?? '')) throw new Error('Invalid native run URL');
  if (metadata.sourceRevision !== environment.source_revision) throw new Error('Native source revision mismatch');
  const evidence = [...files].map(([name, bytes]) => ({ name, sha256: digest(bytes), size: bytes.length }));
  return {
    schemaVersion: VERSION,
    claim: CLAIM,
    startedAt: environment.execution_started_at,
    endedAt: metadata.capturedAt,
    run: metadata,
    runner: {
      imageOS: environment.ImageOS,
      imageVersion: environment.ImageVersion,
      architecture: environment.runner_arch,
      productVersion: environment.ProductVersion,
      buildVersion: environment.BuildVersion
    },
    artifact: { id: plan.artifact.id, sha256: artifact.artifact_sha256, size: Number(artifact.artifact_size), retainedInBundle: false },
    application: {
      version: version.appVersion,
      executable: version.bundle_executable,
      bundleIdentifier: signing.Identifier,
      teamIdentifier: signing.TeamIdentifier,
      signingAuthorities: text('codesign-details.txt').split('\n').filter(line => line.startsWith('Authority=')).map(line => line.slice(10)),
      signatureVerified: text('codesign-verify.txt').includes('valid on disk') && text('codesign-verify.txt').includes('satisfies its Designated Requirement'),
      gatekeeperAccepted: gatekeeper.includes(': accepted') && gatekeeper.includes(`source=${plan.expected.gatekeeperSource}`),
      certificateVerified: text('certificate-verify.txt').includes('certificate verification successful')
    },
    bridge: {
      manifestName: json('bridge-manifest.json').name,
      authenticated: json('isAuthenticated.json').authenticated,
      network: json('getNetwork.json').network,
      version: json('getVersion.json').version
    },
    authenticatedUiObserved: json('authenticated-ui.json').result?.url?.includes('#/dashboard/') === true && json('authenticated-ui.json').result?.buttons?.includes('Logout') === true,
    evidence
  };
}

function result(plan, observations) {
  const checks = [
    ['NATIVE-001', { sha256: plan.artifact.sha256, size: plan.artifact.size }, { sha256: observations.artifact.sha256, size: observations.artifact.size }],
    ['NATIVE-002', true, observations.application.signatureVerified],
    ['NATIVE-003', plan.expected.bundleIdentifier, observations.application.bundleIdentifier],
    ['NATIVE-004', plan.expected.teamIdentifier, observations.application.teamIdentifier],
    ['NATIVE-005', true, observations.application.signingAuthorities.includes(plan.expected.signingAuthority)],
    ['NATIVE-006', true, observations.application.gatekeeperAccepted],
    ['NATIVE-007', plan.expected.appVersion, observations.application.version],
    ['NATIVE-008', true, observations.application.certificateVerified],
    ['NATIVE-009', plan.expected.manifestName, observations.bridge.manifestName],
    ['NATIVE-010', true, observations.bridge.authenticated],
    ['NATIVE-011', plan.expected.network, observations.bridge.network],
    ['NATIVE-012', plan.expected.bridgeVersion, observations.bridge.version],
    ['NATIVE-013', true, observations.authenticatedUiObserved]
  ];
  const outcomes = checks.map(([id, expected, actual]) => ({ id, status: equal(expected, actual) ? 'PASS' : 'FAIL', expected, actual }));
  return { schemaVersion: VERSION, claim: CLAIM, planHash: hashJson(plan), observationsHash: hashJson(observations), overall: outcomes.every(item => item.status === 'PASS') ? 'PASS' : 'FAIL', outcomes };
}

function putObject(root, bytes) {
  const hash = digest(bytes), target = path.join(root, hash);
  if (fs.existsSync(target)) {
    if (!plainFile(target).equals(Buffer.from(bytes))) throw new Error('Content-addressed object collision');
  } else fs.writeFileSync(target, bytes, { flag: 'wx', mode: 0o644 });
  return hash;
}

function loadObject(root, hash) {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid native object hash');
  const bytes = plainFile(path.join(root, hash));
  if (digest(bytes) !== hash) throw new Error(`Native object digest mismatch: ${hash}`);
  return bytes;
}

export function archiveNativeQualification(planFile, evidenceRoot, output) {
  if (fs.existsSync(output)) throw new Error('Native qualification output already exists');
  const plan = readJson(planFile); checkSchema('native-qualification-plan', plan);
  const files = evidenceFiles(evidenceRoot);
  const observations = parseEvidence(plan, files);
  const evaluated = result(plan, observations);
  fs.mkdirSync(path.join(output, 'objects'), { recursive: true });
  const objects = path.join(output, 'objects');
  for (const bytes of files.values()) putObject(objects, bytes);
  const planHash = putObject(objects, canonical(plan));
  const observationsHash = putObject(objects, canonical(observations));
  const resultHash = putObject(objects, canonical(evaluated));
  const record = { schemaVersion: VERSION, kind: 'native-infrastructure-qualification', claim: CLAIM, startedAt: observations.startedAt, endedAt: observations.endedAt, planHash, observationsHash, resultHash, artifact: observations.artifact, evidence: observations.evidence };
  fs.writeFileSync(path.join(output, 'record.json'), canonical(record) + '\n', { flag: 'wx', mode: 0o644 });
  return { recordHash: hashJson(record), overall: evaluated.overall, assertions: evaluated.outcomes.length, runUrl: observations.run.runUrl };
}

export function verifyNativeQualification(output) {
  const record = parseJson(plainFile(path.join(output, 'record.json')));
  const objects = path.join(output, 'objects');
  const plan = parseJson(loadObject(objects, record.planHash)); checkSchema('native-qualification-plan', plan);
  const observations = parseJson(loadObject(objects, record.observationsHash));
  const recordedResult = parseJson(loadObject(objects, record.resultHash));
  if (record.claim !== CLAIM || record.kind !== 'native-infrastructure-qualification' || observations.claim !== CLAIM || recordedResult.claim !== CLAIM) throw new Error('Native qualification claim mismatch');
  const files = new Map(record.evidence.map(item => {
    const bytes = loadObject(objects, item.sha256);
    if (bytes.length !== item.size) throw new Error(`Native evidence size mismatch: ${item.name}`);
    return [item.name, bytes];
  }));
  const recomputedObservations = parseEvidence(plan, files);
  if (!equal(observations, recomputedObservations)) throw new Error('Native observations do not match retained evidence');
  const recomputedResult = result(plan, observations);
  if (!equal(recordedResult, recomputedResult)) throw new Error('Native result does not match retained evidence');
  if (!equal(record.artifact, observations.artifact) || record.startedAt !== observations.startedAt || record.endedAt !== observations.endedAt) throw new Error('Native record binding mismatch');
  return { verified: true, claim: CLAIM, recordHash: hashJson(record), overall: recordedResult.overall, assertions: recordedResult.outcomes.length, runUrl: observations.run.runUrl, artifactRetained: observations.artifact.retainedInBundle };
}
