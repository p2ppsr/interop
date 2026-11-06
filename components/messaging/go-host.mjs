// SPDX-License-Identifier: Apache-2.0
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { startGoWebSocketBridge } from './go-websocket.mjs';
const deadline = (promise, ms) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Go MessageBox deadline ${ms}ms`)), ms);
  Promise.resolve(promise).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
});
export async function startGoMessageBox({ binary, state, key, port = 0, compatibility = true, typescriptSource, websockets = compatibility, onClose = () => {} }) {
  if (websockets && !typescriptSource) throw new Error('Go AuthSocket bridge requires the pinned TypeScript MessageBox source');
  const child = spawn(binary, ['--state', state, '--key', key, '--port', String(websockets ? 0 : port), ...(compatibility ? ['--compatibility'] : [])], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '', stdout = '', closing, bridge;
  child.stderr.on('data', data => { stderr += data; });
  const close = () => closing ??= (async () => {
    let bridgeReceipt, bridgeError;
    try { bridgeReceipt = await bridge?.close(); } catch (error) { bridgeError = error; }
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit'); child.kill('SIGTERM');
      try { await deadline(exited, 15000); } catch { child.kill('SIGKILL'); await deadline(exited, 5000); }
    }
    const receipt = { component: 'go-messagebox', pid: child.pid, exitCode: child.exitCode, signal: child.signalCode, compatibility, bridge: bridgeReceipt, stdout, stderr };
    await onClose(receipt);
    if (bridgeError) throw bridgeError;
    if (child.exitCode !== 0) throw new Error(`Go MessageBox shutdown ${child.exitCode}/${child.signalCode}`);
    return receipt;
  })();
  try {
    const ready = await deadline(new Promise((resolve, reject) => {
      child.once('error', reject); child.once('exit', code => reject(new Error(`Go MessageBox startup exit ${code}: ${stderr}`)));
      child.stdout.on('data', data => { stdout += data; if (stdout.length > 65536) reject(new Error('Go startup output exceeded limit')); for (const line of stdout.split('\n')) { try { const value = JSON.parse(line); if (value.schema === 'tpnil-messagebox-host@1') resolve(value); } catch {} } });
    }), 30000);
    const origin = new URL(ready.origin);
    if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1') throw new Error('Go MessageBox bound an unexpected origin');
    if (websockets) bridge = await startGoWebSocketBridge({ source: typescriptSource, state, key, upstream: ready.origin, port });
    return { ...ready, upstreamOrigin: ready.origin, origin: bridge?.origin ?? ready.origin, websockets: Boolean(bridge), goNativeWebSockets: false, ...(bridge ? { transportImplementation: 'typescript-authsocket-over-go-sqlite' } : {}), close };
  } catch (error) { try { await close(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Go MessageBox startup/cleanup failed'); } throw error; }
}
