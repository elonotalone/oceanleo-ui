# W14 journal
- Baseline (before edits) fail counts: workbench 4, canva 2, v7 1, autosave 2, p4 2, b16 2, edit-bar 2, w13 2, p7 1 (file crash), media-editors 2, collab 2, w25-translate 4, w25-paths 2, plugin-store 0.
- Pre-existing check: extracted fed0b268~1 (git archive) to /tmp/w14/base; w25-tests-out-of-repo-paths gives the identical 37 offenders + 7 dead umo entries there; W5/W6/W7 person-edit scripts and acceptance-image also failed there.
- MISTAKE: ran tests/w10-r2-ui-offline.test.mjs once (not in my list) to see its state; it launches Playwright chromium against oceanleo-app dist. Killed by the 100s timeout, no leftover processes. No other browser use.
