import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DESIGN_ALIGN_ACTIONS,
  DESIGN_SNAP_SCREEN_PX,
  DESIGN_ZOOM,
  clampDesignZoom,
  clampGuide,
  designAlign,
  designAlignRequires,
  designZoomToFit,
  resolveDesignSnap,
  rulerStep,
  rulerTicks,
} from "../src/shell/image-editor/design-mode/design-mode-geometry.ts";
import {
  DESIGN_MODE_INITIAL_STATE,
  FABRIC_EDITOR_DEFAULT_MODE,
  FABRIC_EDITOR_MODES,
  artboardPageForId,
  artboardSummaries,
  findGroupTextTargets,
  loadCarrierFonts,
  modeSwitchPreservesCarrier,
  planEditorModeSwitch,
  switchEditorMode,
  watermarkStamps,
} from "../src/shell/image-editor/design-mode/design-mode-state.ts";
import {
  attachAlphaRatio,
  importPsdToCarrier,
} from "../src/shell/image-editor/design-mode/psd-import.ts";
import {
  PHOTO_ADJUST_SLIDERS,
  PHOTO_ADJUST_TOGGLES,
  PHOTO_CROP_PRESETS,
  PHOTO_FILTER_PRESETS,
  applyPhotoFilterPreset,
  photoAdjustSectionsFor,
} from "../src/shell/image-editor/design-mode/photo-adjust-panel.ts";
import {
  AI_CAPABILITY_ENTRIES,
  applicableAiEntries,
  editBarAiEntries,
  panelAiEntries,
} from "../src/shell/image-editor/design-mode/ai-capability-entries.ts";
import {
  IMAGE_DESIGN_L4_CHIPS,
  IMAGE_DESIGN_MANIFEST_VERSION,
  L4_CHIP_LIMIT,
  chipsForMode,
  imageDesignChipManifestEntries,
} from "../src/shell/image-editor/design-mode/l4-chips.ts";
import { validAgentChips } from "../src/shell/editor-protocol-validation.mjs";
import {
  FABRIC_CARRIER_CONSTANTS,
  fabricCarrierSkinDigest,
  fabricCarrierStructureDigest,
  validateFabricCarrier,
} from "../src/shell/image-editor/fabric-carrier-schema.ts";
import { CROP_RATIOS, INITIAL_FILTERS } from "../src/shell/image-editor/types.ts";

const rect = (left, top, width, height) => ({ left, top, width, height });

// --------------------------------------------------------------------------
// Rulers, zoom, guides
// --------------------------------------------------------------------------

test("ruler steps stay round and keep label density roughly constant", () => {
  for (const zoom of [0.05, 0.25, 1, 2.5, 8, 30]) {
    const step = rulerStep(zoom);
    const mantissa = step / 10 ** Math.floor(Math.log10(step));
    assert.ok(
      [1, 2, 5, 10].some((allowed) => Math.abs(mantissa - allowed) < 1e-9),
      `zoom ${zoom} produced a non-round step ${step}`,
    );
    const screenGap = step * zoom;
    assert.ok(
      screenGap >= 60 && screenGap <= 60 * 5,
      `zoom ${zoom}: labels would sit ${screenGap} screen px apart`,
    );
  }
});

test("zoom-out gives a coarser ruler than zoom-in", () => {
  assert.ok(rulerStep(0.1) > rulerStep(1));
  assert.ok(rulerStep(1) > rulerStep(10));
});

test("ruler ticks label every fifth mark and cover the artboard", () => {
  const ticks = rulerTicks(1000, 1);
  assert.ok(ticks.length > 0);
  assert.equal(ticks[0].position, 0);
  assert.equal(ticks[0].labelled, true);
  assert.ok(ticks.at(-1).position <= 1000);
  const labelled = ticks.filter((tick) => tick.labelled);
  assert.equal(labelled.length, Math.floor(ticks.length / 5) + 1);
});

test("zoom is clamped and fit leaves padding on both sides", () => {
  assert.equal(clampDesignZoom(1e9), DESIGN_ZOOM.maximum);
  assert.equal(clampDesignZoom(0), DESIGN_ZOOM.minimum);
  assert.equal(clampDesignZoom(Number.NaN), 1);

  const zoom = designZoomToFit({ width: 1000, height: 500 }, { width: 600, height: 400 });
  assert.ok(zoom * 1000 <= 600 - DESIGN_ZOOM.fitPadding * 2 + 1e-9);
  assert.ok(zoom * 500 <= 400 - DESIGN_ZOOM.fitPadding * 2 + 1e-9);
  // A viewport smaller than the padding must not produce a negative zoom.
  assert.equal(
    designZoomToFit({ width: 1000, height: 500 }, { width: 10, height: 10 }),
    DESIGN_ZOOM.minimum,
  );
});

