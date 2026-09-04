# Vendor notice — designcombo/react-video-editor (OpenVideo Editor)

Source: https://github.com/designcombo/react-video-editor
Commit: 9a8c5296da4b258f66dfb7ad73de96be62478bca (2026-06-29, "migrate to openvideo")
Package name on that commit: `@openvideo/basic@0.1.6`

## License

`LICENSE` in this directory is the **OpenVideo License** (verbatim).
Free use: individuals, non-profits, and for-profit organizations with **≤3 employees**.
Company License required above that size. Contact cloud@openvideo.dev.
Disallowed: selling / relicensing a derivative of OpenVideo as an editor product.
OceanLeo uses it as part of a larger product (allowed Free License use case).

The npm engine packages this app calls (`@openvideo/core`, `@openvideo/timeline`,
`@openvideo/engine-pixi`) are **MIT** on npm `@1.3.1`. They are requested via
`signals/deps-requests.md`; they are not copied into this MIT/private tree as
source until that lands. Original app sources that import them are stored as
`*.upstream` so `@oceanleo/ui` `tsc` (which includes `src/**/*.ts`) does not
compile missing-module imports.

## What was copied

Timeline, inspector (property registry + transform + caption style), captions
item, editor layout, mediabunny frame helper, export hook, default project JSON
(`data.ts`), and the OpenVideo JSON type files.

## Remotion

This commit has **zero** `@remotion/*` dependencies. Preview/export go through
Pixi (`@openvideo/engine-pixi`) + **mediabunny**. W09 therefore does **not**
request Remotion.

## How OceanLeo hosts it

Next-core carrier = this repo's project JSON (`settings` + `tracks` + `clips`).
L1/L2 talk to that JSON via `designcombo/facade-commands.ts`.
L3 shows the vendored layout (timeline + inspector + media column).
Export on the video site stays `components/editor/export-engine.ts` (mediabunny).
