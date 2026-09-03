import assert from "node:assert/strict";
import test from "node:test";

import {
  FABRIC_CARRIER_AXES,
  FABRIC_CARRIER_CONSTANTS,
  FABRIC_CARRIER_FONT_LICENSES,
  FABRIC_CARRIER_FORBIDDEN_LICENSES,
  FABRIC_CARRIER_JSON_SCHEMA,
  FABRIC_CARRIER_SCHEMA_ID,
  FABRIC_CARRIER_SLOT_KINDS,
  FABRIC_CARRIER_SLOT_STYLES,
  FABRIC_CARRIER_SNAPSHOT_PROPS,
  WASH_SLOTS_ALIGNED_COLUMNS,
  fabricCarrierEditableTextSlots,
  fabricCarrierFromImageSnapshot,
  fabricCarrierSkinDigest,
  fabricCarrierSlotIsCutout,
  fabricCarrierStructureDigest,
  parseFabricCarrier,
  serializeFabricCarrier,
  validateFabricCarrier,
} from "../src/shell/image-editor/fabric-carrier-schema.ts";
import { SNAPSHOT_PROPS } from "../src/shell/image-editor/editor-objects.ts";

const clone = (value) => JSON.parse(JSON.stringify(value));

function carrier() {
  return {
    schema: FABRIC_CARRIER_SCHEMA_ID,
    version: 1,
    title: "国庆促销主视觉",
    doc: { units: "px", dpi: 300, color_space: "sRGB" },
    artboards: [
      {
        id: "ab-01",
        page: 1,
        tier: "story",
        width: 1080,
        height: 1920,
        background: "#ffffff",
        fabric: {
          version: "6.9.1",
          objects: [
            { type: "image", oceanleoId: "bg1", oceanleoAxis: "skin" },
            {
              type: "textbox",
              oceanleoId: "t1",
              oceanleoAxis: "structure",
              oceanleoSlotKey: "title_main",
              oceanleoFontRef: "f-noto-sans-sc",
            },
          ],
        },
      },
    ],
    slots: [
      {
        slot_key: "bg_main",
        kind: "pixel",
        bbox: {
          left: 0,
          top: 0,
          right: 1080,
          bottom: 1920,
          width: 1080,
          height: 1920,
        },
        page: 1,
        role_en: "skyline",
        role_zh: "天际线",
        style: "photo",
        alpha_ratio: 0.4,
        locked: false,
        object_id: "bg1",
        axis: "skin",
      },
      {
        slot_key: "title_main",
        kind: "text",
        bbox: {
          left: 120,
          top: 240,
          right: 960,
          bottom: 420,
          width: 840,
          height: 180,
        },
        page: 1,
        locked: false,
        object_id: "t1",
        axis: "structure",
        text: "国庆七折",
        font_ref: "f-noto-sans-sc",
      },
    ],
    skin: {
      id: "skin-national-day-red",
      palette: ["#C1121F", "#FDF0D5", "#003049"],
      font_refs: ["f-noto-sans-sc"],
      decoration_object_ids: ["bg1"],
    },
    fonts: [
      {
        ref: "f-noto-sans-sc",
        family: "Noto Sans SC",
        license: "OFL",
        weights: [400, 700],
      },
    ],
  };
}

test("the reference document validates", () => {
  const result = validateFabricCarrier(carrier());
  assert.deepEqual(result.ok ? [] : result.errors, []);
  assert.equal(result.ok, true);
});

test("slot field names are the wash_slots column names, verbatim", () => {
  const slotProps = Object.keys(FABRIC_CARRIER_JSON_SCHEMA.$defs.slot.properties);
  for (const column of WASH_SLOTS_ALIGNED_COLUMNS) {
    assert.ok(
      slotProps.includes(column),
      `slot schema is missing wash_slots column ${column}`,
    );
  }
  // Renaming to camelCase is the failure this pins: the pipelines read and
  // write that table directly, so a rename costs a mapping layer on both sides.
  for (const column of WASH_SLOTS_ALIGNED_COLUMNS) {
    assert.equal(column, column.toLowerCase());
  }
});

