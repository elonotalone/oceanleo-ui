// ============================================================================
// 文档家族（文档 / 表格 / 演示 / PDF）的指令面与下载格式机检
// ----------------------------------------------------------------------------
// 判的是 W2 这一面的四条收口判据：
//   1. 四条路由都真的有一份非空指令面，id 前缀逐字等于 editorId；
//   2. 越界 id、越界参数、缺必填、非法枚举、超长参数一律被拒（不静默兜底）；
//   3. `mutates` 标注对得上——会改内容的一条不许标 false，只读的一条不许标 true；
//   4. 下载菜单条目齐全，且文案是人话（不许出现 MIME 串）。
// 另外钉住上传归一化的声明表：过去 `.tsv` 在上传框里选得中、载入时被拒，
// `.pptx` 拖进演示文稿什么也不发生——这两件事由「accept 从同一张表派生」挡住。
//
// 指令面构造器是纯函数，所以这里用替身编辑器直接驱动，不起 React。
// 「装到注册表里读得回来」那一条走 W1 的真注册表，不另立一套。
// ============================================================================

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  boundedCommandState,
  buildDeckCommandSurface,
  buildGridCommandSurface,
  buildPdfCommandSurface,
  buildRichDocCommandSurface,
  DOC_FAMILY_COMMAND_SPECS,
  DOC_FAMILY_STATE_MAX_BYTES,
  parsePageList,
} from "../src/shell/doc-editors/doc-family-commands.ts";
import {
  docFamilyAcceptAttribute,
  docFamilyConvertTarget,
  docFamilyImportPlan,
  docFamilyRefusalReason,
  DOC_FAMILY_CONVERT_TARGETS,
  DOC_FAMILY_DOWNLOAD_FORMATS,
  DOC_FAMILY_EDITOR_IDS,
  DOC_FAMILY_IMPORT_PLANS,
} from "../src/shell/doc-editors/doc-family-formats.ts";
import {
  currentPluginCommandSurface,
  describePluginCommands,
  readPluginCommandState,
  registerPluginCommandSurface,
  resetPluginCommandSurface,
} from "../src/shell/plugin-command/registry.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const ROUTES = join(REPO, "src", "shell", "advanced-routes");

const noopDownload = { download: async () => "" };

// ---------------------------------------------------------------------------
// 替身编辑器：只提供指令面真的会碰到的那几个口
// ---------------------------------------------------------------------------

function tiptapDouble({ text = "小狗 和 小狗" } = {}) {
  const calls = [];
  const inserted = [];
  const chain = {
    focus: () => chain,
    insertContentAt: (position, content) => {
      inserted.push({ position, content });
      return chain;
    },
    setHeading: (attrs) => {
      calls.push(["setHeading", attrs]);
      return chain;
    },
    setParagraph: () => {
      calls.push(["setParagraph"]);
      return chain;
    },
    setFontSize: (size) => {
      calls.push(["setFontSize", size]);
      return chain;
    },
    run: () => true,
  };
  const replacements = [];
  const dispatched = [];
  return {
    calls,
    inserted,
    replacements,
    dispatched,
    chain: () => chain,
    state: {
      doc: {
        content: { size: 42 },
        descendants: (visit) => {
          visit({ isText: true, text, type: { name: "text" } }, 1);
          visit(
            {
              isText: false,
              type: { name: "heading" },
              attrs: { level: 2 },
              textContent: "第一节",
            },
            20,
          );
        },
      },
      tr: {
        insertText: (value, start, end) => {
          replacements.push({ value, start, end });
        },
      },
    },
    view: {
      dispatch: (transaction) => {
        dispatched.push(transaction);
      },
    },
  };
}

function richDocDouble(overrides = {}) {
  const instance = tiptapDouble();
  return {
    instance,
    editor: {
      editor: instance,
      item: { title: "季度报告", meta: {} },
      siteId: "",
      loading: false,
      importing: false,
      saving: false,
      dirty: false,
      sourceReady: true,
      editRevision: 7,
      error: "",
      sourceFailed: false,
      savedUrl: "",
      source: "url-docx",
      words: 120,
      chars: 480,
      save: async () => ({ url: "https://example.invalid/a.docx" }),
      exportDoc: async () => {},
      exportMarkdown: async () => {},
      exportHtml: async () => {},
      exportText: () => {},
      ...overrides,
    },
  };
}

