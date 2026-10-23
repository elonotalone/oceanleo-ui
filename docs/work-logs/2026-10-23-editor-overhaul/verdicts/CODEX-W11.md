# W11 Codex continuation — video timeline

## Delivered change

Commit `8b453106`: long-running editor sessions now check expiring media grants every 30 seconds, only while a project contains grants. A fallback grant can renew repeatedly. Renewal changes neither edit revision nor undo history and clears its timer on unmount. Previously the effect ran only on document changes and marked replacement grants permanently attempted, so an idle editor could eventually lose media again.

Owned code: `src/shell/video-editor/use-video-timeline.ts`. Regression: `tests/video-collab-remote.test.mjs` advances time through two expirations against the actual hook, verifies two renewals, unchanged edit revision, no undo, cleanup. Corrected the old import mock to return a string matching its actual contract. No tests deleted or protection relaxed.

Updated existing W11 browser scenarios for canonical `adjust`/`position` panels, undo between slider changes, direct numeric/color controls, caption creation, transition options, shorter duration and the actual close button. Request logging redacts artifact grants.

## Verification

Focused command (repo root):

```sh
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/w11-video-edit-bar.test.mjs tests/video-editor-v8.test.mjs tests/private-video-commit.test.mjs tests/video-collab-remote.test.mjs tests/video-timeline-carrier-contract.test.mjs
```

**55/55 passed.** Parent owns full typecheck/full suite, so not duplicated. The tests cover every emitted command for video/image/text/audio, transform preview, model normalization, canonical ordering, private commit contract, source hydration, grant fallback, material insertion and consecutive save base.

Browser runs use only the existing LeoDev portal slot and acceptance account. Commands from this work-log directory:

```sh
bash harness/mint.sh | OUT_DIR=/tmp/codex-w11-save THEME=light node harness/run.mjs evidence/W11/scenarios/w11-save.mjs b0fed7d4-c1d1-447d-acbe-09dd5e3aa1f7 1
bash harness/mint.sh | OUT_DIR=/tmp/codex-w11-bar-dark THEME=dark node harness/run.mjs evidence/W11/scenarios/w11-bar.mjs b0fed7d4-c1d1-447d-acbe-09dd5e3aa1f7 0 video
```

Dark video matrix finished (157.5 s): flip-x, flip-y, rotate, opacity, brightness, contrast, saturation, x/y, zoom and angle all change preview pixels and undo restores the original. Duplicate/delete change the timeline and undo restores it. Speed, mute, volume, start time and source in change timeline/preview as applicable and undo restores. Both range and numeric inspector inputs were checked. Attempting to extend the original six-second clip beyond its source correctly produced no mutation; the scenario now tests shortening. Transition was initially only opened, so this run alone does not prove its selector.

Screenshots checked visually and retained under 300 KB each: `evidence/W11/codex-light.png`, `evidence/W11/codex-dark.png`. Timeline and chrome follow host theme; video colors stay unchanged.

Caption follow-up uses `/tmp/codex-w11-text-r4`, same command with `THEME=light`, track index `2`, tag `text`. Sparse grid/mean sampling missed small captions despite their visible changes; the helper now uses a dense pixel hash. Numeric/color controls commit directly and caption text is filled in the inspector. One previous run exited to My Library after Enter in the font-size input; shared owner was notified, and this scenario uses blur because the control already commits on change.

**Caption matrix completed in 83.4 s:** font size, bold, text color, highlight, align and x/y each visibly change preview pixels and undo restores exactly. Caption content changes both pixels and timeline label. Duplicate/delete, start time and duration mutate and undo restores; fade-in changes pixels and undoes. No missing controls in this final run.

## Save protocol evidence

Acceptance root `b0fed7d4-c1d1-447d-acbe-09dd5e3aa1f7`:

| Action | Server result |
| --- | --- |
| A flip-x | revision POST 200; ordinal 6, `1cab317a-ac34-431c-a79c-bb3eba8195a4` |
| B mute | revision POST 200; ordinal 7, `9d7db189-8deb-4b00-8520-ce18bb540775` |
| Reopen, then whole-page reload | flip remains true; mute state remains changed |
| Offline flip-y | save state error, explicit upload/network error |
| Network restored + retry | revision POST 200; ordinal 8, `235a24d7-ca87-4ada-9caf-71fc5162fb78`; saved only afterward |

Read-only SQL against this acceptance-owned root confirms exactly these three added revisions on the same root. Full log/screenshots: `/tmp/codex-w11-save`. The first save scenario used an obsolete close selector and waited 60 s without actually closing; its subsequent navigation did unmount/reopen the editor. The selector has been corrected; separate close verification is recorded below when run.

Direct current dev API check: fresh source rendition grant for original mp4 revision `50993022-ff0c-4cc8-9cca-9b9d3275d26a`, then `/v1/media/import` with `register_asset:false`, returns **200 video/mp4, 625527 bytes**. Earlier typed-registration 500 is resolved. No token or source URL retained in the report.

Separate `w11-close.mjs` now proves actual top-row close detaches the editor, followed by reopening with the same flip state (44.4 s, `/tmp/codex-w11-close/actual-close-reopen.png`). This run is read-only and adds no revision.

## Supported and omitted controls

Text: font-size, bold, text-color, highlight, align, position, duplicate/delete, caption text and timing/transition. Video: flip-x/y, rotate, opacity, adjust, image-fit, position, duplicate/delete, speed, mute/volume, timing/transition. Image: flip-x/y, rotate, opacity, position, duplicate/delete and timing/transition. Audio: duplicate/delete, speed, mute/volume and timing/transition.

No font-family, italic, underline, strike, lists, links, line-height, image crop/border/radius/background removal or image color adjustment is exposed: the preview/export contract lacks those capabilities. No new unsupported button was added in this continuation. Backend flip export parity belongs to parent and was reported patched and real-render-tested there.

## Acceptance still to distinguish

This is not an all-items-green verdict: public-material fork-once and library-card refresh were not independently measured in this continuation; image/audio browser matrices and per-control save/reopen need integration acceptance. Existing focused tests cover their command/persistence paths but are not substituted for browser evidence. Shared page hydration mismatch appears on initial navigation in the harness; it recovers, and no W11 source has been attributed as its cause. Parent owns shared integration and dev-slot freshness.
