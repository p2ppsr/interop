ARG TPNIL_NATIVE_BASE
FROM ${TPNIL_NATIVE_BASE}
USER root
WORKDIR /work
RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*
COPY components/transport/package.json components/transport/package-lock.json /work/components/transport/
RUN npm ci --ignore-scripts --prefix /work/components/transport
COPY components/transport/*.mjs /work/components/transport/
COPY integrations/services/package.json integrations/services/package-lock.json /work/integrations/services/
RUN npm ci --ignore-scripts --prefix /work/integrations/services && cd /work/integrations/services && npm rebuild better-sqlite3
COPY integrations/services/src /work/integrations/services/src
COPY integrations/services/vendor /work/integrations/services/vendor
COPY components/messaging /work/components/messaging
COPY out/messaging-sources /work/out/messaging-sources
COPY out/itcve-go-storage-sync out/itcve-go-storage-sync.json /opt/tpnil/
COPY infra/adapters/storage-sync /work/infra/adapters/storage-sync
COPY infra/native/integrated/*.json /work/infra/native/integrated/
COPY programs/ISI-4/profiles/brc100-boundary-1.0.0 /work/programs/ISI-4/profiles/brc100-boundary-1.0.0
ENV TPNIL_NATIVE_INTEGRATED=1 TPNIL_MESSAGING_PATHS=/work/out/messaging-sources/paths.json
RUN dpkg-query -W -f='${Package} ${Version}\n' > /opt/tpnil/os-packages.txt
USER pwuser
