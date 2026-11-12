ARG TPNIL_INTEGRATED_BASE
FROM scratch AS conformance_files
COPY fixtures/artifacts/yours-wallet-pr368-e360e67/provenance.json /work/fixtures/artifacts/yours-wallet-pr368-e360e67/provenance.json
COPY fixtures/artifacts/yours-wallet-pr368-3e8a97f/provenance.json /work/fixtures/artifacts/yours-wallet-pr368-3e8a97f/provenance.json
COPY fixtures/artifacts/yours-wallet-pr368-4a954ac/provenance.json /work/fixtures/artifacts/yours-wallet-pr368-4a954ac/provenance.json
COPY infra/native/conformance /work/infra/native/conformance
COPY fixtures/artifacts/yours-wallet-pr368-cb3c2f2/provenance.json /work/fixtures/artifacts/yours-wallet-pr368-cb3c2f2/provenance.json
COPY infra/native/integrated/Dockerfile /work/infra/native/integrated/Dockerfile
COPY infra/native/yours-go /work/infra/native/yours-go
COPY .github/workflows/isi4-yours-wallet.yml /work/.github/workflows/isi4-yours-wallet.yml
COPY synthesis/go/cmd /work/synthesis/go/cmd
COPY programs/ISI-4/profiles/native-conformance-2.0.0 /work/programs/ISI-4/profiles/native-conformance-2.0.0
COPY programs/ISI-4/2.0.0 /work/programs/ISI-4/2.0.0
COPY programs/ISI-4/3.0.0 /work/programs/ISI-4/3.0.0
COPY programs/ISI-4/4.0.0 /work/programs/ISI-4/4.0.0
COPY programs/ISI-4/5.0.0 /work/programs/ISI-4/5.0.0
COPY programs/ISI-4/5.1.0 /work/programs/ISI-4/5.1.0
COPY programs/ISI-4/5.2.0 /work/programs/ISI-4/5.2.0
COPY programs/ISI-4/5.3.0 /work/programs/ISI-4/5.3.0
COPY programs/ISI-4/5.4.0 /work/programs/ISI-4/5.4.0
COPY programs/ISI-4/5.5.0 /work/programs/ISI-4/5.5.0
COPY programs/ISI-4/profiles/native-conformance-5.0.0 /work/programs/ISI-4/profiles/native-conformance-5.0.0
COPY programs/ISI-4/profiles/native-conformance-4.0.0 /work/programs/ISI-4/profiles/native-conformance-4.0.0
COPY programs/ISI-4/profiles/native-conformance-3.0.0 /work/programs/ISI-4/profiles/native-conformance-3.0.0
COPY programs/ISI-4/proposals/native-coverage-closure-20261111.json programs/ISI-4/proposals/native-coverage-closure-20261111-execution-map.json /work/programs/ISI-4/proposals/
COPY scripts/prepare-storage-native-contracts-go.mjs scripts/prepare-storage-list-actions-go.mjs scripts/check-native-wallet-selector.mjs scripts/read-committed-blob.mjs /work/scripts/
COPY scripts/verify-native-trust.mjs scripts/verify-native-synthesis.mjs scripts/native-wallet-profiles.mjs scripts/native-rust-compatibility.mjs scripts/run-native-go-wallet.mjs scripts/verify-native-integrated.mjs scripts/prepare-yours-wallet-run.sh /work/scripts/
COPY itcves/ITCVE-1/1.4.0 /work/itcves/ITCVE-1/1.4.0
COPY itcves/ITCVE-1/1.5.0 /work/itcves/ITCVE-1/1.5.0
COPY itcves/ITCVE-1/2.0.0 /work/itcves/ITCVE-1/2.0.0
COPY itcves/ITCVE-1/4.0.0 /work/itcves/ITCVE-1/4.0.0
COPY itcves/ITCVE-1/4.1.0 /work/itcves/ITCVE-1/4.1.0
COPY itcves/ITCVE-1/4.2.0 /work/itcves/ITCVE-1/4.2.0
COPY itcves/ITCVE-1/4.3.0 /work/itcves/ITCVE-1/4.3.0
COPY itcves/ITCVE-1/4.4.0 /work/itcves/ITCVE-1/4.4.0
COPY itcves/ITCVE-1/4.5.0 /work/itcves/ITCVE-1/4.5.0
COPY infra/adapters/storage-portability /work/infra/adapters/storage-portability
COPY infra/adapters/storage-list-actions /work/infra/adapters/storage-list-actions
COPY infra/adapters/storage-native-contracts /work/infra/adapters/storage-native-contracts
COPY programs/ISI-4/profiles/native-coverage-permissions-1.0.0/policy.json /work/programs/ISI-4/profiles/native-coverage-permissions-1.0.0/policy.json
COPY programs/ISI-4/profiles/native-coverage-transactions-1.0.0/policy.json /work/programs/ISI-4/profiles/native-coverage-transactions-1.0.0/policy.json
COPY programs/ISI-4/profiles/native-coverage-transactions-2.0.0/policy.json /work/programs/ISI-4/profiles/native-coverage-transactions-2.0.0/policy.json
COPY programs/ISI-4/profiles/native-coverage-extension-1.0.0/policy.json /work/programs/ISI-4/profiles/native-coverage-extension-1.0.0/policy.json
COPY programs/ISI-4/profiles/native-coverage-extension-2.0.0/policy.json /work/programs/ISI-4/profiles/native-coverage-extension-2.0.0/policy.json
COPY programs/ISI-4/profiles/native-coverage-certificates-1.0.0/policy.json /work/programs/ISI-4/profiles/native-coverage-certificates-1.0.0/policy.json
COPY infra/adapters/storage-batch-subjects /work/infra/adapters/storage-batch-subjects
COPY scripts/prepare-storage-batch-subjects-go.mjs /work/scripts/
COPY infra/adapters/storage-dust-accounting /work/infra/adapters/storage-dust-accounting
COPY scripts/prepare-storage-dust-accounting-go.mjs /work/scripts/
COPY infra/adapters/storage-merge-accounting /work/infra/adapters/storage-merge-accounting
COPY scripts/prepare-storage-merge-accounting-go.mjs /work/scripts/
COPY infra/adapters/storage-input-ancestry /work/infra/adapters/storage-input-ancestry
COPY scripts/prepare-storage-input-ancestry-go.mjs /work/scripts/
COPY infra/adapters/storage-sqlite-retry /work/infra/adapters/storage-sqlite-retry
COPY scripts/prepare-storage-sqlite-retry-go.mjs /work/scripts/
COPY infra/adapters/storage-caller-known-inputs /work/infra/adapters/storage-caller-known-inputs
COPY scripts/prepare-storage-caller-known-inputs-go.mjs /work/scripts/
COPY programs/ISI-4/profiles/native-coverage-transactions-3.0.0/policy.json /work/programs/ISI-4/profiles/native-coverage-transactions-3.0.0/policy.json
COPY programs/ISI-4/profiles/native-coverage-partial-trace-1.0.0/policy.json /work/programs/ISI-4/profiles/native-coverage-partial-trace-1.0.0/policy.json
COPY programs/ISI-4/proposals/native-coverage-accountability-20261112-completion-delta.json programs/ISI-4/proposals/native-coverage-accountability-20261112-completion-delta.md /work/programs/ISI-4/proposals/
COPY scripts/verify-native-image.mjs scripts/compare-native-conformance.mjs scripts/native-reevaluation.mjs scripts/verify-published-integrations.mjs /work/scripts/
COPY synthesis/test /work/synthesis/test
COPY test /work/test
ARG TPNIL_STORAGE_BINARY=itcve-go-storage-portability
COPY out/${TPNIL_STORAGE_BINARY} out/${TPNIL_STORAGE_BINARY}.json /opt/tpnil/

