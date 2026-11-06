// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { startGoMessageBox } from './go-host.mjs';
import { startTypeScriptMessageBox } from './ts-host.mjs';
import { qualifyGoWebSocket } from './websocket-qualification.mjs';
import { subscribeByPolling } from './polling.mjs';
import { startMessagingMongo } from './mongo.mjs';
import { startMessageBoxDiscovery } from './discovery.mjs';
import { ControlledWalletServices } from '../../synthesis/src/wallet-lab/services.ts';
import { createFixtureWallet } from '../../synthesis/src/storage-sync/fixture-wallet.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.resolve(process.argv[2]);
fs.mkdirSync(out, { recursive: true });
const paths = JSON.parse(fs.readFileSync(process.env.TPNIL_MESSAGING_PATHS));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'components/messaging/sources.lock.json')));
const profile = JSON.parse(fs.readFileSync(path.join(root, 'components/messaging/profile.json')));
const require = createRequire(path.join(paths['typescript-messagebox'], 'package.json'));
const load = name => import(pathToFileURL(require.resolve(name)).href);
const sha = data => createHash('sha256').update(data).digest('hex');
const assertions = [], cleanup = [], trace = [], resources = [], wallets = [];
const startedAt = new Date().toISOString();
const nativeFetch = globalThis.fetch;
// The application client still performs full BRC-103/104 verification. This
// records the original wire bytes before any optional compatibility adapter.
globalThis.fetch = async (url, init) => {
  const target = new URL(typeof url === 'string' || url instanceof URL ? url : url.url);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)) throw new Error(`Messaging lane forbids outbound origin ${target.origin}`);
  const response = await nativeFetch(url, init);
  trace.push({ url: target.href, method: init?.method ?? 'GET', headers: Object.fromEntries(new Headers(init?.headers)), body: typeof init?.body === 'string' ? init.body : null, status: response.status, responseHeaders: Object.fromEntries(response.headers), responseBody: await response.clone().text() });
  return response;
};
const { PrivateKey, ProtoWallet, AuthFetch, Transaction } = await load('@bsv/sdk');
const { MessageBoxClient } = await load('@bsv/message-box-client');
function check(condition, detail) { if (!condition) throw new Error(detail); }
async function test(implementation, id, fn) {
  const start = Date.now();
  try { const detail = await fn(); assertions.push({ implementation, id, result: 'PASS', durationMs: Date.now() - start, detail: detail ?? null }); }
  catch (error) { assertions.push({ implementation, id, result: 'FAIL', durationMs: Date.now() - start, detail: String(error?.stack ?? error) }); }
}
const deadline = (promise, ms = 15000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Operation exceeded ${ms}ms`)), ms);
  Promise.resolve(promise).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
});
async function startGo(state, key, port = 0, compatibility = false) {
  return startGoMessageBox({ binary: paths['go-binary'], typescriptSource: paths['typescript-messagebox'], state, key, port, compatibility, onClose(receipt) {
    fs.appendFileSync(path.join(out, 'go-host.log'), receipt.stderr + receipt.stdout);
    const { stdout, stderr, ...summary } = receipt; cleanup.push(summary);
  }});
}
async function afterRestart(read) {
  let error;
  for (let i = 0; i < 5; i++) { try { return await read(); } catch (caught) { error = caught; await new Promise(resolve => setTimeout(resolve, 100)); } }
  throw error;
}
function participant(wallet, host) { return new MessageBoxClient({ walletClient: wallet, host: host.origin, networkPreset: 'local', serverIdentityKeysByHost: { [host.origin]: host.identityKey }, enableLogging: false }); }
async function raw(wallet, host, route, body) {
  const fetcher = new AuthFetch(wallet, undefined, undefined, undefined, { responseTimeoutMs: 10000, requestTimeoutMs: 10000 });
  const response = await fetcher.fetch(host.origin + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), requireMutualAuth: true, expectedIdentityKey: host.identityKey, allowPayments: false });
  return { status: response.status, body: await response.json() };
}
let services, mongo, overlayA, overlayB;
try {
  const webroot = path.join(out, 'webroot'); fs.mkdirSync(webroot); fs.writeFileSync(path.join(webroot, 'index.html'), '<!doctype html><title>MessageBox qualification</title>');
  services = new ControlledWalletServices({ webroot }); await services.start();
  const funding = JSON.parse(fs.readFileSync(path.join(root, profile.funding)));
  const fundingReceipt = await services.fundRemoteWalletFromTeranode('77'.repeat(32), funding);
  fs.writeFileSync(path.join(out, 'funding.json'), JSON.stringify(fundingReceipt, null, 2) + '\n');
  const senderWallet = await createFixtureWallet(services, '77'.repeat(32)); wallets.push(senderWallet);
  for (const implementation of ['typescript', 'go', 'go-adapted']) {
    const receiverKey = (implementation === 'typescript' ? '33' : implementation === 'go' ? '44' : '99').repeat(32);
    const receiverWallet = await createFixtureWallet(services, receiverKey); wallets.push(receiverWallet);
    const receiverIdentity = (await receiverWallet.getPublicKey({ identityKey: true })).publicKey;
    const senderIdentity = (await senderWallet.getPublicKey({ identityKey: true })).publicKey;
    const outsiderWallet = new ProtoWallet(PrivateKey.fromHex('55'.repeat(32)));
    const serverKey = (implementation === 'typescript' ? '66' : '88').repeat(32);
    const serverWallet = await createFixtureWallet(services, serverKey); wallets.push(serverWallet);
    const state = path.join(out, `${implementation}.sqlite`);
    let host;
    const start = async port => implementation === 'typescript'
      ? startTypeScriptMessageBox({ source: paths['typescript-messagebox'], state, key: serverKey, wallet: serverWallet, port }).then(server => { const close = server.close; return { ...server, async close() { const receipt = await close(); cleanup.push(receipt); } }; })
      : startGo(state, serverKey, port, implementation === 'go-adapted');
    host = await start(0); resources.push(() => host.close());
    const fixedPort = Number(new URL(host.origin).port);
    let sender = participant(senderWallet, host), receiver = participant(receiverWallet, host), outsider = participant(outsiderWallet, host);
    const box = 'tpnil_inbox';
    let messageId;
    await test(implementation, 'unauthenticated-denied', async () => {
      const response = await nativeFetch(host.origin + '/listMessages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messageBox: box }) });
      check(response.status >= 400 && response.status < 500, `Unexpected unauthenticated HTTP ${response.status}`); return { status: response.status };
    });
    await test(implementation, 'encrypted-delivery', async () => {
      const sent = await deadline(sender.sendMessage({ recipient: receiverIdentity, messageBox: box, body: 'TPNIL encrypted delivery' }, host.origin)); messageId = sent.messageId;
      const messages = await deadline(receiver.listMessages({ messageBox: box, host: host.origin }));
      const found = messages.find(m => m.messageId === messageId);
      check(found?.body === 'TPNIL encrypted delivery' && found?.sender === senderIdentity, 'Encrypted delivery changed payload or sender'); return { messageId };
    });
    await test(implementation, 'identity-isolation', async () => {
      check((await outsider.listMessages({ messageBox: box, host: host.origin })).length === 0, 'Foreign identity saw recipient messages');
      await outsider.acknowledgeMessage({ messageIds: [messageId], host: host.origin }).catch(() => {});
      check((await receiver.listMessages({ messageBox: box, host: host.origin })).some(m => m.messageId === messageId), 'Foreign acknowledgment removed recipient message');
    });
    await test(implementation, 'duplicate-rejected', async () => {
      let rejected = false; try { await sender.sendMessage({ recipient: receiverIdentity, messageBox: box, messageId, body: 'duplicate' }, host.origin); } catch { rejected = true; }
      check(rejected, 'Duplicate message ID was accepted');
      check((await receiver.listMessages({ messageBox: box, host: host.origin })).filter(m => m.messageId === messageId).length === 1, 'Duplicate changed persisted cardinality');
    });
    await test(implementation, 'permission-denial', async () => {
      check((await raw(receiverWallet, host, '/permissions/set', { messageBox: 'blocked', recipientFee: -1 })).status === 200, 'Could not set block');
      const denied = await raw(senderWallet, host, '/sendMessage', { message: { recipient: receiverIdentity, messageBox: 'blocked', messageId: 'blocked-1', body: 'denied' } });
      check(denied.status === 403, 'Recipient block did not reject');
      check((await receiver.listMessages({ messageBox: 'blocked', host: host.origin })).length === 0, 'Blocked message persisted');
      await raw(receiverWallet, host, '/permissions/set', { messageBox: 'blocked', recipientFee: 0 });
      const accepted = await sender.sendMessage({ recipient: receiverIdentity, messageBox: 'blocked', body: 'recovered' }, host.origin);
      check(typeof accepted.messageId === 'string', 'Permission recovery failed');
    });
    await test(implementation, 'unpaid-denied', async () => {
      await raw(receiverWallet, host, '/permissions/set', { messageBox: 'paid', recipientFee: 23 });
      const result = await raw(senderWallet, host, '/sendMessage', { message: { recipient: receiverIdentity, messageBox: 'paid', messageId: 'unpaid-1', body: 'denied' } });
      check(result.status >= 400, 'Unpaid message accepted');
      check((await receiver.listMessages({ messageBox: 'paid', host: host.origin })).length === 0, 'Unpaid message persisted'); return result;
    });
    let paymentRequest, paidMessageId;
    await test(implementation, 'paid-internalization', async () => {
      const sent = await deadline(sender.sendMessage({ recipient: receiverIdentity, messageBox: 'paid', body: 'Paid peer delivery', checkPermissions: true, maximumPayment: 23 }, host.origin), 30000);
      paidMessageId = sent.messageId;
      const wire = [...trace].reverse().find(x => x.url === host.origin + '/sendMessage' && x.body?.includes('"payment"'));
      paymentRequest = wire && JSON.parse(wire.body);
      const paid = await deadline(receiver.listMessages({ messageBox: 'paid', host: host.origin }), 30000);
      check(paid.some(m => m.messageId === sent.messageId && m.body === 'Paid peer delivery'), 'Paid message was not delivered/internalized');
      check(paymentRequest?.payment?.tx, 'No retained atomic payment BEEF');
      const tx = Transaction.fromBEEF(paymentRequest.payment.tx);
      const actions = await receiverWallet.listActions({ labels: [], limit: 100 });
      check(actions.actions.some(a => a.txid === tx.id('hex')), 'Recipient wallet did not internalize the exact payment transaction');
      fs.writeFileSync(path.join(out, `${implementation}-payment.json`), JSON.stringify({ request: paymentRequest, txid: tx.id('hex'), outputs: tx.outputs.map(o => ({ satoshis: o.satoshis, lockingScript: o.lockingScript.toHex() })), recipientActions: actions }, null, 2) + '\n');
      return { txid: tx.id('hex'), messageId: sent.messageId };
    });
    await test(implementation, 'payment-replay-rejected', async () => {
      check(paymentRequest?.payment, 'Paid predecessor did not produce a replayable payment');
      const replay = structuredClone(paymentRequest); replay.message.messageId += '-replay';
      const result = await raw(senderWallet, host, '/sendMessage', replay);
      check(result.status >= 400, `Payment replay accepted with HTTP ${result.status}`); return result;
    });
    await test(implementation, 'http-auth-replay-rejected', async () => {
      const wire = [...trace].reverse().find(x => x.url === host.origin + '/sendMessage' && x.status === 200 && x.headers['x-bsv-auth-signature']);
      check(wire, 'No signed request retained');
      const response = await nativeFetch(wire.url, { method: wire.method, headers: wire.headers, body: wire.body });
      check(response.status >= 400 && response.status < 500, `Signed replay HTTP ${response.status}`); return { status: response.status };
    });
    await test(implementation, 'restart-recovery', async () => {
      await host.close(); host = await start(fixedPort);
      sender = participant(senderWallet, host); receiver = participant(receiverWallet, host);
      check((await afterRestart(() => receiver.listMessages({ messageBox: box, host: host.origin }))).some(m => m.messageId === messageId), 'Server restart lost an unacknowledged message');
    });
    await test(implementation, 'live-delivery', async () => {
      let received, resolve; const arrived = new Promise(r => { resolve = r; });
      const onMessage = message => { if (message.body === 'live delivery') { received = message; resolve(); } };
      let polling;
      try {
        if (implementation === 'typescript') await deadline(receiver.listenForLiveMessages({ messageBox: 'live', overrideHost: host.origin, onMessage }), 20000);
        else polling = subscribeByPolling({ client: receiver, messageBox: 'live', host: host.origin, onMessage, intervalMs: 100 });
        const sent = await sender.sendMessage({ recipient: receiverIdentity, messageBox: 'live', body: 'live delivery' }, host.origin);
        await deadline(arrived, 15000); check(received?.messageId === sent.messageId, 'Live delivery did not preserve message ID');
        return { transport: implementation === 'typescript' ? 'BRC-103 AuthSocket' : 'recipient-side authenticated HTTP polling' };
      } finally { await polling?.close(); await receiver.disconnectWebSocket(); }
    });
    if (implementation === 'go-adapted') await test(implementation, 'websocket-adapter-contract', async () => {
      const detail = await qualifyGoWebSocket({ load, host: () => host, restart: async () => { await host.close(); host = await start(fixedPort); }, senderWallet, receiverWallet, outsiderWallet, participant });
      sender = participant(senderWallet, host); receiver = participant(receiverWallet, host);
      return detail;
    });
    if (implementation === 'typescript') await test(implementation, 'discovery', async () => {
      mongo = await startMessagingMongo();
      const { submit, lookup, syncPeer } = await import('../../integrations/services/src/overlay.ts');
      const sdk = await load('@bsv/sdk');
      const tracker = { isValidRootForHeight: async (root, height) => services.headers.get(height)?.merkleRoot === root, currentHeight: async () => 900100, findHeaderForHeight: async height => services.headers.get(height) };
      const source = paths['messagebox-discovery'];
      overlayA = await startMessageBoxDiscovery({ source, directory: path.join(out, 'discovery-a'), name: `tpnil_msg_a_${process.pid}`, mongoUri: mongo.uri, tracker });
      overlayB = await startMessageBoxDiscovery({ source, directory: path.join(out, 'discovery-b'), name: `tpnil_msg_b_${process.pid}`, mongoUri: mongo.uri, tracker });
      const script = await new sdk.PushDrop(senderWallet).lock([sdk.Utils.toArray(senderIdentity, 'hex'), sdk.Utils.toArray(host.origin, 'utf8')], [1, 'messagebox advertisement'], '1', 'anyone', true);
      const action = await senderWallet.createAction({ description: 'Advertise controlled MessageBox', outputs: [{ satoshis: 1, lockingScript: script.toHex(), outputDescription: 'MessageBox discovery advertisement' }], options: { randomizeOutputs: false, acceptDelayedBroadcast: false } });
      check(action.tx, 'No advertisement transaction'); const advertisement = sdk.Transaction.fromBEEF(action.tx);
      check(await advertisement.verify(tracker), 'Advertisement does not descend from valid controlled funding');
      const receipt = await submit(overlayA.origin, advertisement, ['tm_messagebox']);
      await syncPeer(overlayB, overlayA.origin, 'tm_messagebox');
      const found = await lookup(overlayB.origin, 'ls_messagebox', { identityKey: senderIdentity });
      check(found.outputs.length === 1, 'Peer did not resolve recipient advertisement');
      const resolved = sdk.Transaction.fromBEEF(found.outputs[0].beef), decoded = sdk.PushDrop.decode(resolved.outputs[found.outputs[0].outputIndex].lockingScript);
      check(sdk.Utils.toHex(decoded.fields[0]) === senderIdentity, 'Discovery identity differs'); const discoveredHost = sdk.Utils.toUTF8(decoded.fields[1]);
      check(discoveredHost === host.origin, 'Discovery changed advertised host');
      const routed = await receiver.sendMessage({ recipient: senderIdentity, messageBox: 'discovered', body: 'Discovered peer delivery' }, discoveredHost);
      const messages = await sender.listMessages({ messageBox: 'discovered', host: discoveredHost });
      check(messages.some(m => m.messageId === routed.messageId && m.body === 'Discovered peer delivery'), 'Discovered service did not deliver');
      await overlayB.close(); overlayB = await startMessageBoxDiscovery({ source, directory: path.join(out, 'discovery-b'), name: `tpnil_msg_b_${process.pid}`, mongoUri: mongo.uri, tracker });
      check((await lookup(overlayB.origin, 'ls_messagebox', { identityKey: senderIdentity })).outputs.length === 1, 'Discovery restart lost advertisement');
      const revoke = new sdk.Transaction(1, [{ sourceTransaction: advertisement, sourceOutputIndex: 0, unlockingScriptTemplate: new sdk.PushDrop(senderWallet).unlock([1, 'messagebox advertisement'], '1', 'anyone') }], [{ satoshis: 0, lockingScript: sdk.LockingScript.fromASM('OP_FALSE OP_RETURN') }], 0);
      await revoke.sign(); check(await revoke.verify(tracker), 'Revocation signature or funding invalid');
      await submit(overlayA.origin, revoke, ['tm_messagebox']);
      check((await lookup(overlayA.origin, 'ls_messagebox', { identityKey: senderIdentity })).outputs.length === 0, 'Revoked advertisement remained discoverable');
      fs.writeFileSync(path.join(out, 'discovery.json'), JSON.stringify({ advertisement: { txid: advertisement.id('hex'), beef: action.tx }, receipt, found, discoveredHost, routed, revocation: { txid: revoke.id('hex'), beef: revoke.toAtomicBEEF() } }, null, 2) + '\n');
      return { advertisementTxid: advertisement.id('hex'), revocationTxid: revoke.id('hex'), routedMessageId: routed.messageId, protocols: ['SHIP topic manager', 'Mongo lookup', 'OverlayExpress HTTP', 'GASP'] };
    });
    await test(implementation, 'payment-replay-after-acknowledgment', async () => {
      check(paymentRequest?.payment && paidMessageId, 'Missing paid predecessor');
      await receiver.acknowledgeMessage({ messageIds: [paidMessageId], host: host.origin });
      await host.close(); host = await start(fixedPort); receiver = participant(receiverWallet, host);
      const replay = structuredClone(paymentRequest); replay.message.messageId += '-after-ack';
      const response = await afterRestart(() => raw(senderWallet, host, '/sendMessage', replay));
      check(response.status >= 400, 'Acknowledgment/restart discarded durable payment replay protection'); return response;
    });
    await test(implementation, 'acknowledgment-durable', async () => {
      await receiver.acknowledgeMessage({ messageIds: [messageId], host: host.origin });
      await host.close(); host = await start(fixedPort); receiver = participant(receiverWallet, host);
      check(!(await afterRestart(() => receiver.listMessages({ messageBox: box, host: host.origin }))).some(m => m.messageId === messageId), 'Acknowledged message returned after restart');
    });
    await host.close(); resources.pop();
  }
} catch (error) { assertions.push({ implementation: 'orchestrator', id: 'execution', result: 'FAIL', detail: String(error?.stack ?? error) }); }
finally {
  for (const close of resources.reverse()) try { await close(); } catch (error) { cleanup.push({ error: String(error) }); }
  for (const wallet of wallets.reverse()) try { await wallet.destroy(); } catch (error) { cleanup.push({ walletError: String(error) }); }
  if (services) { fs.writeFileSync(path.join(out, 'submissions.json'), JSON.stringify(services.submissions.map(s => ({ ...s, bytes: Buffer.from(s.bytes).toString('hex') })), null, 2) + '\n'); await services.close().then(() => cleanup.push({ component: 'controlled-services', closed: true }), error => cleanup.push({ error: String(error) })); }
  for (const overlay of [overlayB, overlayA]) if (overlay) await overlay.close().then(() => cleanup.push({ component: 'discovery-overlay', closed: true }), error => cleanup.push({ error: String(error) }));
  if (mongo) await mongo.close().then(receipt => cleanup.push(receipt), error => cleanup.push({ error: String(error) }));
  globalThis.fetch = nativeFetch;
}
fs.writeFileSync(path.join(out, 'wire.json'), JSON.stringify(trace, null, 2) + '\n');
const evidence = fs.readdirSync(out).filter(name => fs.statSync(path.join(out, name)).isFile()).map(name => ({ path: name, sha256: sha(fs.readFileSync(path.join(out, name))) }));
const result = { runtime: { platform: process.platform, architecture: process.arch, node: process.version, nodeSha256: sha(fs.readFileSync(process.execPath)) }, build: JSON.parse(fs.readFileSync(path.join(root,'out/messaging-sources/build.json'))), adapters: Object.fromEntries(fs.readdirSync(path.join(root,'components/messaging')).filter(name => fs.statSync(path.join(root,'components/messaging',name)).isFile()).map(name => [name, sha(fs.readFileSync(path.join(root,'components/messaging',name)))])), schema: 'tpnil-messaging-result@1', claim: profile.claim, startedAt, endedAt: new Date().toISOString(), components: lock.components, profileSha256: sha(fs.readFileSync(path.join(root, 'components/messaging/profile.json'))), assertions, evidence, cleanup, nativeWalletClaim: false, goNativeWebSockets: false, goAdaptedWebSockets: true };
fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ out, assertions: assertions.map(a => ({ implementation: a.implementation, id: a.id, result: a.result })), cleanup }));
if (assertions.some(a => a.id === 'execution') || cleanup.some(c => c.error || c.walletError)) process.exitCode = 1;
