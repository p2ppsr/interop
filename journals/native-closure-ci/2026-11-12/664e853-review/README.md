# Independent CI archive review

The immutable Foundation archive for source664e is independently verified:91 indexed files, three original artifact ZIPs with262 members, and394 committed/current native inputs. The existing technical intake review remains the source of the recorded execution findings; this review did not rerun native, component, Rust or CI execution.

The positive standalone check passed. Two changed temporary copies were rejected: removing both the generated verifier and its manifest row, and replacing the verifier while coherently updating its stored/decoded hashes and sizes. Both checks execute the original trusted verifier against the copy. The original archive remains byte-identical. The executing verifier and independently supplied archive digest remain external trust anchors.

CI retains584 PASS and six known Go Messaging FAIL results. Its1410 job-seconds bring the completed cohort to28378. The historical source7 run is carried unchanged and not charged twice. The running native8 attempt is separate and has no result in this sidecar.

`verify.py` checks this sidecar and its exact archive link. `check.py` reproduces the independent archive/member/source checks and the two temporary-copy controls.
