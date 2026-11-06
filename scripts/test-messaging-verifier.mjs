// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { verifyMessaging } from './verify-messaging.mjs';
import { sha256 } from '../components/messaging/identity.mjs';
const original = path.resolve(process.argv[2]);
await verifyMessaging(original);
const paths = JSON.parse(fs.readFileSync('out/messaging-sources/paths.json'));
const require = createRequire(path.join(paths['typescript-messagebox'], 'package.json'));
const { Transaction } = await import(pathToFileURL(require.resolve('@bsv/sdk')).href);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-message-verifier-'));
try {
  fs.cpSync(original, directory, { recursive: true });
  let result = JSON.parse(fs.readFileSync(path.join(directory, 'result.json')));
  const paymentFile = 'typescript-payment.json';
  const payment = JSON.parse(fs.readFileSync(path.join(directory, paymentFile)));
  const tx = Transaction.fromBEEF(payment.request.payment.tx); tx.outputs[1].satoshis += 1;
  const oldId = payment.txid, newId = tx.id('hex');
  payment.txid = newId; payment.request.payment.tx = tx.toAtomicBEEF();
  for (const action of payment.recipientActions.actions) if (action.txid === oldId) action.txid = newId;
  fs.writeFileSync(path.join(directory, paymentFile), JSON.stringify(payment));
  result.evidence.find(e => e.path === paymentFile).sha256 = sha256(fs.readFileSync(path.join(directory, paymentFile)));
  result.assertions.find(a => a.implementation === 'typescript' && a.id === 'paid-internalization').detail.txid = newId;
  fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify(result));
  await assert.rejects(verifyMessaging(directory), 'Invalid signed payment must fail even with rebound evidence digests and result transaction IDs');
  fs.cpSync(original, directory, { recursive: true });
  result = JSON.parse(fs.readFileSync(path.join(directory, 'result.json')));
  result.cleanup.push({ component: 'retained-process', running: true });
  fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify(result));
  await assert.rejects(verifyMessaging(directory), 'A running resource cannot be accepted as cleanup');
  console.log('Messaging verifier: 2 independent negative cases passed');
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
