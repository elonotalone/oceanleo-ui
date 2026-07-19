import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DESIGN_TEXT_CONTROL_ORDER,
  nextTextAlignment,
  orderDesignTextControls,
  partitionSelectionControls,
  selectionControlSemantic,
} from "../src/shell/selection-toolbar-layout.ts";
import {
  normalizeSelectionContext,
} from "../src/shell/selection-context.ts";
import {
  partitionSelectionInspectorControls,
} from "../src/shell/selection-inspector-groups.ts";
import { SelectionCommandGate } from "../src/shell/selection-transactions.ts";
import { editorCapabilityFor } from "../src/shell/workbench-routes.ts";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("v9 renders every primary capability without fixed-six truncation", () => {
  const primary = Array.from({ length: 14 }, (_, index) => ({
    id: `primary-${index}`,
    kind: "action",
    label: `Primary ${index}`,
  }));
  const controls = [
    ...primary,
    { id: "semantic-more", kind: "action", label: "More", placement: "more" },
    { id: "tools-only", kind: "action", label: "Tools", placement: "tools" },
  ];
  for (const width of [240, 320, 768, 1920]) {
    const projected = partitionSelectionControls(controls, new Map(), width);
    assert.deepEqual(projected.visible.map(({ id }) => id), primary.map(({ id }) => id));
    assert.deepEqual(projected.overflow.map(({ id }) => id), ["semantic-more"]);
  }
  const layout = source("../src/shell/selection-toolbar-layout.ts");
  assert.doesNotMatch(layout, /MAX_COMPACT_CONTROLS|visible\.length\s*>=\s*6/);
});