function gridDouble(overrides = {}) {
  const calls = [];
  const sheet = {
    id: "s1",
    name: "Sheet1",
    rows: [
      ["城市", "销量"],
      ["杭州", "12"],
      ["上海", "8"],
    ],
    formats: {},
    merges: [],
    conditionalFormats: [],
  };
  return {
    calls,
    editor: {
      item: { title: "销量表", meta: {} },
      siteId: "",
      sheets: [sheet],
      activeSheet: sheet,
      activeSheetId: sheet.id,
      selection: { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } },
      selectedCell: null,
      selectionRange: { firstRow: 0, lastRow: 0, firstCol: 0, lastCol: 0 },
      selectedValue: "城市",
      selectedDisplayValue: "城市",
      headerRow: true,
      loading: false,
      dirty: false,
      editRevision: 3,
      error: "",
      setCell: (...args) => calls.push(["setCell", ...args]),
      selectCell: (...args) => calls.push(["selectCell", ...args]),
      insertRow: (...args) => calls.push(["insertRow", ...args]),
      insertColumn: (...args) => calls.push(["insertColumn", ...args]),
      sort: (...args) => calls.push(["sort", ...args]),
      addSheet: () => calls.push(["addSheet"]),
      renameSheet: (...args) => calls.push(["renameSheet", ...args]),
      exportCsv: () => calls.push(["exportCsv"]),
      save: async () => ({ url: "https://example.invalid/a.xlsx" }),
      ...overrides,
    },
  };
}

function deckDouble(overrides = {}) {
  const calls = [];
  const slides = [
    { id: "p1", title: "封面", layout: "title", elements: [] },
    { id: "p2", title: "要点", layout: "bullets", elements: [{ id: "e1" }] },
  ];
  return {
    calls,
    editor: {
      deck: { version: 2, title: "季度汇报", aspect: "16:9", theme: "ocean", masters: [], slides },
      activeSlide: slides[0],
      activeIndex: 0,
      selectedElement: null,
      selectedElementId: "",
      loading: false,
      dirty: false,
      editRevision: 5,
      error: "",
      selectSlide: (...args) => calls.push(["selectSlide", ...args]),
      patchSlide: (...args) => calls.push(["patchSlide", ...args]),
      applySlideLayout: (...args) => calls.push(["applySlideLayout", ...args]),
      addTextElement: (...args) => calls.push(["addTextElement", ...args]),
      addSlide: () => calls.push(["addSlide"]),
      deleteSlide: () => calls.push(["deleteSlide"]),
      exportPptx: async () => calls.push(["exportPptx"]),
      downloadJson: () => calls.push(["downloadJson"]),
      save: async () => ({ url: "https://example.invalid/a.pptx" }),
      ...overrides,
    },
  };
}

function pdfDouble(overrides = {}) {
  const calls = [];
  return {
    calls,
    editor: {
      readerState: "text-ready",
      failure: null,
      textLayer: {
        status: "ready",
        present: true,
        totalCharacters: 900,
        coveragePageRatio: 1,
        extractor: "pdfjs",
      },
      manifest: null,
      searchFullText: (query) =>
        query === "合同"
          ? [{ pageNumber: 2, offset: 10, excerpt: "本合同自签署之日起生效" }]
          : [],
      pageNumber: 2,
      pageCount: 6,
      rotation: 0,
      zoom: 100,
      annotations: [],
      loading: false,
      rendering: false,
      processing: false,
      dirty: false,
      editRevision: 11,
      error: "",
      notice: "",
      goToPage: (...args) => calls.push(["goToPage", ...args]),
      extractPages: async (...args) => calls.push(["extractPages", ...args]),
      deleteCurrentPage: async () => calls.push(["deleteCurrentPage"]),
      rotateCurrentPage: async (...args) => calls.push(["rotateCurrentPage", ...args]),
      addBlankPage: async () => calls.push(["addBlankPage"]),
      movePage: async (...args) => calls.push(["movePage", ...args]),
      saveCopy: async () => ({ url: "https://example.invalid/a.pdf" }),
      download: () => calls.push(["download"]),
      ...overrides,
    },
  };
}

function allSurfaces() {
  return [
    ["richdoc", buildRichDocCommandSurface(richDocDouble().editor, noopDownload)],
    ["grid", buildGridCommandSurface(gridDouble().editor, noopDownload)],
    ["deck", buildDeckCommandSurface(deckDouble().editor, noopDownload)],
    ["pdf", buildPdfCommandSurface(pdfDouble().editor, noopDownload)],
  ];
}

// ---------------------------------------------------------------------------
// 1 四条路由都有一份能用的指令面
// ---------------------------------------------------------------------------

test("四条路由的 describe() 非空，且每条 id 前缀逐字等于 editorId", () => {
  for (const [editorId, surface] of allSurfaces()) {
    const specs = surface.describe();
    assert.equal(surface.editorId, editorId);
    assert.ok(
      specs.length >= 6,
      `${editorId} 只声明了 ${specs.length} 条指令，任务书要求每条路由至少 6 条`,
    );
    for (const spec of specs) {
      assert.ok(
        spec.id.startsWith(`${editorId}.`),
        `${spec.id} 的前缀不是 ${editorId}.`,
      );
      assert.ok(spec.label.trim().length > 0, `${spec.id} 没有中文标题`);
      assert.ok(spec.summary.trim().length > 0, `${spec.id} 没有一句话说明`);
      assert.equal(
        typeof spec.mutates,
        "boolean",
        `${spec.id} 的 mutates 必须是布尔值`,
      );
      assert.ok(
        !spec.label.includes("插件"),
        `${spec.id} 的标题里不许出现「插件」`,
      );
    }
  }
});