test("guides are clamped into their artboard", () => {
  const guide = { id: "g1", orientation: "vertical", position: 5000, artboardId: "ab-01" };
  assert.equal(clampGuide(guide, { width: 1080, height: 1920 }).position, 1080);
  assert.equal(
    clampGuide({ ...guide, position: -20 }, { width: 1080, height: 1920 }).position,
    0,
  );
  assert.equal(
    clampGuide({ ...guide, orientation: "horizontal", position: 5000 }, { width: 1080, height: 1920 })
      .position,
    1920,
  );
});

// --------------------------------------------------------------------------
// Snapping
// --------------------------------------------------------------------------

const artboard = { width: 1000, height: 800 };

test("an object near the artboard centre snaps to it on both axes", () => {
  // Centred on the centre line: its own centre is 3 px away, its left edge is
  // 47 px away, so the centre edge is the one that wins.
  const moving = rect(447, 347, 100, 100);
  const snapped = resolveDesignSnap(moving, { artboard, siblings: [], guides: [] });
  assert.equal(snapped.left, 450);
  assert.equal(snapped.top, 350);
  assert.equal(snapped.lines.length, 2);
  assert.deepEqual(
    snapped.lines.map((line) => [line.source, line.edge]),
    [
      ["artboard", "center"],
      ["artboard", "center"],
    ],
  );
});

test("the nearest edge wins even when a farther edge would look tidier", () => {
  // Left edge sits 3 px from the centre line while the rect's own centre is
  // 47 px away, so the left edge is what lands on it.
  const moving = rect(497, 397, 100, 100);
  const snapped = resolveDesignSnap(moving, { artboard, siblings: [], guides: [] });
  assert.equal(snapped.left, 500);
  assert.equal(snapped.lines[0].edge, "start");
});

test("snap tolerance is measured on screen, so zooming in demands precision", () => {
  const moving = rect(5, 400, 100, 100);
  const atOneToOne = resolveDesignSnap(moving, { artboard, siblings: [], guides: [], zoom: 1 });
  assert.equal(atOneToOne.left, 0, "5 px away at 1× is inside the tolerance");

  const zoomedIn = resolveDesignSnap(moving, { artboard, siblings: [], guides: [], zoom: 4 });
  assert.equal(
    zoomedIn.left,
    5,
    "the same 5 px is 20 screen px at 4× and must not snap",
  );
  assert.ok(DESIGN_SNAP_SCREEN_PX < 20);
});

test("both axes are decided from the original rectangle, not a half-moved one", () => {
  // Left edge is near a sibling's left; top is near a different sibling's top.
  const moving = rect(202, 302, 50, 50);
  const siblings = [rect(200, 10, 20, 20), rect(700, 300, 20, 20)];
  const snapped = resolveDesignSnap(moving, { artboard, siblings, guides: [] });
  assert.equal(snapped.left, 200);
  assert.equal(snapped.top, 300);
});

test("the nearest candidate wins when several are in range", () => {
  const moving = rect(100, 400, 50, 50);
  const siblings = [rect(104, 0, 10, 10), rect(101, 0, 10, 10)];
  const snapped = resolveDesignSnap(moving, { artboard, siblings, guides: [] });
  assert.equal(snapped.left, 101);
});

test("guides participate in snapping and bypass disables everything", () => {
  const moving = rect(298, 400, 50, 50);
  const guides = [{ id: "g", orientation: "vertical", position: 300, artboardId: "ab-01" }];
  const snapped = resolveDesignSnap(moving, { artboard, siblings: [], guides });
  assert.equal(snapped.left, 300);
  assert.equal(snapped.lines[0].source, "guide");

  const bypassed = resolveDesignSnap(moving, { artboard, siblings: [], guides, bypass: true });
  assert.equal(bypassed.left, 298);
  assert.deepEqual(bypassed.lines, []);
});

test("an object far from everything is left exactly where it is", () => {
  const moving = rect(413, 271, 37, 53);
  const snapped = resolveDesignSnap(moving, {
    artboard,
    siblings: [rect(800, 700, 10, 10)],
    guides: [],
  });
  assert.equal(snapped.left, 413);
  assert.equal(snapped.top, 271);
  assert.deepEqual(snapped.lines, []);
});

// --------------------------------------------------------------------------
// Align and distribute
// --------------------------------------------------------------------------

test("every alignment action moves objects onto one edge or centre", () => {
  const rects = [rect(10, 10, 100, 50), rect(200, 300, 40, 90), rect(500, 120, 60, 30)];

  assert.deepEqual(
    designAlign(rects, "align-left").map((position) => position.left),
    [10, 10, 10],
  );
  assert.deepEqual(
    designAlign(rects, "align-right").map((position, index) => position.left + rects[index].width),
    [560, 560, 560],
  );
  assert.deepEqual(
    designAlign(rects, "align-top").map((position) => position.top),
    [10, 10, 10],
  );
  assert.deepEqual(
    designAlign(rects, "align-bottom").map((position, index) => position.top + rects[index].height),
    [390, 390, 390],
  );

  const centred = designAlign(rects, "align-center-h");
  const centres = centred.map((position, index) => position.left + rects[index].width / 2);
  assert.ok(Math.max(...centres) - Math.min(...centres) < 1e-9);

  const centredV = designAlign(rects, "align-center-v");
  const centresV = centredV.map((position, index) => position.top + rects[index].height / 2);
  assert.ok(Math.max(...centresV) - Math.min(...centresV) < 1e-9);
});

