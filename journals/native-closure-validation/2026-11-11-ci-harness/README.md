# Test harness correction after Linux CI

Foundation43157163535 failed five CPU-heavy cryptographic tests at the default five-second timeout. Only those tests receive explicit thirty-second budgets; every predicate and verifier limit is unchanged.

The certificate suite passed32 cases, then failed its authenticated storage teardown. A real reference wallet reproduces the idle-connection failure after a nine-second CPU-only block. Capturing both reports and closing resources before offline mutations passes the paired control; capture and cleanup failures remain fatal.

The full corrected suite passes629 tests with eight explicit skips using two workers on macOS; typecheck passes. This is not a claim of equivalent Linux CPU performance or a retroactive CI pass. Original failed Linux evidence remains separately retained, and new Linux CI must pass. Native source/policy inputs remain byte-identical to585211c and the two native attempts continue on that frozen source.