test("指令文案不许出现行话：MIME 串、adapter、schema、artifact", () => {
  const banned = ["application/vnd", "adapter", "schema", "artifact"];
  for (const specs of Object.values(DOC_FAMILY_COMMAND_SPECS)) {
    for (const spec of specs) {
      const text = [
        spec.label,
        spec.summary,
        ...(spec.params || []).flatMap((param) => [
          param.label,
          param.hint || "",
          ...(param.enumValues || []).map((choice) => choice.label),
        ]),
      ]
        .join(" ")
        .toLowerCase();
      for (const word of banned) {
        assert.ok(
          !text.includes(word),
          `${spec.id} 的用户文案里出现了行话「${word}」`,
        );
      }
    }
  }
});

// ---------------------------------------------------------------------------
// 2 mutates 标注
// ---------------------------------------------------------------------------

const EXPECTED_MUTATING = {
  richdoc: [
    "richdoc.insert-heading",
    "richdoc.insert-paragraph",
    "richdoc.replace-all",
    "richdoc.set-heading-level",
    "richdoc.set-font-size",
    "richdoc.save",
  ],
  grid: [
    "grid.set-cell",
    "grid.insert-row",
    "grid.insert-column",
    "grid.sort-column",
    "grid.add-sheet",
    "grid.save",
  ],
  deck: [
    "deck.add-slide",
    "deck.set-slide-title",
    "deck.apply-layout",
    "deck.add-text",
    "deck.delete-slide",
    "deck.save",
  ],
  pdf: [
    "pdf.extract-pages",
    "pdf.delete-page",
    "pdf.rotate-page",
    "pdf.add-blank-page",
    "pdf.move-page",
    "pdf.save",
  ],
};

const EXPECTED_READONLY = {
  richdoc: ["richdoc.read-outline", "richdoc.export"],
  grid: ["grid.read-cell", "grid.select-cell", "grid.export"],
  deck: ["deck.go-to-slide", "deck.read-outline", "deck.export"],
  pdf: ["pdf.go-to-page", "pdf.find-text", "pdf.export"],
};

test("会改内容的指令一律 mutates:true，只读指令一律 false", () => {
  for (const [editorId, specs] of Object.entries(DOC_FAMILY_COMMAND_SPECS)) {
    const byId = new Map(specs.map((spec) => [spec.id, spec]));
    for (const id of EXPECTED_MUTATING[editorId]) {
      const spec = byId.get(id);
      assert.ok(spec, `${id} 不见了`);
      assert.equal(spec.mutates, true, `${id} 会改内容，必须标 mutates:true`);
    }
    for (const id of EXPECTED_READONLY[editorId]) {
      const spec = byId.get(id);
      assert.ok(spec, `${id} 不见了`);
      assert.equal(spec.mutates, false, `${id} 是只读的，不许标 mutates:true`);
    }
    const known = new Set([
      ...EXPECTED_MUTATING[editorId],
      ...EXPECTED_READONLY[editorId],
    ]);
    for (const spec of specs) {
      assert.ok(
        known.has(spec.id),
        `${spec.id} 是新加的指令，请把它登记进这份 mutates 判据表`,
      );
    }
  }
});

test("确认框不在编辑器这边弹：四条路由都不出现 confirm/window.confirm", () => {
  const sources = [
    "src/shell/doc-editors/doc-family-commands.ts",
    "src/shell/advanced-routes/RichDocRoute.tsx",
    "src/shell/advanced-routes/GridRoute.tsx",
    "src/shell/advanced-routes/DeckRoute.tsx",
    "src/shell/advanced-routes/PdfRoute.tsx",
  ];
  for (const file of sources) {
    const text = readFileSync(join(REPO, file), "utf8");
    assert.ok(
      !/\bwindow\.confirm\b|(?<![A-Za-z.])confirm\s*\(/.test(text),
      `${file} 自己弹了确认框；mutates 的确认由 agent 侧负责`,
    );
  }
});

// ---------------------------------------------------------------------------
// 3 越界一律被拒
// ---------------------------------------------------------------------------

test("越界 id 一律被拒，并说清现在有哪些指令", async () => {
  for (const [editorId, surface] of allSurfaces()) {
    for (const id of ["", "不存在", `${editorId}.drop-database`, "richdoc.insert-heading!"]) {
      const result = await surface.run(id, {});
      assert.equal(result.ok, false, `${editorId} 竟然接受了越界 id「${id}」`);
      assert.ok(result.message.trim().length > 0, `${editorId} 拒绝时没有说原因`);
    }
  }
});

test("跨路由的 id 不许串台：grid 的指令下给 richdoc 一律被拒", async () => {
  const surface = buildRichDocCommandSurface(richDocDouble().editor, noopDownload);
  const result = await surface.run("grid.set-cell", { row: 1, column: 1, value: "x" });
  assert.equal(result.ok, false);
});

test("未声明的参数、缺必填、非法枚举、超长参数一律被拒", async () => {
  const surface = buildRichDocCommandSurface(richDocDouble().editor, noopDownload);
  const unknownParam = await surface.run("richdoc.insert-heading", {
    text: "标题",
    danger: "rm -rf",
  });
  assert.equal(unknownParam.ok, false);
  assert.match(unknownParam.message, /danger/);

  const missing = await surface.run("richdoc.insert-heading", {});
  assert.equal(missing.ok, false);

  const badEnum = await surface.run("richdoc.insert-heading", {
    text: "标题",
    level: "9",
  });
  assert.equal(badEnum.ok, false);

  const tooLong = await surface.run("richdoc.insert-paragraph", {
    text: "汉".repeat(4000),
  });
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.message, /太长/);
});

