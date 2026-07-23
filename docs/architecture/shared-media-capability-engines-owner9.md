# Shared media capability engines (owner 9)

## Product outcome and boundaries

`@oceanleo/ui` owns reusable image, multi-track timeline, and 3D director
semantics. Sites are adapters, not capability owners. Local image edits preserve
the source byte identity and append an immutable recipe. AI image outputs,
timeline saves/renders, and 3D previs captures produce explicit lineage and
receipts. A missing provider or renderer is a disabled capability with a reason,
never a simulated success.

This change stays inside the image editor, video editor, and model3d workbench
surfaces. Public package aggregation, central advanced-capability routing,
consumer bumps, backend providers, and release work remain separate owners.

## Three reuse chains compared

| Candidate | Mature components and interoperability | Guarantees and environment fit | Moving parts and failure modes | Decision |
| --- | --- | --- | --- | --- |
| Shared semantic kernels with injected adapters | Existing Fabric 6 document model, browser Canvas/Web Audio preview, gateway FFmpeg timeline API, Three.js 0.183 scene/GLTFExporter, and standard `AbortSignal`/JSON contracts | Runs in the current browser/Node package without extra hardware or inbound NAT; pure contracts are testable without DOM/WebGL; one immutable `TimelineDoc` feeds edit/save/render; adapters expose exact provider support | Three small kernels plus adapters. Provider endpoints can be absent, source URLs can expire, and preview can differ from final render; each condition is represented in validation or a receipt | **Selected** |
| Replace the surfaces with specialized editor stacks | Pintura/Filerobot-style image editors, Remotion Player/Renderer, and react-three-fiber/drei all have documented ecosystems | Good individual UX, but introduces licensing/runtime decisions, a React renderer migration, server-side Chromium/Node render resources, and a second 3D scene ownership model | Multiple state models, conversion layers, larger bundles, migration risk, and preview/export drift. Timeline output would no longer use the proven gateway FFmpeg contract directly | Rejected: more moving parts and weaker fit than the already-shipped runtimes |
| Site-local orchestration over cloud media vendors | Cloudinary-style image transforms, Shotstack-style video jobs, and hosted 3D render APIs have documented HTTP workflows | Provider output can scale, but requires credentials, egress, billing reconciliation, and provider-specific endpoint availability; offline/local recipe guarantees disappear | Every site duplicates command mapping and lineage; provider outages, unsupported operations, and cost semantics drift by consumer | Rejected: violates shared-package ownership and cannot guarantee local zero billing |

The selected chain ranks first on production maturity in this repository,
hardware/resource fit, and number of moving parts. Fabric, the current
`TimelineDoc` + FFmpeg request, and the real Three.js scene remain authoritative;
the new layer names semantic commands and receipts rather than replacing them.

## Contract direction

- Image: a source reference pins byte digest/length/MIME. `crop`, `rotate`,
  `flip`, `adjust`, and `filter` append validated local recipe operations and
  always return a zero-charge receipt. AI commands (`relight`, `multi-angle`,
  `panorama`, `grid-4`, `grid-9`, `grid-25`, `grid-split`, `upscale`,
  `inpaint`, `outpaint`, `portrait-quality`) require an adapter that explicitly
  advertises that command. Outputs are new immutable lineage nodes.
- Timeline: `TimelineDoc` remains the only composite document. Semantic edits
  create revisioned snapshots; save and render adapters receive the same
  normalized snapshot. Render cancellation is an explicit adapter contract and
  every receipt pins schema version plus document revision.
- 3D director: a serializable director sidecar binds scene, shot, and take;
  validates camera/FOV/lens/aperture, lighting and transforms; and stores ordered
  motion keyframes. Local screenshots issue evidence receipts. The default
  playblast adapter records the real Three canvas and routes it through the
  timeline renderer; aperture remains serializable camera semantics and drives
  Bokeh DOF only where the measured WebGL runtime supports it.

## Falsifying assumption and pre-production proof

