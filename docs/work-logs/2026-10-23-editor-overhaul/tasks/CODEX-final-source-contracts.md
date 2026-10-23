# Final source contract reconciliation

Owner: existing `/root/video`, after W15 delivered. Parent owns global suite,
typecheck and actual host acceptance. No product changes authorized here.

Files exclusively owned for this follow-up:

- tests/advanced-project-autosave.test.mjs
- tests/office-real-file-roundtrip.test.mjs
- tests/lightweight-office-frontend.test.mjs
- tests/image-edge-snapping.test.mjs
- tests/rendition-callback-identity.test.mjs

These full-suite failures follow the editor overhaul's refactored persistence,
source gates and history paths. Read the final implementation and distinguish
stale textual assertions from actual behavior defects. Update only genuinely
obsolete source assertions to exact replacement symbols/contracts, never delete
a safety check or broaden it to hide a defect. If a behavioral regression is
found, report it before any product edit; source ownership stays with original
owners. Do not touch 3D tests owned by pdf, MyLibrary/host files owned by parent,
or parallel Bay/profile/collections work. No browser, network writes, runtime
restart, dependencies, push, full suite, CSS generation or broad git staging.

Run all named files under run-heavy (five-file batch), through the standard test
loader/DOM guard. Report failures before/after, exact reasons and remaining gaps
in verdicts/CODEX-final-source-contracts.md. Commit exact paths with --only.
