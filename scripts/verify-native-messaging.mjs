// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sha256 } from '../components/messaging/identity.mjs';
import { canonicalMessageEvidence, messageEvidenceHash } from '../components/messaging/evidence.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Verify helper evidence independently. Native application identity/admission
 * and wallet-boundary provenance must also pass the enclosing native verifier.
 * Supports the helper directory or the enclosing flattened integrated directory.
 */
export async function verifyNativeMessaging(directory) {
  const plain = path.join(directory, 'result.json');
  const standalone = fs.existsSync(plain) && JSON.parse(fs.readFileSync(plain)).schema === 'tpnil-native-messaging-result@1';
  const read = file => JSON.parse(fs.readFileSync(path.join(directory, standalone ? file : file === 'result.json' ? 'messaging.json' : `messaging-${file}`)));
  const result = read('result.json');
  assert.equal(result.schema, 'tpnil-native-messaging-result@1'); assert.equal(result.result, 'PASS');
  const profileBytes = fs.readFileSync(path.join(root, 'components/messaging/native-profile.json'));
  const profile = JSON.parse(profileBytes);
  assert.equal(result.profile, profile.id); assert.equal(result.profileSha256, sha256(profileBytes));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'components/messaging/sources.lock.json')));
  const source = lock.components.find(item => item.id === 'typescript-messagebox');
  const cache = path.dirname(process.env.TPNIL_MESSAGING_PATHS ?? path.join(root, 'out/messaging-sources/paths.json'));
  const require = createRequire(path.join(cache, `${source.repository.split('/')[1]}-${source.commit}`, source.path, 'package.json'));
  const { Transaction, ProtoWallet, PrivateKey, PushDrop, P2PKH, PublicKey, Utils } = await import(pathToFileURL(require.resolve('@bsv/sdk')).href);
  assert.equal(PublicKey.fromString(result.nativeIdentity).toString(), result.nativeIdentity);
  const fixture = JSON.parse(fs.readFileSync(path.join(root, profile.fixture)));
  const tracker = { currentHeight: async () => 900100, isValidRootForHeight: async (merkleRoot, height) => height === fixture.fundingHeight && merkleRoot === fixture.merkleRoot };
  const evidence = new Set();
  for (const item of result.evidence) {
    assert(!path.isAbsolute(item.path) && !item.path.split(/[\\/]/).includes('..')); assert(!evidence.has(item.path)); evidence.add(item.path);
    assert(['canonical-json', 'canonical-json-v2'].includes(item.encoding), 'Unknown messaging evidence encoding');
    assert.equal(messageEvidenceHash(read(item.path), item.encoding), item.sha256, `Changed evidence ${item.path}`);
  }
  assert(evidence.has('exchanges.json'));
  const exchanges = read('exchanges.json'), txids = new Set();
  const required = profile.implementations.flatMap(implementation => ['discovery', 'native-paid-delivery', 'restart-ack-replay'].map(id => `${implementation}/${id}`));
  assert.equal(result.assertions.length, required.length); assert.deepEqual(new Set(result.assertions.map(item => item.id)), new Set(required));
  assert(result.assertions.every(item => item.verdict === 'PASS'));
  assert.equal(result.transactions.length, profile.implementations.length);
  for (const implementation of profile.implementations) {
    const file = `${implementation}-native-payment.json`; assert(evidence.has(file)); const record = read(file);
    const paidAssertion = result.assertions.find(item => item.id === `${implementation}/native-paid-delivery`);
    const receiver = new ProtoWallet(PrivateKey.fromHex((implementation === 'typescript' ? '32' : '42').repeat(32)));
    assert.equal(record.recipient, (await receiver.getPublicKey({ identityKey: true })).publicKey);
    assert.equal(record.nativeIdentity, result.nativeIdentity); assert.equal(paidAssertion.nativeIdentity, result.nativeIdentity); assert.equal(paidAssertion.recipient, record.recipient);
    const advertisement = Transaction.fromBEEF(record.advertisement.beef);
    assert.equal(await advertisement.verify(tracker), true, 'Advertisement script/ancestry invalid'); assert.equal(advertisement.id('hex'), record.advertisement.txid);
    assert.equal(result.assertions.find(item => item.id === `${implementation}/discovery`).txid, advertisement.id('hex'));
    assert.equal(record.resolved.length, 1); const resolved = record.resolved[0];
    assert.equal(resolved.txid, advertisement.id('hex')); assert.equal(Transaction.fromBEEF(resolved.beef).id('hex'), advertisement.id('hex'));
    assert(record.admission.tm_messagebox.outputsToAdmit.includes(resolved.outputIndex));
    const decoded = PushDrop.decode(advertisement.outputs[resolved.outputIndex].lockingScript), signature = decoded.fields.pop();
    assert.equal(decoded.fields.length, 2); assert.equal(Utils.toHex(decoded.fields[0]), record.recipient); assert.equal(Utils.toUTF8(decoded.fields[1]), resolved.host);
    assert.equal((await new ProtoWallet('anyone').verifySignature({ data: decoded.fields.flat(), signature, counterparty: record.recipient, protocolID: [1, 'messagebox advertisement'], keyID: '1' })).valid, true, 'Discovery advertisement signature invalid');
    const tx = Transaction.fromBEEF(record.request.payment.tx), txid = tx.id('hex');
    assert.equal(await tx.verify(tracker), true, 'Payment script/ancestry invalid');
    assert.equal(txid, record.txid); assert.equal(txid, paidAssertion.txid); assert(!txids.has(txid)); txids.add(txid);
    const transaction = result.transactions.find(item => item.implementation === implementation); assert(transaction);
    assert.equal(transaction.txid, txid); assert.equal(transaction.rawHex, tx.toHex()); assert.equal(Transaction.fromBEEF(transaction.beef).toHex(), tx.toHex());
    const inputs = tx.inputs.reduce((total, input) => total + input.sourceTransaction.outputs[input.sourceOutputIndex].satoshis, 0), outputs = tx.outputs.reduce((total, output) => total + output.satoshis, 0);
    assert(inputs >= outputs); assert.equal(transaction.inputSatoshis, inputs); assert.equal(transaction.outputSatoshis, outputs); assert.equal(transaction.fee, inputs - outputs);
    assert.equal(record.request.payment.outputs.length, 1); const remittance = record.request.payment.outputs[0]; assert.equal(remittance.protocol, 'wallet payment');
    const output = tx.outputs[remittance.outputIndex]; assert.equal(output.satoshis, profile.recipientFee);
    const { derivationPrefix, derivationSuffix, senderIdentityKey } = remittance.paymentRemittance;
    const key = await receiver.getPublicKey({ protocolID: [2, '3241645161d8'], keyID: `${derivationPrefix} ${derivationSuffix}`, counterparty: senderIdentityKey, forSelf: true });
    assert.equal(output.lockingScript.toHex(), new P2PKH().lock(PublicKey.fromString(key.publicKey).toAddress()).toHex(), 'Payment does not belong to the recipient');
    assert(record.recipientActions.actions.some(action => action.txid === txid && action.satoshis === profile.recipientFee && action.isOutgoing === false), 'Exact recipient wallet receipt absent');
    const message = record.request.message; assert.equal(message.recipient, record.recipient); assert.equal(message.messageId, record.sent.messageId); assert.equal(message.messageId, paidAssertion.messageId);
    const encrypted = JSON.parse(message.body).encryptedMessage; assert.equal(typeof encrypted, 'string');
    const { plaintext } = await receiver.decrypt({ protocolID: [1, 'messagebox'], keyID: '1', counterparty: result.nativeIdentity, ciphertext: Utils.toArray(encrypted, 'base64') });
    assert.equal(Utils.toUTF8(plaintext), profile.message, 'Ciphertext does not decrypt to the frozen native task');
    for (const messages of [record.messages, record.afterRestart]) assert(messages.some(item => item.messageId === message.messageId && item.sender === result.nativeIdentity && item.body === profile.message));
    assert(!record.afterAcknowledgment.some(item => item.messageId === message.messageId));
    assert(record.replayStatus >= 400 && record.replayStatus < 500); assert.equal(result.assertions.find(item => item.id === `${implementation}/restart-ack-replay`).replayStatus, record.replayStatus);
    const matchesRequest = (body, request) => {
      try { return typeof body === 'string' && canonicalMessageEvidence(JSON.parse(body)) === canonicalMessageEvidence(request); }
      catch { return false; }
    };
    const sent = exchanges.find(item => item.url === `${resolved.host}/sendMessage` && item.status === 200 && matchesRequest(item.body, record.request)); assert(sent, 'Successful actual payment exchange absent');
    const replay = structuredClone(record.request); replay.message.messageId += '-replay';
    assert(exchanges.some(item => item.url === `${resolved.host}/sendMessage` && item.status === record.replayStatus && matchesRequest(item.body, replay)), 'Replay exchange absent');
    assert(result.cleanup.some(item => item.implementation === implementation && item.serviceClosed === true));
    assert(result.cleanup.some(item => item.implementation === implementation && item.discoveryClosed === true));
  }
  for (const entry of result.cleanup) {
    assert(!entry.error && !entry.running && entry.signal == null && (entry.exitCode === undefined || entry.exitCode === 0));
    if (entry.bridge) assert(entry.bridge.httpListening === false && entry.bridge.databaseClosed === true && entry.bridge.socketCount === 0);
  }
  return { verified: true, assertions: required.length, nativeIdentity: result.nativeIdentity, paymentTransactions: [...txids], nativeArtifactQualification: 'Requires the enclosing unchanged-native-wallet admission and provenance envelope' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) console.log(JSON.stringify(await verifyNativeMessaging(path.resolve(process.argv[2])), null, 2));
