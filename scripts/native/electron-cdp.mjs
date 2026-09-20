#!/usr/bin/env node
import fs from 'node:fs';

const [command, ...args] = process.argv.slice(2);
const endpoint = process.env.TPNIL_CDP_ENDPOINT ?? 'http://127.0.0.1:9222';

async function target() {
  const response = await fetch(`${endpoint}/json/list`);
  if (!response.ok) throw new Error(`CDP target discovery returned ${response.status}`);
  const targets = await response.json();
  const page = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl);
  if (!page) throw new Error('No Electron page target is available');
  return page;
}

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP connection timeout')), 10000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP connection failed')); }, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject, timer } = pending.get(message.id); pending.delete(message.id); clearTimeout(timer);
    if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
  });
  socket.addEventListener('close', () => {
    for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(new Error('CDP connection closed')); }
    pending.clear();
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP ${method} timeout`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  return { socket, call };
}

async function evaluate(call, expression) {
  const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'Renderer evaluation failed');
  return result.result?.value;
}

function clickExpression(text) {
  return `(() => {
    const wanted = ${JSON.stringify(text)};
    const elements = [...document.querySelectorAll('button,[role="button"]')];
    const element = elements.find(item => item.innerText.trim() === wanted) ?? elements.find(item => item.innerText.includes(wanted));
    if (!element) throw new Error('button not found: ' + wanted);
    element.click();
    return { clicked: element.innerText.trim() };
  })()`;
}

function fillExpression(label, value) {
  return `(() => {
    const wanted = ${JSON.stringify(label)};
    const value = ${JSON.stringify(value)};
    const labels = [...document.querySelectorAll('label')];
    const matched = labels.find(item => item.innerText.trim() === wanted) ?? labels.find(item => item.innerText.includes(wanted));
    let input = matched?.htmlFor ? document.getElementById(matched.htmlFor) : null;
    input ??= [...document.querySelectorAll('input,textarea')].find(item =>
      item.getAttribute('aria-label') === wanted || item.getAttribute('placeholder')?.includes(wanted));
    if (!input) throw new Error('input not found: ' + wanted);
    const prototype = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return { filled: matched?.innerText.trim() ?? input.getAttribute('aria-label') ?? input.getAttribute('placeholder'), length: value.length };
  })()`;
}

const snapshotExpression = `(() => ({
  url: location.href,
  title: document.title,
  text: document.body.innerText,
  buttons: [...document.querySelectorAll('button,[role="button"]')].map(item => item.innerText.trim()).filter(Boolean),
  inputs: [...document.querySelectorAll('input,textarea')].map(item => ({
    id: item.id,
    type: item.type,
    label: item.id ? document.querySelector('label[for="' + CSS.escape(item.id) + '"]')?.innerText.trim() ?? null : null,
    placeholder: item.getAttribute('placeholder'),
    valueLength: item.value.length
  }))
}))()`;

try {
  const page = await target();
  const { socket, call } = await connect(page.webSocketDebuggerUrl);
  let result;
  if (command === 'snapshot' && args.length === 0) result = await evaluate(call, snapshotExpression);
  else if (command === 'wait-text' && (args.length === 1 || args.length === 2)) {
    const wanted = args[0], timeout = args.length === 2 ? Number(args[1]) : 60000;
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 300000) throw new Error('Invalid wait timeout');
    const deadline = Date.now() + timeout;
    do {
      result = await evaluate(call, snapshotExpression);
      if (result.text.includes(wanted)) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    } while (Date.now() < deadline);
    if (!result.text.includes(wanted)) throw new Error(`text not observed before timeout: ${wanted}`);
  }
  else if (command === 'click-text' && args.length === 1) result = await evaluate(call, clickExpression(args[0]));
  else if (command === 'fill-label' && args.length === 2) result = await evaluate(call, fillExpression(args[0], args[1]));
  else if (command === 'eval' && args.length === 1) result = await evaluate(call, args[0]);
  else if (command === 'screenshot' && args.length === 1) {
    await call('Page.enable');
    const capture = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(args[0], Buffer.from(capture.data, 'base64'), { flag: 'wx', mode: 0o644 });
    result = { path: args[0], bytes: Buffer.byteLength(capture.data, 'base64') };
  } else throw new Error('usage: electron-cdp.mjs snapshot | wait-text <text> [timeout-ms] | click-text <text> | fill-label <label> <value> | eval <expression> | screenshot <new-file>');
  socket.close();
  process.stdout.write(JSON.stringify({ target: { id: page.id, title: page.title, url: page.url }, result }, null, 2) + '\n');
} catch (error) {
  process.stderr.write(`TPNIL CDP ERROR: ${error.message}\n`);
  process.exitCode = 2;
}
