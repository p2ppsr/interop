// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { verifyMessagingBuild } from './identity.mjs';
import { messageEvidenceHash } from './evidence.mjs';
import { startTypeScriptMessageBox } from './ts-host.mjs';
import { startGoMessageBox } from './go-host.mjs';
import { startMessageBoxDiscovery } from './discovery.mjs';
import { createFixtureWallet } from '../../synthesis/src/storage-sync/fixture-wallet.ts';
import { submit } from '../../integrations/services/src/overlay.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
function check(value, message) { if (!value) throw new Error(message); }
export function messagingPaths(file = process.env.TPNIL_MESSAGING_PATHS ?? path.join(root, 'out/messaging-sources/paths.json')) {
  const cache = path.dirname(file), lock = JSON.parse(fs.readFileSync(path.join(root, 'components/messaging/sources.lock.json')));
  // All paths are derived from the verified source identities, so relocation
  // from a CI build directory into /work requires no rewrite of evidence.
  return { ...Object.fromEntries(lock.components.map(component => [component.id, path.join(cache, `${component.repository.split('/')[1]}-${component.commit}`, component.path)])), 'go-binary': path.join(cache, 'messagebox-go') };
}
async function eventually(read) {
  let error;
  for (let i = 0; i < 5; i++) { try { return await read(); } catch (caught) { error = caught; await new Promise(resolve => setTimeout(resolve, 100)); } }
  throw error;
}

/** Native payer is never substituted: every sender auth/crypto/payment request
 * is dispatched to the caller's admitted unchanged native wallet interface. */
