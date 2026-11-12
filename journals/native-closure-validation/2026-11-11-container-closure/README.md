# Native container source closure correction

A final packaging review found that the worker would require source files absent from the image. The missing Go sources, selector scripts and workflow are now explicitly copied. Both prospective plans and paired Rust manifests were refrozen before native execution.

All147 core tests pass, including a new complete COPY-closure check and six missing-source counterexamples across the two plans. The previous629 synthesis tests and eight gated skips remain applicable to unchanged runtime bytes. No native execution occurred during this correction.

The exact five previous inputs are retained under `before/`, verified against the immutable earlier validation hashes. `validation.json` binds current source inputs, original/stored logs, and the previous receipt. The prior record remains historical rather than silently rewritten.
