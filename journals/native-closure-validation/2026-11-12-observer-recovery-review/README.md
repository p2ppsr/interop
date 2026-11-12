# Independent observer recovery archive review

The corrected274-member validation archive is bound by its exact e56eb5b3
manifest. One positive control and eleven meaningful mutations were executed
against copies. All pass the expected acceptance/rejection checks, including
the two previously accepted omission cases. The prior b089 archive and original
failed review remain separately preserved inside the main validation history.

The exact checker, receipt and per-control stdout/stderr are retained. This is
archive integrity validation, not native execution or qualification. verify.py
checks both inventories and the final control results without rerunning tests.
Use --replay-controls to rerun the exact checker in an isolated owned output
directory; this does not edit the archived receipt or the main archive.
