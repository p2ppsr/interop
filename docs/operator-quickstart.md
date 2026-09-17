# Foundation operator commands

Run the dependency-free core with Node 22 or later. Record the exact Node and OS versions for reproducibility. CI validates the core on a hosted worker; SUT evaluation requires a qualified ITCVE.

```sh
npm test
npm run check
python3 -m unittest discover -s test -p 'test_*.py' -v
node bin/tpnil.mjs demo out/a-new-run
node bin/tpnil.mjs verify out/a-new-run
node bin/tpnil.mjs replay out/a-new-run
```

The demo executes synthetic laboratory fixtures. `verify` and `replay` validate the journal chain and recompute equality outcomes from retained observations. SUT re-execution and independent observation require separate runs. A nonpassing recorded run exits 1; malformed/incomplete evidence exits 2. `verify-prefix <old-bundle> <new-bundle>` requires a previously trusted retained checkpoint/bundle and detects replacement/truncation of its prefix.

Artifact verification streams bytes without executing the artifact:

```sh
node bin/tpnil.mjs verify-artifact path/to/artifact <64-hex-sha256>
```

Compiled web roots can be packaged with Python's standard library:

```sh
python3 scripts/package-webroot.py path/to/compiled-webroot out/application.tgz > out/application.manifest.json
```

The packager fixes paths, ownership, modes, timestamps and gzip metadata, rejects symlinks/nonregular files and environment/source-control files, limits input to 10,000 files/256 MiB, and refuses overwrite. It requires `index.html`. Pin Python/zlib/OS along with the compiler and package lock for cross-host reproducibility; two matching local builds are not independent laboratory reproduction. This tool does not safely extract arbitrary submitted archives or provision HTTPS.

The local journal uses a single-writer lock. After a crashed process, preserve a copy and inspect the journal with `verify` before manual recovery. Lock removal requires confirmation that the writer has stopped; interrupted journal content remains preserved during recovery. Restore from a known checkpoint or publish a separately identified recovery record; orphan staging objects are not valid runs. Official publication additionally requires the governance/evidence launch gates.
