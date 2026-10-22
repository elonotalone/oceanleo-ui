import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  blankWebsiteSource,
  existingWebsiteSource,
} from "../src/shell/website-local/blank-website-source.ts";
import {
  addWebsitePage,
  addWebsiteSection,
  CLIENT_ACCEPTANCE_TITLE_PREFIX,
  cloudBuildPreviewAvailable,
  copyWebsiteSourceForClientAcceptance,
  createWebsiteSourceHistory,
  exportWebsiteSource,
  patchWebsiteSection,
  removeWebsitePage,
  removeWebsiteSection,
  reorderWebsiteSections,
  setWebsiteSectionHeading,
  setWebsiteTheme,
  setWebsiteTitle,
  WEBSITE_BUILD_PREVIEW_OFFLINE_NOTICE,
  websitePuckKinds,
} from "../src/shell/website-local/website-source-session.ts";
import {
  puckToWebsiteSource,
  websiteSourceToPuck,
} from "../src/shell/website-local/website-puck-map.ts";
import {
  parseWebsiteSource,
  validateWebsiteSource,
} from "../src/shell/website-source-carrier/website-source-validate.ts";
import {
  WEBSITE_SECTION_KINDS,
  WEBSITE_SOURCE_FORMAT,
} from "../src/shell/website-source-carrier/website-source-schema.ts";

const embedded = readFileSync("src/shell/advanced-routes/EmbeddedRoute.tsx", "utf8");
const localRoute = readFileSync(
  "src/shell/advanced-routes/WebsiteLocalRoute.tsx",
  "utf8",
);
const puckConfig = readFileSync(
  "src/shell/website-local/website-puck-config.tsx",
  "utf8",
);
const EVIDENCE_DIR =
  "/root/projects/oceanleo-app/docs/react-client-rebuild/evidence/W10/website";

test("EmbeddedRoute keeps the remote website iframe and branches to Puck only when local", () => {
  assert.match(embedded, /<EmbedEditorPane/);
  assert.match(embedded, /WebsiteLocalRoute/);
  assert.match(embedded, /preferLocalWebsite/);
  // Undo/redo live in the OceanLeo top bar (adapter.history), not inside the stage.
  assert.match(localRoute, /history: \{ canUndo, canRedo, undo, redo \}/);
  assert.doesNotMatch(localRoute, /website-local-undo|website-local-redo/);
  assert.match(localRoute, /website-offline-preview-notice/);
  assert.match(localRoute, /preview\.notice/);
  assert.match(localRoute, /website-page-add/);
  assert.match(localRoute, /website-theme-accent/);
  assert.match(localRoute, /WEBSITE_SECTION_KINDS/);
});

test("Puck config is generated from all website-source@1 section kinds", () => {
  assert.match(puckConfig, /WEBSITE_SECTION_KINDS/);
  assert.match(puckConfig, /buildComponents/);
  assert.doesNotMatch(puckConfig, /Hero: \{ fields, render: Block \}/);
  assert.deepEqual([...websitePuckKinds()], [...WEBSITE_SECTION_KINDS]);
  assert.equal(WEBSITE_SECTION_KINDS.length, 13);
});