COPY synthesis/test/native-permission-startup.test.ts synthesis/test/native-failure.test.ts /work/synthesis/test/
COPY synthesis/test/fixtures/native5-identity-prompt.json /work/synthesis/test/fixtures/native5-identity-prompt.json

COPY programs/ISI-4/5.6.0 /work/programs/ISI-4/5.6.0
COPY itcves/ITCVE-1/4.6.0 /work/itcves/ITCVE-1/4.6.0
COPY programs/ISI-4/profiles/native-coverage-extension-3.0.0 /work/programs/ISI-4/profiles/native-coverage-extension-3.0.0

COPY programs/ISI-4/5.7.0 /work/programs/ISI-4/5.7.0
COPY itcves/ITCVE-1/4.7.0 /work/itcves/ITCVE-1/4.7.0
COPY programs/ISI-4/profiles/native-coverage-extension-4.0.0 /work/programs/ISI-4/profiles/native-coverage-extension-4.0.0
FROM ${TPNIL_INTEGRATED_BASE}
USER root
COPY --from=conformance_files /work /work
COPY --from=conformance_files /opt/tpnil /opt/tpnil
ENV TPNIL_NATIVE_CONFORMANCE=1 TPNIL_NATIVE_IDENTITY_TRUST=1
USER pwuser
