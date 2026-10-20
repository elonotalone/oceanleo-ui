/**
 * W6: non-richdoc source / dirty / save mapping.
 * Load failure must never become an editable blank that autosaves over
 * existing bytes. These tests call the admission helpers and loaders, not
 * source-string presence.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { blankDesignDocument } from "../src/shell/design-canvas/blank-design-document.ts";
import { blankWebsiteSource } from "../src/shell/website-local/blank-website-source.ts";
import {
  audioSourcePersistenceAdmitted,
  designCanvasLocalSourceAdmission,
  gameSourceAdmission,
  imageSourcePersistenceAdmitted,
  model3dSourcePersistenceAdmitted,
  pdfSourcePersistenceAdmitted,
  websiteLocalSourceFromItem,
} from "../src/shell/advanced-routes/non-richdoc-source-gate.ts";
import {
  gridExpectedSourcePresent,
  gridOpenFailedClosed,
  planGridSameDocumentOpen,
} from "../src/shell/doc-editors/grid-univer/same-document.ts";
import { loadGridSheets } from "../src/shell/doc-editors/grid-model.ts";
import { chartCommandDefinitions } from "../src/shell/chart-editor/chart-command-surface.ts";
import { audioCommandDefinitions } from "../src/shell/media-editors/audio-command-surface.ts";

function persistFromAdmission(admitted, item) {
  return admitted.ok
    ? { ok: true, item }
    : { ok: false, error: admitted.error };
}

function durableGame(item = {}) {
  return {
    key: "artifact:game",
    source: "artifact",
    id: "game-1",
    title: "已有游戏",
    kind: "game",
    siteId: "game",
    favorite: false,
    artifactId: "game-art",
    revisionId: "game-rev",
    artifactType: "game",
    meta: {},
    artifact: {
      artifactId: "game-art",
      revisionId: "game-rev",
      renditions: {},
    },
    ...item,
  };
}

test("grid: existing source plus empty plan is fail-closed; new local empty is not", () => {
  assert.equal(
    gridExpectedSourcePresent({ artifactId: "art-1", url: "" }),
    true,
  );
  assert.equal(
    gridExpectedSourcePresent({ artifactId: "", url: "", projectUrl: "" }),
    false,
  );
  assert.equal(
    gridOpenFailedClosed({
      expectedSource: true,
      planKind: "empty",
    }),
    true,
  );
  assert.equal(
    gridOpenFailedClosed({
      expectedSource: false,
      planKind: "empty",
    }),
    false,
  );
  assert.equal(
    gridOpenFailedClosed({
      expectedSource: true,
      planKind: "office",
      loadFailed: true,
    }),
    true,
  );
  assert.equal(
    planGridSameDocumentOpen({ title: "空", officeSheets: [] }).kind,
    "empty",
  );
});

test("grid: durable artifact without source throws instead of returning a blank workbook", async () => {
  await assert.rejects(
    () =>
      loadGridSheets({
        key: "artifact:sheet",
        source: "artifact",
        id: "sheet-1",
        title: "库里的表",
        kind: "sheet",
        siteId: "sheet",
        favorite: false,
        artifactId: "art-sheet",
        revisionId: "rev-sheet",
        url: "",
        content: "",
        meta: {},
      }),
    (error) => {
      assert.match(String(error.message || error), /缺少可验证|源/);
      return true;
    },
  );
  const local = await loadGridSheets({
    key: "local:sheet",
    source: "creation",
    id: "local-sheet",
    title: "新表",
    kind: "sheet",
    siteId: "sheet",
    favorite: false,
    url: "",
    content: "",
    meta: {},
  });
  assert.deepEqual(local, []);
  const flushed = persistFromAdmission(
    { ok: false, error: "表格源未成功载入" },
    { title: "blank" },
  );
  assert.equal(flushed.ok, false);
});

test("website local: parse failure and durable missing source refuse blank overwrite", () => {
  const parsed = websiteLocalSourceFromItem({
    title: "本地可编辑的网站工程",
    meta: { websiteSource: blankWebsiteSource("本地可编辑的网站工程") },
  });
  assert.equal(parsed.ok, true);

  const invalid = websiteLocalSourceFromItem({
    artifactId: "web-art",
    title: "已有网站",
    meta: { websiteSource: { not: "website-source@1" } },
  });
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /未改用空白稿覆盖原件/);
  assert.equal(persistFromAdmission(invalid, { title: "blank" }).ok, false);

  const missing = websiteLocalSourceFromItem({
    artifactId: "web-art",
    title: "已有网站",
  });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /未改用空白稿覆盖原件/);

  const fresh = websiteLocalSourceFromItem({
    title: "本地可编辑的网站工程",
  });
  assert.equal(fresh.ok, true);
});

test("design canvas local: parse failure and durable missing source refuse blank overwrite", () => {
  const parsed = designCanvasLocalSourceAdmission({
    title: "本地设计稿 W10",
    meta: { designDocument: blankDesignDocument("本地设计稿 W10") },
  });
  assert.equal(parsed.ok, true);

  const invalid = designCanvasLocalSourceAdmission({
    artifactId: "design-art",
    meta: { designDocument: { not: "oceanleo.design-document.v1" } },
  });
  assert.equal(invalid.ok, false);
  assert.equal(persistFromAdmission(invalid, { title: "blank" }).ok, false);

  const missing = designCanvasLocalSourceAdmission({
    artifactId: "design-art",
    title: "已有设计稿",
  });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /未改用空白画布覆盖原件/);
});

test("image / pdf / audio / 3d persistence admission refuses load failure", () => {
  assert.equal(
    imageSourcePersistenceAdmitted({ loading: true, sceneDiagnostic: null }).ok,
    false,
  );
  const scene = imageSourcePersistenceAdmitted({
    loading: false,
    sceneDiagnostic: { code: "invalid-scene", message: "分层工程缺失" },
  });
  assert.equal(scene.ok, false);
  assert.match(scene.error, /分层工程缺失/);
  assert.equal(
    persistFromAdmission(scene, { title: "blank-canvas" }).ok,
    false,
  );
  assert.equal(
    imageSourcePersistenceAdmitted({
      loading: false,
      sceneDiagnostic: null,
      sourceReady: false,
    }).ok,
    false,
  );
  assert.equal(
    imageSourcePersistenceAdmitted({ loading: false, sceneDiagnostic: null })
      .ok,
    true,
  );

  const pdfFail = pdfSourcePersistenceAdmitted({
    loading: false,
    failure: { message: "PDF 源损坏" },
    hasBytes: false,
  });
  assert.equal(pdfFail.ok, false);
  assert.equal(
    pdfSourcePersistenceAdmitted({
      loading: false,
      failure: null,
      hasBytes: false,
    }).ok,
    false,
  );
  assert.equal(
    pdfSourcePersistenceAdmitted({
      loading: false,
      failure: null,
      hasBytes: true,
    }).ok,
    true,
  );

  assert.equal(
    audioSourcePersistenceAdmitted({ loading: false, capture: null }).ok,
    false,
  );
  assert.equal(
    audioSourcePersistenceAdmitted({
      loading: false,
      capture: { sourceUrl: "https://cdn.test/a.wav", operations: [] },
    }).ok,
    true,
  );

  assert.equal(
    model3dSourcePersistenceAdmitted({ loading: false, modelLoaded: false })
      .ok,
    false,
  );
  assert.equal(
    model3dSourcePersistenceAdmitted({ loading: false, modelLoaded: true }).ok,
    true,
  );
});

test("game: durable envelope missing is fail-closed; a new local draft is not", () => {
  const missing = gameSourceAdmission(durableGame());
  assert.equal(missing.ok, false);
  assert.match(missing.error, /未改用空白稿覆盖原件/);
  assert.equal(persistFromAdmission(missing, { title: "blank-game" }).ok, false);

  const present = gameSourceAdmission(
    durableGame({
      artifact: {
        artifactId: "game-art",
        revisionId: "game-rev",
        renditions: {
          full: {
            url: "https://cdn.test/game.json",
            digest: "sha256:abc",
          },
        },
      },
    }),
  );
  assert.equal(present.ok, true);

  const fresh = gameSourceAdmission({
    key: "local:game",
    source: "creation",
    id: "local-game",
    title: "新游戏",
    kind: "game",
    siteId: "game",
    favorite: false,
    meta: { advanced_editor_route: "game" },
  });
  assert.equal(fresh.ok, true);
});

test("chart and audio command surfaces list no mutate commands until source is ready", () => {
  const chart = chartCommandDefinitions({
    editor: { loading: false, sourceReady: false },
    deliver: async () => undefined,
  });
  assert.equal(chart.length, 0);

  const chartLoading = chartCommandDefinitions({
    editor: { loading: true, sourceReady: false },
    deliver: async () => undefined,
  });
  assert.equal(chartLoading.length, 0);

  const audio = audioCommandDefinitions({
    editor: { loading: false, duration: 0, editRevision: 0 },
    deliver: async () => undefined,
  });
  assert.equal(audio.length, 0);
});
