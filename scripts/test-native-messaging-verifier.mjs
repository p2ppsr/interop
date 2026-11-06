// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifyNativeMessaging } from './verify-native-messaging.mjs';
import { canonicalMessageEvidence, messageEvidenceHash } from '../components/messaging/evidence.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const original = path.resolve(process.argv[2]); await verifyNativeMessaging(original);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-native-message-verifier-'));
const read = file => JSON.parse(fs.readFileSync(path.join(directory, file)));
const write = (file, data) => fs.writeFileSync(path.join(directory, file), JSON.stringify(data));
function rebind(result) { for (const item of result.evidence) item.sha256 = messageEvidenceHash(read(item.path), item.encoding); write('result.json', result); }
try {
  fs.cpSync(original, directory, { recursive: true });
  let result = read('result.json'), payment = read('typescript-native-payment.json');
  payment.recipientActions.actions = []; write('typescript-native-payment.json', payment); rebind(result);
  await assert.rejects(verifyNativeMessaging(directory), /Exact recipient wallet receipt absent/);
  fs.cpSync(original, directory, { recursive: true });
  result = read('result.json'); payment = read('typescript-native-payment.json');
  const paths = JSON.parse(fs.readFileSync('out/messaging-sources/paths.json'));
  const require = createRequire(path.join(paths['typescript-messagebox'], 'package.json'));
  const { Transaction } = await import(pathToFileURL(require.resolve('@bsv/sdk')).href);
  const transaction = Transaction.fromBEEF(payment.request.payment.tx); transaction.outputs[1].satoshis += 1;
  payment.request.payment.tx = transaction.toAtomicBEEF(); payment.txid = transaction.id('hex');
  write('typescript-native-payment.json', payment); rebind(result);
  await assert.rejects(verifyNativeMessaging(directory), /Payment script\/ancestry invalid|Script evaluation error/);
  // Exercise the real native envelope writer, including recursive canonical
  // key sorting and redaction. Pretty-printing alone does not model this path.
  fs.rmSync(directory, { recursive: true }); fs.mkdirSync(directory);
  const valid = JSON.parse(fs.readFileSync(path.join(original, 'result.json')));
  const values = Object.fromEntries(valid.evidence.map(item => [item.path, JSON.parse(fs.readFileSync(path.join(original, item.path)))]));
  for (const item of valid.evidence) { item.encoding = 'canonical-json-v2'; item.sha256 = messageEvidenceHash(values[item.path]); }
  const writerInput = path.join(directory, 'writer-input.json');
  fs.writeFileSync(writerInput, JSON.stringify({ result: valid, values }));
  const writeEnvelope = input => {
    execFileSync(process.execPath, ['--import', path.join(root, 'synthesis/node_modules/tsx/dist/loader.mjs'), '--input-type=module', '-e', `
      import fs from 'node:fs';
      import { EvidenceBundle } from ${JSON.stringify(pathToFileURL(path.join(root, 'synthesis/src/wallet-lab/evidence.ts')).href)};
      const input = JSON.parse(fs.readFileSync(process.argv[1]));
      const bundle = new EvidenceBundle(process.argv[2]);
      bundle.addJson('integrated/messaging.json', input.result);
      for (const [name, value] of Object.entries(input.values)) bundle.addJson('integrated/messaging-' + name, value);
      bundle.flush();
    `, input, path.join(directory, 'envelope')], { stdio: 'pipe' });
  };
  writeEnvelope(writerInput);
  const integrated = path.join(directory, 'envelope/evidence/integrated');
  assert.equal(fs.readFileSync(path.join(integrated, 'messaging-exchanges.json'), 'utf8').trim(), canonicalMessageEvidence(values['exchanges.json']));
  await verifyNativeMessaging(integrated);
  // Historical insertion-order evidence must still reject a changed envelope;
  // the new verifier may not silently upgrade or repair that failed sample.
  function reverseKeys(value) {
    if (Array.isArray(value)) return value.map(reverseKeys);
    if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().reverse().map(key => [key, reverseKeys(value[key])]));
    return value;
  }
  const historical = structuredClone(valid), historicalValues = reverseKeys(values);
  for (const item of historical.evidence) { item.encoding = 'canonical-json'; item.sha256 = messageEvidenceHash(historicalValues[item.path], item.encoding); }
  fs.writeFileSync(writerInput, JSON.stringify({ result: historical, values: historicalValues })); writeEnvelope(writerInput);
  await assert.rejects(verifyNativeMessaging(integrated), /Changed evidence/);
  console.log('Native messaging verifier: missing receipt, invalid signature and legacy envelope rejection passed; actual EvidenceBundle canonicalization v2 passed');
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