test("alignment never changes the axis it is not asked about", () => {
  const rects = [rect(10, 10, 100, 50), rect(200, 300, 40, 90)];
  assert.deepEqual(
    designAlign(rects, "align-left").map((position) => position.top),
    [10, 300],
  );
  assert.deepEqual(
    designAlign(rects, "align-top").map((position) => position.left),
    [10, 200],
  );
});

test("distribution equalises gaps, not centres, and pins the outer two", () => {
  const rects = [rect(0, 0, 100, 10), rect(150, 0, 20, 10), rect(400, 0, 100, 10)];
  const placed = designAlign(rects, "distribute-h");

  assert.equal(placed[0].left, 0, "first stays put");
  assert.equal(placed[2].left, 400, "last stays put");

  const gapBefore = placed[1].left - (placed[0].left + rects[0].width);
  const gapAfter = placed[2].left - (placed[1].left + rects[1].width);
  assert.ok(Math.abs(gapBefore - gapAfter) < 1e-9, `gaps ${gapBefore} vs ${gapAfter}`);
});

test("distribution works on unsorted input and on the vertical axis", () => {
  const rects = [rect(400, 400, 100, 100), rect(0, 0, 100, 40), rect(150, 150, 20, 20)];
  const horizontal = designAlign(rects, "distribute-h");
  assert.equal(horizontal[1].left, 0);
  assert.equal(horizontal[0].left, 400);

  const vertical = designAlign(rects, "distribute-v");
  const order = [...rects.keys()].sort((a, b) => rects[a].top - rects[b].top);
  const first = order[0];
  const last = order.at(-1);
  assert.equal(vertical[first].top, rects[first].top);
  assert.equal(vertical[last].top, rects[last].top);
});

test("too few objects is a no-op rather than a crash", () => {
  const one = [rect(5, 5, 10, 10)];
  for (const action of DESIGN_ALIGN_ACTIONS) {
    assert.deepEqual(designAlign(one, action), [{ left: 5, top: 5 }], action);
  }
  const two = [rect(5, 5, 10, 10), rect(50, 50, 10, 10)];
  assert.deepEqual(
    designAlign(two, "distribute-h"),
    [
      { left: 5, top: 5 },
      { left: 50, top: 50 },
    ],
    "distribution needs three",
  );
  assert.equal(designAlignRequires("distribute-h"), 3);
  assert.equal(designAlignRequires("align-left"), 2);
});

// --------------------------------------------------------------------------
// Mode pair
// --------------------------------------------------------------------------

function carrier(overrides = {}) {
  return {
    schema: "oceanleo.fabric-carrier.v1",
    version: 1,
    title: "两模式共用的一份文档",
    doc: { units: "px", dpi: 300, color_space: "sRGB" },
    artboards: [
      {
        id: "ab-01",
        page: 1,
        width: 1080,
        height: 1920,
        background: "#ffffff",
        fabric: {
          version: "6.9.1",
          objects: [
            { type: "image", oceanleoId: "bg", oceanleoAxis: "skin" },
            {
              type: "group",
              oceanleoId: "grp",
              oceanleoAxis: "structure",
              objects: [
                { type: "rect", oceanleoId: "grp-bg", oceanleoAxis: "skin" },
                { type: "textbox", oceanleoId: "grp-text", text: "组内文字", oceanleoAxis: "structure" },
              ],
            },
          ],
        },
      },
    ],
    slots: [
      {
        slot_key: "bg_main",
        kind: "pixel",
        bbox: { left: 0, top: 0, right: 1080, bottom: 1920, width: 1080, height: 1920 },
        page: 1,
        locked: false,
        object_id: "bg",
        axis: "skin",
      },
    ],
    fonts: [],
    ...overrides,
  };
}

test("photo is the default mode and design turns the ruler on", () => {
  assert.equal(FABRIC_EDITOR_DEFAULT_MODE, "photo");
  assert.deepEqual([...FABRIC_EDITOR_MODES], ["photo", "design"]);
  assert.equal(DESIGN_MODE_INITIAL_STATE.mode, "photo");
  assert.equal(DESIGN_MODE_INITIAL_STATE.rulerVisible, false);

  const document = carrier();
  const design = switchEditorMode(DESIGN_MODE_INITIAL_STATE, "design", document);
  assert.equal(design.kind, "preserve-document");
  assert.equal(design.state.mode, "design");
  assert.equal(design.state.rulerVisible, true);

  const back = switchEditorMode(design.state, "photo", document);
  assert.equal(back.state.rulerVisible, false);
  assert.equal(
    switchEditorMode(design.state, "design", document).state,
    design.state,
    "same mode is identity",
  );
});

