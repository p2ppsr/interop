# Native conformance coverage 5.0.0

[ISI-4 5.0.0](../../5.0.0/README.md) retains the original 280 native
assertions and adds 84 conditional predicates and 28 permission predicates.
The [execution plan](../../../../infra/native/conformance/plan-5.1.1.json)
binds the official Yours Wallet 5.1.1 artifact, policies, source inputs and
392-assertion catalog before execution. Every repetition uses a fresh native
Chromium profile and identity, the pinned Go service closure, controlled
mined funding and kernel network isolation.

The [conditional oracle](conditional-oracle-1.0.0.json) covers populated
output/action queries, filters, ordering, paging and optional fields;
transaction signing, abort, batching and known-proof handling; ASCII and UTF-8
basket boundaries; certificate acquisition, proof and relinquishment; and
authenticated certificate issuance with malformed-response controls.
Returned signatures, certificate fields, authentication exchanges, query
membership and transaction ancestry are independently checked. Missing
execution remains visible. A malformed returned transaction may establish a
mapped native failure, but it cannot establish a transaction proof.

The [permission oracle](permission-coverage-1.0.0.json) covers protocol,
basket, certificate and both linkage permission categories. It observes
native grants, cached permission, cross-origin denial, browser restart,
Settings revocation and a second restart. A grouped manifest requests an
explicitly selected 100-satoshi standing allowance; two allowed payments and
overflow, alternate-origin and post-revocation denials are independently
checked. Trusted clicks, the spending checkbox, screenshots, identity and
browser-context replacement are retained. An unresolved request stops the
scenario so a stale popup cannot satisfy a subsequent request.

The [shutdown policy](shutdown-submissions-2.0.0.json) binds the final ledgers
from every owned provider after browser and service shutdown. A denied
payment appearing in those ledgers fails admission even if the wallet's
public call rejected. The original shutdown policy remains bound to earlier
profiles.

[Namespace oracle 5](namespace-oracle-5.0.0.json) narrowly recognizes the
reserved-protocol and reserved-basket unsupported-P-module errors observed
in the historical trace. It changes those two prospective interpretations;
the original observations and the separate structured-error predicate remain
unchanged. A comparison must distinguish this interpretation correction from
a change observed in the wallet or Go components.

The [coverage inventory](../../proposals/native-coverage-closure-20261111.json)
and [execution map](../../proposals/native-coverage-closure-20261111-execution-map.json)
account for 306 proposed variants across 36 groups. That inventory is larger
than this executed subset. Secondary privileged keyrings, a native byte-wire
endpoint, finite permission expiry and further conditional combinations
remain explicit dependencies or unexecuted coverage. Both remaining-coverage
gates retain their declared meaning; this profile does not establish complete
BRC-100 conformance.

The retained [TypeScript reference fixture](../../../../fixtures/native-conditional/reference-20261111/README.md)
is an engineering preflight. Its outcomes, source-only wallet fixes and
offline tests are separate from an admitted native execution result.

## Prospective observer2 and candidate expansion

The separately frozen official5.1.1 observer2 and PR3687e39006 candidate plans
retain all392 identities and add34 observations, for426 total. They select
clause6, conditional2 and permission coverage3 explicitly. The third allowed
payment must reach the100-satoshi allowance exactly including independently
computed fees; overflowing requests still require denial through final shutdown.

The [transaction-state policy](transaction-states-1.0.0.json) adds19 checks
covering explicit defaults, immediate and staged signing, abort safety,
malformed/conflicting inputs, proof trust and TXID-only returns. The
[certificate-state policy](certificate-states-1.0.0.json) adds14 checks for
acquisition integrity, complete proof tuples, independent issuer/type filters,
branch-specific field behavior and cleanup. Native calls bind to retained
transaction bytes, storage, routes and complete provider evidence. Ambiguous
standard semantics use only the explicitly documented safe alternatives;
those alternatives do not settle the underlying normative question.

These are prospective fixtures. The original plan, historical outcomes and
unsupported or unexecuted coverage obligations are not rewritten.
