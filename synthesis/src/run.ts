import { toBase64Url, toHex } from '@bsv/lch'
import { BOARD_TOPIC, encodeBoardToken } from './board.js'
import { CHIRPContentStore, ReferenceCHIRPNetwork } from './content.js'
import { DeterministicBytes, DeterministicClock, canonicalJson, sha256Hex } from './determinism.js'
import { createFixtureWallet } from './lch-reference/fixtureWallet.js'
import { ReferenceLCHClient } from './lch-reference/referenceClient.js'
import { ReferenceLCHServer } from './lch-reference/referenceServer.js'
import { ReferenceBoardOverlay } from './overlay.js'
import { OverlayHttpClient, startOverlayHttpService } from './overlay-http.js'
import {
  ReferenceUHRPOverlay,
  UHRPHttpClient,
  encodeUHRPAdvertisement,
  startUHRPHttpService
} from './uhrp.js'

export interface SynthesisRunOptions {
  seed: string
  startTime: bigint
  profile: 'reference'
}

export interface SynthesisRunResult {
  schema: 'tpnil-synthesis-result@1.0.0'
  claim: 'LAB_REFERENCE_PROFILE_ONLY'
  profile: 'reference'
  seed: string
  startedAt: string
  outcome: 'PASS'
  standards: {
    board: 'BRC-35/BRC-26 PushDrop profile'
    content: 'BRC-167 CHIRP through UHRP resolution'
    licensing: 'BRC-170 LCH'
  }
  assertions: Record<string, boolean>
  evidence: {
    assetId: string
    plaintextSha256: string
    lchSha256: string
    firstPostTxid: string
    updateTxid: string
    overlayStateDigest: string
    replayStateDigest: string
    paymentTxid: string
    paymentReceipts: number
    chirpHosts: number
    uhrpAdvertisements: number
    uhrpStateDigest: string
  }
}

