# SUT admission

Candidate records identify artifact provenance and outstanding admission requirements. Admission establishes a canonical SUT identity and its permitted evaluation scope.

Admission requires verified digest and size, artifact kind and architecture, source and release provenance where available, a reproducible dependency closure, signature results, installation and configuration procedures, declared platform support, regtest capability, retention and access rights, and the [common adapter lifecycle](../adapters/README.md). OCI records bind both image-index and selected platform-manifest digests, together with required layers.

Web application records retain the source archive or revision, compiler and OS versions, package locks, build commands, compiled web-root tarball, normalized file-tree manifest, and serving policy. Source and compiled artifacts have separate identities. Archive creation fixes path order, ownership, timestamps, modes, and compression metadata. Intake validates file types and sizes and rejects absolute paths, traversal, device nodes, and escaping links before extraction.

The foundation provides byte verification and compiled-webroot packaging. Archive extraction and application serving remain in the [implementation roadmap](../ROADMAP.md).
