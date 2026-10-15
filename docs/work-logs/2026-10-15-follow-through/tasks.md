# Follow-through task books — 2026-10-15

User: finish /root/.claude/projects/-root/eaa58d4f-8006-46e6-b006-c96b22dd32cd.jsonl, preserving concurrent work.

## Shared rules

Read /opt/cursor-workspaces/oceandino/AGENTS.md, /root/.oceanleo-workstation/INSTRUCTIONS.md and matching packs. Run bootstrap first. Work on main, never revert or stage someone else's changes. No browser, screenshots, production promotion, secrets, installs, global CSS generation, version bumps or pushes. Use apply_patch. Heavy work uses /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy; focused checks run-light. Parent owns integration, generated output, version, deployment and final verification. Do not dispatch grandchildren. Report files and exact verification; leave changes uncommitted for parent. Journal findings in a uniquely named report beside this task book. Existing dirty files are concurrent work: inspect but do not change without parent coordination. Do not loosen checks or expand baselines merely to make tests green.

## I18N

Own clean src/i18n files, tests/i18n-*.test.mjs and narrowly necessary translation fixtures/baselines. Exclude initially dirty bay-mine-copy.ts, bay-money-copy.ts, bay-shell-copy.ts, bay-supply-copy.ts; coordinate if required. Repair remaining i18n key coverage, collisions, enterprise agreement (Desactivado/Desactivada), work-chat table failures. Run relevant checks, diagnose genuine source defects vs stale registrations. No source files outside src/i18n. Report i18n-report.md.

## EFFECT

Own tests/effect-tt-dependency.test.mjs and clean non-Bay/non-cloud-computer source effect sites it flags. Run and repair actual translation/effect risks and stale historical registration evidence without weakening scanner or debt guard. Do not edit src/i18n or shared global test helpers without parent coordination. Report effect-report.md.

## FORM

Own clean src/shell/bay/form/{bay-deadline.ts,BayDeadlineField.tsx,BayAutoTextarea.tsx,BayChoice.tsx,BayRevealForm.tsx,listing-terms-fields.tsx}, plus new focused deadline/form tests. Audit calendar, HH:MM:SS input, selected timezone vs device timezone vs UTC, DST edge cases, choice collapse/reopen, textarea clipping, required focus. All current Bay tests may be run diagnostically through heavy guard as one suite; don't edit dirty files/tests. Diagnose remaining Bay failures and report boundaries instead of changing concurrent dirty code. CheckoutPane.tsx is dirty and read-only. Ensure no browser. Report form-report.md.

## SESSIONS

Own clean src/shell/cloud-computer/agent-dialog/useAgentDialogController.tsx, clean adjacent new refresh helpers, and NEW focused tests (do not edit initially dirty cloud-computer-agent-dialog.test.mjs, reduce.ts, Composer.tsx or MessageList.tsx). Preserve automatic session history freshness; reduce unnecessary polling, prevent overlapping requests, handle visibility/activity, focus and reconnects. Add meaningful behavioral coverage. Backend is read-only. Report sessions-report.md.

## BACKEND-PHOTOPEA (read-only)

Inspect existing /tiers fix and runtime development API evidence, plus Photopea black-screen report through transcript and mapped editor source. Read-only except your own backend-photopea-report.md. Do not restart any service, edit product code or commit concurrent backend changes. Use bounded HTTP/API checks, no browser. Identify exactly what remains broken and safe fix boundaries. Verify the separate retired oceanbizs lib/site-domains.ts change was committed as requested. Report evidence and next concrete steps.
