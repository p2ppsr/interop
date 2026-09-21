#!/usr/bin/env node
// Observe the admitted app's browser console without evaluating or changing page code.
const [endpoint, origin] = process.argv.slice(2)
if (!endpoint || !origin) throw new Error('usage: watch-webview-console.mjs ENDPOINT ORIGIN')

let socket
let currentTarget
let connecting = false
let stopped = false
let recorded = 0
const clean = value => String(value ?? '')
  .replace(/\b[0-9a-f]{32,}\b/gi, '[hex]')
  .replace(/\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[token]')
  .replace(/\b[A-Za-z0-9+/=_-]{48,}\b/g, '[opaque]')
  .replace(/\b\d{6,}\b/g, '[number]')
  .replaceAll('TPNIL-Fixture-2026!', '[fixture-password]')
  .slice(0, 600)

function record(kind, values) {
  if (recorded++ >= 500) return
  process.stdout.write(JSON.stringify({ at: new Date().toISOString(), origin, kind, values: values.map(clean) }) + '\n')
}

async function attach() {
  if (stopped || connecting || socket?.readyState === WebSocket.OPEN) return
  connecting = true
  try {
    const targets = await (await fetch(`${endpoint}/json/list`)).json()
    const target = targets.find(candidate => candidate.type === 'page' &&
      candidate.url?.startsWith(origin) && candidate.webSocketDebuggerUrl)
    if (!target) return
    const next = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      next.addEventListener('open', resolve, { once: true })
      next.addEventListener('error', reject, { once: true })
    })
    socket = next
    currentTarget = target.id
    next.addEventListener('message', event => {
      const message = JSON.parse(String(event.data))
      if (message.method === 'Runtime.consoleAPICalled' &&
        ['error', 'warning'].includes(message.params.type))
        record(message.params.type, message.params.args.map(arg => arg.value ?? arg.description))
      if (message.method === 'Runtime.exceptionThrown')
        record('exception', [message.params.exceptionDetails?.text,
          message.params.exceptionDetails?.exception?.description])
    })
    next.addEventListener('close', () => {
      if (currentTarget === target.id) { socket = undefined; currentTarget = undefined }
    })
    next.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }))
  } catch {
    // The native WebView and DevTools socket appear and disappear with navigation.
  } finally {
    connecting = false
  }
}

const interval = setInterval(() => void attach(), 1_000)
process.on('SIGTERM', () => {
  stopped = true
  clearInterval(interval)
  socket?.close()
  process.exit(0)
})
void attach()
