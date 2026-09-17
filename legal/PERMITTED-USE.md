# Permitted BSV use and narrow cross-chain exceptions

Version 0.1.0. This schedule defines the field of use for original TPNIL grants and contribution pledges. It does not amend any third party's license without that rights holder's agreement.

## Defined terms

**Covered Materials** are the original laboratory code, normative and explanatory prose, vectors, fixtures, criteria, specifications, programs, environments, evaluators and infrastructure identified by a contribution or release digest. Merely submitting a proprietary SUT does not make its internals Covered Materials.

**BSV** and **BSV Blockchain** use the Open BSV License Version 6 reference definition. **BSV Evaluation** additionally includes development, audit, education, verification, archival reproduction, and isolated BSV regtest/test-chain simulation exclusively directed to implementing, evaluating, migrating into, or interoperating with that ecosystem. A test chain must not be repurposed as a non-BSV commercial network under this exception.

**Covered Functionality** is the function that copies, implements or otherwise practices a controlled right in Covered Materials. Field-of-use compliance is assessed for that function and the relevant transaction/operation, not by branding the entire product “BSV.” Mere mention of a BSV address or addition of a BSV menu item is insufficient.

## Permitted categories

1. **Exclusive BSV use.** Develop, implement, operate, study, test, distribute and commercialize Covered Materials and compliant implementations exclusively for BSV, including BSV Evaluation.
2. **Migration, transition and import into BSV.** Interact with a non-BSV system solely to retrieve, validate, convert, release, transfer or import data, identities, assets or application state into BSV, and to verify or complete that transfer. Minimal source-side signing, settlement, refunds and failure recovery necessary to complete or safely unwind that operation are included. This does not authorize a continuing general-purpose non-BSV service or an export from BSV to an unrelated chain.
3. **Basic asset swaps involving BSV.** Quote, arrange, validate, settle, reconcile or safely refund an individual basic asset exchange in which BSV is an actual source or destination leg. Either direction is permitted. Necessary source/destination chain interaction and ordinary settlement custody solely incidental to that swap are included. A failed/cancelled attempted qualifying swap remains covered for its necessary unwind; a sham or nominal BSV routing leg used to disguise unrelated trading does not qualify.
4. **Necessary supporting operations.** Use ordinary computing, networking, storage, cryptography, payment messaging, and evidence retention ancillary to the above permitted functions. A non-blockchain support library does not become a prohibited blockchain merely because it supports such operations.

## Outside the grant

The grant does not cover implementing or operating general non-BSV blockchain processing, wallets, overlays, content markets, generalized bridges, validators, lending, derivatives or unrelated non-BSV-to-non-BSV exchange using Covered Functionality. A platform listing BSV does not obtain permission for every pair on that platform. Supporting another chain for independent commercial purposes is not a migration exception. Passing a laboratory test confers no extra IP permission.

A mixed product may segregate a permitted BSV or qualifying swap/import function from other functions using independently obtained rights. This instrument does not prohibit unrelated independently developed code; it grants no rights to practice Covered Functionality in those other functions. Licensors reserve their controlled rights outside the permitted scope, without asserting that every out-of-scope act is legally infringing.

## Concrete applications

| Use | Grant classification |
| --- | --- |
| Implement a contributed evaluator or specification exclusively for BSV | Permitted |
| Execute offline BSV wallet and stack conformance tests with mock coins | Permitted |
| Import another chain's records into BSV and verify the completed import | Permitted within the migration purpose |
| Swap BTC to BSV, or BSV to BTC, with necessary settlement/refund steps | Permitted basic swap exception |
| Use the same contributed machinery for ETH-to-BTC trades because the venue also lists BSV | Not licensed by this grant |
| Operate an unrelated chain's wallet/validator using covered contributions and add an unused BSV option | Not licensed by this grant |
| Use third-party code under a stricter BSV-only license for a swap | Requires that third party's permission; this schedule cannot supply it |

Interpretation changes operate prospectively through new versions. They may clarify ambiguity but cannot retroactively withdraw an irrevocable grant already earned for a covered use. Archive the accepted version and its digest with every contribution.
