/**
 * Tests for W04 design-mode infrastructure and photopea bridge.
 *
 * Pure data tests — no Fabric runtime, no canvas (see carrier spec §7.1).
 * Run with the full test harness flags from package.json.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ---------- Photopea bridge --------------------------------------------------

import {
  buildPhotopeaConfig,
  photopeaLaunchUrl,
  classifyPhotopeaMessage,
  photopeaReducer,
  photopeaShouldMountFrame,
  photopeaBytesToDataUrl,
  PHOTOPEA_INITIAL_STATE,
  PHOTOPEA_ORIGIN,
  PHOTOPEA_DONE,
  PHOTOPEA_EXPORT_SCRIPT,
} from "../src/shell/image-editor/photopea-bridge.ts";

describe("photopea-bridge", () => {
  it("config without document produces empty files array", () => {
    const config = buildPhotopeaConfig();
    assert.deepStrictEqual(config.files, []);
    assert.strictEqual(config.environment.theme, 1);
  });

  it("config with document includes data URL", () => {
    const config = buildPhotopeaConfig({
      documentDataUrl: "data:image/png;base64,abc",
      theme: "light",
    });
    assert.deepStrictEqual(config.files, ["data:image/png;base64,abc"]);
    assert.strictEqual(config.environment.theme, 2);
  });

  it("launch URL encodes config in fragment", () => {
    const url = photopeaLaunchUrl();
    assert.ok(url.startsWith(PHOTOPEA_ORIGIN + "#"));
  });

  it("classifies foreign origin as foreign", () => {
    const msg = classifyPhotopeaMessage({ origin: "https://evil.com", data: "hello" });
    assert.strictEqual(msg.kind, "foreign");
  });

  it("classifies ArrayBuffer as document", () => {
    const buf = new ArrayBuffer(8);
    const msg = classifyPhotopeaMessage({ origin: PHOTOPEA_ORIGIN, data: buf });
    assert.strictEqual(msg.kind, "document");
    assert.strictEqual(msg.bytes, buf);
  });

  it("classifies DONE string as script-done", () => {
    const msg = classifyPhotopeaMessage({ origin: PHOTOPEA_ORIGIN, data: PHOTOPEA_DONE });
    assert.strictEqual(msg.kind, "script-done");
  });

  it("reducer: closed → open → launching", () => {
    const s = photopeaReducer(PHOTOPEA_INITIAL_STATE, { type: "open" });
    assert.strictEqual(s.phase, "launching");
    assert.ok(photopeaShouldMountFrame(s));
  });

  it("reducer: launching → script-done → ready", () => {
    let s = photopeaReducer(PHOTOPEA_INITIAL_STATE, { type: "open" });
    s = photopeaReducer(s, {
      type: "message",
      message: { kind: "script-done" },
    });
    assert.strictEqual(s.phase, "ready");
  });

  it("reducer: ready → request-export → exporting", () => {
    let s = photopeaReducer(PHOTOPEA_INITIAL_STATE, { type: "open" });
    s = photopeaReducer(s, {
      type: "message",
      message: { kind: "script-done" },
    });
    s = photopeaReducer(s, { type: "request-export" });
    assert.strictEqual(s.phase, "exporting");
  });

  it("reducer: exporting → document message → returned with bytes", () => {
    let s = photopeaReducer(PHOTOPEA_INITIAL_STATE, { type: "open" });
    s = photopeaReducer(s, { type: "message", message: { kind: "script-done" } });
    s = photopeaReducer(s, { type: "request-export" });
    const bytes = new ArrayBuffer(16);
    s = photopeaReducer(s, { type: "message", message: { kind: "document", bytes } });
    assert.strictEqual(s.phase, "returned");
    assert.strictEqual(s.document, bytes);
  });

  it("reducer: close resets to initial", () => {
    let s = photopeaReducer(PHOTOPEA_INITIAL_STATE, { type: "open" });
    s = photopeaReducer(s, { type: "close" });
    assert.deepStrictEqual(s, PHOTOPEA_INITIAL_STATE);
    assert.ok(!photopeaShouldMountFrame(s));
  });

  it("PHOTOPEA_EXPORT_SCRIPT is a Photopea script string", () => {
    assert.ok(PHOTOPEA_EXPORT_SCRIPT.includes("saveToOE"));
  });

  it("bytesToDataUrl produces a valid data URL", () => {
    const bytes = new ArrayBuffer(4);
    const url = photopeaBytesToDataUrl(bytes, (u8) =>
      Buffer.from(u8).toString("base64"),
    );
    assert.ok(url.startsWith("data:image/vnd.adobe.photoshop;base64,"));
  });
});

// ---------- Design mode: snap engine -----------------------------------------

import {
  computeSnapLines,
  applySnap,
  alignObjects,
  SNAP_THRESHOLD_PX,
} from "../src/shell/image-editor/design-mode/design-mode-init.ts";

describe("design-mode snap engine", () => {
  it("computes edge snap lines between two objects", () => {
    const target = { left: 100, top: 100, width: 50, height: 50 };
    const sibling = { left: 100, top: 200, width: 80, height: 30 };
    const lines = computeSnapLines(target, [sibling], [], 0, false);
    const verticalSnaps = lines.filter((l) => l.orientation === "vertical");
    assert.ok(verticalSnaps.length > 0, "should have vertical snap on left edge");
    assert.ok(verticalSnaps.some((l) => l.position === 100));
  });

  it("computes guide snap lines", () => {
    const target = { left: 98, top: 100, width: 50, height: 50 };
    const guide = { id: "g1", orientation: "vertical", position: 100, artboardId: "ab-01" };
    const lines = computeSnapLines(target, [], [guide], 0, false);
    assert.ok(lines.some((l) => l.type === "guide" && l.position === 100));
  });

  it("computes grid snap lines when grid is visible", () => {
    const target = { left: 48, top: 50, width: 50, height: 50 };
    const lines = computeSnapLines(target, [], [], 50, true);
    assert.ok(lines.some((l) => l.type === "grid" && l.position === 50));
  });

  it("no snaps when nothing is close", () => {
    const target = { left: 0, top: 0, width: 50, height: 50 };
    const sibling = { left: 500, top: 500, width: 50, height: 50 };
    const lines = computeSnapLines(target, [sibling], [], 0, false);
    assert.strictEqual(lines.length, 0);
  });

  it("applySnap adjusts position when within threshold", () => {
    const target = { left: 98, top: 100, width: 50, height: 50 };
    const lines = [{ orientation: "vertical", position: 100, type: "edge" }];
    const result = applySnap(target, lines);
    assert.strictEqual(result.left, 100);
  });
});

// ---------- Design mode: alignment -------------------------------------------

describe("design-mode alignment helpers", () => {
  // Mock objects with getBoundingRect
  function mockObj(left, top, width, height) {
    return {
      left,
      top,
      width,
      height,
      getBoundingRect() {
        return { left: this.left, top: this.top, width: this.width, height: this.height };
      },
      set(prop, value) {
        this[prop] = value;
      },
    };
  }

  it("align-left moves objects to minimum left", () => {
    const a = mockObj(50, 0, 20, 20);
    const b = mockObj(100, 0, 20, 20);
    alignObjects([a, b], "align-left");
    assert.strictEqual(b.left, 50);
  });

  it("align-right moves objects to maximum right edge", () => {
    const a = mockObj(50, 0, 20, 20);
    const b = mockObj(0, 0, 20, 20);
    alignObjects([a, b], "align-right");
    assert.strictEqual(b.left, 50);
  });

  it("distribute-h spaces three objects evenly", () => {
    const a = mockObj(0, 0, 20, 20);
    const b = mockObj(50, 0, 20, 20);
    const c = mockObj(100, 0, 20, 20);
    alignObjects([a, b, c], "distribute-h");
    // a stays at 0, c stays at 100, b should be at 50 (midpoint)
    assert.ok(Math.abs(b.left - 50) < 1);
  });
});

// ---------- Photo adjustments ------------------------------------------------

import {
  PHOTO_ADJUSTMENTS,
  PHOTO_FILTER_PRESETS,
  PHOTO_CROP_PRESETS,
  ANNOTATION_TOOLS,
} from "../src/shell/image-editor/design-mode/photo-adjust-panel.ts";

describe("photo-adjust-panel constants", () => {
  it("has 7 adjustment sliders", () => {
    assert.strictEqual(PHOTO_ADJUSTMENTS.length, 7);
  });

  it("each slider has sensible range", () => {
    for (const s of PHOTO_ADJUSTMENTS) {
      assert.ok(s.min < s.max, `${s.id}: min < max`);
      assert.ok(s.defaultValue >= s.min && s.defaultValue <= s.max, `${s.id}: default in range`);
    }
  });

  it("filter presets include none and grayscale", () => {
    assert.ok(PHOTO_FILTER_PRESETS.some((p) => p.id === "none"));
    assert.ok(PHOTO_FILTER_PRESETS.some((p) => p.id === "grayscale"));
  });

  it("crop presets include free and standard ratios", () => {
    assert.ok(PHOTO_CROP_PRESETS.some((p) => p.id === "free"));
    assert.ok(PHOTO_CROP_PRESETS.some((p) => p.id === "16:9"));
  });

  it("annotation tools are all distinct", () => {
    const ids = ANNOTATION_TOOLS.map((t) => t.id);
    assert.strictEqual(new Set(ids).size, ids.length);
  });
});

// ---------- AI capability entries --------------------------------------------

import {
  AI_CAPABILITY_ENTRIES,
  applicableAiCapabilities,
  editBarAiEntries,
} from "../src/shell/image-editor/design-mode/ai-capability-entries.ts";

describe("ai-capability-entries", () => {
  it("has 4 entries (inpaint, outpaint, upscale, rewrite-text)", () => {
    assert.strictEqual(AI_CAPABILITY_ENTRIES.length, 4);
  });

  it("non-selection capabilities are available without selection", () => {
    const caps = applicableAiCapabilities(undefined, false);
    assert.ok(caps.some((c) => c.id === "outpaint"));
    assert.ok(caps.some((c) => c.id === "upscale"));
  });

  it("inpaint requires image selection", () => {
    const withImage = applicableAiCapabilities("image", true);
    assert.ok(withImage.some((c) => c.id === "inpaint"));

    const withText = applicableAiCapabilities("text", true);
    assert.ok(!withText.some((c) => c.id === "inpaint"));
  });

  it("rewrite-text only for text selection", () => {
    const withText = applicableAiCapabilities("text", true);
    assert.ok(withText.some((c) => c.id === "rewrite-text"));

    const withImage = applicableAiCapabilities("image", true);
    assert.ok(!withImage.some((c) => c.id === "rewrite-text"));
  });

  it("editBarAiEntries returns only editBarVisible items", () => {
    const entries = editBarAiEntries("image");
    assert.ok(entries.every((e) => e.editBarVisible));
  });
});

// ---------- L4 chips ---------------------------------------------------------

import {
  IMAGE_DESIGN_L4_CHIPS,
  chipsForMode,
} from "../src/shell/image-editor/design-mode/l4-chips-config.ts";

describe("l4-chips-config", () => {
  it("has exactly 8 chips (spec §3 row 1)", () => {
    assert.strictEqual(IMAGE_DESIGN_L4_CHIPS.length, 8);
  });

  it("photo mode gets fewer chips than design mode", () => {
    const photo = chipsForMode("photo");
    const design = chipsForMode("design");
    assert.ok(photo.length < design.length);
    assert.ok(photo.length >= 3);
  });

  it("all chip ids are unique", () => {
    const ids = IMAGE_DESIGN_L4_CHIPS.map((c) => c.id);
    assert.strictEqual(new Set(ids).size, ids.length);
  });

  it("design-only chips include multi-size and generate-similar", () => {
    const design = chipsForMode("design");
    assert.ok(design.some((c) => c.id === "chip-multi-size"));
    assert.ok(design.some((c) => c.id === "chip-generate-similar"));
  });
});

// ---------- PSD import -------------------------------------------------------

import {
  importPsdToCarrier,
} from "../src/shell/image-editor/design-mode/psd-import.ts";

describe("psd-import", () => {
  it("imports a minimal PSD with one text layer", () => {
    const psd = {
      width: 1080,
      height: 1920,
      children: [
        {
          name: "Title",
          left: 100,
          top: 200,
          right: 900,
          bottom: 300,
          opacity: 255,
          text: {
            text: "Hello World",
            style: {
              font: { name: "Noto Sans SC" },
              fontSize: 48,
              fillColor: { r: 0, g: 0, b: 0 },
            },
          },
        },
      ],
    };

    const result = importPsdToCarrier(psd);
    assert.strictEqual(result.carrier.schema, "oceanleo.fabric-carrier.v1");
    assert.strictEqual(result.carrier.artboards.length, 1);
    assert.strictEqual(result.carrier.artboards[0].width, 1080);
    assert.strictEqual(result.carrier.artboards[0].height, 1920);
    assert.strictEqual(result.carrier.slots.length, 1);

    const slot = result.carrier.slots[0];
    assert.strictEqual(slot.kind, "text");
    assert.strictEqual(slot.text, "Hello World");
    assert.strictEqual(slot.bbox.left, 100);
    assert.strictEqual(slot.bbox.width, 800);
    assert.strictEqual(slot.bbox.width, slot.bbox.right - slot.bbox.left);
    assert.strictEqual(slot.bbox.height, slot.bbox.bottom - slot.bbox.top);

    assert.ok(result.carrier.fonts.length > 0);
    assert.strictEqual(result.carrier.fonts[0].family, "Noto Sans SC");
  });

  it("imports a PSD with an image layer", () => {
    const psd = {
      width: 500,
      height: 500,
      children: [
        {
          name: "bg",
          left: 0,
          top: 0,
          right: 500,
          bottom: 500,
          opacity: 255,
          canvas: { width: 500, height: 500 },
        },
      ],
    };

    const result = importPsdToCarrier(psd);
    assert.strictEqual(result.carrier.slots.length, 1);
    assert.strictEqual(result.carrier.slots[0].kind, "pixel");
    assert.strictEqual(result.carrier.slots[0].axis, "structure");
  });

  it("skips hidden layers", () => {
    const psd = {
      width: 100,
      height: 100,
      children: [
        { name: "visible", left: 0, top: 0, right: 50, bottom: 50, opacity: 255, canvas: { width: 50, height: 50 } },
        { name: "hidden", left: 0, top: 0, right: 50, bottom: 50, opacity: 255, hidden: true, canvas: { width: 50, height: 50 } },
      ],
    };

    const result = importPsdToCarrier(psd);
    assert.strictEqual(result.carrier.slots.length, 1);
  });

  it("skips zero-size layers with warning", () => {
    const psd = {
      width: 100,
      height: 100,
      children: [
        { name: "zero", left: 50, top: 50, right: 50, bottom: 50, opacity: 255 },
      ],
    };

    const result = importPsdToCarrier(psd);
    assert.strictEqual(result.carrier.slots.length, 0);
    assert.ok(result.warnings.length > 0);
  });

  it("carrier bbox is self-consistent", () => {
    const psd = {
      width: 800,
      height: 600,
      children: [
        { name: "layer", left: 10, top: 20, right: 300, bottom: 400, opacity: 200, canvas: { width: 290, height: 380 } },
      ],
    };

    const result = importPsdToCarrier(psd);
    const bbox = result.carrier.slots[0].bbox;
    assert.strictEqual(bbox.width, bbox.right - bbox.left);
    assert.strictEqual(bbox.height, bbox.bottom - bbox.top);
  });

  it("flattens nested layer groups", () => {
    const psd = {
      width: 100,
      height: 100,
      children: [
        {
          name: "group",
          children: [
            { name: "child1", left: 0, top: 0, right: 30, bottom: 30, opacity: 255, canvas: { width: 30, height: 30 } },
            { name: "child2", left: 40, top: 0, right: 70, bottom: 30, opacity: 255, canvas: { width: 30, height: 30 } },
          ],
        },
      ],
    };

    const result = importPsdToCarrier(psd);
    assert.strictEqual(result.carrier.slots.length, 2);
  });
});