test("越界的行列与页码被拒，且报出真实的边界", async () => {
  const grid = gridDouble();
  const gridSurface = buildGridCommandSurface(grid.editor, noopDownload);
  const outOfRange = await gridSurface.run("grid.set-cell", {
    row: 99,
    column: 1,
    value: "x",
  });
  assert.equal(outOfRange.ok, false);
  assert.match(outOfRange.message, /只有 3 行/);
  assert.equal(grid.calls.length, 0, "被拒的指令不许碰编辑器");

  const pdf = pdfDouble();
  const pdfSurface = buildPdfCommandSurface(pdf.editor, noopDownload);
  const badPage = await pdfSurface.run("pdf.go-to-page", { page: 99 });
  assert.equal(badPage.ok, false);
  assert.match(badPage.message, /只有 6 页/);
  assert.equal(pdf.calls.length, 0);

  const deck = deckDouble();
  const deckSurface = buildDeckCommandSurface(deck.editor, noopDownload);
  const badSlide = await deckSurface.run("deck.go-to-slide", { page: 7 });
  assert.equal(badSlide.ok, false);
  assert.match(badSlide.message, /只有 2 页/);
});

// ---------------------------------------------------------------------------
// 4 指令真能干活
// ---------------------------------------------------------------------------

test("文档：插标题 / 插段落 / 全文替换 / 改层级 / 改字号真的落到编辑器上", async () => {
  const { editor, instance } = richDocDouble();
  const surface = buildRichDocCommandSurface(editor, noopDownload);

  const heading = await surface.run("richdoc.insert-heading", {
    text: "结论",
    level: "1",
  });
  assert.equal(heading.ok, true);
  assert.equal(instance.inserted[0].position, 42);
  assert.equal(instance.inserted[0].content.type, "heading");
  assert.equal(instance.inserted[0].content.attrs.level, 1);

  const paragraph = await surface.run("richdoc.insert-paragraph", { text: "一段话" });
  assert.equal(paragraph.ok, true);
  assert.equal(instance.inserted[1].content.type, "paragraph");

  const replaced = await surface.run("richdoc.replace-all", {
    from: "小狗",
    to: "小猫",
  });
  assert.equal(replaced.ok, true);
  assert.match(replaced.message, /共 2 处/);
  assert.equal(instance.replacements.length, 2);
  assert.equal(instance.dispatched.length, 1);

  const missing = await surface.run("richdoc.replace-all", {
    from: "没有这个词",
    to: "x",
  });
  assert.equal(missing.ok, false, "没找到就不算成功，不许假报改过");

  const level = await surface.run("richdoc.set-heading-level", { level: "0" });
  assert.equal(level.ok, true);
  assert.deepEqual(instance.calls.at(-1), ["setParagraph"]);

  const size = await surface.run("richdoc.set-font-size", { size: 18 });
  assert.equal(size.ok, true);
  assert.deepEqual(instance.calls.at(-1), ["setFontSize", "18px"]);

  const tooSmall = await surface.run("richdoc.set-font-size", { size: 2 });
  assert.equal(tooSmall.ok, false);

  const outline = await surface.run("richdoc.read-outline", {});
  assert.equal(outline.ok, true);
  assert.match(outline.message, /第一节/);
});