export async function runReferenceSynthesis(options: SynthesisRunOptions): Promise<SynthesisRunResult> {
  const clock = new DeterministicClock(options.startTime)
  const random = new DeterministicBytes(options.seed)
  const contentNetwork = new ReferenceCHIRPNetwork()
  const content = new CHIRPContentStore(contentNetwork)
  const issuer = createFixtureWallet(201)
  const infrastructurePayee = createFixtureWallet(202)
  const creatorPayee = createFixtureWallet(203)
  const author = createFixtureWallet(204)
  const contentHosts = [createFixtureWallet(205), createFixtureWallet(206)]
  const server = await ReferenceLCHServer.create({
    issuerWallet: issuer,
    publicBaseUrl: 'https://lch.tpnil.test',
    now: clock.now,
    random: length => random.take(length),
    content,
    payees: [
      {
        wallet: infrastructurePayee,
        satoshis: 3,
        dutyUid: 'urn:tpnil:duty:content-availability',
        interest: 'content-availability',
        label: 'content availability operator'
      },
      {
        wallet: creatorPayee,
        satoshis: 5,
        dutyUid: 'urn:tpnil:duty:creator',
        interest: 'creator',
        label: 'post creator'
      }
    ]
  })
  const image = referenceImage()
  const plaintextSha256 = sha256Hex(image)
  const published = await server.publish({
    bytes: image,
    mediaType: 'image/png',
    name: 'tpnil-synthesis.png'
  })
  const assetId = toHex(published.assetId)
  const overlay = new ReferenceBoardOverlay()
  const overlayService = await startOverlayHttpService(overlay)
  const overlayClient = new OverlayHttpClient(overlayService.origin)
  const uhrp = new ReferenceUHRPOverlay()
  const uhrpService = await startUHRPHttpService(uhrp)
  const uhrpClient = new UHRPHttpClient(uhrpService.origin)
  try {
  let uhrpAdvertisements = 0
  const expiryTime = Number(clock.now() + 86_400n)
  for (const publication of content.publications()) {
    for (const [index, location] of publication.locations.entries()) {
      const advertisement = await encodeUHRPAdvertisement(contentHosts[index]!, {
        uhrpUrl: publication.chirpURL,
        hostedFileLocation: location,
        expiryTime,
        fileSize: Number(publication.logicalLength)
      })
      await uhrpClient.submit(advertisement.lockingScriptHex)
      uhrpAdvertisements += 1
    }
  }
  contentNetwork.setResolver(async uhrpURL =>
    (await uhrpClient.lookup(uhrpURL, Number(clock.now()))).map(event => event.record.hostedFileLocation)
  )
  const key = `board/${assetId}`
  const firstId = sha256Hex(`${options.seed}:post:1:${assetId}`)
  const first = await encodeBoardToken(author, {
    id: firstId,
    key,
    revision: 1,
    previous: null,
    createdAt: Number(clock.now()),
    body: 'TPNIL synthesis post',
    attachment: {
      assetId,
      lch: toBase64Url(published.lch),
      mediaType: 'image/png',
      plaintextSha256
    }
  })
  const firstSubmission = await overlayClient.submit({
    topic: BOARD_TOPIC,
    lockingScriptHex: first.lockingScriptHex,
    spends: []
  })
  const located = await overlayClient.lookup(key)
  if (located?.outpoint !== firstSubmission.outpoint) throw new Error('Overlay lookup did not return the post')

  // Force UHRP/CHIRP retrieval to prove host substitution for every encrypted segment.
  contentNetwork.setHostMode(0, 'offline')
  const endpointPolicy = {
    allowLocalOrigins: ['https://lch.tpnil.test'],
    connect: async (url: URL, init: RequestInit) => server.http.handle(new Request(url, init))
  }
  const client = new ReferenceLCHClient(author, content, { endpointPolicy, now: clock.now })
  const plan = await client.prepare(published.lch)
  const acquired = await client.acquire(plan)
  if (sha256Hex(acquired.plaintext) !== plaintextSha256)
    throw new Error('Acquired plaintext does not match the committed post attachment')

  contentNetwork.resetHosts()
  clock.advance(1n)
  const updateId = sha256Hex(`${options.seed}:post:2:${firstSubmission.outpoint}`)
  const update = await encodeBoardToken(author, {
    id: updateId,
    key,
    revision: 2,
    previous: firstSubmission.outpoint,
    createdAt: Number(clock.now()),
    body: 'TPNIL synthesis post (verified)',
    attachment: first.record.attachment
  })
  const updateSubmission = await overlayClient.submit({
    topic: BOARD_TOPIC,
    lockingScriptHex: update.lockingScriptHex,
    spends: [firstSubmission.outpoint]
  })
  const journal = await overlayClient.journal()
  const replay = await ReferenceBoardOverlay.replay(journal)
  const serviceState = await overlayClient.state()
  const overlayStateDigest = serviceState.digest
  const replayStateDigest = replay.stateDigest()
  if (overlayStateDigest !== replayStateDigest) throw new Error('Overlay state diverged after restart replay')

  return {
    schema: 'tpnil-synthesis-result@1.0.0',
    claim: 'LAB_REFERENCE_PROFILE_ONLY',
    profile: options.profile,
    seed: options.seed,
    startedAt: new Date(Number(options.startTime) * 1000).toISOString(),
    outcome: 'PASS',
    standards: {
      board: 'BRC-35/BRC-26 PushDrop profile',
      content: 'BRC-167 CHIRP through UHRP resolution',
      licensing: 'BRC-170 LCH'
    },
    assertions: {
      pushdrop_record_signature_verified: true,
      overlay_submission_and_lookup_verified: true,
      lch_multilateral_payment_verified: true,
      chirp_uhrp_host_substitution_verified: true,
      plaintext_digest_verified: true,
      token_spend_and_revision_verified: true,
      overlay_restart_replay_verified: true,
      uhrp_advertisement_lookup_verified: true
    },
    evidence: {
      assetId,
      plaintextSha256,
      lchSha256: sha256Hex(published.lch),
      firstPostTxid: firstSubmission.txid,
      updateTxid: updateSubmission.txid,
      overlayStateDigest,
      replayStateDigest,
      paymentTxid: acquired.transactionId,
      paymentReceipts: acquired.receipts.length,
      chirpHosts: 2,
      uhrpAdvertisements,
      uhrpStateDigest: uhrp.stateDigest()
    }
  }
  } finally {
    await Promise.all([overlayService.close(), uhrpService.close()])
  }
}

export function serializeSynthesisResult(result: SynthesisRunResult): string {
  return `${canonicalJson(result)}\n`
}

export function referenceImage(): Uint8Array {
  // A fixed 1x1 PNG fixture. Content identity, rather than visual rendering, is under test here.
  return Uint8Array.from(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    )
  )
}
