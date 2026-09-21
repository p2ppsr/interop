import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import tls from 'node:tls'
import { afterEach, describe, expect, it } from 'vitest'
import { ControlledWalletServices } from '../src/wallet-lab/services.js'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true })
})

async function openControlledTunnel(proxyUrl: string): Promise<tls.TLSSocket> {
  const proxy = new URL(proxyUrl)
  const socket = net.connect(Number(proxy.port), proxy.hostname)
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve)
    socket.once('error', reject)
  })
  socket.write('CONNECT todo.itcve.test:443 HTTP/1.1\r\nHost: todo.itcve.test:443\r\n\r\n')
  await new Promise<void>((resolve, reject) => {
    let response = ''
    const onData = (chunk: Buffer): void => {
      response += chunk.toString('latin1')
      if (!response.includes('\r\n\r\n')) return
      socket.off('data', onData)
      if (!response.startsWith('HTTP/1.1 200')) reject(new Error(`CONNECT failed: ${response}`))
      else resolve()
    }
    socket.on('data', onData)
    socket.once('error', reject)
  })
  const secure = tls.connect({ socket, servername: 'todo.itcve.test', rejectUnauthorized: false })
  secure.on('error', () => undefined)
  await new Promise<void>((resolve, reject) => {
    secure.once('secureConnect', resolve)
    secure.once('error', reject)
  })
  secure.write('GET / HTTP/1.1\r\nHost: todo.itcve.test\r\nConnection: keep-alive\r\n\r\n')
  await new Promise<void>((resolve, reject) => {
    secure.once('data', () => resolve())
    secure.once('error', reject)
  })
  return secure
}

describe('controlled wallet services', () => {
  it('forcibly releases generated MITM listeners and active tunnels', async () => {
    const webroot = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-controlled-webroot-'))
    temporaryDirectories.push(webroot)
    fs.writeFileSync(path.join(webroot, 'index.html'), '<!doctype html><title>fixture</title>')
    const services = new ControlledWalletServices({ webroot })
    await services.start()
    const tunnel = await openControlledTunnel(services.proxyUrl)
    await services.close()
    await Promise.race([
      new Promise<void>(resolve => tunnel.once('close', () => resolve())),
      new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('proxy tunnel remained open')), 2_000))
    ])
    expect(tunnel.destroyed).toBe(true)
  }, 15_000)
})