test("表格：写单元格 / 插行 / 排序 / 读单元格", async () => {
  const grid = gridDouble();
  const surface = buildGridCommandSurface(grid.editor, noopDownload);

  const write = await surface.run("grid.set-cell", { row: 2, column: 2, value: "20" });
  assert.equal(write.ok, true);
  // 面向用户是 1 起算，模型里是 0 起算。
  assert.deepEqual(grid.calls[0], ["setCell", 1, 1, "20"]);

  const row = await surface.run("grid.insert-row", { side: "before" });
  assert.equal(row.ok, true);
  assert.deepEqual(grid.calls[1], ["insertRow", "before"]);

  const sorted = await surface.run("grid.sort-column", { column: 2, direction: "desc" });
  assert.equal(sorted.ok, true);
  assert.deepEqual(grid.calls[2], ["selectCell", { row: 1, col: 1 }]);
  assert.deepEqual(grid.calls[3], ["sort", "desc"]);

  const read = await surface.run("grid.read-cell", { row: 2, column: 1 });
  assert.equal(read.ok, true);
  assert.match(read.message, /杭州/);
});

test("演示：加页 / 改某页标题 / 换版式 / 跳页", async () => {
  const deck = deckDouble();
  const surface = buildDeckCommandSurface(deck.editor, noopDownload);

  assert.equal((await surface.run("deck.add-slide", {})).ok, true);
  assert.deepEqual(deck.calls[0], ["addSlide"]);

  const retitled = await surface.run("deck.set-slide-title", {
    title: "新标题",
    page: 2,
  });
  assert.equal(retitled.ok, true);
  assert.deepEqual(deck.calls[1], ["selectSlide", "p2"]);
  assert.deepEqual(deck.calls[2], ["patchSlide", { title: "新标题" }]);

  const layout = await surface.run("deck.apply-layout", { layout: "two-column" });
  assert.equal(layout.ok, true);
  assert.deepEqual(deck.calls[3], ["applySlideLayout", "two-column"]);

  const jumped = await surface.run("deck.go-to-slide", { page: 2 });
  assert.equal(jumped.ok, true);

  const outline = await surface.run("deck.read-outline", {});
  assert.equal(outline.ok, true);
  assert.match(outline.message, /第 1 页/);
});

test("PDF：跳页 / 全文查词 / 拆页 / 挪页", async () => {
  const pdf = pdfDouble();
  const surface = buildPdfCommandSurface(pdf.editor, noopDownload);

  assert.equal((await surface.run("pdf.go-to-page", { page: 3 })).ok, true);
  assert.deepEqual(pdf.calls[0], ["goToPage", 3]);

  const found = await surface.run("pdf.find-text", { query: "合同" });
  assert.equal(found.ok, true);
  assert.match(found.message, /第 2 页/);

  const notFound = await surface.run("pdf.find-text", { query: "没有这个词" });
  assert.equal(notFound.ok, false);

  const extracted = await surface.run("pdf.extract-pages", { pages: "1,3-4" });
  assert.equal(extracted.ok, true);
  assert.deepEqual(pdf.calls.at(-1), ["extractPages", [1, 3, 4]]);

  const allPages = await surface.run("pdf.extract-pages", { pages: "1-6" });
  assert.equal(allPages.ok, false, "拆出全部页等于没拆，不许当成功");

  const moved = await surface.run("pdf.move-page", { from: 1, to: 3 });
  assert.equal(moved.ok, true);
  assert.deepEqual(pdf.calls.at(-1), ["movePage", 1, 3]);
});

test("扫描件没有文字层时，全文查词给出可读原因而不是空结果", async () => {
  const pdf = pdfDouble({
    textLayer: {
      status: "ready",
      present: false,
      totalCharacters: 0,
      coveragePageRatio: 0,
      extractor: "pdfjs",
    },
  });
  const surface = buildPdfCommandSurface(pdf.editor, noopDownload);
  const result = await surface.run("pdf.find-text", { query: "合同" });
  assert.equal(result.ok, false);
  assert.match(result.message, /扫描件/);
});

test("页码清单解析：合法写法解析出来，越界与乱写一律空数组", () => {
  assert.deepEqual(parsePageList("1,3-5", 8), [1, 3, 4, 5]);
  assert.deepEqual(parsePageList("2 2 1", 8), [1, 2]);
  assert.deepEqual(parsePageList("0", 8), []);
  assert.deepEqual(parsePageList("9", 8), []);
  assert.deepEqual(parsePageList("5-3", 8), []);
  assert.deepEqual(parsePageList("一到三", 8), []);
});

test("编辑器还没载入时不假装能改：只剩下不需要文档的指令", () => {
  const loading = buildRichDocCommandSurface(
    richDocDouble({ loading: true, sourceReady: false, editor: null }).editor,
    noopDownload,
  );
  const ids = loading.describe().map((spec) => spec.id);
  assert.deepEqual(ids, ["richdoc.export"]);
});

// ---------------------------------------------------------------------------
// 5 state() 有界
// ---------------------------------------------------------------------------

function byteSize(value) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

test("四条路由的 state() 都在 4096 字节以内", () => {
  for (const [editorId, surface] of allSurfaces()) {
    const size = byteSize(surface.state());
    assert.ok(
      size <= DOC_FAMILY_STATE_MAX_BYTES,
      `${editorId} 的摘要 ${size} 字节，超过了 ${DOC_FAMILY_STATE_MAX_BYTES}`,
    );
  }
});

