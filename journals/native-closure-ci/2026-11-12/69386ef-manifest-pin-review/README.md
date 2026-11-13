# CI archive manifest-pin follow-up

The original69386ef CI archive07f6aaa9 and its independent review5a80b6e2 remain unchanged. A copied archive with the generated verify.py row and file omitted could pass the original verifier when a trusted external copy performed the check. The exact counterexample is retained; it concerns standalone archive inventory checking and does not change any original CI result, artifact or job cost.

The added verify-pinned-ci.py first requires the complete externally reviewed07f6 manifest identity, both generated roles and all exact physical bytes, then runs the pinned original verifier. Its real original-archive positive and omitted-verifier negative controls pass. The ops admission already pinned07f6, so its evidence basis is unchanged.

Run python3 verify.py to verify this follow-up and the exact original CI archive. This performs local byte and receipt checks only; no CI or native execution occurs. Executed verifier code still requires an external trusted Git/hash identity. The original check.py is retained as the exact source used from its ignored working path; this standalone verifier provides the archived entrypoint.