test("existing website-source@1 load/edit pages/blocks/images/links/styles/save/reopen/export", async () => {
  const opened = existingWebsiteSource("操作员已有的网站工程");
  const openedCheck = validateWebsiteSource(opened);
  assert.equal(
    openedCheck.ok,
    true,
    JSON.stringify(openedCheck.ok ? [] : { errors: openedCheck.errors, semantic: openedCheck.semantic }),
  );
  const kinds = new Set(opened.sections.map((section) => section.kind));
  assert.equal(kinds.size, 13);
  for (const kind of WEBSITE_SECTION_KINDS) {
    assert.equal(kinds.has(kind), true, kind);
  }

  const copy = copyWebsiteSourceForClientAcceptance(opened, "网站深度编辑");
  assert.equal(copy.title.startsWith(CLIENT_ACCEPTANCE_TITLE_PREFIX), true);
  const history = createWebsiteSourceHistory(copy);
  let source = history.current();
  source = history.commit(setWebsiteTitle(source, `${CLIENT_ACCEPTANCE_TITLE_PREFIX} 离线改过的网站标题`));
  source = history.commit(setWebsiteSectionHeading(source, "hero", "离线改过的首屏标题"));
  source = history.commit(
    patchWebsiteSection(source, "gallery", {
      items: [
        {
          title: "新封面",
          assetId: "cover",
          alt: "替换后的封面",
          href: "/about",
        },
      ],
    }),
  );
  source = history.commit(
    patchWebsiteSection(source, "cta", {
      actions: [{ label: "新按钮", href: "/contact", variant: "primary" }],
    }),
  );
  source = history.commit(setWebsiteTheme(source, { accent: "#0F766E" }));
  source = history.commit(addWebsitePage(source, "联系栏目"));
  const contactPage = source.pages.at(-1);
  assert.ok(contactPage);
  source = history.commit(addWebsiteSection(source, contactPage.id, "gallery"));
  const addedGalleryId = source.pages
    .find((page) => page.id === contactPage.id)
    .sectionIds.at(-1);
  source = history.commit(
    reorderWebsiteSections(source, "home", [
      "features",
      "hero",
      "story",
      "gallery",
      "pricing",
      "faq",
      "cta",
    ]),
  );
  source = history.commit(
    removeWebsiteSection(source, contactPage.id, addedGalleryId),
  );
  assert.equal(
    source.pages
      .find((page) => page.id === contactPage.id)
      .sectionIds.includes(addedGalleryId),
    false,
  );
  const beforeRemovePage = source;
  source = history.commit(removeWebsitePage(source, contactPage.id));
  assert.equal(source.pages.some((page) => page.id === contactPage.id), false);
  assert.equal(history.undo().pages.length, beforeRemovePage.pages.length);
  source = history.redo();

  const homePuck = websiteSourceToPuck(source, "home");
  assert.equal(homePuck.content[0].type, "feature-grid");
  assert.equal(
    homePuck.content.map((item) => item.type).includes("hero"),
    true,
  );
  homePuck.content.find((item) => item.type === "hero").props.body = "Puck 改过的首屏正文";
  const roundtrip = puckToWebsiteSource(homePuck, source, "home");
  const hero = roundtrip.sections.find((section) => section.id === "hero");
  assert.equal(hero.body, "Puck 改过的首屏正文");
  source = history.commit(roundtrip);

  const aboutPuck = websiteSourceToPuck(source, "about");
  assert.equal(aboutPuck.content.some((item) => item.type === "testimonial"), true);
  const aboutRoundtrip = puckToWebsiteSource(aboutPuck, source, "about");
  assert.equal(aboutRoundtrip.pages[0].id, "home");

  const exported = exportWebsiteSource(source);
  const reopened = parseWebsiteSource(exported);
  assert.equal(reopened.title, `${CLIENT_ACCEPTANCE_TITLE_PREFIX} 离线改过的网站标题`);
  assert.equal(reopened.theme.accent, "#0F766E");
  assert.equal(
    reopened.sections.find((section) => section.id === "hero").heading,
    "离线改过的首屏标题",
  );
  assert.equal(
    reopened.sections.find((section) => section.id === "gallery").items[0].alt,
    "替换后的封面",
  );
  assert.equal(
    reopened.sections.find((section) => section.id === "cta").actions[0].href,
    "/contact",
  );
  assert.equal(reopened.pages.length >= 2, true);
  assert.equal(new Set(reopened.sections.map((section) => section.kind)).size, 13);
  assert.equal(cloudBuildPreviewAvailable(false).available, false);
  assert.equal(
    cloudBuildPreviewAvailable(false).notice,
    WEBSITE_BUILD_PREVIEW_OFFLINE_NOTICE,
  );

  await mkdir(EVIDENCE_DIR, { recursive: true });
  const savedPath = `${EVIDENCE_DIR}/website-source.saved.v1.json`;
  const reopenedPath = `${EVIDENCE_DIR}/website-source.reopened.v1.json`;
  const exportPath = `${EVIDENCE_DIR}/website-source.export.json`;
  await writeFile(savedPath, exported);
  await writeFile(reopenedPath, exportWebsiteSource(reopened));
  await writeFile(exportPath, exported);
  const evidence = {
    editorId: "website",
    core: "@puckeditor/core@0.23.0",
    schema: WEBSITE_SOURCE_FORMAT,
    puckComponents: [...WEBSITE_SECTION_KINDS],
    openedExisting: true,
    clientAcceptanceCopy: reopened.title,
    load: { pages: reopened.pages.length, sections: reopened.sections.length, kinds: 13 },
    mutate: {
      title: reopened.title,
      heading: reopened.sections.find((section) => section.id === "hero").heading,
      imageAlt: reopened.sections.find((section) => section.id === "gallery").items[0].alt,
      link: reopened.sections.find((section) => section.id === "cta").actions[0].href,
      accent: reopened.theme.accent,
    },
    pages: { addRemove: true },
    blocks: { addRemoveReorder: true },
    undoRedo: true,
    save: { path: savedPath },
    reopen: { path: reopenedPath },
    export: { path: exportPath, format: "json" },
    cloudBuildPreview: "online-only",
  };
  await writeFile(`${EVIDENCE_DIR}/offline.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  assert.equal(evidence.load.kinds, 13);
});

test("blank website-source still round-trips the four-section starter", () => {
  const initial = blankWebsiteSource();
  assert.equal(validateWebsiteSource(initial).ok, true);
  const puck = websiteSourceToPuck(initial);
  assert.equal(puck.content[0].type, "hero");
  const roundtrip = puckToWebsiteSource(puck, initial);
  assert.equal(roundtrip.sections[0].kind, "hero");
});