test("摘要超长时整键丢弃并留下说明，不许切出半个值", () => {
  const bounded = boundedCommandState({
    keep: "短的",
    huge: "汉".repeat(5000),
  });
  assert.equal(bounded.keep, "短的");
  assert.equal(bounded.huge, undefined);
  assert.match(String(bounded.omitted), /huge/);
  assert.ok(byteSize(bounded) <= DOC_FAMILY_STATE_MAX_BYTES);
});

test("超长标题的文档，摘要照样在界内", () => {
  const surface = buildRichDocCommandSurface(
    richDocDouble({ item: { title: "长".repeat(3000), meta: {} } }).editor,
    noopDownload,
  );
  assert.ok(byteSize(surface.state()) <= DOC_FAMILY_STATE_MAX_BYTES);
});

// ---------------------------------------------------------------------------
// 6 装进 W1 的注册表，agent 侧读得回来
// ---------------------------------------------------------------------------

test("四条路由的指令面都能被 currentPluginCommandSurface() 读到", async () => {
  for (const [editorId, surface] of allSurfaces()) {
    resetPluginCommandSurface();
    const unregister = registerPluginCommandSurface(surface);
    const active = currentPluginCommandSurface();
    assert.ok(active, `${editorId} 挂上去之后读不回来`);
    assert.equal(active.editorId, editorId);
    const specs = describePluginCommands();
    assert.ok(
      specs.length >= 6,
      `${editorId} 经注册表校验后只剩 ${specs.length} 条指令；说明有 spec 不合规被丢了`,
    );
    const snapshot = readPluginCommandState();
    assert.equal(snapshot.editorId, editorId);
    assert.equal(
      snapshot.truncated,
      false,
      `${editorId} 的摘要被注册表截断了，说明它不是有界摘要`,
    );
    const refused = await active.run(`${editorId}.没有这条`, {});
    assert.equal(refused.ok, false);
    unregister();
    assert.equal(currentPluginCommandSurface(), null);
  }
  resetPluginCommandSurface();
});

test("四条路由源码真的把指令面挂上去了", () => {
  const wiring = [
    ["RichDocRoute.tsx", "buildRichDocCommandSurface"],
    ["GridRoute.tsx", "buildGridCommandSurface"],
    ["DeckRoute.tsx", "buildDeckCommandSurface"],
    ["PdfRoute.tsx", "buildPdfCommandSurface"],
  ];
  for (const [file, builder] of wiring) {
    const text = readFileSync(join(ROUTES, file), "utf8");
    assert.match(
      text,
      new RegExp(`usePluginCommandSurface\\(\\s*${builder}\\(`),
      `${file} 没有用 usePluginCommandSurface(${builder}(…)) 挂上指令面`,
    );
  }
});

// ---------------------------------------------------------------------------
// 7 下载菜单齐全且是人话
// ---------------------------------------------------------------------------

const REQUIRED_DOWNLOADS = {
  richdoc: ["docx", "md", "html", "pdf", "txt"],
  grid: ["xlsx", "csv"],
  deck: ["pptx", "pdf"],
  pdf: ["pdf"],
};

test("每条路由的下载格式覆盖任务书要求的那几种", () => {
  for (const [editorId, required] of Object.entries(REQUIRED_DOWNLOADS)) {
    const have = DOC_FAMILY_DOWNLOAD_FORMATS[editorId].map((format) => format.extension);
    for (const extension of required) {
      assert.ok(
        have.includes(extension),
        `${editorId} 的下载菜单少了 ${extension}（现有：${have.join("、")}）`,
      );
    }
    assert.equal(new Set(have).size, have.length, `${editorId} 的下载格式有重复`);
    const ids = DOC_FAMILY_DOWNLOAD_FORMATS[editorId].map((format) => format.id);
    assert.equal(new Set(ids).size, ids.length, `${editorId} 的下载条目 id 有重复`);
  }
});

test("下载菜单文案是人话：带得出后缀、不出现 MIME 串", () => {
  for (const formats of Object.values(DOC_FAMILY_DOWNLOAD_FORMATS)) {
    for (const format of formats) {
      assert.ok(
        format.label.includes(`.${format.extension}`),
        `${format.id} 的文案「${format.label}」没告诉用户会得到什么后缀`,
      );
      assert.ok(
        !format.label.toLowerCase().includes("application/"),
        `${format.id} 的文案里出现了 MIME 串`,
      );
      assert.ok(
        ["local", "convert"].includes(format.via),
        `${format.id} 没说清是本地出还是走后端转换`,
      );
    }
  }
});

