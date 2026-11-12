FROM node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c AS node
FROM mongo:8.0.16@sha256:4b58ebcb1dc7a7b4e84cd8ce9098d48764ae4478876898ff9551acf2ac4a6a6d AS mongo
FROM mcr.microsoft.com/playwright:v1.62.1-noble@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e
USER root
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=mongo /usr/bin/mongod /usr/bin/mongod
RUN apt-get update && apt-get install -y --no-install-recommends libnss3-tools && rm -rf /var/lib/apt/lists/*
WORKDIR /work
COPY synthesis/package.json synthesis/package-lock.json /work/synthesis/
RUN cd /work/synthesis && npm ci --ignore-scripts
COPY synthesis/src /work/synthesis/src
COPY synthesis/go/go.mod synthesis/go/go.sum synthesis/go/components.lock.json /work/synthesis/go/
COPY infra/native/yours-go /work/infra/native/yours-go
COPY infra/plans/isi4-yours-todo-go-controlled-services.json /work/infra/plans/
COPY out/itcve-go-services out/itcve-mongo /opt/tpnil/
ARG TPNIL_WALLET_VERSION=5.1.0
ARG TPNIL_WALLET_ARTIFACT_DIRECTORY=yours-wallet-v${TPNIL_WALLET_VERSION}
COPY out/sut-artifacts/${TPNIL_WALLET_ARTIFACT_DIRECTORY} /work/out/sut-artifacts/${TPNIL_WALLET_ARTIFACT_DIRECTORY}
COPY fixtures/artifacts/yours-wallet-pr368-7e39006/provenance.json /work/fixtures/artifacts/yours-wallet-pr368-7e39006/provenance.json
COPY out/sut-artifacts/todo-ts-236733c /work/out/sut-artifacts/todo-ts-236733c
COPY fixtures/artifacts/todo-ts-236733c-webroot.tgz /work/fixtures/artifacts/
COPY fixtures/teranode/wab-funding-v1.json /work/fixtures/teranode/
RUN mkdir -p /evidence && chown pwuser:pwuser /evidence
ENV TPNIL_GO_BINARY=/opt/tpnil/itcve-go-services TPNIL_GO_MONGO_URI=mongodb://127.0.0.1:27017/?directConnection=true HOME=/tmp/tpnil-home
RUN dpkg-query -W -f='${Package} ${Version}\n' > /opt/tpnil/os-packages.txt
USER pwuser
CMD ["/bin/sh", "-c", "mkdir -p \"$HOME\" && xvfb-run -a /usr/local/bin/node --import /work/synthesis/node_modules/tsx/dist/loader.mjs /work/synthesis/src/wallet-lab/native/worker.ts"]
