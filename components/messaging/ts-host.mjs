// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

/** Embed the pinned production routes/auth/transports; mutable state is caller-owned. */
export async function startTypeScriptMessageBox({ source, state, key, wallet: suppliedWallet, port = 0 }) {
  const require = createRequire(path.join(source, 'package.json'));
  const load = name => import(pathToFileURL(require.resolve(name)).href);
  const { ProtoWallet, PrivateKey } = await load('@bsv/sdk');
  const { default: knexFactory } = await load('knex');
  const { createAuthMiddleware } = await load('@bsv/auth-express-middleware');
  const { KnexSessionManager, Setup } = await load('@bsv/wallet-toolbox');
  const compose = await import(pathToFileURL(path.join(source, 'src/compose.ts')).href);
  const { KnexPaymentReplayStore } = await import(pathToFileURL(path.join(source, 'src/security/KnexPaymentReplayStore.ts')).href);
  const db = knexFactory({ client: 'better-sqlite3', connection: { filename: state }, useNullAsDefault: true, pool: { min: 1, max: 1 } });
  let server, sockets;
  try {
    const migrations = fs.readdirSync(path.join(source, 'src/migrations')).filter(x => /^\d.*\.ts$/.test(x)).sort();
    await db.migrate.latest({ migrationSource: {
      getMigrations: async () => migrations,
      getMigrationName: name => name,
      getMigration: name => import(pathToFileURL(path.join(source, 'src/migrations', name)).href)
    }});
    const wallet = suppliedWallet ?? (process.env.TPNIL_MESSAGING_STORAGE_URL
      ? await Setup.createWalletClientNoEnv({ chain: 'main', rootKeyHex: key, storageUrl: process.env.TPNIL_MESSAGING_STORAGE_URL })
      : Object.assign(new ProtoWallet(PrivateKey.fromHex(key)), {
          internalizeAction: async () => { throw new Error('Paid acceptance requires an explicitly configured controlled wallet storage'); }
        }));
    const sessions = new KnexSessionManager(db);
    const replay = new KnexPaymentReplayStore(db);
    const ctx = compose.createMessageBoxContext({ wallet, knex: db, sessionManager: sessions, paymentReplayStore: replay, enableWebSockets: true });
    const app = compose.createMessageBoxApp();
    const { default: express } = await load('express');
    app.use(express.json({ limit: '1mb' }));
    compose.registerMessageBoxPreAuthRoutes(app, '', { knex: db, wallet, paymentReplayStore: replay });
    app.use(createAuthMiddleware({ wallet, sessionManager: sessions }));
    compose.registerMessageBoxPostAuthRoutes(app, ctx);
    server = http.createServer(app);
    sockets = compose.attachMessageBoxWebSockets(server, ctx);
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(Number(port), '127.0.0.1', resolve); });
    let closing;
    return {
      origin: `http://127.0.0.1:${server.address().port}`,
      identityKey: (await wallet.getPublicKey({ identityKey: true })).publicKey,
      async close() { return closing ??= (async () => { await compose.closeMessageBoxWebSockets(sockets); server.closeAllConnections(); if (server.listening) await new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve())); await db.destroy(); return { component: 'typescript-messagebox', httpListening: server.listening, databaseClosed: true }; })(); }
    };
  } catch (error) { if (sockets) await compose.closeMessageBoxWebSockets(sockets); if (server?.listening) server.close(); await db.destroy(); throw error; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [source, state, key, port = '0'] = process.argv.slice(2);
  const host = await startTypeScriptMessageBox({ source, state, key, port });
  process.stdout.write(JSON.stringify({ schema: 'tpnil-messagebox-host@1', origin: host.origin, identityKey: host.identityKey, implementation: 'typescript', websockets: true }) + '\n');
  const close = () => host.close().catch(error => { console.error(error); process.exitCode = 1; });
  process.once('SIGTERM', close); process.once('SIGINT', close);
}
