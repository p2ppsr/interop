import { describe, expect, it } from 'vitest'
import { BOARD_TOPIC, decodeAndVerifyBoardToken, encodeBoardToken } from '../src/board.js'
import { ReferenceCHIRPNetwork } from '../src/content.js'
import { sha256Hex } from '../src/determinism.js'
import { createFixtureWallet } from '../src/lch-reference/fixtureWallet.js'
import { ReferenceBoardOverlay } from '../src/overlay.js'
import { OverlayHttpClient, startOverlayHttpService } from '../src/overlay-http.js'
import { runReferenceSynthesis } from '../src/run.js'
import {
  ReferenceUHRPOverlay,
  UHRPHttpClient,
  decodeAndVerifyUHRPAdvertisement,
  encodeUHRPAdvertisement,
  startUHRPHttpService
} from '../src/uhrp.js'
import { StorageUtils } from '@bsv/sdk'

describe('TPNIL synthesis building blocks', () => {
  it('executes the complete reference golden path deterministically at the semantic boundary', async () => {
    const options = {
      seed: 'tpnil-synthesis-test',
      startTime: 1_800_000_000n,
      profile: 'reference' as const
    }
    const first = await runReferenceSynthesis(options)
    const second = await runReferenceSynthesis(options)
    expect(first.outcome).toBe('PASS')
    expect(first.assertions).toEqual(
      Object.fromEntries(Object.keys(first.assertions).map(key => [key, true]))
    )
    expect(second.evidence.assetId).toBe(first.evidence.assetId)
    expect(second.evidence.plaintextSha256).toBe(first.evidence.plaintextSha256)
    expect(first.evidence.replayStateDigest).toBe(first.evidence.overlayStateDigest)
    expect(second.evidence.replayStateDigest).toBe(second.evidence.overlayStateDigest)
    expect(second.evidence.paymentReceipts).toBe(first.evidence.paymentReceipts)
    expect(first.evidence.uhrpAdvertisements).toBeGreaterThan(1)
    expect(second.evidence.uhrpStateDigest).toBe(first.evidence.uhrpStateDigest)
  })

  it('rejects an altered PushDrop record signature', async () => {
    const wallet = createFixtureWallet(301)
    const token = await encodeBoardToken(wallet, {
      id: sha256Hex('tamper-token'),
      key: 'board/tamper',
      revision: 1,
      previous: null,
      createdAt: 1_800_000_000,
      body: 'untampered',
      attachment: {
        assetId: sha256Hex('asset'),
        lch: 'AA',
        mediaType: 'image/png',
        plaintextSha256: sha256Hex('plaintext')
      }
    })
    const bytes = Uint8Array.from(Buffer.from(token.lockingScriptHex, 'hex'))
    const index = bytes.length - 5
    bytes[index] = (bytes[index] ?? 0) ^ 1
    await expect(decodeAndVerifyBoardToken(Buffer.from(bytes).toString('hex'))).rejects.toThrow()
  })

  it('enforces current-token spending, rejects a double spend, and replays the journal', async () => {
    const wallet = createFixtureWallet(302)
    const overlay = new ReferenceBoardOverlay()
    const attachment = {
      assetId: sha256Hex('overlay-asset'),
      lch: 'AA',
      mediaType: 'image/png',
      plaintextSha256: sha256Hex('overlay-plaintext')
    }
    const first = await encodeBoardToken(wallet, {
      id: sha256Hex('overlay-1'),
      key: 'board/overlay',
      revision: 1,
      previous: null,
      createdAt: 1,
      body: 'one',
      attachment
    })
    const accepted = await overlay.submit({ topic: BOARD_TOPIC, lockingScriptHex: first.lockingScriptHex, spends: [] })
    const second = await encodeBoardToken(wallet, {
      id: sha256Hex('overlay-2'),
      key: 'board/overlay',
      revision: 2,
      previous: accepted.outpoint,
      createdAt: 2,
      body: 'two',
      attachment
    })
    await overlay.submit({
      topic: BOARD_TOPIC,
      lockingScriptHex: second.lockingScriptHex,
      spends: [accepted.outpoint]
    })
    await expect(
      overlay.submit({
        topic: BOARD_TOPIC,
        lockingScriptHex: second.lockingScriptHex,
        spends: [accepted.outpoint]
      })
    ).rejects.toThrow()
    const replay = await ReferenceBoardOverlay.replay(overlay.journal())
    expect(replay.stateDigest()).toBe(overlay.stateDigest())
  })

  it('retrieves through a second CHIRP host and rejects corruption at every host', async () => {
    const network = new ReferenceCHIRPNetwork()
    const bytes = new TextEncoder().encode('content availability fixture')
    const published = await network.publish(bytes, 'text/plain')
    network.setHostMode(0, 'corrupt')
    await expect(network.downloader().download(published.chirpURL)).resolves.toMatchObject({ data: bytes })
    network.setHostMode(1, 'corrupt')
    await expect(network.downloader().download(published.chirpURL)).rejects.toMatchObject({
      code: 'ERR_CHIRP_FETCH'
    })
  })

  it('exercises submission and lookup over HTTP and synchronizes an independent overlay', async () => {
    const wallet = createFixtureWallet(303)
    const source = new ReferenceBoardOverlay()
    const service = await startOverlayHttpService(source)
    try {
      const client = new OverlayHttpClient(service.origin)
      const token = await encodeBoardToken(wallet, {
        id: sha256Hex('http-overlay-1'),
        key: 'board/http-overlay',
        revision: 1,
        previous: null,
        createdAt: 3,
        body: 'served over HTTP',
        attachment: {
          assetId: sha256Hex('http-asset'),
          lch: 'AA',
          mediaType: 'image/png',
          plaintextSha256: sha256Hex('http-plaintext')
        }
      })
      const result = await client.submit({ topic: BOARD_TOPIC, lockingScriptHex: token.lockingScriptHex, spends: [] })
      expect((await client.lookup('board/http-overlay'))?.outpoint).toBe(result.outpoint)

      const replica = new ReferenceBoardOverlay()
      await replica.synchronize(await client.journal())
      expect(replica.stateDigest()).toBe((await client.state()).digest)
    } finally {
      await service.close()
    }
  })

  it('advertises CHIRP content through the canonical UHRP token and HTTP lookup boundary', async () => {
    const wallet = createFixtureWallet(304)
    const uhrpUrl = `uhrp://${StorageUtils.getURLForFile(new TextEncoder().encode('uhrp fixture'))}`
    const advertisement = await encodeUHRPAdvertisement(wallet, {
      uhrpUrl,
      hostedFileLocation: 'https://content-a.tpnil.test/chirp/root/objects/root',
      expiryTime: 1_800_086_400,
      fileSize: 12
    })
    await expect(decodeAndVerifyUHRPAdvertisement(advertisement.lockingScript)).resolves.toEqual(advertisement.record)

    const overlay = new ReferenceUHRPOverlay()
    const service = await startUHRPHttpService(overlay)
    try {
      const client = new UHRPHttpClient(service.origin)
      const submitted = await client.submit(advertisement.lockingScriptHex)
      expect(await client.lookup(uhrpUrl, 1_800_000_000)).toHaveLength(1)
      expect(await client.lookup(uhrpUrl, 1_800_086_400)).toHaveLength(0)
      await client.revoke(submitted.outpoint)
      expect(await client.lookup(uhrpUrl, 1_800_000_000)).toHaveLength(0)
      const replay = await ReferenceUHRPOverlay.replay(await client.journal())
      expect(replay.stateDigest()).toBe(overlay.stateDigest())
    } finally {
      await service.close()
    }
  })
})