export async function runNativeMessaging(wallet, services, output) {
  const out = path.resolve(output); fs.mkdirSync(out, { recursive: true });
  const profileBytes = fs.readFileSync(path.join(root, 'components/messaging/native-profile.json'));
  const profile = JSON.parse(profileBytes), paths = messagingPaths();
  verifyMessagingBuild(root, paths);
  const require = createRequire(path.join(paths['typescript-messagebox'], 'package.json'));
  const load = name => import(pathToFileURL(require.resolve(name)).href);
  const sdk = await load('@bsv/sdk'), { MessageBoxClient } = await load('@bsv/message-box-client');
  const assertions = [], transactions = [], cleanup = [], exchanges = [];
  const localWallets = [];
  const tracker = { currentHeight: async () => 900100, isValidRootForHeight: async (merkleRoot, height) => services.headers.get(height)?.merkleRoot === merkleRoot, findHeaderForHeight: async height => services.headers.get(height) };
  const nativeIdentity = (await wallet.getPublicKey({ identityKey: true })).publicKey;
  const advertiser = await createFixtureWallet(services, '77'.repeat(32)); localWallets.push(advertiser);
  const makeClient = (clientWallet, host) => {
    const client = new MessageBoxClient({ walletClient: clientWallet, host: host.origin, networkPreset: 'local', serverIdentityKeysByHost: { [host.origin]: host.identityKey }, enableLogging: false });
    const authenticatedFetch = client.authFetch.fetch.bind(client.authFetch);
    client.authFetch.fetch = async (url, options) => {
      const response = await authenticatedFetch(url, options);
      exchanges.push({ url, method: options?.method, body: options?.body, status: response.status, response: await response.clone().text(), authenticatedBy: 'pinned SDK AuthFetch with expected server identity' });
      return response;
    };
    return client;
  };
  for (const implementation of profile.implementations) {
    let host, discovery, recipientWallet, serverWallet;
    const startedAt = Date.now();
    try {
      const receiverKey = (implementation === 'typescript' ? '32' : '42').repeat(32), serverKey = (implementation === 'typescript' ? '62' : '82').repeat(32);
      recipientWallet = await createFixtureWallet(services, receiverKey); localWallets.push(recipientWallet);
      serverWallet = await createFixtureWallet(services, serverKey); localWallets.push(serverWallet);
      const recipient = (await recipientWallet.getPublicKey({ identityKey: true })).publicKey;
      const state = path.join(out, `${implementation}.sqlite`);
      const start = port => implementation === 'typescript'
        ? startTypeScriptMessageBox({ source: paths['typescript-messagebox'], state, key: serverKey, wallet: serverWallet, port })
        : startGoMessageBox({ binary: paths['go-binary'], typescriptSource: paths['typescript-messagebox'], state, key: serverKey, compatibility: true, port, onClose(receipt) { const { stdout, stderr, ...data } = receipt; cleanup.push(data); fs.appendFileSync(path.join(out, `${implementation}.log`), stdout + stderr); } });
      host = await start(0); const port = Number(new URL(host.origin).port);
      const mongoUri = process.env.TPNIL_GO_MONGO_URI;
      check(mongoUri, 'Native discovery requires the enclosing isolated Mongo replica set');
      discovery = await startMessageBoxDiscovery({ source: paths['messagebox-discovery'], directory: path.join(out, `discovery-${implementation}`), name: `native_messagebox_${implementation.replaceAll('-', '_')}_${process.pid}`, mongoUri, tracker });
      const advertisementScript = await new sdk.PushDrop(recipientWallet).lock([sdk.Utils.toArray(recipient, 'hex'), sdk.Utils.toArray(host.origin, 'utf8')], [1, 'messagebox advertisement'], '1', 'anyone', true);
      const advertisement = await advertiser.createAction({ description: 'Advertise native payment recipient', outputs: [{ satoshis: 1, lockingScript: advertisementScript.toHex(), outputDescription: 'MessageBox recipient advertisement' }], options: { randomizeOutputs: false, acceptDelayedBroadcast: false } });
      check(advertisement.tx, 'Advertisement lacks a serialized transaction');
      const advertisementTx = sdk.Transaction.fromBEEF(advertisement.tx);
      check(await advertisementTx.verify(tracker), 'Advertisement does not verify against controlled mined funding');
      const admission = await submit(discovery.origin, advertisementTx, ['tm_messagebox']);
      const resolved = await discovery.resolve(recipient);
      check(resolved.length === 1 && resolved[0].host === host.origin && resolved[0].txid === advertisementTx.id('hex'), 'Recipient discovery did not return the admitted advertisement');
      assertions.push({ id: `${implementation}/discovery`, verdict: 'PASS', txid: advertisementTx.id('hex') });
      const control = new sdk.AuthFetch(recipientWallet, undefined, undefined, undefined, { responseTimeoutMs: 10000, requestTimeoutMs: 10000 });
      const permission = await control.fetch(host.origin + '/permissions/set', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messageBox: 'native_payment', recipientFee: profile.recipientFee }), requireMutualAuth: true, expectedIdentityKey: host.identityKey });
      check(permission.ok, 'Recipient fee configuration failed');
      const sender = makeClient(wallet, host);
      let receiver = makeClient(recipientWallet, host);
      const sent = await sender.sendMessage({ recipient, messageBox: 'native_payment', body: profile.message, checkPermissions: true, maximumPayment: profile.recipientFee }, resolved[0].host);
      const exchange = [...exchanges].reverse().find(item => item.url === host.origin + '/sendMessage' && item.status === 200 && item.body?.includes('"payment"'));
      check(exchange, 'Native payment request bytes were not retained');
      const request = JSON.parse(exchange.body), payment = sdk.Transaction.fromBEEF(request.payment.tx);
      check(await payment.verify(tracker), 'Native payment failed independent ancestry/script verification');
      const messages = await receiver.listMessages({ messageBox: 'native_payment', host: host.origin });
      check(messages.some(message => message.messageId === sent.messageId && message.sender === nativeIdentity && message.body === profile.message), 'Recipient payload or native sender identity differs');
      const actions = await recipientWallet.listActions({ labels: [], limit: 100 });
      check(actions.actions.some(action => action.txid === payment.id('hex')), 'Recipient wallet did not internalize the exact native payment');
      check(request.payment.outputs.length === 1 && payment.outputs[request.payment.outputs[0].outputIndex].satoshis === profile.recipientFee, 'Native payment differs from fixed recipient fee');
      const input = payment.inputs.reduce((sum, value) => sum + value.sourceTransaction.outputs[value.sourceOutputIndex].satoshis, 0), paid = payment.outputs.reduce((sum, value) => sum + value.satoshis, 0);
      check(input >= paid, 'Native payment created value');
      transactions.push({ implementation, purpose: 'native-wallet-messagebox-payment', txid: payment.id('hex'), rawHex: payment.toHex(), beef: request.payment.tx, inputSatoshis: input, outputSatoshis: paid, fee: input - paid });
      assertions.push({ id: `${implementation}/native-paid-delivery`, verdict: 'PASS', txid: payment.id('hex'), messageId: sent.messageId, nativeIdentity, recipient });
      await host.close(); host = await start(port); receiver = makeClient(recipientWallet, host);
      const afterRestart = await eventually(() => receiver.listMessages({ messageBox: 'native_payment', host: host.origin }));
      check(afterRestart.some(message => message.messageId === sent.messageId), 'Paid message lost during server restart');
      await receiver.acknowledgeMessage({ messageIds: [sent.messageId], host: host.origin });
      await host.close(); host = await start(port); receiver = makeClient(recipientWallet, host);
      const afterAcknowledgment = await eventually(() => receiver.listMessages({ messageBox: 'native_payment', host: host.origin }));
      check(!afterAcknowledgment.some(message => message.messageId === sent.messageId), 'Acknowledged native payment message returned');
      const replay = structuredClone(request); replay.message.messageId += '-replay';
      const response = await eventually(() => sender.authFetch.fetch(host.origin + '/sendMessage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(replay), requireMutualAuth: true, expectedIdentityKey: host.identityKey, allowPayments: false }));
      check(response.status >= 400 && response.status < 500, 'Native payment replay was not rejected after acknowledgment/restart');
      assertions.push({ id: `${implementation}/restart-ack-replay`, verdict: 'PASS', replayStatus: response.status });
      fs.writeFileSync(path.join(out, `${implementation}-native-payment.json`), JSON.stringify({ nativeIdentity, recipient, advertisement: { txid: advertisementTx.id('hex'), beef: advertisement.tx }, admission, resolved, request, txid: payment.id('hex'), recipientActions: actions, messages, afterRestart, afterAcknowledgment, sent, replayStatus: response.status, elapsedMs: Date.now() - startedAt }, null, 2) + '\n');
    } catch (error) { assertions.push({ id: `${implementation}/execution`, verdict: 'FAIL', error: String(error?.stack ?? error) }); }
    finally {
      if (host) await host.close().then(() => cleanup.push({ implementation, serviceClosed: true }), error => cleanup.push({ implementation, error: String(error) }));
      if (discovery) await discovery.close().then(() => cleanup.push({ implementation, discoveryClosed: true }), error => cleanup.push({ implementation, error: String(error) }));
    }
  }
  for (const item of localWallets.reverse()) await item.destroy();
  fs.writeFileSync(path.join(out, 'exchanges.json'), JSON.stringify(exchanges, null, 2) + '\n');
  const evidence = fs.readdirSync(out).filter(file => file.endsWith('.json') && file !== 'result.json').map(file => ({ path: file, encoding: 'canonical-json-v2', sha256: messageEvidenceHash(JSON.parse(fs.readFileSync(path.join(out, file)))) }));
  const result = { schema: 'tpnil-native-messaging-result@1', profile: profile.id, profileSha256: sha256(profileBytes), nativeIdentity, assertions, transactions, evidence, cleanup, result: assertions.some(item => item.verdict !== 'PASS') || cleanup.some(item => item.error) ? 'FAIL' : 'PASS' };
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}
