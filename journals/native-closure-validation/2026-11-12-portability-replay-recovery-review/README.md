# Independent portability replay recovery validation review

The original58-member validation archive remains unchanged. One positive control
and six independent tamper controls passed: omitted native/source6 inputs,
omitted linked evidence, changed core count with rewritten hashes, false semantic
receipt with rewritten hashes, and a missing indexed member. The checker preserves
complete subprocess output and verifies each mutation was applied when replacing
bytes. These are local archive controls, with no new CI or native session.

verify.py checks the sealed evidence and retained controls. Optional
--replay-controls reproduces the controls in an owned temporary copy.