test("导出指令的枚举与下载菜单同一张表，不许各说一套", () => {
  for (const [editorId, surface] of allSurfaces()) {
    const spec = surface
      .describe()
      .find((entry) => entry.id === `${editorId}.export`);
    assert.ok(spec, `${editorId} 没有导出指令`);
    const choices = spec.params[0].enumValues.map((choice) => choice.value);
    assert.deepEqual(
      choices,
      DOC_FAMILY_DOWNLOAD_FORMATS[editorId].map((format) => format.extension),
    );
  }
});

test("导出失败时把原因带回给 agent，不许报成功", async () => {
  const surface = buildRichDocCommandSurface(richDocDouble().editor, {
    download: async () => "转换服务暂时连不上，请过一会儿再试。",
  });
  const result = await surface.run("richdoc.export", { format: "pdf" });
  assert.equal(result.ok, false);
  assert.match(result.message, /连不上/);
});

// ---------------------------------------------------------------------------
// 8 上传归一化声明表
// ---------------------------------------------------------------------------

test("冷门格式各自转到对的目标格式", () => {
  assert.equal(docFamilyConvertTarget("richdoc", "老合同.doc"), "docx");
  assert.equal(docFamilyConvertTarget("richdoc", "notes.rtf"), "docx");
  assert.equal(docFamilyConvertTarget("richdoc", "简历.odt"), "docx");
  assert.equal(docFamilyConvertTarget("deck", "汇报.odp"), "pptx");
  assert.equal(docFamilyConvertTarget("deck", "旧版.ppt"), "pptx");
  assert.equal(docFamilyConvertTarget("pdf", "合同.docx"), "pdf");
});

// 转换端点 `/v1/convert/office` 的白名单。取自网关的单一事实源
// `oceanleo/backend/app/convert/capabilities.py`（OFFICE_SOURCES +
// OFFICE_SOURCES_VIA_GATEWAY / OFFICE_TARGETS），并用**真文件**逐条实测过
// （2026-08-19，见 signals/W2-journal.md）：
//   rtf→docx 200、txt→docx 200、csv→xlsx 200、pptx→pptx 200、xlsx→xlsx 200、
//   pptx→pdf 200、xlsx→pdf 200；跨家族的 pptx→docx 422「no export filter」。
// 所以规则是：来源必须在白名单里，落地格式要么是 pdf，要么和来源同家族。
const BACKEND_CONVERT_SOURCES = new Set([
  "doc", "docx", "odt", "rtf", "txt",
  "xls", "xlsx", "ods", "csv", "tsv",
  "ppt", "pptx", "odp",
  "pdf",
]);
const BACKEND_CONVERT_TARGETS = new Set(["pdf", "docx", "xlsx", "pptx"]);
const BACKEND_FAMILY_OF = {
  doc: "word", docx: "word", odt: "word", rtf: "word", txt: "word",
  xls: "sheet", xlsx: "sheet", ods: "sheet", csv: "sheet", tsv: "sheet",
  ppt: "slide", pptx: "slide", odp: "slide",
};

test("转换映射不许超出后端白名单支持的格式", () => {
  for (const editorId of DOC_FAMILY_EDITOR_IDS) {
    for (const [from, to] of Object.entries(
      DOC_FAMILY_CONVERT_TARGETS[editorId],
    )) {
      assert.ok(
        BACKEND_CONVERT_SOURCES.has(from),
        `${editorId} 想把 .${from} 送去转换，但转换端点不收这个来源（会拿回 400），应改成一句拒绝理由`,
      );
      assert.ok(
        BACKEND_CONVERT_TARGETS.has(to),
        `${editorId} 想让后端转出 ${to}，但后端只出 ${[...BACKEND_CONVERT_TARGETS].join("、")}`,
      );
      assert.ok(
        to === "pdf" || BACKEND_FAMILY_OF[from] === BACKEND_FAMILY_OF[to],
        `${editorId} 想把 .${from} 转成 ${to}，跨家族转换后端没有对应的导出过滤器（实测 pptx→docx 422）`,
      );
    }
  }
});

test("下载里走转换的那几项，落地格式后端真的出得来", () => {
  for (const editorId of DOC_FAMILY_EDITOR_IDS) {
    for (const format of DOC_FAMILY_DOWNLOAD_FORMATS[editorId]) {
      if (format.via !== "convert") continue;
      assert.ok(
        BACKEND_CONVERT_TARGETS.has(format.extension),
        `${editorId} 的下载菜单里「${format.label}」要后端转出 ${format.extension}，后端出不来`,
      );
    }
  }
});

test("制表符分隔的 .tsv 由表格自己认，不再白跑一趟后端", () => {
  // 后端入口白名单里没有 tsv，送过去只会 400；表格读取器在纯文本模式下自己分列。
  assert.equal(docFamilyConvertTarget("grid", "导出.tsv"), "");
  assert.equal(docFamilyRefusalReason("grid", "导出.tsv"), "");
  assert.ok(docFamilyAcceptAttribute("grid").includes(".tsv"));
  const loader = readFileSync(
    new URL("../src/shell/doc-editors/grid-model.ts", import.meta.url),
    "utf8",
  );
  const gate = loader.slice(loader.indexOf("export async function loadGridFile"));
  assert.match(
    gate.slice(0, 600),
    /"csv",\s*"tsv"/,
    "loadGridFile 的后缀闸没放开 tsv：上传框选得中、载入时被拒的老事故会重演",
  );
});

