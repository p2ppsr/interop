# Yours Wallet 5.1.0 intake and experimental result

Status: **admitted and executed; overall `FAIL` with repeatable mixed vector outcomes**.

The unchanged public v5.1.0 Chromium extension archive is pinned at SHA-256 `d55abda7dc8790ecfdd57ed0f5f4dd4a28187bb4833715f7612b067625eabc52`. Two clean executions used the normal wallet-creation flow and reported `yours-wallet-5.1.0` on mainnet. The extension's production service identities were routed to isolated laboratory services; the extension bytes were not changed, and no public-mainnet funds or broadcasts were used.

Both repetitions produced the same semantic projection:

| Vector | Outcome | Finding |
| --- | --- | --- |
| V001 | PASS | Exact artifact, ordinary initialization, mainnet reporting and controlled mainnet-format fixture proof passed. |
| V002 | PASS | The ToDo token was created, decoded as the expected PushDrop protocol and independently decrypted. |
| V003 | PASS | Clearing application-local state and reloading reconstructed exactly one task from wallet state. |
| V004 | PASS | Redemption removed the intended outpoint from the unspent `todo tokens` basket. |
| V005 | FAIL | The requested deny and alternate-origin operations completed without an independently observed deny result or origin-specific prompt. |
| V006 | FAIL | The first accepted immediate-broadcast action and the post-rejection recovery did not submit within the 45-second causal barrier. The intervening controlled rejection was submitted and preserved wallet state. |
| V007 | BLOCKED | Remote-storage continuity passed for this service, but counterpart replacement requires the ISI-3 multi-remote profile. |
| V008 | BLOCKED | The 28-method inventory and safe crypto cases passed; remaining certificate, identity and lifecycle clauses still need executable fixtures. |

The failed and blocked outcomes are laboratory results, not harness errors. Every applicable action was bounded, scored and retained. The [series record](../../journals/wallet-runs/2026-09-20/yours-wallet-5.1.0-todo-controlled-services/series.json), [first repetition](../../journals/wallet-runs/2026-09-20/yours-wallet-5.1.0-todo-controlled-services/repetition-1/record.json), and [second repetition](../../journals/wallet-runs/2026-09-20/yours-wallet-5.1.0-todo-controlled-services/repetition-2/record.json) verify offline.
