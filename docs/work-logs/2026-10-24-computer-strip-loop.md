# Computer page React 185 investigation

Scope: fix locally; the operator explicitly requested no oceanbizs push.
One small component/test unit; no delivery-sized parallel clusters.

The program strip must settle after resize, keep the selected program visible
when collapsed, and release its controls when the row fits again.

Considered routes (all use existing React and DOM APIs; no new services or dependencies):

1. Measure flex wrapping with the controls temporarily out of layout, restore
   them synchronously, then read the actual first row. Selected: browser flex
   layout remains the authority, including max-width and text truncation.
2. Permanently reserve room for the controls with CSS visibility. Stable but
   unnecessarily wraps programs that would fit without the controls.
3. Derive capacity by summing item widths and adding controls' width back.
   Existing route: fails because max-w-full clamps items to the changed row
   width. Cloned intrinsic measurement would also duplicate rendered controls.

Falsifiable assumption: testing the actual layout without the controls gives
the same wrap verdict whether those controls are currently mounted or absent.
The focused JSDOM regression models flex-wrap and max-w-full (JSDOM does not
provide layout), with a 160px row, 140px/20px items, 16px gap and 68px controls.
Before the fix it fails with `Maximum update depth exceeded`, from
ProgramStrip's layout-effect measurement. These are synthetic dimensions,
not a measurement of the operator's browser. The screenshot alone does not
prove this was its only possible trigger.

The message list's inline ref was also inspected, but its existing rendering
tests did not reproduce this loop; it is outside this focused fix.

## Verification

- `program-strip-layout.test.mjs`: failed before the product edit with the
  maximum-depth exception; passed afterward, including selected-item visibility
  in collapsed mode and resize from narrow to wide and back.
- `acp-card-flows.test.mjs`: 53 passed.
- `cloud-computer-program-row.test.mjs`: 6 passed.
- `server-page-href.test.mjs`: 1 passed.
- `tsc --noEmit`: exit 0; `git diff --check`: exit 0.
- LeoDev oceanleo slot: linked to the local UI, FRESH(dev), 0 STALE;
  computer route returned HTTP 200. No browser/visual verification performed.
- Existing `server-page-view.test.mjs` could not load because its domain-family
  stub lacks `sharedCookieDomainFor`. The initial pre-fix message-list run also
  had one unrelated existing expectation mismatch (amber styling for an offline
  reconnect notice); 7 other tests passed. Neither failure was hidden or changed.
- No commits, push, package bump, deployment or website restart performed.