**Falsifying assumption:** if one JSON-serializable immutable document per
engine cannot round-trip its command while preserving source identity and
passing the identical revision-pinned snapshot to save/render/provider adapters
without loading Fabric, WebGL, or a browser, this shared-kernel design is
invalid.

The throwaway proof is `/tmp/oceanleo-owner9-contract-proof.mjs`. It must run on
the target Linux host before production modules are edited and objectively show:

- local image source SHA-256 unchanged and billed amount exactly zero;
- AI progress/lineage from an advertised fake adapter and a reason for an
  unsupported command;
- byte-identical timeline save/render snapshots with a pinned version and a
  cancellation receipt;
- camera rejection outside bounds, ordered motion keyframes, a screenshot
  receipt, and an unavailable playblast reason.

Proof status is recorded after execution; the scratch file is not shipped.

Proof result: **PASS** on Linux with host Node `v22.22.2`. The measured source
digest was
`4c4b6a3be1314ab86138bef4314dde022e600960d8689a2c8f8631802d20dab6`;
local billing was `0`; AI progress was `[0, 0.5, 1]`; timeline save/render
serialized bytes matched at revision `7` and cancellation was observed; camera
validation rejected `180°`; two keyframes reopened in `[0, 1000]` order; the
screenshot receipt completed; and the deliberately adapter-free pre-production
playblast probe reported `No playblast executor is configured`.

## Landed shared entries and integration

- `src/shell/image-editor/image-capability-engine.ts` owns the image command
  registries, immutable recipe/lineage records, validation, progress,
  cancellation, error, output-cardinality, and cost receipts.
  `src/lib/image-ai-edit.ts` re-exports that surface through the existing public
  lib entry. `createGatewayImageAiProvider` remains the configurable adapter;
  `createOceanLeoImageAiProvider` is the production mapping for all eleven
  semantics. Exact request schemas live in
  `image-editor/image-provider-mappings.ts`: relight, angle, panorama, contact
  grids, mask-guided inpaint, outpaint and portrait quality use the durable
  image-edit chain; upscale uses the verified super-resolution route; grid split
  performs deterministic local slicing followed by durable uploads. Multi-angle
  uses one request per named viewpoint so cardinality is explicit rather than a
  provider-variant guess. Async status/cancel URLs are restricted to the gateway
  origin so an untrusted response cannot receive the bearer token.
- `src/shell/video-editor/timeline-capability-engine.ts` owns the semantic edit
  registry and immutable version snapshot consumed by save/render adapters.
  `createGatewayTimelineRenderAdapter` binds it to the existing real
  `/v1/video/render-timeline` submit/status/delete chain.
- `src/shell/media-editors/model3d-director.ts` owns director documents,
  commands, camera/lens math, validation, and previs receipts.
  `Model3DDirectorPanel.tsx` binds those contracts to the real scene workbench;
  `Model3DWorkbench` still accepts an optional override adapter, while its
  default playblast executor records the real scene, uploads one source, renders
  the same `TimelineDoc` kernel to a durable MP4, and records source URL, render
  job, duration, fps and frame count. `model3d-runtime.mjs` applies director
  camera motion and bounded Bokeh DOF to preview, screenshot and playblast.

The owner-controlled capability barrels are:

- `src/shell/video-editor/capabilities.ts`
- `src/shell/media-editors/model3d-capabilities.ts`

Central shell aggregation is outside this owner. The central owner has now
integrated exactly these one-line additions in `src/shell/index.ts`:

```ts
export * from "./video-editor/capabilities";
export * from "./media-editors/model3d-capabilities";
```

No new provider endpoint is required for execution. The remaining external
gateway limitation is cooperative cancellation after an image request has been
admitted: current image routes intentionally submit and poll DashScope inside
one blocking HTTP request and expose no public image task/status/delete
contract. Browser abort is implemented, and the adapter also implements real
status polling and DELETE cancellation whenever a gateway response supplies
`status_url`/`cancel_url`; stopping an already-admitted current image task needs
backend ownership.

## Continuation decision: executable providers, playblast and DOF

