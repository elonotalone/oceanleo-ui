import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createOceanLeoAppContext,
  defineOceanLeoSiteManifest,
  resolveCatalogAlias,
  siteManifestMatches,
} from "../src/contracts/site-manifest.ts";
import {
  validateDomainDependencyGraph,
} from "../src/architecture/domain-boundaries.ts";
import {
  filterWorkspaceLibraryEntries,
  visibleWorkspaceLibraryCategories,
  workspaceLibraryCategories,
} from "../src/shell/workspace-library-model.ts";

test("site manifest canonicalizes thin-host identity without authorizing adapters", () => {
  const manifest = defineOceanLeoSiteManifest({
    siteKey: "  WORD_AI ",
    aliases: ["Word", "word"],
    brand: { name: "LeoWord" },
    catalog: {
      entries: [{ id: "report" }],
      aliases: { legacy_report: "report" },
    },
    workspace: {
      canonicalBasePath: "/studio/",
      historyBasePath: "/runs/",
      legacyQueryKeys: ["fn", "legacy_mode"],
    },
    adapters: [
      {
        id: "Rich_Doc",
        role: "workbench",
        route: "/editor/",
        capabilities: ["admin"],
      },
    ],
    appContext: { locale: "zh", siteKey: "untrusted" },
  });

  assert.equal(manifest.siteKey, "word-ai");
  assert.deepEqual(manifest.aliases, ["word"]);
  assert.equal(siteManifestMatches(manifest, "WORD"), true);
  assert.equal(resolveCatalogAlias(manifest, "legacy report"), "report");
  assert.equal(manifest.workspace.canonicalBasePath, "/studio");
  assert.deepEqual(manifest.workspace.legacyQueryKeys, ["fn", "legacy-mode"]);
  assert.deepEqual(manifest.adapters, [
    {
      id: "rich-doc",
      role: "workbench",
      route: "/editor",
    },
  ]);
  assert.equal("capabilities" in manifest.adapters[0], false);
  assert.deepEqual(createOceanLeoAppContext(manifest, { locale: "en" }), {
    locale: "en",
    siteKey: "word-ai",
  });
});

test("workspace library query and category controllers are deterministic", () => {
  const entries = [
    { id: "one", title: "Annual report", category: "文档", content: null },
    {
      id: "two",
      title: "Remote match",
      category: "图片",
      trustedSearchMatch: true,
      content: null,
    },
  ];
  const categories = workspaceLibraryCategories(entries);
  assert.deepEqual(categories, [
    { id: "all", label: "全部" },
    { id: "文档", label: "文档" },
    { id: "图片", label: "图片" },
  ]);
  assert.deepEqual(
    visibleWorkspaceLibraryCategories(
      categories,
      ["文档"],
      "图片",
      false,
    ),
    {
      visibleCategories: [
        { id: "all", label: "全部" },
        { id: "文档", label: "文档" },
        { id: "图片", label: "图片" },
      ],
      overflowCategoryCount: 1,
    },
  );
  assert.deepEqual(
    filterWorkspaceLibraryEntries(entries, "no local match", "all").map(
      (entry) => entry.id,
    ),
    ["two"],
  );
});

test("dependency direction rejects contract and implementation back-edges", () => {
  assert.deepEqual(
    validateDomainDependencyGraph([
      {
        importer: "src/contracts/site-manifest.ts",
        specifier: "../shell/library-data",
      },
      {
        importer: "src/shell/ResultCanvas.tsx",
        specifier: "../facades/workspace",
      },
      {
        importer: "src/facades/library.ts",
        specifier: "./workspace",
      },
    ]).map((violation) => violation.reason),
    [
      "contracts are dependency roots and cannot import implementations",
      "implementation modules must not depend on public facades",
      "domain facades must not import another facade",
    ],
  );
});

test("ResultCanvas delegates all component-name reflection to one legacy adapter", () => {
  const resultCanvas = readFileSync(
    new URL("../src/shell/ResultCanvas.tsx", import.meta.url),
    "utf8",
  );
  const adapter = readFileSync(
    new URL(
      "../src/shell/legacy-workspace-surface-adapter.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(resultCanvas, /displayName|componentName\(/);
  assert.match(adapter, /function componentName\(/);
  assert.match(adapter, /adaptLegacyWorkspaceSurfaceTabs/);
});
