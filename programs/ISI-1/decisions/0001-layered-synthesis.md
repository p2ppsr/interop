# ISI-1 decision 0001: layered transaction-processing synthesis

Status: **Adopted**
Date: **2026-09-20**

## Decision

ISI-1 will establish the complete transaction-processing synthesis in independently testable layers. Each layer receives its own fixtures, negative cases, raw observations, and oracle before it is used by a broader scenario. The final scenario combines only qualified layers.

The deterministic ISI-1 service topology uses regtest and program-controlled wallets. This boundary permits deterministic funding, mining, invalid-transaction cases, reorganization exercises, and complete reset. It does not require a production wallet to expose regtest behavior.

Unchanged production wallet binaries remain within ISI-4's controlled mainnet-wallet profile. An ISI-1 service result and an ISI-4 wallet result are separate findings until a declared bridge profile has itself been qualified.

## Canonical application direction

TPNIL will build a small reference application, **TPNIL Synthesis Board**, for the integrated scenario. It will use current BRC-35 Global KVStore semantics for board records, BRC-26 UHRP for content discovery, BRC-167 CHIRP for chunked content, and BRC-170 LCH for licensing and protected-content acquisition.

The historical `p2ppsr/postboard-ui` and `p2ppsr/postboard-london` repositories remain research inputs. Their older SDK and overlay boundaries do not make either repository a canonical SUT for this program. The new reference application will keep the user-visible post-board concept while using the current interfaces and normative conformance material.

The application is a test instrument, not an oracle. Independent evaluators will validate its Global KVStore token, LCH objects and policies, UHRP advertisements, CHIRP closure, transaction outputs, processor states, proofs, and final plaintext bytes.

## Qualification sequence

1. **Frozen standard vectors.** Import the exact BRC-167 and BRC-170 corpora at pinned source revisions. Verify positive and negative cases independently of the application.
2. **Board-record contract.** Freeze the Global KVStore protocol identifier, key rules, tags, canonical value encoding, revision rules, and history projection. Test malformed, incorrectly signed, duplicate-live, wrong-controller, and spent-record cases.
3. **Content availability.** Publish deterministic fixture bytes to two complete hosts. Verify UHRP advertisement admission, lookup, expiry and revocation; CHIRP complete and range reads; corrupt-host rejection; and one-host outage recovery.
4. **Licensed acquisition.** Verify LCH framing, identifiers, signatures, policy, offers, selection, segmented encryption, payment demands, receipts, key delivery, recovery, tamper rejection, and exact plaintext reconstruction. Exercise both receipt-complete settlement and the authorized-output offline-Payee path.
5. **Overlay convergence.** Submit Global KVStore and UHRP transactions through the canonical HTTP overlay boundary, synchronize a second node from a clean state, and compare canonical topical UTXO projections.
6. **Transaction lifecycle.** Submit through Arcade to Teranode, mine deterministically, acquire Merkle Service evidence, validate headers and proofs independently, and observe the wallet and overlay projections at declared causal barriers.
7. **Reference application.** Drive the Synthesis Board through two independent identities: publish a post containing an LCH header reference, acquire its image, decrypt and render it, restart the application, and reconstruct the same authoritative state.
8. **Fault and substitution matrix.** Repeat with controlled outages, invalid transactions, double spends, corrupt content, stale advertisements, lost callbacks, service restarts, and one component substitution at a time.

Passing an earlier layer does not imply a later layer passes. A failure in a later layer retains the evidence and identifies the earliest failed boundary.

## First integrated golden path

The first complete run will:

1. restore a clean regtest service closure and mine the declared funding schedule;
2. create deterministic image bytes and their expected plaintext digest;
3. produce a signed LCH header and segmented ciphertext;
4. publish the ciphertext as a CHIRP object through independently addressed complete hosts and advertise its availability through UHRP;
5. create a signed Global KVStore post record that references the LCH header;
6. resolve the post from a second identity and validate the live KV token independently;
7. inspect the LCH offer without spending, acquire a quote, and construct the exact declared BSV outputs through the BRC-100 boundary;
8. submit the transaction through Arcade, observe Teranode acceptance, mine it, and validate the resulting proof and header relationship;
9. complete the selected LCH settlement profile, recover the licensed key material, and decrypt the authenticated records;
10. compare the rendered image bytes with the original fixture; and
11. restart the client and supporting services, then reconstruct the same post, license, content, transaction, and proof relationships without a second payment.

The first fault companion will interrupt one Payee or evidence provider after the funded transaction exists. Recovery must reuse the same transaction and must not create a second financial effect.

## Evidence boundary

The run will retain the component digests, environment lock, funding and transaction graph, raw HTTP exchanges, overlay submissions and lookups, event timeline, LCH objects and settlement evidence, CHIRP nodes, UHRP advertisements, headers and Merkle proofs, wallet calls, final bytes, UI observations, and restart projections.

The semantic projection will identify transaction states separately: wallet creation, Arcade receipt, processor acceptance or rejection, network observation, mining, proof availability, wallet internalization, overlay admission, and content-license completion. No one state stands in for another.

## Consequences

The quickest path to a credible result is the walletless reference workbench plus real controlled services, followed by the native production-wallet matrix. This ordering exercises actual transaction processing early while keeping production-wallet claims within the profile designed for them.

The reference application will be small enough to audit and reproduce. Product features, social discovery, moderation, presentation polish, and unrelated message-board behavior remain outside the first conformance scenario.
