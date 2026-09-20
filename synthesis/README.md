# TPNIL synthesis runtime

This package contains reusable executable components for the ISI-1 transaction-processing synthesis. It is a separately locked Node.js package so a laboratory run resolves the same protocol libraries without changing the repository's dependency-free journal and standards tooling.

The reference profile proves the protocol contracts in process. Service profiles reuse the same assertions across independently operated HTTP endpoints and transaction-processing services. A result identifies its profile; a reference-profile result does not represent an external implementation result.

The reusable modules cover:

- canonical byte encoding, hashing, and deterministic identifiers;
- canonical UHRP advertisement tokens, HTTP submission and lookup, expiry, revocation, replay, and CHIRP host resolution;
- CHIRP construction, range retrieval, host failover, and corruption rejection;
- LCH content storage and licensed acquisition through the pinned reference implementation;
- BRC-100-wallet-derived PushDrop board locks, signed revisions, spending, and decoding;
- topical overlay submission, current-state lookup, double-spend rejection, journal replay, and independent-node synchronization;
- a real HTTP overlay boundary; and
- Teranode runtime probes and reproducible Arcade transaction fixtures.

Run the package checks with:

```sh
npm ci --prefix synthesis
npm test --prefix synthesis
npm run typecheck --prefix synthesis
npm --prefix synthesis exec tsx src/cli.ts ../out/synthesis-reference
```

The CLI result is `LAB_REFERENCE_PROFILE_ONLY`. External service qualifications live under `infra/plans/` and retained evidence under `journals/`.

Archive and verify a reference result with:

```sh
node bin/tpnil.mjs archive-reference-qualification out/synthesis-reference journals/reference-qualification/<date>/<run>
node bin/tpnil.mjs verify-reference-qualification journals/reference-qualification/<date>/<run>
```