test("guides survive a round trip through photo mode", () => {
  const document = carrier();
  const guides = [{ id: "g1", orientation: "vertical", position: 100, artboardId: "ab-01" }];
  const design = { ...DESIGN_MODE_INITIAL_STATE, mode: "design", guides };
  const roundTrip = switchEditorMode(
    switchEditorMode(design, "photo", document).state,
    "design",
    document,
  );
  assert.deepEqual(roundTrip.state.guides, guides);
});

test("switching modes does not touch the document (R2: two views, one file)", () => {
  const document = carrier();
  const before = JSON.parse(JSON.stringify(document));
  const beforeStructure = fabricCarrierStructureDigest(document);
  const beforeSkin = fabricCarrierSkinDigest(document);

  const planned = planEditorModeSwitch(DESIGN_MODE_INITIAL_STATE, "design", document);
  const route = switchEditorMode(DESIGN_MODE_INITIAL_STATE, "design", document);

  assert.deepEqual(route, planned, "产品入口必须把 planEditorModeSwitch 的 route 原样交还");
  assert.equal(route.kind, "preserve-document", "切模式的唯一去向是保留文档");
  assert.equal(route.state.mode, "design", "模式必须真的切过去，空转不算切");
  assert.deepEqual(route.document, before, "交还的必须是进函数时那份文件");
  assert.deepEqual(document, before, "不得就地改传入的文档");
  assert.equal(fabricCarrierStructureDigest(route.document), beforeStructure);
  assert.equal(fabricCarrierSkinDigest(route.document), beforeSkin);
  assert.equal(modeSwitchPreservesCarrier(before, route.document), true);
  assert.equal(
    modeSwitchPreservesCarrier(before, { ...document, title: "改过了" }),
    false,
    "the check must be able to fail, or it proves nothing",
  );
});

test("artboards are summarised in page order with their slot counts", () => {
  const document = carrier({
    artboards: [
      { id: "ab-02", page: 2, width: 1080, height: 1080, background: "#fff", fabric: { objects: [] } },
      {
        id: "ab-01",
        page: 1,
        name: "主图",
        width: 1080,
        height: 1920,
        background: "#fff",
        fabric: { objects: [{ type: "image", oceanleoId: "bg", oceanleoAxis: "skin" }] },
      },
    ],
  });
  const summaries = artboardSummaries(document);
  assert.deepEqual(
    summaries.map((entry) => entry.page),
    [1, 2],
  );
  assert.equal(summaries[0].name, "主图");
  assert.equal(summaries[1].name, "画板 2", "unnamed artboards fall back to their page");
  assert.equal(summaries[0].slotCount, 1);
  assert.equal(summaries[1].slotCount, 0);

  assert.equal(artboardPageForId(document, "ab-02"), 2);
  assert.equal(artboardPageForId(document, "nope"), null);
});

test("text nested inside a group is found for in-place editing", () => {
  const targets = findGroupTextTargets(carrier());
  assert.equal(targets.length, 1);
  assert.equal(targets[0].text, "组内文字");
  assert.equal(targets[0].objectId, "grp-text");
  assert.deepEqual([...targets[0].path], [1, 1]);

  const flat = carrier({
    artboards: [
      {
        id: "ab-01",
        page: 1,
        width: 1080,
        height: 1920,
        background: "#fff",
        fabric: { objects: [{ type: "textbox", oceanleoId: "t", text: "顶层文字" }] },
      },
    ],
    slots: [],
  });
  assert.deepEqual(
    findGroupTextTargets(flat),
    [],
    "top-level text is edited normally and is not a group target",
  );
});

// --------------------------------------------------------------------------
// Watermark
// --------------------------------------------------------------------------

test("tiled watermark covers the artboard and is marked as skin", () => {
  const stamps = watermarkStamps({ width: 1000, height: 800 }, { text: "OceanLeo" });
  assert.ok(stamps.length > 1);
  for (const stamp of stamps) {
    assert.equal(stamp.oceanleoAxis, "skin", "a watermark is not document structure");
    assert.equal(stamp.selectable, false);
    assert.equal(stamp.evented, false);
    assert.ok(stamp.left >= 0 && stamp.left <= 1000);
    assert.ok(stamp.top >= 0 && stamp.top <= 800);
  }
});

test("tile density follows the stamp size, not the artboard size", () => {
  const small = watermarkStamps({ width: 1000, height: 800 }, { text: "OceanLeo", fontSize: 12 });
  const large = watermarkStamps({ width: 1000, height: 800 }, { text: "OceanLeo", fontSize: 96 });
  assert.ok(
    small.length > large.length,
    `small text should tile more often: ${small.length} vs ${large.length}`,
  );
});

test("corner placements produce exactly one stamp inside the canvas", () => {
  for (const placement of ["center", "top-left", "top-right", "bottom-left", "bottom-right"]) {
    const stamps = watermarkStamps({ width: 1000, height: 800 }, { text: "©", placement });
    assert.equal(stamps.length, 1, placement);
    assert.ok(stamps[0].left >= 0 && stamps[0].left <= 1000, placement);
    assert.ok(stamps[0].top >= 0 && stamps[0].top <= 800, placement);
  }
});

