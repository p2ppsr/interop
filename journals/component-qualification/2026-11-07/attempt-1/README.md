# Multicast delivery fabric: first attempt

These bundles are the first attempt of the `multicast-fabric-*` plans, retained
under the evidence policy. The plans named `lightwebinc/multicast-test` at
commit `5eddece1974ad1fa85703156d1f42cf89dadca41`.

| Plan | Result | Cause |
| --- | --- | --- |
| `MULTICAST-FABRIC-TX-FRAMES` | PASS | |
| `MULTICAST-FABRIC-TX-FRAGMENTATION` | FAIL | `TestScenario25_FragmentationLoss` could not start its loss impairment |
| `MULTICAST-FABRIC-TX-REPAIR` | FAIL | Scenarios 08, 10, 17 and 99 could not start their loss impairments; 11 and 18 could not install the rule that blocks the retransmission endpoint |
| `MULTICAST-FABRIC-TX-BUNDLES` | FAIL | `TestScenario89_RebucketLossRecovery` and `TestScenario91_CoalesceLossRecovery` could not start their loss impairments |

The qualification command started the scenarios as root with the invoking
user's `PATH`, which on the runner host omitted the system `sbin` directories.
Each scenario that impairs a link with `tc netem`, or blocks an
endpoint with `ip6tables`, therefore failed before it sent traffic, with
`exec: "tc": executable file not found in $PATH` or `nsenter: failed to execute
ip6tables` in the retained output. The failure is a laboratory execution fault in the command,
not an observation of the components under test.

Commit `8e553bf81e55484dfb10431ae1e7da63f061dd3c` appends the `sbin`
directories to the root run's `PATH` and checks for `tc`, `ip` and `ip6tables`
before the run. The attempt was stopped during the fifth plan, which left no
bundle; every plan was then run again at the corrected commit, and those
bundles are retained in the parent directory.
