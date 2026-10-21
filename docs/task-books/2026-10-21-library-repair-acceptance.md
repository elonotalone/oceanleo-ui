# Library repair acceptance — 2026-10-21

Completed 2026-10-21T15:43:00.795Z. Account: elonlee63@gmail.com. UI commit: d6eaf128.

## Result

- All 13 editor families have one private, owner-bound genuine example. Current-source parsers, editor adapter dispatch, thumbnail renderer and actual per-type filtering passed against the real owner projections.
- Parent independently downloaded all 13 current sources and 13 thumbnails through the local dev HTTP gateway; all digests matched the immutable revision receipts and all thumbnails decoded as non-flat images.
- Actual Word/PPT/Excel package admission, chart parser, website parser, design parser, workflow graph parser, game envelope/draft admission, media durations, image decode, and PDF page parsing passed. Game gameplay VM: 8 checks passed. Canonical 3D, website and video dependency grants were read back and verified.
- UI typecheck passed; 32 focused tests passed. Dev /library HTTP 200; 4 dev slots FRESH(dev), 0 STALE. No browser automation or production deployment was used.
- The 13 original erroneous uploads were soft-retired after replacement acceptance. Their source/storage bytes were preserved, so the retirement is recoverable.
- Shared UI classifies by the declared artifact family/capability, keeps empty type selection, removes fake document gray lines, extracts actual Office/text excerpts and bounds preview loading.

## Owner artifact heads

| Feature | Artifact | Revision | Source format |
|---|---|---|---|
| audio_editing | 6cf6ec0a-1fc8-4653-90e3-6f5eaa9dae80 | b16f7b48-3752-4f6c-a8e7-56b6c2fb6414 | mp3 |
| chart_editing | cb4b3150-f13e-4d55-8ba8-4945fd9b7ac6 | 0b48b1b6-ef76-44ef-8300-06c92320154c | oceanleo.chart.v1 |
| presentation_editing | 77534e47-31d3-4f98-a6a0-c0596e4f00be | b73e55d9-b0ae-4fd0-b73a-9984dbc09f6b | pptx |
| document_editing | cf20e79f-ed64-43c0-b0d5-303663c9965d | 3d2b0210-4b5e-44ad-a522-d98ec33952f9 | docx |
| model_3d_editing | 1ad86d53-ad95-4360-a6be-e32b597354a2 | 9a21029f-7ffc-4d88-80a0-0057f5a9f396 | gltf |
| pdf_editing | d67e8433-d6f7-4fe7-8b3f-3949d1d7c7b5 | 3eb215d4-ad43-45fb-b0f4-c161e180ed1b | pdf |
| image_editing | 210ab91a-81e3-4460-9924-2385261323ca | c25dad37-8e28-4dfb-a04a-1ee4f9488319 | webp |
| video_editing | 3f13d8a1-ba65-48c6-b3d2-747457b4a7e5 | 6b672bb6-c334-4b72-9910-707f4b4f7d1b | mp4 |
| website_editing | 84a73f17-5cae-4092-aecc-2740f7ce3813 | d5c1edcb-7d7a-4396-a145-afd10a1d0abc | website-source@1 |
| video_canvas | 9c6ef0c3-34dc-4a80-ac80-ab269d31ba18 | 0b7be1b1-4f3b-43f5-93fc-1fb210c42fda | oceanleo.video.project.v2 |
| design_canvas | cbf7147b-9c6c-4a62-a833-accff1e12ae8 | 754ff828-32fb-423c-9f5a-576e875a9ef0 | oceanleo.design-document.v1 |
| spreadsheet_editing | 47d640d6-e337-4245-85f7-d7e186cfa932 | f4fa22c5-9999-4c54-8d12-5d685d862a5f | xlsx |
| game_editing | 8f812a82-6af1-438e-bf85-b8655bf4e6de | 38e7bc5b-3e99-445d-ad43-84065d786a61 | oceanleo.game-document.v1 |

## Retired erroneous artifact ids

- a926bcbf-0b41-4496-ae3d-5d5f1f48712a (retired=true)
- 1c81ba98-806a-4b65-aa7b-9e8cc129dbbe (retired=true)
- 25e945e5-41f9-48a5-8aef-b380008b63c4 (retired=true)
- 37c44f8e-a287-4559-a84f-2e046f7b2c6c (retired=true)
- 71712dd2-a7b7-4a86-b398-a075476b8b92 (retired=true)
- 5835135f-f5ea-45cf-9574-bd9fe58e8d19 (retired=true)
- 1a7ebd10-52aa-4c53-8c0d-4cb3d9108c2c (retired=true)
- 49eef859-03b9-4bab-b1c2-d06001dc9216 (retired=true)
- cb5b9427-863b-47e0-a339-4114fdd638b0 (retired=true)
- 93088e1b-983b-4c19-b0f4-b40c726c3b8f (retired=true)
- b6b59068-b7a7-4513-a8cd-7cd8d2078878 (retired=true)
- 4ef68d86-57f9-4d3d-86d8-0cf3193920d2 (retired=true)
- 333d181a-bd07-45f6-a11e-0a3de16bd4da (retired=true)

## Evidence and reproducibility

Local evidence directory: /tmp/library-repair-20261021/. It contains manifest.json (source/cover digests), live-http-verification.json, readback.json, retirement.json, verify-ui.mjs, verify-live.py, verify-game.mjs, corrected source/cover bytes, source builders, and scripts/ (the four account-scoped temporary operational scripts). No session/service-role credentials or signed rendition URLs are included in this committed receipt.

Focused check command:

```sh
node --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/library-editor-category.test.mjs tests/document-cover-excerpt.test.mjs tests/document-cover-runtime.test.mjs tests/material-cover-rendering.test.mjs tests/collection-chrome.test.mjs tests/app-page-header.test.mjs
pnpm typecheck
node /tmp/library-repair-20261021/verify-ui.mjs
node /tmp/library-repair-20261021/verify-game.mjs
```