test("an empty watermark stamps nothing", () => {
  assert.deepEqual(watermarkStamps({ width: 100, height: 100 }, { text: "   " }), []);
});

// --------------------------------------------------------------------------
// Fonts
// --------------------------------------------------------------------------

test("fonts load from asset keys and report per-family failures", async () => {
  const asked = [];
  const outcomes = await loadCarrierFonts(
    [
      { ref: "f-a", family: "Noto Sans SC", license: "OFL", weights: [400, 700], asset_key: "fonts/a.otf" },
      { ref: "f-b", family: "Broken", license: "OFL", source_url: "https://cdn.test/b.otf" },
      { ref: "f-c", family: "No Source", license: "OFL" },
    ],
    {
      assetBaseUrl: "https://assets.test/",
      load: async (descriptor) => {
        asked.push(`${descriptor.family}@${descriptor.weight}`);
        return descriptor.family !== "Broken";
      },
    },
  );

  assert.deepEqual(asked, [
    "Noto Sans SC@400",
    "Noto Sans SC@700",
    "Broken@400",
  ]);
  assert.deepEqual(
    outcomes.map((outcome) => [outcome.ref, outcome.loaded, outcome.reason]),
    [
      ["f-a", true, undefined],
      ["f-b", false, "load-failed"],
      ["f-c", false, "no-source"],
    ],
  );
  assert.equal(
    asked.includes("No Source@400"),
    false,
    "a font with nowhere to load from must not reach the loader",
  );
});

test("a share-alike font is refused before any request is made", async () => {
  let requests = 0;
  const outcomes = await loadCarrierFonts(
    [{ ref: "f-x", family: "Copyleft Face", license: "CC-BY-SA", source_url: "https://cdn.test/x.otf" }],
    {
      assetBaseUrl: "https://assets.test",
      load: async () => {
        requests += 1;
        return true;
      },
    },
  );
  assert.equal(outcomes[0].loaded, false);
  assert.equal(outcomes[0].reason, "forbidden-license");
  assert.equal(requests, 0, "refusing after fetching is not refusing");
});

// --------------------------------------------------------------------------
// PSD import
// --------------------------------------------------------------------------

const psdFixture = {
  width: 1080,
  height: 1920,
  imageResources: { resolutionInfo: { horizontalResolution: 300 } },
  children: [
    { name: "背景", left: 0, top: 0, right: 1080, bottom: 1920, opacity: 1 },
    {
      name: "标题",
      left: 100,
      top: 200,
      right: 900,
      bottom: 320,
      opacity: 0.5,
      text: { text: "国庆七折", style: { fontSize: 72, font: { name: "Source Han Sans" }, fillColor: { r: 255, g: 0, b: 0 } } },
    },
    {
      name: "商品组",
      left: 100,
      top: 800,
      right: 980,
      bottom: 1500,
      opacity: 1,
      children: [
        { name: "商品图", left: 120, top: 820, right: 900, bottom: 1400, opacity: 1 },
        { name: "价签", left: 700, top: 1300, right: 960, bottom: 1450, opacity: 1, text: { text: "¥99", style: { fontSize: 48 } } },
      ],
    },
    { name: "隐藏层", left: 0, top: 0, right: 100, bottom: 100, hidden: true },
    { name: "空层", left: 10, top: 10, right: 10, bottom: 10 },
  ],
};

test("an imported PSD passes the carrier's own validator", () => {
  const { carrier: imported } = importPsdToCarrier(psdFixture);
  const verdict = validateFabricCarrier(imported);
  assert.equal(verdict.ok, true, JSON.stringify(verdict.errors ?? [], null, 1));
});

test("layer opacity is read as 0..1, the unit ag-psd actually reports", () => {
  const { carrier: imported } = importPsdToCarrier(psdFixture);
  const opacities = imported.artboards[0].fabric.objects.map((object) => object.opacity);
  assert.deepEqual(opacities, [1, 0.5, 1]);
  for (const opacity of opacities) {
    assert.ok(
      opacity > 0.01,
      `opacity ${opacity} means the layer is invisible; dividing by 255 is the classic way to get here`,
    );
  }
});

test("groups become one smartobject slot and keep their children nested", () => {
  const { carrier: imported } = importPsdToCarrier(psdFixture);
  const kinds = imported.slots.map((slot) => slot.kind);
  assert.deepEqual(kinds, ["pixel", "text", "smartobject"]);

  const group = imported.artboards[0].fabric.objects.find((object) => object.type === "group");
  assert.ok(group, "the group must survive as a group");
  assert.equal(group.objects.length, 2);
  assert.deepEqual(
    group.objects.map((child) => child.type),
    ["image", "textbox"],
  );

  // In-group text must remain reachable, which is the point of not flattening.
  const targets = findGroupTextTargets(imported);
  assert.deepEqual(
    targets.map((target) => target.text),
    ["¥99"],
  );
});