Source inspection found that the gateway already has durable, metered image
chains:

- `POST /v1/images/edit` accepts one or multiple image URLs, a prompt,
  `description_edit`, ratio/sharpness and `n`; it upgrades multi-image requests
  to the proven Qwen edit model and returns rehosted permanent URLs.
- `POST /v1/images/upscale` is a verified DashScope
  `super_resolution` route and also returns rehosted permanent URLs.
- Image routes intentionally block while DashScope submit/poll runs in the
  gateway. There is no public image task/status/delete route, so the browser can
  abort its HTTP request but cannot cooperatively cancel the already-admitted
  provider task. This is a gateway contract limitation, not a UI omission.
- `POST/GET/DELETE /v1/video/render-timeline` is an asynchronous, cancellable,
  metered FFmpeg chain whose successful URL and creation row are durable.

Three executable mapping candidates were compared:

| Chain | Fit and guarantees | Failure modes | Decision |
| --- | --- | --- | --- |
| Same-origin semantic adapter over `/images/edit`, `/images/upscale`, durable upload, and local grid slicing | Reuses deployed auth, model selection, billing, rehosting and source allowlists; outputs can be lineage-pinned | Image HTTP cancellation cannot stop a provider task after gateway admission; generative prompts can fail semantically | **Selected** |
| Browser calls DashScope task APIs directly | Would expose native task polling/cancel | Requires provider credentials in the browser, bypasses gateway metering/rehosting and violates the trust boundary | Rejected |
| Advertise commands while waiting for eleven new backend routes | Simple UI but no execution | UI-only capability, permanent disabled states | Rejected |

For playblast, per-frame PNG upload was rejected because a five-second 24 fps
take would create 120 uploads and URLs. A hosted 3D renderer was rejected
because no provider contract exists. The selected chain records the real Three
canvas with standards-based `captureStream` + `MediaRecorder`, uploads one WebM
source, then feeds that source into the existing timeline renderer for a durable
MP4 receipt and cooperative render cancellation.

For depth of field, metadata-only aperture was rejected because the installed
Three 0.183 package includes the mature `EffectComposer`, `RenderPass` and
`BokehPass` modules. The selected implementation maps f-stop and focus distance
to bounded Bokeh uniforms for editor preview, screenshot and playblast. It
remains a raster preview effect: glTF/GLB has no portable aperture/DOF rendering
contract, and runtimes without WebGL postprocessing retain camera metadata but
return the exact capability limitation.

Continuation falsifying assumption: **if the deployed gateway source lacks the
durable edit/upscale or cancellable timeline routes, the installed Three package
lacks Bokeh uniforms, or a browser canvas cannot produce a supported
`MediaRecorder` stream, this chain cannot honestly execute and must fail with
the measured limitation.**

The no-browser pre-production proof is
`/tmp/oceanleo-owner9-provider-playblast-proof.mjs`. It statically verifies the
authoritative gateway route declarations, blocking image semantics, timeline
submit/status/delete contract, installed Bokeh uniforms, all eleven mapping
entries, and the single-WebM playblast plan. Browser API presence is checked at
runtime by production code because browser execution is explicitly disallowed
for this task.

Continuation proof result: **PASS** on host Node `v22.22.2`. It found all eleven
mapping entries, durable blocking image routes, cancellable timeline routes and
the installed Bokeh `focus`/`aperture`/`maxblur` uniforms. Node reported
`MediaRecorder` as `undefined`, which is the expected non-browser limitation and
is handled as a typed runtime capability failure rather than a disabled product
stub.

## Verification result

Focused owner-9 and adjacent integrity suites completed **66/66 tests passing**:
image command/provider/integrity, timeline kernel/video render, director,
playblast/DOF, model persistence, media-editor integration, advanced model
history, and both owner-controlled barrels.

The owner-9-only TypeScript project and the final full `npm run typecheck` both
completed without diagnostics. No browser verification was run, as explicitly
required; browser-only `MediaRecorder`, canvas-stream and WebGL capability
checks fail closed at runtime with tested reasons.
