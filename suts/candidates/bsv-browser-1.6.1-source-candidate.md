# BSV Browser 1.6.1 source candidate

Status: **engineering qualification complete; production SUT admission blocked**.

The laboratory pinned public source revision `52ec2a688f54530dacea14a74dd6bf466fe0bf0f`, archived it deterministically, and compiled an Android release APK with the ISI-4 mainnet wallet profile and declared controlled-service endpoints. No publisher-supplied binary release was available. The APK is therefore a laboratory derivative and cannot stand in for a production artifact.

On the clean Android fixture, the ordinary wallet flow created a local wallet and switched the browser into wallet mode. The ToDo page at `https://todo.metanet.app` then exposed 28 BRC-100 methods. Direct probes reported `wallet-brc100-1.0.0`, an authenticated wallet, and `mainnet`. A ToDo create attempt reached wallet encryption and transaction construction before the unfunded wallet reported that 25 satoshis were required. No public-mainnet funds or broadcasts were used.

These observations qualify the Android build, browser bridge, wallet initialization, and application path. They do not establish conformance. All eight vectors remain `BLOCKED` for this candidate because the evaluated bytes were not supplied by the publisher; the transaction vectors also require an admitted controlled funding fixture. The [offline-verifiable observation](../../journals/native-observation/2026-09-20/bsv-browser-1.6.1-source-candidate-android-arm64/record.json) preserves the exact boundary.
