# Codex 接班 2026-10-23

Continue the operator-approved editor overhaul. Previous Claude process stopped; preserve its landed changes and unrelated ongoing LeoBay work. No production/twin push, deployment, dependency install, operator-account writes, or duplicate cleanup. Browser consent persists; use the existing harness, acceptance account, dev slot only. Follow live kernel/bootstrap and existing 00-dispatch.md decisions, _COMMON.md, _EDITOR.md, and your W task book. The old task-book statement of model identity is historical; this continuation uses the current Codex agent.

Ownership is only the original W file boundary plus your own tests, copy book, evidence and a new verdict CODEX-Wxx.md. Do not edit shared files or other owners' code. Scoped commits on main; preserve all unrelated dirty files. Run focused meaningful tests; parent owns one full typecheck and full suite. No child agents. Use guarded commands. Investigate actual current files and git history before repeating work: several fixes landed after the transcript summary. Browser scenario calls may take minutes: launch asynchronously and report findings frequently. Do not print tokens, cookies, env contents or process command lines.

## Dispatch units

First capacity wave: W06 PDF, W11 timeline video, W14 website. These are disjoint substantial units. Pending capacity: W07 deck, W12 audio, W13 3D, W16 video canvas, then shared save/chrome/library acceptance. W10 is delivered; verify remaining claims during acceptance. Parent owns cross-cutting integration, shared drafts/status, full suite/typecheck, slot freshness and final evidence.

## W06

Read original W06 task, state/journal/delivery and recent commits including 71638f5a. Complete the remaining PDF text problem: Latin/CJK text entered then click away, save, close/reopen, reload must render correctly and remain standard PDF annotations. Existing untracked r3-reopen.mjs belongs to the previous work: inspect and preserve it, do not overwrite without understanding. Validate self-hosted font configuration from code and dev HTTP. Finish only actual remaining issues, run focused tests plus dev browser check and independent downloaded PDF inspection. Produce CODEX-W06.md with evidence and remaining failures. Shared config changes go to parent as a concrete patch request.

## W11

Read original W11 task, state/journal and signals. Finish actual remaining video timeline bugs and save protocol. Every visible toolbar button must affect preview and survive reopen; use existing scenarios first. Pay attention to expiring media URLs and preview/export transform parity. You own only W11 original UI boundary; backend export requests go to parent with exact patch/evidence. Report dropped unsupported buttons honestly. Produce CODEX-W11.md.

## W14

Read original W14 task, state/journal/signals and latest code. Finish website text/image shared bars, faithful preview, stable same-instance mode switching, private save with dependency closure, fork once, offline recovery. Preserve UGC isolation; run security gate before touching any injection/iframe/postMessage code and do not weaken it. Use existing website scenarios. Produce CODEX-W14.md with browser and focused test evidence.

## W07

Original W07 boundary only. Read state/journal plus newest deck commits before doing anything. Finish open-only phantom-version fix, text/image canon bars and light/dark layout, and remaining save/fork/offline/card acceptance. Reuse existing scenarios; specifically no version should be created merely opening/closing/reloading. Confirm real edits still publish exactly once. Parent changed shared drafts to owner-authenticated private storage and added stale-local protection; coordinate any interfaces. Produce CODEX-W07.md.

## W12

Original W12 audio boundary only. Read state/journal then inspect newest changes, as old state can lag commits. Finish theme-aware waveform, working toolbar/drawers and material insertion with undo, actual save revisions for two edits, reopen/reload and offline retry. Use original W12 scenes and fixture; create acceptance-owned copies only. Produce CODEX-W12.md.

## W13

Original W13 3D boundary only. Read state/journal/newest commits. Finish actual remaining object bars, duplicate/delete/transform behavior, theme chrome, GLB checkpoint save/restore with advanced source identity, material insertion, and D11 protocol. Preserve original scene colors. Verify no blank/phantom save on open, working save after second edit, both reopen and reload. Produce CODEX-W13.md.

## W16

Original W16 video-canvas boundary only. Read state/journal/latest code and preserve untracked s7-material.mjs. Finish native project canvas nodes, material insertion through full pipeline, private durable saves and thumbnails, real two-edit revision/fork/offline protocol, light/dark chrome. Do not assume saved if only a session snapshot exists. Produce CODEX-W16.md. Own focused tests only; parent coordinates global checks.

## W15 iteration completion

Ownership extension: oceanleo app/_components/game-iteration-client.ts, backend/app/routers/game_generate_router.py and a new dedicated game iteration job module if needed, plus focused game-iteration tests in that repo; original W15 UI boundary remains available. No CORS/cookie/sandbox/origin loosening, no model downgrade, no changes to credits or moderation rules. Read W15-delivery and W15-to-parent: user-visible iteration times out at ~180s while server saves later. Implement a bounded, authenticated job submission/status/result or robust streaming workflow so the user remains informed until the saved revision is confirmed, with idempotent submission and no duplicate billing/saves on transient retries. Preserve title unless the user changes title. Verify owner isolation, conflicts, cancellation/reload behavior and honest errors with focused tests and dev browser. Use existing durable job infrastructure if it exists; investigate first. Parent owns runtime restart after changes are tested. Produce CODEX-W15.md.

## Shared focused test reconciliation (after W16)

Own only tests/d25-office-prewarm.test.mjs, tests/d25-office-rerender.test.mjs (if that exact file exists), tests/route-context-editors.test.mjs, tests/b12-single-scroll-owner.test.mjs, and a new verdict CODEX-shared-test-reconciliation.md. Diagnose the parent full-suite failures in /tmp/codex-editor-overhaul-suite.log; current core extraction and canon controls changed legitimate interfaces. Repair test imports/stubs/assertions to follow actual exported modules and current canonical contract, preserving substantive behavior checks; replace obsolete source regex with meaningful command/runtime assertions. Do not weaken invariants, add skips, raise budgets or alter product sources. If any test reveals a real product defect, report it to parent with evidence. Run and report named focused tests. No browser or runtime restart in this unit; no source-owner overlap.
