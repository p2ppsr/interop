import { CHIRPBuilder, CHIRPDownloader, type CHIRPObjectSink } from '@bsv/chirp'
import { ReferenceContentStore } from './lch-reference/referenceServer.js'

type HostMode = 'online' | 'offline' | 'corrupt'

interface Host {
  readonly origin: string
  mode: HostMode
  readonly objects: Map<string, Uint8Array>
}

export interface PublishedCHIRP {
  chirpURL: string
  rootIdentifier: string
  logicalLength: bigint
  objectCount: number
  locations: string[]
}

export class ReferenceCHIRPNetwork implements CHIRPObjectSink {
  private readonly hosts: Host[]
  private readonly roots = new Set<string>()
  private resolver?: (uhrpURL: string) => Promise<string[]>

  constructor(origins = ['https://chirp-a.tpnil.test', 'https://chirp-b.tpnil.test']) {
    if (origins.length < 2) throw new TypeError('The reference profile requires two CHIRP hosts')
    this.hosts = origins.map(origin => ({ origin: new URL(origin).origin, mode: 'online', objects: new Map() }))
  }

  async putObject(identifier: string, bytes: Uint8Array, kind: 'blob' | 'branch' | 'root') {
    for (const host of this.hosts) host.objects.set(identifier, bytes.slice())
    if (kind === 'root') this.roots.add(identifier)
  }

  async publish(bytes: Uint8Array, mediaType: string): Promise<PublishedCHIRP> {
    const result = await new CHIRPBuilder().build(bytes, { mediaType, sink: this })
    return {
      chirpURL: result.chirpURL,
      rootIdentifier: result.rootIdentifier,
      logicalLength: result.logicalLength,
      objectCount: result.objectCount,
      locations: this.locations(result.rootIdentifier)
    }
  }

  setResolver(resolver: (uhrpURL: string) => Promise<string[]>): void {
    this.resolver = resolver
  }

  locationsFor(rootIdentifier: string): string[] {
    return this.locations(rootIdentifier)
  }

  downloader(): CHIRPDownloader {
    return new CHIRPDownloader({
      resolve: async uhrpURL => this.resolver === undefined ? this.locations(rootFromURL(uhrpURL)) : this.resolver(uhrpURL),
      fetch: async input => this.fetch(String(input)),
      retriesPerObject: this.hosts.length,
      concurrency: 4
    })
  }

  setHostMode(index: number, mode: HostMode): void {
    const host = this.hosts[index]
    if (host === undefined) throw new RangeError(`Unknown CHIRP host ${index}`)
    host.mode = mode
  }

  resetHosts(): void {
    for (const host of this.hosts) host.mode = 'online'
  }

  private locations(rootIdentifier: string): string[] {
    if (!this.roots.has(rootIdentifier)) return []
    return this.hosts.map(
      host => `${host.origin}/chirp/v1/${rootIdentifier}/objects/${rootIdentifier}`
    )
  }

  private async fetch(urlValue: string): Promise<Response> {
    const url = new URL(urlValue)
    const host = this.hosts.find(candidate => candidate.origin === url.origin)
    if (host === undefined || host.mode === 'offline') return new Response(null, { status: 503 })
    const identifier = url.pathname.split('/').at(-1)
    const bytes = identifier === undefined ? undefined : host.objects.get(identifier)
    if (bytes === undefined) return new Response(null, { status: 404 })
    const result = bytes.slice()
    if (host.mode === 'corrupt' && result.length > 0) result[0] = (result[0] ?? 0) ^ 0xff
    return new Response(result, {
      status: 200,
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': String(result.length),
        'content-encoding': 'identity'
      }
    })
  }
}

export class CHIRPContentStore extends ReferenceContentStore {
  private readonly published: PublishedCHIRP[] = []
  constructor(private readonly network: ReferenceCHIRPNetwork) {
    super('https://unused.tpnil.test')
  }

  override async put(ciphertext: Uint8Array): Promise<string[]> {
    const published = await this.network.publish(ciphertext, 'application/octet-stream')
    this.published.push(published)
    return [published.chirpURL]
  }

  publications(): PublishedCHIRP[] {
    return this.published.map(item => ({ ...item, locations: [...item.locations] }))
  }

  override async read(locator: string, start = 0n, end?: bigint): Promise<Uint8Array> {
    const result = await this.network.downloader().download(locator, {
      ...(start === 0n && end === undefined ? {} : { range: { start, endExclusive: end ?? (1n << 62n) } })
    })
    return result.data
  }
}

function rootFromURL(value: string): string {
  const match = /^(?:uhrp|chirp):\/\/([^/?#]+)$/u.exec(value)
  if (match?.[1] === undefined) throw new TypeError(`Invalid content URL: ${value}`)
  return match[1]
}