test("v9 floating bar is intrinsic width with only a viewport safety maximum", () => {
  const toolbar = source("../src/shell/SelectionToolbar.tsx");
  const floating = source("../src/shell/FloatingContextToolbar.tsx");
  assert.match(toolbar, /w-fit max-w-full/);
  assert.match(toolbar, /maxInlineSize:\s*SELECTION_TOOLBAR_VIEWPORT_MAX/);
  assert.doesNotMatch(toolbar, /width:\s*`min\(|min-w-\[[^\]]+\]|flex-1 flex-nowrap/);
  assert.match(toolbar, /\[overflow-x:auto\]/);
  assert.match(floating, /inline-flex w-fit max-w-/);
});

test("Design text controls follow the canonical semantic order", () => {
  const controls = [
    { id: "layers", kind: "panel", label: "Position", semantic: "position" },
    {
      id: "animation-gallery",
      kind: "animation-gallery",
      label: "Animation",
      semantic: "animation",
      disabled: true,
      unavailableReason: "Selection is locked",
      animationGallery: {
        presets: [{ id: "fade", label: "Fade", applyCommandId: "animation.apply.fade" }],
      },
    },
    { id: "effects", kind: "panel", label: "Effects" },
    { id: "opacity", kind: "number", label: "Opacity", value: 1 },
    { id: "vertical-text", kind: "toggle", label: "Vertical", value: false },
    {
      id: "text-anchor",
      kind: "select",
      label: "Anchor",
      value: "top",
      options: [
        { value: "top", label: "Top" },
        { value: "middle", label: "Middle" },
        { value: "bottom", label: "Bottom" },
      ],
    },
    { id: "line-spacing", kind: "range", label: "Line", value: 1 },
    { id: "letter-spacing", kind: "range", label: "Letter", value: 0 },
    {
      id: "align",
      kind: "select",
      label: "Align",
      slot: "inspector",
      inspectorGroup: "text-spacing",
      value: "left",
      options: ["left", "center", "right", "justify"].map((value) => ({
        value,
        label: value,
      })),
    },
    { id: "case", kind: "action", label: "Case" },
    { id: "strike", kind: "toggle", label: "Strike", value: false },
    { id: "underline", kind: "toggle", label: "Underline", value: false },
    { id: "italic", kind: "toggle", label: "Italic", value: false },
    { id: "bold", kind: "toggle", label: "Bold", value: false },
    { id: "color", kind: "color", label: "Color", value: "#000000" },
    { id: "font-size", kind: "number", label: "Font size", value: 24 },
  ];
  const partitioned = partitionSelectionInspectorControls(controls);
  const ordered = orderDesignTextControls(partitioned.compact);
  assert.deepEqual(
    ordered.map((control) => selectionControlSemantic(control)),
    DESIGN_TEXT_CONTROL_ORDER,
  );
  assert.deepEqual(
    partitioned.groups.find(({ panelId }) => panelId.includes("text-spacing"))
      ?.controls.map(({ id }) => id),
    ["text-anchor", "line-spacing", "letter-spacing"],
  );
  assert.equal(
    partitioned.groups.some((group) =>
      group.controls.some(({ id }) => id === "align"),
    ),
    false,
  );
  const toolbar = source("../src/shell/SelectionToolbar.tsx");
  assert.ok(toolbar.indexOf("<EditorToolsTrigger") < toolbar.indexOf("{visible.map"));
  assert.doesNotMatch(toolbar, />T<\/|decorative/i);
});

test("Design alignment is one five-step click cycle and spacing stays separate", () => {
  let alignment;
  const seen = [];
  for (let index = 0; index < 5; index += 1) {
    alignment = nextTextAlignment(alignment);
    seen.push(alignment);
  }
  assert.deepEqual(seen, ["left", "center", "right", "justify", "left"]);
  const toolbar = source("../src/shell/SelectionToolbar.tsx");
  assert.match(toolbar, /data-selection-alignment/);
  assert.match(toolbar, /aria-pressed=\{current !== undefined\}/);
  assert.doesNotMatch(toolbar, /alignment[\s\S]{0,120}aria-haspopup="listbox"/);
});

test("typed animation gallery exposes only declared real capabilities", () => {
  const valid = normalizeSelectionContext({
    version: 1,
    kind: "design-text",
    id: "text:hero",
    revision: 4,
    epoch: 9,
    controls: [{
      id: "animation-gallery",
      kind: "animation-gallery",
      label: "Animation",
      semantic: "animation",
      disabled: true,
      unavailableReason: "Selection is locked",
      animationGallery: {
        presets: [{
          id: "fade",
          label: "Fade",
          applyCommandId: "animation.fade.apply",
          current: true,
          preview: {
            commandId: "animation.fade.preview",
            durationMs: 600,
            parameterIds: ["duration"],
          },
          parameters: [{
            id: "duration",
            label: "Duration",
            commandId: "animation.fade.duration",
            kind: "number",
            value: 600,
            min: 100,
            max: 5000,
            step: 50,
          }],
        }],
        removeCommandId: "animation.remove",
        clearCommandId: "animation.clear",
      },
    }],
  });
  const gallery = valid?.controls[0].animationGallery;
  assert.equal(valid?.controls[0].unavailableReason, "Selection is locked");
  assert.equal(gallery?.presets[0].preview?.durationMs, 600);
  assert.equal(gallery?.presets[0].current, true);
  assert.equal(gallery?.presets[0].parameters?.[0].commandId, "animation.fade.duration");
  assert.equal(gallery?.removeCommandId, "animation.remove");
  assert.equal(gallery?.clearCommandId, "animation.clear");

  const unsupported = structuredClone({
    ...valid,
    version: 1,
    controls: [{
      ...valid.controls[0],
      animationGallery: {
        presets: [{ id: "spin", label: "Spin", applyCommandId: "animation.spin" }],
      },
    }],
  });
  assert.equal(normalizeSelectionContext(unsupported), null);

  const gallerySource = source("../src/shell/SelectionAnimationGallery.tsx");
  assert.match(gallerySource, /preset\.preview\s*&&/);
  assert.match(gallerySource, /gallery\.removeCommandId/);
  assert.match(gallerySource, /gallery\.clearCommandId/);
  assert.match(gallerySource, /history === "view"/);
  assert.match(gallerySource, /data-reduced-motion-preview="explicit-only"/);
});

test("selection epoch rejects stale results and IME defers compact mutations", () => {
  const gate = new SelectionCommandGate();
  const context = {
    version: 1,
    kind: "design-text",
    id: "text:hero",
    revision: 3,
    epoch: 12,
    controls: [],
  };
  assert.equal(gate.accept({
    requestId: "stale-epoch",
    selectionId: context.id,
    selectionRevision: 3,
    selectionEpoch: 11,
    controlId: "font-size",
    value: 30,
  }, context), false);
  assert.equal(gate.accept({
    requestId: "current-epoch",
    selectionId: context.id,
    selectionRevision: 3,
    selectionEpoch: 12,
    controlId: "font-size",
    value: 30,
  }, context), true);
  const toolbar = source("../src/shell/SelectionToolbarNumberControl.tsx");
  const gallery = source("../src/shell/SelectionAnimationGallery.tsx");
  for (const value of [toolbar, gallery]) {
    assert.match(value, /onCompositionStart/);
    assert.match(value, /onCompositionEnd/);
    assert.match(value, /isComposing/);
  }
});

test("route capability ownership is artifact-based, including edu website artifacts", () => {
  const eduWebsite = {
    key: "edu:website:lesson",
    id: "lesson",
    title: "Lesson site",
    kind: "website",
    siteId: "edu",
    url: "",
    favorite: false,
    meta: { project_id: "lesson-site" },
  };
  assert.deepEqual(editorCapabilityFor(eduWebsite), {
    available: true,
    adapter: "website",
    route: {
      type: "embed",
      base: "https://website.oceanleo.com/embed/site-editor",
      mediaType: "website",
    },
    manifest: null,
    unavailableReason: "",
  });
  const videoNamedCanvas = {
    ...eduWebsite,
    key: "video:canvas:plain",
    kind: "canvas",
    siteId: "video",
    meta: {},
  };
  assert.equal(editorCapabilityFor(videoNamedCanvas).adapter, "design-canvas");
  assert.equal(
    editorCapabilityFor({
      ...eduWebsite,
      key: "edu:image:lesson",
      kind: "file",
      siteId: "edu",
      url: "https://asset.oceanleo.com/lesson.png",
      meta: { mime: "image/png" },
    }).adapter,
    "image",
  );
  assert.equal(
    editorCapabilityFor({
      ...eduWebsite,
      key: "edu:video:lesson",
      kind: "file",
      siteId: "edu",
      url: "https://asset.oceanleo.com/lesson.mp4",
      meta: { mime: "video/mp4" },
    }).adapter,
    "video-timeline",
  );
  assert.equal(
    editorCapabilityFor({
      ...eduWebsite,
      key: "edu:video-canvas:lesson",
      kind: "video_canvas",
      siteId: "edu",
      meta: {},
    }).adapter,
    "video-canvas",
  );
  const embed = source("../src/shell/workbench-embed.tsx");
  assert.match(embed, /editorRouteFor\(item\)/);
  assert.doesNotMatch(embed, /item\.siteId\s*===\s*"video"/);
  assert.doesNotMatch(source("../src/shell/workbench-routes.ts"), /siteKey/);
});

test("all advanced route adapters project through the shared SelectionToolbar chrome", () => {
  for (const path of [
    "../src/shell/image-editor/FabricImageContextToolbar.tsx",
    "../src/shell/doc-editors/DeckContextToolbar.tsx",
    "../src/shell/doc-editors/RichDocContextToolbar.tsx",
    "../src/shell/doc-editors/GridContextToolbar.tsx",
    "../src/shell/media-editors/PdfContextToolbar.tsx",
    "../src/shell/media-editors/AudioContextToolbar.tsx",
    "../src/shell/video-editor/VideoTimelineContextToolbar.tsx",
    "../src/shell/chart-editor/ChartContextToolbar.tsx",
    "../src/shell/media-editors/Model3DContextToolbar.tsx",
    "../src/shell/advanced-routes/EmbeddedRoute.tsx",
  ]) {
    assert.match(source(path), /SelectionToolbar/, path);
  }
  const shell = source("../src/shell/InlineAdvancedWorkbenchShell.tsx");
  assert.match(shell, /contextBarLeading:\s*floatingToolbar\.leading/);
  assert.match(shell, /contextBarTrailing:\s*floatingToolbar\.trailing/);
  assert.equal((shell.match(/<FloatingContextToolbar/g) || []).length, 1);
});
