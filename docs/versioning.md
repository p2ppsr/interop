# Versioning and change control

All laboratory artifacts use SemVer `MAJOR.MINOR.PATCH`, including pre-1.0 artifacts. An acceptance-changing edit increments MAJOR, including at 0.x. New optional profiles or vectors increment MINOR. Editorial changes that cannot affect a verdict increment PATCH. New mandatory vectors change acceptance. Released versions identify fixed content.

ISIs, ITCVEs, profiles, oracles, adapters, schemas, vector corpora, and runners are versioned independently under this common rule. A run lock captures both versions and content digests. Laboratory releases identify tested compatibility sets; qualification requires a digest-addressed compatibility manifest.

Changelogs record migrations and requirement changes. Vector identifiers are permanent, with revised behavior assigned a new version. Deprecation records specify replacement and retirement dates. Historical content and verifiers remain available, and evaluation against a new oracle creates a separately identified result.

Intake resolves “latest” to exact released bytes, source revision where known, dependency lock, signatures, and an observation timestamp. Execution uses that fixed inventory. Rebuilds, browser changes, signing or provisioning changes, and different architectures create distinct evaluated artifact configurations.
