# Draft: clarify signed action values in BRC-100

Status: standards discussion draft only. This file has not been sent to maintainers. It changes no wallet API, admitted profile, historical evidence, or conformance predicate.

The pinned BRC-100 revision `39a643ff148a8dcd23ec08986a8ddeb7d5713743` assigns `SatoshiValue` to `listActions().actions[].satoshis`, while that type has a minimum of one. Its binary response table names VarInt, whose general description is unsigned. Actual TypeScript and Go storage implementations expose signed net action values, and their SDK encoders preserve negative and zero values. A later inspected BRC revision (`9150386334fe1411a295ee1f2e354f215f93339e`) retains this conflict; this is a source snapshot, not a claim about future revisions.

The exact retained `output.listActions` predicate input in native run43157433977 returned `satoshis:-36`, `isOutgoing:true`, `status:unproven`. A separate setup/control action returned-1032; it illustrates accounting but is not the predicate's failing input. The strict pinned predicate correctly remains FAIL. No current native qualification is inferred from the source or codec comparison.

## Proposed clarification for review

Introduce a distinct `SignedSatoshiValue` for this action-summary field only. It is an integer in the inclusive range−2,100,000,000,000,000 to+2,100,000,000,000,000, including zero. Existing output-value and payment types retain their own bounds; this proposal does not globally permit negative transaction outputs.

Define the field as the wallet's accounted net change for the transaction: the value credited to that wallet's ledger minus the value debited from its ledger. A debit is negative, a credit positive, and no net change zero. Include fees exactly once through the transaction's actual debit/change accounting. Filters choose which action records are returned; they must not recompute the amount from only the filtered outputs. Require the same transaction and wallet identity to produce a consistent value across labels, pagination, and output-detail selection.

Define `isOutgoing` independently as action-origin metadata. It must not be treated as an invertible sign encoding. A response may not discard negative or zero records, change their sign, clamp them to zero, or fabricate a minimum value to fit a positive-only type.

For this mandatory wire field, document the existing signed compact integer convention explicitly: nonnegative values use the existing shortest CompactSize representation; negative values use marker`ff` followed by an eight-byte little-endian two's-complement signed integer. Decoding interprets the sign for this field, validates the signed monetary range, and never treats−1 as an omitted-field sentinel. This field-specific rule must not silently alter every generic VarInt field. If maintainers choose a different encoding, negotiate a new wire/API revision and retain the existing encoding for existing clients.

Before adoption, settle which credited/debited ledger categories are included for basket-controlled outputs, recoverable custom outputs, merged internalizations, refunds, storage service fees, and still-pending/failed actions. The definition must not confuse a prospective action amount with a finalized balance change. These questions require an explicit standard/API decision; the lab must not resolve them by rewriting returned money values.

## Compatibility and acceptance evidence

The retained TypeScript SDK2.7.1 and Go SDK1.7.3 codec experiment round-trips−1032,−1,0,1,+1032 unchanged with identical response bytes. For the amount field alone, examples are:

| Value | Encoded field bytes |
| ---: | --- |
|−1032|`fff8fbffffffffffff`|
|−1|`ffffffffffffffffff`|
|0|`00`|
|1|`01`|
|1032|`fd0804`|

Those five fixtures document existing behavior; they are not sufficient boundary coverage. A prospective accepted revision needs both implementations to test zero, both monetary endpoints, negative/positive single-byte and extended-encoding boundaries, out-of-range/fractional values, exact wire parity, unchanged pagination, and signed sums across self-transfer, fee-only, ordinary payment, incoming-credit merge, noSend, rejection, and retry cases. It must verify idempotent credit and actual transaction conservation separately from display format.

Permission accounting is a concrete compatibility constraint: the observed manager subtracts signed history values when calculating spend. Replacing−1032 by+1032 reverses that contribution; replacing it by zero erases it. Moving a projection only to public callers still changes their deployed history and wire contract. An additive negotiated display magnitude/direction can be considered, but it cannot replace the existing field silently.

The lab should keep `output.listActions` FAIL under the currently pinned positive-only standard, retain all original samples, and introduce a separately versioned oracle only after an explicit adopted clarification or negotiated API contract. Full BRC-100 conformance remains unclaimed.

Sources: [pinned type and response contract](https://github.com/bsv-blockchain/BRCs/blob/39a643ff148a8dcd23ec08986a8ddeb7d5713743/wallet/0100.md#listactions), [later inspected standard snapshot](https://github.com/bsv-blockchain/BRCs/blob/9150386334fe1411a295ee1f2e354f215f93339e/wallet/0100.md), and the retained source/codec receipts under `journals/native-closure-validation/2026-11-11-observer3/diagnostics/signed-action-value/`. The companion JSON binds the exact source and evidence digests.
