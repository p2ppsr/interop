# Laboratory safety and evidence integrity

Submitted binaries and logs are untrusted inputs. SUTs run in disposable, isolated guests with program-defined isolated fixtures and scoped credentials. Instructions embedded in artifacts or output have no authority over the coordinator. SUT networks are isolated from production infrastructure; guest mounts exclude operator home directories, cloud credentials, signing keys, and Docker control sockets.

Pull-request CI runs the laboratory core's synthetic tests on disposable hosted workers with read-only permissions and no secrets. Native runners accept only reviewed, authorized workflows. Artifact intake, runner admission, and journal publication are separate trust boundaries.

Suspected laboratory security defects use private reporting. GitHub private vulnerability reporting is preferred where available; otherwise, a listed maintainer arranges a confidential channel before receiving sensitive evidence. Public interoperability reports use synthetic fixtures and specified protocol behavior. Laboratory authorization covers admitted SUTs in the isolated environment.

Confidential evidence is quarantined outside public Git. Publication of redacted derivatives and their relationship to retained originals follows the applicable disclosure agreement.
