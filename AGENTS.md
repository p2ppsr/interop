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
- Use isolated regtest fixtures and synthetic identities. Keep production credentials, personal data, and production services outside test environments.
- Record decisions, conflicts, unresolved interpretations, coverage, and verified acceptances accurately.
- Run npm test, npm run check, and the Python packaging tests for relevant changes. Check document links after structural edits.