test("hidden and zero-size layers are dropped, with a reason for the empty one", () => {
  const { carrier: imported, warnings } = importPsdToCarrier(psdFixture);
  assert.equal(imported.slots.length, 3);
  assert.equal(
    warnings.some((warning) => warning.code === "zero-size-layer"),
    true,
  );
  assert.equal(
    warnings.some((warning) => warning.detail.includes("隐藏层")),
    false,
    "a deliberately hidden layer is not a problem worth reporting",
  );
});

test("PSD fonts are never stamped with a licence we cannot verify", () => {
  const { carrier: imported, warnings } = importPsdToCarrier(psdFixture);
  assert.deepEqual(imported.fonts, [], "a PSD does not tell us a font's licence");
  const unknown = warnings.filter((warning) => warning.code === "unknown-font-license");
  assert.equal(unknown.length, 1);
  assert.match(unknown[0].detail, /Source Han Sans/);

  for (const slot of imported.slots) {
    assert.equal(slot.font_ref, undefined, "no slot may point at an undeclared font");
  }
});

test("out-of-range dpi is clamped with a warning instead of failing validation", () => {
  const { carrier: imported, warnings } = importPsdToCarrier({
    ...psdFixture,
    imageResources: { resolutionInfo: { horizontalResolution: 1200 } },
  });
  assert.equal(imported.doc.dpi, FABRIC_CARRIER_CONSTANTS.dpi.maximum);
  assert.equal(validateFabricCarrier(imported).ok, true);
  assert.equal(
    warnings.some((warning) => warning.code === "clamped-dpi"),
    true,
  );

  const missing = importPsdToCarrier({ ...psdFixture, imageResources: undefined });
  assert.equal(missing.carrier.doc.dpi, FABRIC_CARRIER_CONSTANTS.dpi.fallback);
  assert.equal(
    missing.warnings.some((warning) => warning.code === "clamped-dpi"),
    false,
  );
});

test("an oversized PSD canvas is clamped so the carrier stays valid", () => {
  const { carrier: imported, warnings } = importPsdToCarrier({
    width: 20000,
    height: 20000,
    children: [{ name: "l", left: 0, top: 0, right: 100, bottom: 100 }],
  });
  assert.equal(imported.artboards[0].width, FABRIC_CARRIER_CONSTANTS.artboardEdge.maximum);
  assert.equal(validateFabricCarrier(imported).ok, true);
  assert.equal(
    warnings.some((warning) => warning.code === "clamped-artboard"),
    true,
  );
});

test("pixel layers wait for their bitmaps rather than claiming to be opaque", () => {
  const { carrier: imported, pendingImages } = importPsdToCarrier(psdFixture);
  const pixelSlot = imported.slots.find((slot) => slot.kind === "pixel");
  assert.equal(
    pixelSlot.alpha_ratio,
    undefined,
    "alpha_ratio must not be invented before the pixels are decoded",
  );
  assert.equal(pendingImages.has(pixelSlot.object_id), true);

  const withAlpha = attachAlphaRatio(imported, new Map([[pixelSlot.object_id, 0.37421]]));
  assert.equal(withAlpha.slots.find((slot) => slot.kind === "pixel").alpha_ratio, 0.3742);
  assert.equal(validateFabricCarrier(withAlpha).ok, true);
  // Only pixel slots carry it: the validator rejects it on any other kind.
  const textSlot = withAlpha.slots.find((slot) => slot.kind === "text");
  assert.equal(textSlot.alpha_ratio, undefined);
});

test("a pixel layer with no measurement stays unmeasured, not 'fully opaque'", () => {
  const { carrier: imported } = importPsdToCarrier(psdFixture);
  const pixelSlot = imported.slots.find((slot) => slot.kind === "pixel");

  // Nothing measured for this object: the slot must come back untouched.
  // Filling in 0 would read downstream as "alpha_ratio 0 ⇒ not a cutout slot",
  // which is an assertion about pixels nobody has looked at.
  const unmeasured = attachAlphaRatio(imported, new Map());
  assert.equal(
    unmeasured.slots.find((slot) => slot.kind === "pixel").alpha_ratio,
    undefined,
  );
  assert.deepEqual(unmeasured.slots, imported.slots);

  // And a genuine zero is still recorded as a zero.
  const measuredZero = attachAlphaRatio(imported, new Map([[pixelSlot.object_id, 0]]));
  assert.equal(measuredZero.slots.find((slot) => slot.kind === "pixel").alpha_ratio, 0);
});

test("an empty PSD imports as an empty artboard and says so", () => {
  const { carrier: imported, warnings } = importPsdToCarrier({ width: 800, height: 600 });
  assert.equal(validateFabricCarrier(imported).ok, true);
  assert.deepEqual(imported.slots, []);
  assert.equal(warnings[0].code, "empty-layer");
});

// --------------------------------------------------------------------------
// Photo adjustment panel
// --------------------------------------------------------------------------