test("the live wash_slots value domains are the carrier's value domains", () => {
  assert.deepEqual([...FABRIC_CARRIER_SLOT_KINDS].sort(), [
    "media",
    "pixel",
    "shape",
    "smartobject",
    "text",
  ]);
  assert.deepEqual([...FABRIC_CARRIER_SLOT_STYLES].sort(), [
    "flat-multi",
    "flat-solid",
    "illust-detailed",
    "line",
    "photo",
    "texture",
  ]);
  assert.deepEqual(FABRIC_CARRIER_JSON_SCHEMA.$defs.slot.properties.kind.enum, [
    ...FABRIC_CARRIER_SLOT_KINDS,
  ]);
});

test("bbox keeps all six keys and must stay self-consistent", () => {
  const bbox = FABRIC_CARRIER_JSON_SCHEMA.$defs.bbox;
  assert.deepEqual([...bbox.required].sort(), [
    "bottom",
    "height",
    "left",
    "right",
    "top",
    "width",
  ]);

  const missing = clone(carrier());
  delete missing.slots[0].bbox.width;
  assert.equal(validateFabricCarrier(missing).ok, false);

  const inconsistent = clone(carrier());
  inconsistent.slots[0].bbox.width = 999;
  const result = validateFabricCarrier(inconsistent);
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => error.keyword === "bbox-consistency"),
    "expected a bbox-consistency violation",
  );
});

test("alpha_ratio is a ratio, is pixel-only, and drives the cutout threshold", () => {
  assert.equal(FABRIC_CARRIER_CONSTANTS.cutoutAlphaRatioThreshold, 0.02);

  const outOfRange = clone(carrier());
  outOfRange.slots[0].alpha_ratio = 1.5;
  assert.equal(validateFabricCarrier(outOfRange).ok, false);

  const wrongKind = clone(carrier());
  wrongKind.slots[1].alpha_ratio = 0.5;
  const result = validateFabricCarrier(wrongKind);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.keyword === "alpha-ratio-kind"));

  const [pixelSlot] = carrier().slots;
  assert.equal(fabricCarrierSlotIsCutout(pixelSlot), true);
  assert.equal(
    fabricCarrierSlotIsCutout({ ...pixelSlot, alpha_ratio: 0.02 }),
    false,
    "the threshold is exclusive",
  );
  assert.equal(
    fabricCarrierSlotIsCutout({ ...pixelSlot, alpha_ratio: undefined }),
    false,
  );
  // No derived `cutout` boolean is stored, so moving the threshold cannot leave
  // stale data behind.
  assert.ok(
    !("cutout" in FABRIC_CARRIER_JSON_SCHEMA.$defs.slot.properties),
    "the carrier must not store a derived cutout flag",
  );
});

test("unknown keys are rejected at every level", () => {
  const topLevel = clone(carrier());
  topLevel.unexpected = 1;
  assert.equal(validateFabricCarrier(topLevel).ok, false);

  const inSlot = clone(carrier());
  inSlot.slots[0].unexpected = 1;
  assert.equal(validateFabricCarrier(inSlot).ok, false);

  const inArtboard = clone(carrier());
  inArtboard.artboards[0].unexpected = 1;
  assert.equal(validateFabricCarrier(inArtboard).ok, false);
});

test("share-alike copyleft cannot enter a composite", () => {
  for (const forbidden of FABRIC_CARRIER_FORBIDDEN_LICENSES) {
    assert.ok(
      !FABRIC_CARRIER_FONT_LICENSES.includes(forbidden),
      `${forbidden} must not be an allowed licence`,
    );
    const document = clone(carrier());
    document.fonts[0].license = forbidden;
    assert.equal(validateFabricCarrier(document).ok, false);
  }
});

test("every reference must resolve", () => {
  const danglingObject = clone(carrier());
  danglingObject.slots[1].object_id = "does-not-exist";
  let result = validateFabricCarrier(danglingObject);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.keyword === "reference"));

  const danglingFont = clone(carrier());
  danglingFont.slots[1].font_ref = "f-absent";
  result = validateFabricCarrier(danglingFont);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.keyword === "reference"));

  const danglingPage = clone(carrier());
  danglingPage.slots[1].page = 7;
  assert.equal(validateFabricCarrier(danglingPage).ok, false);

  const duplicateSlot = clone(carrier());
  duplicateSlot.slots[1].slot_key = duplicateSlot.slots[0].slot_key;
  result = validateFabricCarrier(duplicateSlot);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.keyword === "unique"));
});

