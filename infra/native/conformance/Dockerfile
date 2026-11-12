ARG TPNIL_INTEGRATED_BASE
FROM ${TPNIL_INTEGRATED_BASE}
USER root
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
COPY programs/ISI-4/profiles/native-conformance-5.0.0 /work/programs/ISI-4/profiles/native-conformance-5.0.0
COPY programs/ISI-4/profiles/native-conformance-4.0.0 /work/programs/ISI-4/profiles/native-conformance-4.0.0
COPY programs/ISI-4/profiles/native-conformance-3.0.0 /work/programs/ISI-4/profiles/native-conformance-3.0.0
COPY programs/ISI-4/proposals/native-coverage-closure-20261111.json programs/ISI-4/proposals/native-coverage-closure-20261111-execution-map.json /work/programs/ISI-4/proposals/
COPY scripts/prepare-storage-native-contracts-go.mjs scripts/prepare-storage-list-actions-go.mjs scripts/check-native-wallet-selector.mjs /work/scripts/
COPY scripts/verify-native-trust.mjs scripts/native-wallet-profiles.mjs scripts/native-rust-compatibility.mjs scripts/run-native-go-wallet.mjs scripts/verify-native-integrated.mjs scripts/prepare-yours-wallet-run.sh /work/scripts/
COPY itcves/ITCVE-1/1.4.0 /work/itcves/ITCVE-1/1.4.0
COPY itcves/ITCVE-1/1.5.0 /work/itcves/ITCVE-1/1.5.0
COPY itcves/ITCVE-1/2.0.0 /work/itcves/ITCVE-1/2.0.0
COPY itcves/ITCVE-1/4.0.0 /work/itcves/ITCVE-1/4.0.0
COPY itcves/ITCVE-1/4.1.0 /work/itcves/ITCVE-1/4.1.0
COPY itcves/ITCVE-1/4.2.0 /work/itcves/ITCVE-1/4.2.0
COPY infra/adapters/storage-portability /work/infra/adapters/storage-portability
COPY infra/adapters/storage-list-actions /work/infra/adapters/storage-list-actions
COPY infra/adapters/storage-native-contracts /work/infra/adapters/storage-native-contracts
ARG TPNIL_STORAGE_BINARY=itcve-go-storage-portability
COPY out/${TPNIL_STORAGE_BINARY} out/${TPNIL_STORAGE_BINARY}.json /opt/tpnil/
ENV TPNIL_NATIVE_CONFORMANCE=1 TPNIL_NATIVE_IDENTITY_TRUST=1
USER pwuser
