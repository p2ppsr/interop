# Third-party materials and licensing limits

Original TPNIL materials use [Apache-2.0](LICENSE). The following materials retain their own terms and are excluded from that grant. Their inclusion or use does not establish vendor participation or endorsement.

## Retained Open BSV materials — not relicensed

| Material | Provenance and applicable terms |
| --- | --- |
| `fixtures/standards/brc-167/chirp-v1.json` | Imported from `bsv-blockchain/ts-stack` at `f999e0c1aad9a7afd0cbadaaf23841d049af9d5a`; [manifest](fixtures/standards/manifest.json), Open BSV License Version 6 |
| `fixtures/standards/brc-170/conformance-vectors.json` | Imported from `bsv-blockchain/BRCs` at `9c9b3ecfe1c0b765400812deff57d018a01cf0ec`; [manifest](fixtures/standards/manifest.json), Open BSV License Version 6 |
| `synthesis/src/lch-reference/` and `synthesis/test/lch-reference.test.ts` | Adapted from the pinned ts-stack LCH reference application; [notices](synthesis/THIRD_PARTY_NOTICES.md) and [unchanged license](synthesis/LICENSES/ts-stack-lch-reference.txt) |

The [retained reference license](LICENSES/Open-BSV-License-6.reference.txt) limits use of the covered software and derivatives to BSV. TPNIL's Apache grant cannot remove those restrictions. These imports require a compatible upstream grant or independent replacement before they can be offered without those restrictions. Running the imported standards suites or synthesis profile remains subject to the applicable upstream terms.

## Dependencies and external software

Resolved npm dependencies, container images, operating systems, native applications and referenced standards retain their respective licenses. `synthesis/package-lock.json` pins npm artifacts; license text in each resolved artifact controls. The pinned `@bsv/sdk`, `@bsv/chirp`, `@bsv/lch`, `@bsv/wallet-toolbox`, authentication middleware and payment middleware artifacts each carry Open BSV License Version 6; see the [synthesis notices](synthesis/THIRD_PARTY_NOTICES.md). This migration supplies no new permissions for those packages, Teranode, Arcade, Merkle Service or other external components. A dependency reference or download script does not relicense its target.

The synthesis package includes both original Apache-licensed material and the Open BSV imports above. Its package metadata points to these notices rather than representing the whole package as unrestricted Apache material.

## Submitted artifacts and retained evidence

`fixtures/artifacts/` contains compiled third-party application material with its own provenance. Software identified in `suts/`, raw third-party content retained under `journals/`, and referenced or archived binaries keep their original terms. Original TPNIL report prose and evaluation tooling use Apache-2.0; embedded third-party content does not acquire that license.

Existing evaluation alone does not establish acceptance of submission terms. P2PPSR's owner has expressly accepted version 2.1.0 for the archived Metanet Explorer v1.1.10 AAB; see the [acceptance record](journals/submission-acceptance/2026-11-02/metanet-explorer-1.1.10/acceptance.json) and current intake evidence. The owner's [scope clarification](journals/submission-acceptance/2026-11-02/metanet-explorer-1.1.10/education-scope-clarification.json) adds broad non-commercial TPNIL-related use, including education. These records do not cover other releases or other vendors. Vendor participation announcements and continued hosting require the applicable license or an authorized acceptance covering the identified artifacts. Outstanding rights remain unresolved until supported; public availability alone supplies no additional grant. Public-result admission requires everyone's continuing rights to run, retain and mirror the artifacts for non-commercial TPNIL-related activity, including reproduction and education, plus an accessible reproduction bundle. This submission grant excludes resale and unrelated use or distribution, without narrowing broader rights available under an existing license. Existing binary archives and historical evaluations are not automatically cleared by adopting the submission terms.

Historical source-revision identifiers in retained evidence refer to the prelaunch development revisions recorded at execution. Replacing Git history does not change those observations or imply that historical workspaces used the current license.

## Optional Go controlled-service dependencies

The optional ITCVE Go host links the exact Go Overlay Services, Go ChainTracks,
Go SDK and Go Wallet Toolbox modules resolved by `synthesis/go/go.mod` and
`go.sum`. The three service source revisions and module checksums are recorded
in [the component lock](synthesis/go/components.lock.json). The three pinned service modules carry Open BSV License Version 5; their
unchanged license texts remain in the resolved module archives; linking or downloading them supplies no additional rights.
The digest-pinned MongoDB container used for component qualification retains
its own license. Original laboratory host and adapter code remains Apache-2.0.

## Integrated service and Rust dependencies

`integrations/services/vendor/` retains selected ChainTracks routes (Open BSV v6)
and Identity Services (Open BSV v4) at the per-file hashes and source revisions
in `integrations/services/sources.json`, with unchanged upstream licenses.
Additional npm closures are fixed by `integrations/services/package-lock.json`
and `components/transport/package-lock.json`. Message Box preparation downloads
the exact sources in `components/messaging/sources.lock.json`; upstream licenses
remain controlling. The Rust participant links the SDK revision and dependencies
fixed by `components/rust/Cargo.lock`. These pins and compatibility patches grant
no new rights and imply no vendor endorsement.
