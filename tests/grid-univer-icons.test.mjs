import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  gridUniverFacadeControlIds,
  gridUniverSelectionContext,
} from "../src/shell/doc-editors/grid-univer/stage-plan.ts";
import { gridUniverCommand } from "../src/shell/doc-editors/grid-univer/facade-commands.ts";
import { selectionControlUsesIconOnly } from "../src/shell/selection-toolbar-layout.ts";

const toolbarModuleUrl = await compileModule(
  "src/shell/SelectionToolbarControl.tsx",
  {
    "./SelectionAnimationGallery": dataModule(
      "export function SelectionAnimationGallery() { return null; }",
    ),
  },
);
const iconModuleUrl = await compileModule("src/shell/AdvancedEditorIcon.tsx");
const { SelectionToolbarControl } = await import(toolbarModuleUrl);
const { AdvancedEditorIcon } = await import(iconModuleUrl);

function renderGridControl(control, context, presentation = "compact") {
  return renderToStaticMarkup(
    React.createElement(SelectionToolbarControl, {
      control,
      selectionId: context.id,
      selectionRevision: context.revision,
      onCommand() {},
      accent: "#6d5dfc",
      presentation,
    }),
  );
}

function renderedSvg(markup) {
  return markup.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/)?.[1] || "";
}

test("real generated grid controls render named glyphs for compact and overflow use", () => {
  const contexts = [
    gridUniverSelectionContext({
      selection: { startRow: 2, endRow: 2, startColumn: 1, endColumn: 1 },
      revision: 6,
      kind: "grid-cell",
    }),
    gridUniverSelectionContext({
      selection: { startRow: 2, endRow: 4, startColumn: 1, endColumn: 3 },
      revision: 7,
      kind: "grid-range",
    }),
  ];
  assert.equal(contexts[0].id, "cell:sheet:2:1");
  assert.equal(contexts[0].label, "2:1");
  assert.equal(contexts[0].kind, "grid-cell");
  assert.equal(contexts[1].id, "cell:sheet:2:1");
  assert.equal(contexts[1].kind, "grid-range");

  for (const context of contexts) {
    assert.deepEqual(
      context.controls.map(({ id }) => id),
      gridUniverFacadeControlIds(),
      "the rendered toolbar must come from every runnable grid facade control",
    );

    for (const control of context.controls) {
      const command = gridUniverCommand(control.id);
      assert.ok(command?.run, `${control.id} must resolve to a real command adapter`);

      const compact = renderGridControl(control, context);
      assert.ok(
        compact.includes(`aria-label="${control.label}"`) ||
          compact.includes(`title="${control.label}"`),
        `${control.id} must remain accessible by its label in compact mode`,
      );

      if (selectionControlUsesIconOnly(control)) {
        assert.ok(control.icon, `${control.id} is icon-only but has no icon metadata`);
      }
      if (control.icon) {
        const svg = renderedSvg(compact);
        assert.ok(svg, `${control.id} declares an icon but rendered no glyph`);
        assert.match(
          svg,
          /<(?:path|circle|rect|line|polyline|polygon)\b/,
          `${control.id} rendered an empty SVG`,
        );
      }

      const overflow = renderGridControl(control, context, "menu");
      assert.ok(
        overflow.includes(control.label),
        `${control.id} must expose its readable label in overflow`,
      );
    }
  }
});

test("an unknown runtime icon uses a visible glyph fallback", () => {
  const markup = renderToStaticMarkup(
    React.createElement(AdvancedEditorIcon, {
      name: "missing-grid-glyph",
    }),
  );
  assert.match(markup, /data-icon-fallback="true"/);
  assert.match(renderedSvg(markup), /<(?:path|circle|rect)\b/);
});