test("pages are 1-based and multi-artboard is the normal case", () => {
  assert.equal(FABRIC_CARRIER_CONSTANTS.firstPage, 1);
  assert.equal(FABRIC_CARRIER_JSON_SCHEMA.$defs.artboard.properties.page.minimum, 1);
  assert.equal(FABRIC_CARRIER_JSON_SCHEMA.properties.artboards.minItems, 1);

  const zeroPage = clone(carrier());
  zeroPage.artboards[0].page = 0;
  assert.equal(validateFabricCarrier(zeroPage).ok, false);

  const twoBoards = clone(carrier());
  twoBoards.artboards.push({
    ...clone(twoBoards.artboards[0]),
    id: "ab-02",
    page: 2,
    tier: "square",
    width: 1080,
    height: 1080,
  });
  assert.equal(validateFabricCarrier(twoBoards).ok, true);

  const duplicatePage = clone(twoBoards);
  duplicatePage.artboards[1].page = 1;
  const result = validateFabricCarrier(duplicatePage);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.keyword === "unique"));
});

test("reskin leaves structure byte-identical", () => {
  const before = carrier();
  const after = clone(before);
  after.skin.id = "skin-spring-green";
  after.skin.palette = ["#2A9D8F", "#E9F5DB", "#264653"];
  for (const object of after.artboards[0].fabric.objects) {
    if (object.oceanleoAxis === "skin") object.type = "rect";
  }
  for (const slot of after.slots) {
    if (slot.axis === "skin") slot.style = "flat-solid";
  }

  assert.equal(
    fabricCarrierStructureDigest(after),
    fabricCarrierStructureDigest(before),
    "reskinning must not move the structure axis",
  );
  assert.notEqual(
    fabricCarrierSkinDigest(after),
    fabricCarrierSkinDigest(before),
  );
  assert.equal(validateFabricCarrier(after).ok, true);
});

test("restructure leaves skin byte-identical", () => {
  const before = carrier();
  const after = clone(before);
  after.slots[1].text = "双十一五折";
  after.slots[1].bbox = {
    left: 100,
    top: 200,
    right: 980,
    bottom: 400,
    width: 880,
    height: 200,
  };
  for (const object of after.artboards[0].fabric.objects) {
    if (object.oceanleoAxis === "structure") object.type = "i-text";
  }

  assert.equal(
    fabricCarrierSkinDigest(after),
    fabricCarrierSkinDigest(before),
    "restructuring must not move the skin axis",
  );
  assert.notEqual(
    fabricCarrierStructureDigest(after),
    fabricCarrierStructureDigest(before),
  );
  assert.equal(validateFabricCarrier(after).ok, true);
});

test("axis has exactly two values and every slot must pick one", () => {
  assert.deepEqual([...FABRIC_CARRIER_AXES], ["structure", "skin"]);
  const noAxis = clone(carrier());
  delete noAxis.slots[0].axis;
  assert.equal(validateFabricCarrier(noAxis).ok, false);
  const thirdAxis = clone(carrier());
  thirdAxis.slots[0].axis = "decoration";
  assert.equal(validateFabricCarrier(thirdAxis).ok, false);
});

test("editable text means real text on a Fabric text object", () => {
  const editable = fabricCarrierEditableTextSlots(carrier());
  assert.deepEqual(
    editable.map((slot) => slot.slot_key),
    ["title_main"],
  );

  const flattened = clone(carrier());
  flattened.artboards[0].fabric.objects[1].type = "image";
  assert.deepEqual(fabricCarrierEditableTextSlots(flattened), []);

  const empty = clone(carrier());
  empty.slots[1].text = "";
  assert.deepEqual(fabricCarrierEditableTextSlots(empty), []);

  const locked = clone(carrier());
  locked.slots[1].editable = false;
  assert.deepEqual(fabricCarrierEditableTextSlots(locked), []);
});

