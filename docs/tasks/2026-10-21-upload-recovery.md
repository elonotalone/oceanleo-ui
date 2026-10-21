# Upload recovery owner (second wave)

Operator authorizes gpt-6-luna, reasoning max. This is a disjoint remaining unit after toolbar delivery. Bootstrap first; read live kernel and oceanleo pack. No browser/Playwright, production, dependency installs or pushes. apply_patch, main only. Preserve concurrent changes and do not edit Library UI, editor layout/save or toolbar files.

Own only src/lib/database.ts, src/lib/upload/* and upload-specific tests. Library owner retains MyLibrary.tsx, auth, artifact-client.ts and preview-to-edit work. Coordinate any UI call-site changes directly with library owner. Parent owns generated CSS, versions, full typechecks and final integration.

Problem: user frequently gets `网络错误，无法连接到ai网关` while uploading Library files. Existing auth-lock steal/replay and same-user refresh reset were fixed by library owner; investigate remaining transport behavior and repair transient failures without hiding real failures or duplicating artifacts. Private Library uploads must stay private, maintain stable content-bound idempotency keys across retries and request phases, preserve progress/cancellation, and never fall back to public storage. Do not blindly replay mutations without proven idempotency semantics. Use existing upload APIs/SDKs, no new service.

Acceptance: meaningful request-level tests for transient fetch/XHR/auth failure then success, bounded retries, identical idempotency identity, timeout/abort distinction, genuine 4xx non-retry, private routing and no duplicate registration. Existing private-library-upload/upload-resume/upload-progress tests as applicable. Parent runs full typecheck; focused tests through agent-io-guard run-light. Investigate, implement, verify; no token/secret output or downloading user files. No live test upload unless essential and clearly scoped; simulated request failures preferred.

Return exact files, root causes, test results and limits in docs/tasks/2026-10-21-upload-recovery-result.md. Do not commit product changes; parent integrates explicitly.
