# Teranode funding fixtures

`wab-funding-v1.json` is the canonical initial funding input for the controlled WAB profile. The pinned Teranode v0.15.9 runtime mined block 1 directly to the WAB controller's wallet-payment derivation and then mined another 100 blocks to establish coinbase maturity. The fixture retains the exact coinbase, block header, Merkle commitment, Atomic BEEF, public derivation data, and runtime provenance.

The fixture can be regenerated from a clean pinned runtime:

```sh
node scripts/prepare-teranode-runtime.mjs \
  /path/to/teranode-quickstart-at-2ef9915ffeec252a34b45755f11453ecc1f265f0 \
  out/teranode-wallet-funding
docker compose --project-directory out/teranode-wallet-funding up -d --pull never
npm --prefix synthesis run prepare:teranode-wallet-funding -- \
  ../out/teranode-wallet-funding \
  ../fixtures/teranode/wab-funding-v1.json
docker compose --project-directory out/teranode-wallet-funding down -v
```

A regenerated fixture has new block and transaction identifiers. Its semantic projection must retain the pinned runtime, a single coinbase transaction at the funding height, 100 blocks of maturity, the exact WAB payment derivation, and a valid Merkle commitment. Replacing the canonical fixture is a normative profile change and precedes any run that uses it.