test("carrier custom properties are declared for serialization", () => {
  // Fabric 6 drops undeclared custom properties from toObject() silently, so an
  // unlisted property would only ever exist in memory.
  for (const property of FABRIC_CARRIER_SNAPSHOT_PROPS) {
    assert.ok(
      SNAPSHOT_PROPS.includes(property),
      `${property} must be listed in SNAPSHOT_PROPS`,
    );
  }
  for (const property of FABRIC_CARRIER_SNAPSHOT_PROPS) {
    assert.ok(property.startsWith("oceanleo"), "reuse the oceanleo* prefix");
  }
});

test("the schema stays inside the shared evaluator's keyword subset", () => {
  // The evaluator throws on an unknown keyword rather than ignoring it, and a
  // keyword in a branch no fixture reaches would otherwise throw in production
  // instead of here.
  const allowed = new Set([
    "$schema",
    "$id",
    "title",
    "description",
    "default",
    "examples",
    "type",
    "const",
    "enum",
    "required",
    "properties",
    "additionalProperties",
    "items",
    "minItems",
    "maxItems",
    "minLength",
    "maxLength",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "pattern",
    "format",
    "allOf",
    "if",
    "then",
    "else",
    "$ref",
    "$defs",
  ]);
  const seen = new Set();
  const walk = (node) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    for (const [keyword, value] of Object.entries(node)) {
      seen.add(keyword);
      assert.ok(
        allowed.has(keyword),
        `schema uses keyword ${keyword}, which the evaluator rejects`,
      );
      if (keyword === "properties" || keyword === "$defs") {
        for (const child of Object.values(value)) walk(child);
      } else if (keyword === "allOf") {
        for (const child of value) walk(child);
      } else if (
        keyword === "items" ||
        keyword === "if" ||
        keyword === "then" ||
        keyword === "else"
      ) {
        walk(value);
      }
    }
  };
  walk(FABRIC_CARRIER_JSON_SCHEMA);
  assert.ok(seen.has("properties"), "the walk reached nothing");
  assert.ok(!seen.has("oneOf") && !seen.has("anyOf") && !seen.has("not"));
});

test("serialization is deterministic and round-trips", () => {
  const document = carrier();
  const once = serializeFabricCarrier(document);
  assert.equal(once, serializeFabricCarrier(clone(document)));
  const parsed = parseFabricCarrier(once);
  assert.equal(parsed.ok, true);
  assert.equal(serializeFabricCarrier(parsed.carrier), once);
  assert.equal(parseFabricCarrier("{oops").ok, false);
});

test("a legacy single-artboard snapshot upgrades without losing objects", () => {
  const snapshot = {
    json: {
      objects: [
        { type: "image", oceanleoId: "keep-me" },
        { type: "rect" },
        { type: "textbox", oceanleoAxis: "skin" },
      ],
    },
    doc: { width: 1080, height: 1080 },
    canvasBackground: "#123456",
  };
  const upgraded = fabricCarrierFromImageSnapshot(snapshot, { title: "旧图" });
  const result = validateFabricCarrier(upgraded);
  assert.deepEqual(result.ok ? [] : result.errors, []);

  assert.equal(upgraded.artboards.length, 1);
  assert.equal(upgraded.artboards[0].page, 1);
  assert.equal(upgraded.artboards[0].background, "#123456");
  assert.equal(upgraded.artboards[0].fabric.objects.length, 3);
  assert.equal(upgraded.artboards[0].fabric.objects[0].oceanleoId, "keep-me");
  assert.equal(upgraded.artboards[0].fabric.objects[1].oceanleoId, "legacy-1");
  assert.equal(upgraded.artboards[0].fabric.objects[1].oceanleoAxis, "structure");
  assert.equal(upgraded.artboards[0].fabric.objects[2].oceanleoAxis, "skin");
  assert.deepEqual(upgraded.slots, []);

  // A stored snapshot may hold any string here, and an invalid colour would
  // otherwise make the upgraded document fail its own schema.
  const oddColour = fabricCarrierFromImageSnapshot(
    { ...snapshot, canvasBackground: "rgba(0,0,0,0)" },
    { title: "旧图" },
  );
  assert.equal(validateFabricCarrier(oddColour).ok, true);
  assert.equal(oddColour.artboards[0].background, "#ffffff");
});
