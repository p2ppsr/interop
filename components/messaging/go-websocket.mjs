// SPDX-License-Identifier: Apache-2.0
import http from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

/** Actual TS AuthSocket over the Go message store. The verified socket identity
 * is the sole read selector. Recipient keys and HTTP impersonation are absent.
 * Writes, acknowledgments and paid-message internalization use Go AuthFetch.
 */
export async function startGoWebSocketBridge({ source, state, key, upstream, port = 0, intervalMs = 100 }) {
  const require = createRequire(path.join(source, 'package.json'));
  const load = name => import(pathToFileURL(require.resolve(name)).href);
  const { ProtoWallet, PrivateKey, PublicKey } = await load('@bsv/sdk');
  const { AuthSocketServer } = await load('@bsv/authsocket');
  const Database = require('better-sqlite3');
  const db = new Database(state, { readonly: true, fileMustExist: true });
  const rows = db.prepare(`SELECT messages.messageId, messages.sender, messages.body FROM messages JOIN messageBox ON messages.messageBoxId=messageBox.messageBoxId WHERE messageBox.identityKey=? AND messageBox.type=? ORDER BY messages.created_at ASC, messages.messageId ASC LIMIT 32 OFFSET ?`);
  const agent = new http.Agent({ keepAlive: false }), requests = new Set();
  const server = http.createServer((request, response) => {
    if (!request.url?.startsWith('/') || request.url.startsWith('//')) { response.writeHead(400); response.end(); return; }
    const target = http.request(new URL(upstream), { path: request.url, method: request.method, headers: { ...request.headers, host: new URL(upstream).host }, agent }, result => { response.writeHead(result.statusCode, result.headers); result.pipe(response); });
    requests.add(target); target.once('close', () => requests.delete(target));
    target.once('error', error => { if (!response.headersSent) response.writeHead(502); response.end(); });
    request.on('aborted', () => target.destroy()); request.pipe(target);
  });
  const io = new AuthSocketServer(server, { wallet: new ProtoWallet(PrivateKey.fromHex(key)), maxHttpBufferSize: 1024 * 1024 });
  const sockets = new Map(); let stopped = false, busy = false, active = Promise.resolve();
  io.on('connection', socket => {
    if (sockets.size >= 128) { socket.ioSocket.disconnect(true); return; }
    const state = { socket, identity: null, rooms: new Map(), delivered: new Set() }; sockets.set(socket.id, state);
    socket.on('disconnect', () => sockets.delete(socket.id));
    socket.ioSocket.once('disconnect', () => sockets.delete(socket.id));
    socket.on('authenticated', async claim => {
      try {
        const identity = socket.identityKey;
        if (typeof identity !== 'string' || PublicKey.fromString(identity).toString() !== identity || (claim?.identityKey !== undefined && claim.identityKey !== identity)) throw new Error('Identity mismatch');
        if ([...sockets.values()].filter(other => other.identity === identity).length >= 8) throw new Error('Identity connection limit');
        state.identity = identity; await socket.emit('authenticationSuccess', { status: 'success' });
      } catch { await socket.emit('authenticationFailed', { reason: 'Authenticated identity required' }); socket.ioSocket.disconnect(true); }
    });
    socket.on('joinRoom', async room => {
      const prefix = `${state.identity}-`, box = typeof room === 'string' && room.startsWith(prefix) ? room.slice(prefix.length) : '';
      if (!state.identity || !box || Buffer.byteLength(box) > 128 || /[\x00-\x1f\x7f]/.test(box) || state.rooms.size >= 32) { await socket.emit('joinFailed', { roomId: room, code: 'ERR_WEBSOCKET_ROOM_NOT_OWNED', reason: 'Room is not owned by authenticated identity or exceeds limits' }); return; }
      if (!state.rooms.has(room)) state.rooms.set(room, 0); await socket.emit('joinedRoom', { roomId: room });
    });
    socket.on('leaveRoom', async room => { if (!state.rooms.has(room)) { await socket.emit('leaveFailed', { reason: 'Room is not owned by authenticated identity' }); return; } state.rooms.delete(room); await socket.emit('leftRoom', { roomId: room }); });
    // Clients already fall back to authenticated HTTP for fee-bearing sends.
    // Keep one write/fee/replay authority in the actual Go handlers.
    socket.on('sendMessage', async data => { if (typeof data?.roomId === 'string') await socket.emit(`sendMessageAck-${data.roomId}`, { status: 'error', code: 'ERR_PAYMENT_REQUIRES_AUTHFETCH' }); });
  });
  async function poll() {
    for (const state of sockets.values()) {
      if (!state.identity) continue;
      for (const [room, offset] of state.rooms) {
        const box = room.slice(state.identity.length + 1);
        const page = rows.all(state.identity, box, offset);
        // Wrap bounded scans: insert/delete ordering cannot permanently hide
        // rows, including when SQLite reuses a removed maximum rowid.
        state.rooms.set(room, page.length === 32 ? offset + page.length : 0);
        for (const row of page) {
          if (stopped || state.delivered.has(row.messageId)) continue;
          if (state.delivered.size >= 10000) { state.socket.ioSocket.disconnect(true); break; }
          const envelope = JSON.parse(row.body);
          // Match upstream TS transport semantics: paid messages must be read
          // via listMessages so payment internalization precedes acknowledgment.
          if (envelope.payment) continue;
          let timeout;
          try {
            await Promise.race([
              state.socket.emit(`sendMessage-${room}`, { sender: row.sender, messageId: row.messageId, body: envelope.message }),
              new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Socket delivery deadline')), 5000); })
            ]);
          } finally { clearTimeout(timeout); }
          state.delivered.add(row.messageId);
        }
      }
    }
  }
  const timer = setInterval(() => {
    if (busy || stopped) return;
    busy = true;
    active = poll().catch(() => { for (const state of sockets.values()) state.socket.ioSocket.disconnect(true); }).finally(() => { busy = false; });
  }, intervalMs);
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); }
  catch (error) { stopped = true; clearInterval(timer); await active; await io.close(); db.close(); agent.destroy(); throw error; }
  let closing;
  return { origin: `http://127.0.0.1:${server.address().port}`, async close() { return closing ??= (async () => {
    stopped = true; clearInterval(timer); await active; await io.close();
    for (const request of requests) request.destroy(); agent.destroy(); server.closeAllConnections();
    if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    db.close(); sockets.clear(); return { component: 'go-authsocket-bridge', httpListening: server.listening, socketCount: sockets.size, databaseClosed: true };
  })(); } };
}
