import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { archiveNativeQualification, verifyNativeQualification } from '../src/native-qualification.mjs';
import { canonical, digest, parseJson } from '../src/json.mjs';

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const PLAN = path.join(ROOT, 'infra/plans/bsv-desktop-native-qualification.json');

function evidence(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-native-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const json = value => Buffer.from(canonical(value) + '\n');
  const generic = json({ target: {}, result: {} });
  const files = {
    'app-first-launch.log': Buffer.from('HTTPS server listening\n'),
    'app-qualified-launch.log': Buffer.from('Certificate accepted by the network stack\n'),
    'app-version.txt': Buffer.from('2.8.5\nbundle_executable=BSV-Desktop\n'),
    'artifact.txt': Buffer.from('artifact_size=197754121\nartifact_sha256=05dec27dc461d4a9fbbe9aafdec53bdb6e947b46c0d1652e16342da47471d12e\n'),
    'authenticated-ui.json': json({ target: {}, result: { url: 'file:///app/index.html#/dashboard/apps', text: 'Your Balance', buttons: ['Logout'] } }),
    'authenticated-ui.png': Buffer.from([137, 80, 78, 71]),
    'bridge-manifest.json': json({ name: 'BSV Desktop' }),
    'certificate-verify.txt': Buffer.from('certificate verification successful.\n'),
    'codesign-details.txt': Buffer.from('Identifier=com.bsvblockchain.bsvdesktop\nAuthority=Developer ID Application: BSV Association (SV8SWTHA2H)\nTeamIdentifier=SV8SWTHA2H\n'),
    'codesign-verify.txt': Buffer.from('valid on disk\nsatisfies its Designated Requirement\n'),
    'create-wallet.json': generic,
    'direct-key-ui.json': generic,
    'environment.txt': Buffer.from('execution_started_at=2026-09-20T19:00:00Z\nImageOS=macos15\nImageVersion=20260907.0337.1\nrunner_arch=ARM64\nsource_revision=0123456789abcdef0123456789abcdef01234567\nProductVersion=15.7.9\nBuildVersion=24G830\n'),
    'gatekeeper.txt': Buffer.from('BSV Desktop.app: accepted\nsource=Notarized Developer ID\n'),
    'getNetwork.json': json({ network: 'mainnet' }),
    'getVersion.json': json({ version: 'wallet-brc100-1.0.0' }),
    'hdiutil-attach.txt': Buffer.from('mounted\n'),
    'hdiutil-detach.txt': Buffer.from('detached\n'),
    'initial-ui.json': generic,
    'isAuthenticated.json': json({ authenticated: true }),
    'pre-trust-ui.json': generic,
    'processes.txt': Buffer.from('BSV-Desktop\n'),
    'run-metadata.json': json({ capturedAt: '2026-09-20T19:01:00Z', repository: 'p2ppsr/interop', runId: '123', runAttempt: '1', runUrl: 'https://github.com/p2ppsr/interop/actions/runs/123', sourceRevision: '0123456789abcdef0123456789abcdef01234567', workflowRef: 'p2ppsr/interop/.github/workflows/native.yml@refs/heads/main' }),
    'screenshot.json': generic,
    'vault-confirm.json': generic,
    'vault-create.json': generic,
    'vault-fill.json': generic,
    'vault-ui.json': generic,
    'wallet-key-fill.json': generic,
    'wallet-login.json': generic
  };
  for (const [name, bytes] of Object.entries(files)) fs.writeFileSync(path.join(root, name), bytes);
  const sums = Object.entries(files).map(([name, bytes]) => `${digest(bytes)}  ${name}`).sort().join('\n') + '\n';
  fs.writeFileSync(path.join(root, 'SHA256SUMS'), sums);
  return root;
}

test('native evidence archives and verifies offline without issuing conformance', t => {
  const source = evidence(t), output = `${source}-bundle`;
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  const archived = archiveNativeQualification(PLAN, source, output);
  const verified = verifyNativeQualification(output);
  assert.equal(archived.overall, 'PASS');
  assert.equal(verified.overall, 'PASS');
  assert.equal(verified.assertions, 13);
  assert.equal(verified.claim, 'INFRASTRUCTURE_QUALIFICATION_ONLY');
  assert.equal(verified.artifactRetained, false);
});

test('native verifier rejects modified retained evidence', t => {
  const source = evidence(t), output = `${source}-bundle`;
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  archiveNativeQualification(PLAN, source, output);
  const record = parseJson(fs.readFileSync(path.join(output, 'record.json')));
  const target = record.evidence.find(item => item.name === 'getNetwork.json');
  fs.appendFileSync(path.join(output, 'objects', target.sha256), 'tamper');
  assert.throws(() => verifyNativeQualification(output), /digest mismatch/);
});