test("送错门的文件被指到对的编辑器，而不是给一句办不到的建议", () => {
  const sheetInDoc = docFamilyRefusalReason("richdoc", "报表.xlsx");
  assert.match(sheetInDoc, /表格编辑器/);
  assert.ok(
    !sheetInDoc.includes("另存为 .xlsx"),
    "对着文档编辑器的用户说「另存为 .xlsx」是办不到的建议",
  );
  assert.match(docFamilyRefusalReason("grid", "合同.docx"), /文档编辑器/);
  assert.match(docFamilyRefusalReason("grid", "汇报.pptx"), /演示编辑器/);
  assert.match(docFamilyRefusalReason("richdoc", "扫描件.pdf"), /PDF 编辑器/);
  // 本家族里确实打不开的，给的是「另存成什么」而不是指路。
  assert.match(docFamilyRefusalReason("grid", "老账.xlsb"), /另存为 \.xlsx/);
  assert.match(docFamilyRefusalReason("richdoc", "模板.dotx"), /另存为 \.docx/);
  assert.match(docFamilyRefusalReason("deck", "带宏.pptm"), /另存为 \.pptx/);
});

test("原生就认的格式不白转一次", () => {
  assert.equal(docFamilyConvertTarget("richdoc", "a.docx"), "");
  assert.equal(docFamilyConvertTarget("grid", "a.csv"), "");
  assert.equal(docFamilyConvertTarget("deck", "a.pptx"), "");
  assert.equal(docFamilyConvertTarget("pdf", "a.pdf"), "");
});

test("上传框 accept 与归一化表同源：选得中的一定打得开", () => {
  for (const editorId of DOC_FAMILY_EDITOR_IDS) {
    const accept = docFamilyAcceptAttribute(editorId);
    const plan = docFamilyImportPlan(editorId);
    const known = [
      ...plan.accept,
      ...plan.rules.flatMap((rule) => rule.from),
    ];
    for (const extension of known) {
      assert.ok(
        accept.includes(`.${extension}`),
        `${editorId} 的 accept 少了 .${extension}`,
      );
    }
    for (const part of accept.split(",")) {
      if (!part.startsWith(".")) continue;
      const extension = part.slice(1);
      assert.ok(
        known.includes(extension),
        `${editorId} 的 accept 放进了 .${extension}，但归一化表打不开它——这正是 .tsv 那次事故`,
      );
    }
  }
});

test("打不开的格式给一句人能看懂的原因，且不含行话", () => {
  const numbers = docFamilyRefusalReason("grid", "账目.numbers");
  assert.match(numbers, /Numbers/);
  assert.match(numbers, /导出成/);
  const keynote = docFamilyRefusalReason("deck", "汇报.key");
  assert.match(keynote, /Keynote/);
  const unknown = docFamilyRefusalReason("richdoc", "神秘.zzz");
  assert.match(unknown, /\.zzz/);
  const noExtension = docFamilyRefusalReason("richdoc", "没有后缀");
  assert.match(noExtension, /扩展名/);
  for (const message of [numbers, keynote, unknown, noExtension]) {
    for (const word of ["artifact", "adapter", "schema", "application/vnd"]) {
      assert.ok(!message.toLowerCase().includes(word), `原因里出现了行话「${word}」`);
    }
  }
});

test("能打开的格式不许被判成打不开", () => {
  assert.equal(docFamilyRefusalReason("richdoc", "a.docx"), "");
  assert.equal(docFamilyRefusalReason("richdoc", "老合同.doc"), "");
  assert.equal(docFamilyRefusalReason("richdoc", "插图.png"), "");
  assert.equal(docFamilyRefusalReason("grid", "导出.tsv"), "");
  assert.equal(docFamilyRefusalReason("deck", "汇报.odp"), "");
  assert.equal(docFamilyRefusalReason("pdf", "合同.docx"), "");
});

test("四条声明表一次给全，转换一律走后端 office 端点", () => {
  assert.equal(DOC_FAMILY_IMPORT_PLANS.length, DOC_FAMILY_EDITOR_IDS.length);
  for (const plan of DOC_FAMILY_IMPORT_PLANS) {
    assert.ok(plan.accept.length > 0, `${plan.editorId} 没声明原生格式`);
    for (const rule of plan.rules) {
      assert.equal(
        rule.endpoint,
        "office",
        `${plan.editorId} 的转换走了 ${rule.endpoint}；文档家族只用后端 office 端点`,
      );
      assert.ok(rule.from.length > 0);
    }
  }
});
