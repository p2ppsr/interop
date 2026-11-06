// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { sha256 } from '../components/messaging/identity.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function verifyMessaging(directory) {
  const result = JSON.parse(fs.readFileSync(path.join(directory, 'result.json')));
  assert.equal(result.schema, 'tpnil-messaging-result@1');
  assert.equal(result.claim, 'INFRASTRUCTURE_QUALIFICATION_ONLY');
  assert.equal(result.nativeWalletClaim, false);
  assert.equal(result.goNativeWebSockets, false);
  const candidates = ['components/messaging/profile.json', 'components/messaging/profiles/http-polling-v1.json'];
  const matching = candidates.find(file => sha256(fs.readFileSync(path.join(root, file))) === result.profileSha256);
  assert(matching, 'Unknown frozen messaging profile');
  const profile = JSON.parse(fs.readFileSync(path.join(root, matching)));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'components/messaging/sources.lock.json')));
  assert.deepEqual(result.components, lock.components);
  const evidence = new Set();
  for (const item of result.evidence) {
    assert.equal(typeof item.path, 'string'); assert(!path.isAbsolute(item.path) && !item.path.split(/[\\/]/).includes('..'));
    assert(!evidence.has(item.path)); evidence.add(item.path);
    assert.equal(sha256(fs.readFileSync(path.join(directory, item.path))), item.sha256, `Evidence changed: ${item.path}`);
  }
  for (const required of ['wire.json', 'funding.json', 'submissions.json']) assert(evidence.has(required), `Missing ${required}`);
  const paths = JSON.parse(fs.readFileSync(path.join(root, 'out/messaging-sources/paths.json')));
  const require = createRequire(path.join(paths['typescript-messagebox'], 'package.json'));
  const { Transaction } = await import(pathToFileURL(require.resolve('@bsv/sdk')).href);
  const fixture = JSON.parse(fs.readFileSync(path.join(root, profile.funding)));
  const tracker = { currentHeight: async () => 900100, isValidRootForHeight: async (merkleRoot, height) => height === fixture.fundingHeight && merkleRoot === fixture.merkleRoot };
  const paidIds = new Set();
  for (const implementation of ['typescript', 'go', 'go-adapted']) {
    const list = result.assertions.filter(a => a.implementation === implementation);
    const ids = new Set(list.map(a => a.id)); assert.equal(ids.size, list.length, 'Duplicate assertion');
    for (const id of Object.keys(profile.assertions)) if ((profile.appliesTo?.[id] ?? (id === 'discovery' ? ['typescript'] : ['typescript', 'go', 'go-adapted'])).includes(implementation)) assert(ids.has(id), `Missing ${implementation}/${id}`);
    for (const entry of list) assert(['PASS', 'FAIL', 'BLOCKED'].includes(entry.result));
    const paid = list.find(a => a.id === 'paid-internalization');
    if (paid.result === 'PASS') {
      const file = `${implementation}-payment.json`; assert(evidence.has(file));
      const payment = JSON.parse(fs.readFileSync(path.join(directory, file)));
      const tx = Transaction.fromBEEF(payment.request.payment.tx);
      assert.equal(tx.id('hex'), payment.txid); assert.equal(tx.id('hex'), paid.detail.txid);
      assert.equal(await tx.verify(tracker), true, 'Payment must preserve real mined ancestry and valid input scripts');
      assert(payment.recipientActions.actions.some(a => a.txid === payment.txid));
      const mapped = payment.request.payment.outputs.map(output => tx.outputs[output.outputIndex]);
      assert.equal(mapped.length, 1); assert.equal(mapped[0].satoshis, 23, 'Recipient fee differs from frozen oracle');
      const totalInput = tx.inputs.reduce((sum, input) => sum + input.sourceTransaction.outputs[input.sourceOutputIndex].satoshis, 0);
      const totalOutput = tx.outputs.reduce((sum, output) => sum + output.satoshis, 0);
      assert(totalInput >= totalOutput, 'Payment creates value');
      assert(!paidIds.has(payment.txid), 'Independent implementation runs reused a payment'); paidIds.add(payment.txid);
    }
  }
  const discovery = result.assertions.find(a => a.id === 'discovery');
  if (discovery.result === 'PASS') {
    assert(evidence.has('discovery.json'));
    const record = JSON.parse(fs.readFileSync(path.join(directory, 'discovery.json')));
    for (const item of [record.advertisement, record.revocation]) { const tx = Transaction.fromBEEF(item.beef); assert.equal(tx.id('hex'), item.txid); assert.equal(await tx.verify(tracker), true); }
    assert.equal(record.found.outputs.length, 1);
    assert.equal(Transaction.fromBEEF(record.found.outputs[0].beef).id('hex'), record.advertisement.txid);
  }
  assert(result.cleanup.every(entry => !entry.error && !entry.walletError && entry.running !== true && (entry.exitCode === undefined || entry.exitCode === 0) && entry.signal == null));
  for (const entry of result.cleanup) if (entry.bridge) assert(entry.bridge.httpListening === false && entry.bridge.databaseClosed === true && entry.bridge.socketCount === 0, 'Go socket bridge remains active');
  assert(result.cleanup.some(entry => entry.component === 'controlled-services' && entry.closed === true));
  return { verified: true, assertions: result.assertions.length, pass: result.assertions.filter(a => a.result === 'PASS').length, fail: result.assertions.filter(a => a.result === 'FAIL').length, blocked: result.assertions.filter(a => a.result === 'BLOCKED').length, paidTransactions: [...paidIds] };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) console.log(JSON.stringify(await verifyMessaging(path.resolve(process.argv[2] ?? 'out/messaging')), null, 2));