test("every slider and toggle drives a filter the engine actually applies", () => {
  const engineSource = readFileSync(
    new URL("../src/shell/image-editor/editor-objects.ts", import.meta.url),
    "utf8",
  );
  const buildFilters = engineSource.slice(engineSource.indexOf("function buildFilters"));

  for (const control of [...PHOTO_ADJUST_SLIDERS, ...PHOTO_ADJUST_TOGGLES]) {
    assert.ok(
      Object.hasOwn(INITIAL_FILTERS, control.key),
      `${control.key} is not a FilterSettings field`,
    );
    assert.ok(
      buildFilters.includes(`settings.${control.key}`),
      `buildFilters never reads settings.${control.key}, so this control would do nothing`,
    );
  }
});

test("crop presets only offer ratios the crop command accepts", () => {
  for (const preset of PHOTO_CROP_PRESETS) {
    assert.ok(CROP_RATIOS.includes(preset.id), `${preset.id} is not a CropRatio`);
  }
});

test("filter presets layer over current values and 'original' resets", () => {
  const current = { ...INITIAL_FILTERS, brightness: 40, invert: true };
  const vivid = applyPhotoFilterPreset(
    current,
    PHOTO_FILTER_PRESETS.find((preset) => preset.id === "vivid"),
  );
  assert.equal(vivid.contrast, 20);
  assert.equal(vivid.brightness, 40, "a preset must not silently discard manual work");

  const reset = applyPhotoFilterPreset(
    current,
    PHOTO_FILTER_PRESETS.find((preset) => preset.id === "none"),
  );
  assert.deepEqual(reset, INITIAL_FILTERS);
});

test("crop and annotation are photo-mode only; colour work follows both modes", () => {
  const photo = photoAdjustSectionsFor("photo").map((section) => section.group);
  const design = photoAdjustSectionsFor("design").map((section) => section.group);
  assert.ok(photo.includes("crop") && photo.includes("annotate"));
  assert.equal(design.includes("crop"), false);
  assert.equal(design.includes("annotate"), false);
  assert.ok(design.includes("color") && design.includes("filter"));
});

// --------------------------------------------------------------------------
// AI entry points
// --------------------------------------------------------------------------

test("all four engine capabilities plus text rewrite have an entry point", () => {
  const ids = AI_CAPABILITY_ENTRIES.map((entry) => entry.id);
  for (const required of ["inpaint", "outpaint", "upscale", "remove-bg", "rewrite-text"]) {
    assert.ok(ids.includes(required), `${required} has no entry point`);
  }
});

test("entry ids match the engine's own command ids", () => {
  const engineSource = readFileSync(
    new URL("../src/shell/image-editor/image-capability-engine.ts", import.meta.url),
    "utf8",
  );
  for (const entry of AI_CAPABILITY_ENTRIES) {
    if (entry.id === "rewrite-text") continue;
    assert.ok(
      engineSource.includes(`"${entry.id}"`),
      `${entry.id} is not a command the engine knows about`,
    );
  }
});

test("selection-typed actions stay hidden unless the type matches", () => {
  const none = applicableAiEntries({ hasSelection: false }).map((entry) => entry.id);
  assert.deepEqual(none, ["remove-bg", "outpaint", "upscale"]);

  const image = applicableAiEntries({ hasSelection: true, selectedType: "image" }).map((e) => e.id);
  assert.ok(image.includes("inpaint"));
  assert.equal(image.includes("rewrite-text"), false);

  const text = applicableAiEntries({ hasSelection: true, selectedType: "textbox" }).map((e) => e.id);
  assert.ok(text.includes("rewrite-text"));
  assert.equal(
    text.includes("inpaint"),
    false,
    "inpainting a text object would spend a provider call on nonsense",
  );

  const unknownType = applicableAiEntries({ hasSelection: true }).map((entry) => entry.id);
  assert.equal(unknownType.includes("inpaint"), false);
});

test("edit bar and panel take their entries from the same list", () => {
  const context = { hasSelection: true, selectedType: "image" };
  for (const entry of editBarAiEntries(context)) {
    assert.equal(entry.onEditBar, true);
    assert.ok(applicableAiEntries(context).includes(entry));
  }
  const textPanel = panelAiEntries({ hasSelection: true, selectedType: "textbox" }, "text");
  assert.deepEqual(
    textPanel.map((entry) => entry.id),
    ["rewrite-text"],
  );
});

test("every AI entry that spends money says so", () => {
  for (const entry of AI_CAPABILITY_ENTRIES) {
    assert.equal(entry.billable, true, `${entry.id} must declare that it costs a provider call`);
  }
});

// --------------------------------------------------------------------------
// L4 chips
// --------------------------------------------------------------------------

const FIVE_LAYER_SPEC =
  "/opt/cursor-workspaces/oceandino/docs/architecture/oceanleo-shell-spec-five-layers.md";

