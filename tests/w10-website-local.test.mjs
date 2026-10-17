import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import test from "node:test";

import { blankWebsiteSource } from "../src/shell/website-local/blank-website-source.ts";
import {
  cloudBuildPreviewAvailable,
  createWebsiteSourceHistory,
  exportWebsiteSource,
  setWebsiteSectionHeading,
  setWebsiteTitle,
  WEBSITE_BUILD_PREVIEW_OFFLINE_NOTICE,
} from "../src/shell/website-local/website-source-session.ts";
import {
  puckToWebsiteSource,
  websiteSourceToPuck,
} from "../src/shell/website-local/website-puck-map.ts";
import {
  parseWebsiteSource,
  validateWebsiteSource,
} from "../src/shell/website-source-carrier/website-source-validate.ts";
import { WEBSITE_SOURCE_FORMAT } from "../src/shell/website-source-carrier/website-source-schema.ts";

const embedded = readFileSync("src/shell/advanced-routes/EmbeddedRoute.tsx", "utf8");
const localRoute = readFileSync(
  "src/shell/advanced-routes/WebsiteLocalRoute.tsx",
  "utf8",
);
const EVIDENCE_DIR =
  "/root/projects/oceanleo-app/docs/react-client-rebuild/evidence/W10/website";

test("EmbeddedRoute keeps the remote website iframe and branches to Puck only when local", () => {
  assert.match(embedded, /<EmbedEditorPane/);
  assert.match(embedded, /WebsiteLocalRoute/);
  assert.match(embedded, /preferLocalWebsite/);
  assert.match(localRoute, /website-local-undo/);
  assert.match(localRoute, /website-local-redo/);
  assert.match(localRoute, /website-offline-preview-notice/);
  assert.match(localRoute, /preview\.notice/);
});

test("website-source@1 local load/mutate/undo/save/reopen/export; cloud preview is online-only", async () => {
  const initial = blankWebsiteSource();
  const validation = validateWebsiteSource(initial);
  assert.equal(
    validation.ok,
    true,
    JSON.stringify(validation.ok ? [] : validation.errors),
  );
  const parsed = parseWebsiteSource(JSON.stringify(initial));
  assert.equal(parsed.schema, WEBSITE_SOURCE_FORMAT);
  assert.equal(parsed.sections.length, 4);

  const history = createWebsiteSourceHistory(parsed);
  let source = history.current();
  source = history.commit(setWebsiteTitle(source, "离线改过的网站标题"));
  source = history.commit(
    setWebsiteSectionHeading(source, "hero", "离线改过的首屏标题"),
  );
  assert.equal(history.current().title, "离线改过的网站标题");
  assert.equal(history.undo().sections[0].heading, "本地可编辑的网站首页");
  assert.equal(history.redo().sections[0].heading, "离线改过的首屏标题");

  const puck = websiteSourceToPuck(history.current());
  assert.equal(puck.content[0].type, "Hero");
  const roundtrip = puckToWebsiteSource(puck, history.current());
  assert.equal(roundtrip.sections[0].heading, "离线改过的首屏标题");

  const exported = exportWebsiteSource(history.current());
  const reopened = parseWebsiteSource(exported);
  assert.equal(reopened.title, "离线改过的网站标题");
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
    load: { sections: 4 },
    mutate: { title: reopened.title, heading: reopened.sections[0].heading },
    undoRedo: true,
    save: { path: savedPath },
    reopen: { path: reopenedPath },
    export: { path: exportPath, format: "json" },
    cloudBuildPreview: "online-only",
  };
  await writeFile(`${EVIDENCE_DIR}/offline.json`, JSON.stringify(evidence, null, 2));
  assert.equal(evidence.load.sections, 4);
});
