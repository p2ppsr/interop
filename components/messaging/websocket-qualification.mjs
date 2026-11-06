// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const bounded = (promise, ms = 15000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`WebSocket qualification exceeded ${ms}ms`)), ms);
  Promise.resolve(promise).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
});
const nextEvent = (socket, event) => new Promise(resolve => socket.on(event, resolve));
/** Run actual maintained AuthSocket and MessageBox clients against the adapter.
 * A reconnect is at-least-once; each connection has bounded duplicate filtering.
 */
export async function qualifyGoWebSocket({ load, host, restart, senderWallet, receiverWallet, outsiderWallet, participant }) {
  const { AuthSocketClient } = await load('@bsv/authsocket-client');
  const identity = (await receiverWallet.getPublicKey({ identityKey: true })).publicKey;
  const senderIdentity = (await senderWallet.getPublicKey({ identityKey: true })).publicKey;
  const outsiderIdentity = (await outsiderWallet.getPublicKey({ identityKey: true })).publicKey;
  const box = 'websocket_adapter', room = `${identity}-${box}`;
  let receiver, sender, attacker, deliveries = [], resolveDelivery = () => {};
  const onMessage = message => { deliveries.push(message); resolveDelivery(message); };
  const listen = async () => {
    receiver = participant(receiverWallet, host()); deliveries = [];
    await bounded(receiver.listenForLiveMessages({ messageBox: box, overrideHost: host().origin, onMessage }));
  };
  const received = id => deliveries.some(message => message.messageId === id);
  const awaitId = async id => { while (!received(id)) await bounded(new Promise(resolve => { resolveDelivery = resolve; })); };
  let first, second;
  try {
    await listen();
    attacker = AuthSocketClient(host().origin, { wallet: outsiderWallet, expectedServerIdentityKey: host().identityKey });
    const authenticated = nextEvent(attacker, 'authenticationSuccess');
    attacker.on('connect', () => attacker.emit('authenticated', { identityKey: outsiderIdentity }));
    await bounded(authenticated);
    let leaked = 0; attacker.on(`sendMessage-${room}`, () => { leaked++; });
    const rejected = nextEvent(attacker, 'joinFailed'); attacker.emit('joinRoom', room);
    assert.equal((await bounded(rejected)).code, 'ERR_WEBSOCKET_ROOM_NOT_OWNED');
    sender = participant(senderWallet, host());
    first = await sender.sendLiveMessage({ recipient: identity, messageBox: box, body: 'Go-backed encrypted push' }, host().origin);
    await sender.disconnectWebSocket();
    await awaitId(first.messageId); await wait(400);
    assert.equal(deliveries.filter(message => message.messageId === first.messageId).length, 1);
    assert.equal(deliveries[0].body, 'Go-backed encrypted push'); assert.equal(deliveries[0].sender, senderIdentity); assert.equal(leaked, 0);
    attacker.disconnect(); attacker = undefined;
    await receiver.disconnectWebSocket();
    const queued = [];
    for (let index = 0; index < 33; index++) queued.push(await sender.sendMessage({ recipient: identity, messageBox: box, body: `Queued page boundary ${index}` }, host().origin));
    await listen(); await awaitId(first.messageId);
    for (const message of queued) await awaitId(message.messageId);
    await wait(400);
    assert.equal(deliveries.filter(message => message.messageId === first.messageId).length, 1, 'Reconnect duplicated pending message');
    assert.equal(new Set(deliveries.map(message => message.messageId)).size, 34, 'Paged pending messages were skipped');
    assert.equal(deliveries.length, 34, 'Paged pending messages were duplicated');
    await receiver.acknowledgeMessage({ messageIds: queued.map(message => message.messageId), host: host().origin });
    await receiver.disconnectWebSocket(); await restart(); await listen(); await awaitId(first.messageId); await wait(400);
    assert.equal(deliveries.filter(message => message.messageId === first.messageId).length, 1, 'Restart duplicated pending message');
    await receiver.acknowledgeMessage({ messageIds: [first.messageId], host: host().origin });
    await receiver.disconnectWebSocket(); await restart(); await listen();
    second = await participant(senderWallet, host()).sendMessage({ recipient: identity, messageBox: box, body: 'Post-ack push health' }, host().origin);
    await awaitId(second.messageId); await wait(400);
    assert.equal(received(first.messageId), false, 'Acknowledged message reappeared after restart');
    await receiver.acknowledgeMessage({ messageIds: [second.messageId], host: host().origin });
    return { transport: 'Actual TS AuthSocket over actual Go SQLite', goNativeWebSockets: false, adapterWebSockets: true, liveSendAuthenticatedHttpFallback: true, verifiedRecipient: identity, messageIds: [first.messageId, second.messageId], pagedPendingMessages: 34, foreignRoomDenied: true, leakedMessages: leaked, duplicateDeliveries: 0, reconnectRedelivery: true, restartRedelivery: true, acknowledgmentDurable: true };
  } finally { attacker?.disconnect(); await sender?.disconnectWebSocket(); await receiver?.disconnectWebSocket(); }
}
