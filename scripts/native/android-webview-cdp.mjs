#!/usr/bin/env node
import fs from 'node:fs';

const [command, endpoint = 'http://127.0.0.1:9223', argument] = process.argv.slice(2);
if (!['snapshot', 'evaluate'].includes(command) || (command === 'evaluate' && argument === undefined)) {
  console.error('usage: android-webview-cdp.mjs <snapshot | evaluate EXPRESSION> [ENDPOINT]');
  process.exit(2);
}

const targets = await (await fetch(`${endpoint}/json/list`)).json();
const target = targets.find(candidate => candidate.type === 'page' && candidate.webSocketDebuggerUrl);
if (!target) throw new Error('No debuggable Android WebView page was found');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let nextId = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(String(event.data));
  const resolve = pending.get(message.id);
  if (resolve) {
    pending.delete(message.id);
    resolve(message);
  }
});
const call = (method, params = {}) => new Promise(resolve => {
  const id = ++nextId;
  pending.set(id, resolve);
  socket.send(JSON.stringify({ id, method, params }));
});
const expression = command === 'snapshot'
  ? `({url:location.href,title:document.title,body:document.body.innerText,hasCWI:Boolean(window.CWI),cwiMethods:window.CWI?Object.keys(window.CWI).sort():[]})`
  : argument;
const response = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
socket.close();
if (response.error || response.result?.exceptionDetails) {
  console.error(JSON.stringify(response));
  process.exit(1);
}
process.stdout.write(`${JSON.stringify(response.result?.result?.value, null, 2)}\n`);