test("the eight chips match the five-layer spec row for image·design", (t) => {
  // Cross-repo reconciliation: the spec is the authority for these labels, and
  // copying it in would let the two drift apart silently. Registered in
  // `w25-tests-out-of-repo-paths.test.mjs`; skipped rather than thrown when the
  // docs repo is not checked out, so a missing sibling repo cannot take the
  // whole file down with an ENOENT at load time.
  let spec;
  try {
    spec = readFileSync(FIVE_LAYER_SPEC, "utf8");
  } catch {
    t.skip("五层规范所在的 oceandino 仓不在本机，跳过跨仓对账");
    return;
  }
  const row = spec
    .split("\n")
    .find((line) => line.includes("图片·设计（合并 Fabric）"));
  assert.ok(row, "the spec row itself is missing; this test is measuring nothing");

  const chipCell = row.split("|")[3];
  for (const chip of IMAGE_DESIGN_L4_CHIPS) {
    assert.ok(
      chipCell.includes(chip.label),
      `chip 「${chip.label}」 is not in the spec's list: ${chipCell.trim()}`,
    );
  }
  assert.equal(IMAGE_DESIGN_L4_CHIPS.length, L4_CHIP_LIMIT);
  assert.ok(IMAGE_DESIGN_L4_CHIPS.length <= L4_CHIP_LIMIT, "spec §2 caps chips at 8");
});

test("chip ids and command ids are unique", () => {
  assert.equal(new Set(IMAGE_DESIGN_L4_CHIPS.map((chip) => chip.id)).size, L4_CHIP_LIMIT);
  assert.equal(
    new Set(IMAGE_DESIGN_L4_CHIPS.map((chip) => chip.commandId)).size,
    L4_CHIP_LIMIT,
    "two chips sharing a command would put two entries in one history slot",
  );
});

test("photo mode hides the artboard-only chips", () => {
  const photo = chipsForMode("photo").map((chip) => chip.label);
  assert.equal(photo.includes("一键多尺寸"), false);
  assert.equal(photo.includes("导出全部尺寸"), false);
  assert.ok(photo.includes("超分"));
  assert.equal(chipsForMode("design").length, L4_CHIP_LIMIT);
});

test("the manifest payload passes W01's own chip validator", () => {
  for (const mode of ["photo", "design"]) {
    const entries = imageDesignChipManifestEntries(mode);
    assert.equal(
      validAgentChips(entries),
      true,
      `${mode} chips were rejected by the host validator`,
    );
  }
  assert.equal(IMAGE_DESIGN_MANIFEST_VERSION, 2, "chips are only read when this is 2");
});

test("host-side fields stay out of the manifest payload", () => {
  const entries = imageDesignChipManifestEntries("design");
  assert.equal(entries.length, L4_CHIP_LIMIT);
  for (const entry of entries) {
    const chip = IMAGE_DESIGN_L4_CHIPS.find((candidate) => candidate.id === entry.id);
    assert.equal(entry.label, chip.label);
    assert.equal(entry.kind, chip.kind);
    assert.equal(entry.prompt, chip.prompt);
    assert.deepEqual(
      Object.keys(entry).sort(),
      ["appliesTo", "id", "kind", "label", "prompt"],
      "an unknown field would make the validator reject all eight chips at once",
    );
  }
});

test("every chip prompt names a placeholder the host substitutes", () => {
  for (const chip of IMAGE_DESIGN_L4_CHIPS) {
    assert.match(
      chip.prompt,
      /\{selection\}|\{document\}/,
      `chip ${chip.id} would send the agent a prompt with no context in it`,
    );
    // A chip that needs a selection must not claim to apply without one.
    if (chip.prompt.includes("{selection}")) {
      assert.equal(
        chip.appliesTo.includes("*"),
        false,
        `chip ${chip.id} asks for {selection} but offers itself with no selection`,
      );
    }
  }
});

// --------------------------------------------------------------------------
// Orthogonality (R9 / V1 criterion 7) demonstrated through design mode
// --------------------------------------------------------------------------

test("reskinning leaves structure byte-identical and vice versa", () => {
  const base = carrier({
    skin: { id: "skin-red", palette: ["#c1121f", "#fdf0d5", "#003049"] },
  });

  const reskinned = JSON.parse(JSON.stringify(base));
  reskinned.skin = { id: "skin-blue", palette: ["#003049", "#ffffff", "#c1121f"] };
  reskinned.artboards[0].fabric.objects[0].fill = "#003049";
  reskinned.slots[0].role_en = "night sky";

  assert.equal(
    fabricCarrierStructureDigest(base),
    fabricCarrierStructureDigest(reskinned),
    "changing skin-axis things must not move the structure digest",
  );
  assert.notEqual(fabricCarrierSkinDigest(base), fabricCarrierSkinDigest(reskinned));

  const restructured = JSON.parse(JSON.stringify(base));
  restructured.artboards[0].fabric.objects[1].objects[1].text = "换了文案";
  assert.equal(fabricCarrierSkinDigest(base), fabricCarrierSkinDigest(restructured));
});
