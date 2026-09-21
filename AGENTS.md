# Repository guidance

Read CHARTER.md, GOVERNANCE.md, CONTRIBUTING.md, LICENSE.md, and docs/implementation-status.md before changing semantics.

## Editorial standard

Write as TPNIL, for readers who encounter the repository without its drafting history. Use one institutional voice across the charter, governance, legal instruments, program definitions, and technical documentation.

- State policies, facts, responsibilities, and acceptance conditions directly. Give each obligation a clear subject.
- Omit conversation history, prompting instructions, drafting deliberations, and references to documents “provided” or “supplied” during establishment.
- Replace internal reminders such as “do not assume,” “do not claim,” and “have counsel review” with the actual rule, prerequisite, or recorded status. Preserve operative prohibitions where they define a technical or legal boundary.
- Put legal identity, authority, founding participation, affiliation disclosures, voting rules, and forum provisions in GOVERNANCE.md. Maintain its participation table as the authoritative register rather than duplicating member status in a separate document or JSON file. Keep agreements focused on their parties, terms, and acceptance.
- Record implementation maturity in docs/implementation-status.md and the relevant program or artifact status. Link to those records instead of repeating defensive caveats throughout the repository.
- Describe repository content and disclosure obligations precisely. Avoid blanket statements about information that will “never” be disclosed or narration about private source documents.
- Keep source provenance where it supports a technical finding. Distinguish a source observation from a normative requirement and an executed result.
- Review surrounding prose and cross-references after edits so the document remains coherent. Preserve the exact text of third-party licenses and quoted source material.

## Engineering and stewardship

- Preserve private visibility until the authorized steward explicitly authorizes public release under GOVERNANCE.md. Contact with prospective founding participants requires express instruction.
- Apply the repository's Open BSV licensing policy to original infrastructure, vectors, evaluators, and prose. Proprietary SUTs retain their own ownership and submission terms.
- Label synthetic fixtures and results LAB_SELF_TEST_ONLY. SUT conformance requires executed applicable assertions and complete evidence; certification additionally requires the governance gates.
- Freeze standards, artifacts, dependencies, versions, oracles, and criteria before scored runs. Apply the same admission requirements to reference implementations.
- Preserve accepted journal records and failed attempts. Append corrections with references to the original evidence.
- Treat `PASS`, `FAIL`, and `BLOCKED` as laboratory data. A completed, verifiable run may contain any of them; execution tooling fails only when the run or evidence contract fails.
- Follow each program’s declared network and funding boundary. ISI-4 uses unchanged production mainnet binaries with supported, explicitly configured ITCVE services and isolated fixtures; it requires no wallet regtest API or special build. Keep personal wallets, production credentials, and public-mainnet spending outside this controlled-service profile. Preserve application trust controls and record unsupported integration limits.
- Give every spendable controlled funding output a verifiable ancestry. Scored mobile-wallet runs use the admitted Teranode-mined fixture, validate its block header and Merkle proof before internalization, and retain the WAB payment and descendant transactions. Synthetic no-input funding belongs only in laboratory unit tests.
- Record decisions, conflicts, unresolved interpretations, coverage, and verified acceptances accurately.
- Run npm test, npm run check, and the Python packaging tests for relevant changes. Check document links after structural edits.
