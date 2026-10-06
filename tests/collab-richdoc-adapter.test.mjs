/**
 * W12：富文本多人同改的适配层（`src/shell/collab/adapters/richdoc.ts`）。
 * 不起真编辑器：种子 / 保存 / 外部新版本三条流程用假编辑器 + 真 `Y.XmlFragment` 验证。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  RICHDOC_COLLAB_FIELD,
  followRichDocExternalRevisions,
  renderRichDocCaret,
  richDocCaretUser,
  richDocCollabPhase,
  richDocEditable,
  richDocFromY,
  richDocSelectionRender,
  safeCollabColor,
  saveRichDocWithRoom,
  seedRichDoc,
} from "../src/shell/collab/adapters/richdoc.ts";

let Y = null;
try {
  Y = await import("yjs");
} catch {
  Y = null;
}

test("阶段判断：不在协同 / 连接中 / 播种 / 等同步 / 可编辑", () => {
  const phase = (room, extra = {}) =>
    richDocCollabPhase({ room, contentReady: true, seeded: false, ...extra });
  assert.equal(phase(null), "off");
  assert.equal(phase({ status: "denied", needsSeed: false }), "off");
  assert.equal(phase({ status: "disabled", needsSeed: false }), "off");
  assert.equal(phase({ status: "connecting", needsSeed: true }), "connecting");
  assert.equal(phase({ status: "syncing", needsSeed: true }), "seed");
  assert.equal(phase({ status: "synced", needsSeed: true }), "seed");
  assert.equal(phase({ status: "synced", needsSeed: true }, { contentReady: false }), "load-source");
  assert.equal(phase({ status: "synced", needsSeed: true }, { seeded: true }), "live");
  assert.equal(phase({ status: "syncing", needsSeed: false }), "wait-sync");
  assert.equal(phase({ status: "synced", needsSeed: false }), "live");
  // 断线后继续写，不退回等待
  assert.equal(phase({ status: "offline", needsSeed: false }, { wasLive: true }), "live");
  assert.equal(phase({ status: "offline", needsSeed: false }), "connecting");
});

test("可编辑：协同里没就绪不可编辑；只读时一律不可编辑", () => {
  assert.equal(richDocEditable("off", false), true);
  assert.equal(richDocEditable("off", true), false);
  assert.equal(richDocEditable("live", false), true);
  assert.equal(richDocEditable("live", true), false);
  assert.equal(richDocEditable("wait-sync", false), false);
  assert.equal(richDocEditable("seed", false), false);
});

test("种子：写内容 → 清撤销栈 → completeSeed 带上根名，顺序固定", () => {
  const calls = [];
  seedRichDoc({
    room: { completeSeed: (roots) => calls.push(["complete", roots]) },
    setContent: () => calls.push(["setContent"]),
    clearUndo: () => calls.push(["clearUndo"]),
  });
  assert.deepEqual(calls, [["setContent"], ["clearUndo"], ["complete", [RICHDOC_COLLAB_FIELD]]]);
  assert.equal(RICHDOC_COLLAB_FIELD, "oceanleo:richdoc");
});

test("保存：非保存者不存；保存者存完告诉房间版本号；不在协同里照旧；没产生新版本不通知", async () => {
  const marked = [];
  const room = (isSaver, status = "synced") => ({
    isSaver,
    status,
    markSaved: (id) => marked.push(id),
  });
  let saves = 0;
  const save = async () => {
    saves += 1;
    return { revisionId: `rev-${saves}` };
  };

  assert.deepEqual(await saveRichDocWithRoom({ room: room(false), save }), { skipped: true, result: null });
  assert.equal(saves, 0);

  const saved = await saveRichDocWithRoom({ room: room(true), save });
  assert.equal(saved.skipped, false);
  assert.deepEqual(marked, ["rev-1"]);

  const solo = await saveRichDocWithRoom({ room: null, save });
  assert.equal(solo.skipped, false);
  assert.equal(saves, 2);
  assert.deepEqual(marked, ["rev-1"], "不在协同里不通知房间");

  const denied = await saveRichDocWithRoom({ room: room(false, "denied"), save });
  assert.equal(denied.skipped, false, "房间被拒绝时按没有协同处理");

  const failed = await saveRichDocWithRoom({ room: room(true), save: async () => null });
  assert.equal(failed.result, null);
  const noRevision = await saveRichDocWithRoom({ room: room(true), save: async () => ({}) });
  assert.deepEqual(noRevision.result, {});
  assert.deepEqual(marked, ["rev-1"]);
});

test("外部新版本：读取 → 套进编辑器 → markSaved → 清未保存；只认最后一条；读取失败不动内容", async () => {
  let listener = null;
  const marked = [];
  const room = {
    onExternalRevision(cb) {
      listener = cb;
      return () => {
        listener = null;
      };
    },
    markSaved: (id) => marked.push(id),
  };
  const applied = [];
  let cleaned = 0;
  const errors = [];
  const pending = new Map();
  const off = followRichDocExternalRevisions({
    room,
    read: (id) =>
      new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      }),
    apply: (content, id) => applied.push([id, content]),
    markClean: () => {
      cleaned += 1;
    },
    onError: (error) => errors.push(error.message),
  });

  listener("rev-a", "ai");
  listener("rev-b", "pro");
  pending.get("rev-b").resolve("B 内容");
  await Promise.resolve();
  await Promise.resolve();
  pending.get("rev-a").resolve("A 内容（迟到，应丢弃）");
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(applied, [["rev-b", "B 内容"]]);
  assert.deepEqual(marked, ["rev-b"]);
  assert.equal(cleaned, 1);

  listener("rev-c", "import");
  pending.get("rev-c").reject(new Error("读不到"));
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(errors, ["读不到"]);
  assert.equal(applied.length, 1);

  listener("rev-d", "ai");
  off();
  assert.equal(listener, null);
  pending.get("rev-d").resolve("D");
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(applied.length, 1, "解绑后不再套用");
});

test("别人的光标：名字当纯文本、颜色过白名单，不出现 innerHTML", () => {
  const created = [];
  const doc = {
    createElement(tag) {
      const el = {
        tag,
        className: "",
        textContent: null,
        style: {},
        children: [],
        appendChild(child) {
          this.children.push(child);
        },
        setAttribute() {},
      };
      Object.defineProperty(el, "innerHTML", {
        set() {
          throw new Error("不许用 innerHTML");
        },
      });
      created.push(el);
      return el;
    },
  };
  const caret = renderRichDocCaret({ name: "<img src=x onerror=alert(1)>小王", color: "hsl(120, 70%, 45%)" }, doc);
  assert.equal(caret.children.length, 1);
  assert.equal(caret.children[0].textContent, "<img src=x onerror=alert(1)>小王");
  assert.equal(caret.children[0].style.background, "hsl(120, 70%, 45%)");
  const evil = renderRichDocCaret({ name: "x", color: "red;background:url(javascript:1)" }, doc);
  assert.equal(evil.children[0].style.background, "#6366f1");
  assert.equal(safeCollabColor("#fff"), "#fff");
  assert.equal(safeCollabColor("expression(1)"), "#6366f1");
  assert.deepEqual(richDocCaretUser({ id: 7, name: "A".repeat(80), color: "bad" }), {
    id: "7",
    name: "A".repeat(40),
    color: "#6366f1",
  });
  assert.equal(richDocSelectionRender({ color: "#abc" }).style, "background-color: #aabbcc33");
  assert.equal(
    richDocSelectionRender({ color: "hsl(200, 70%, 45%)" }).style,
    "background-color: hsla(200, 70%, 45%, 0.2)",
  );
  assert.equal(richDocSelectionRender({ color: "#12345678" }).style, "background-color: #6366f133");
  assert.deepEqual(richDocSelectionRender({ color: "#123456" }), {
    nodeName: "span",
    class: "oleo-richdoc-selection",
    style: "background-color: #12345633",
  });
});

// ── 两个 Y.Doc 之间（依赖 yjs；未装时跳过） ─────────────────────────────────

function sync(a, b) {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
}

/** 假编辑器：把「段落数组」写进 Y.XmlFragment，和协同扩展写进去的结构同形。 */
function fakeEditor(doc) {
  const fragment = doc.getXmlFragment(RICHDOC_COLLAB_FIELD);
  return {
    fragment,
    setContent(blocks) {
      doc.transact(() => {
        fragment.delete(0, fragment.length);
        for (const block of blocks) {
          const element = new Y.XmlElement(block.type);
          for (const [key, value] of Object.entries(block.attrs ?? {})) element.setAttribute(key, value);
          const text = new Y.XmlText();
          text.insert(0, block.text);
          element.insert(0, [text]);
          fragment.insert(fragment.length, [element]);
        }
      });
    },
    paragraphText(index) {
      return fragment.get(index).get(0).toString();
    },
    insertAt(index, offset, value) {
      fragment.get(index).get(0).insert(offset, value);
    },
  };
}

const WORK = [
  { type: "heading", attrs: { level: 1 }, text: "季度总结" },
  { type: "paragraph", text: "第一段内容" },
];

test("播种：只有播种者写作品内容，其余客户端同步后看到同一份", { skip: !Y }, () => {
  const seeder = new Y.Doc();
  const other = new Y.Doc();
  const seedEditor = fakeEditor(seeder);
  const completed = [];
  seedRichDoc({
    room: { completeSeed: (roots) => completed.push(roots) },
    setContent: () => seedEditor.setContent(WORK),
  });
  assert.deepEqual(completed, [["oceanleo:richdoc"]]);
  sync(seeder, other);
  const read = richDocFromY(other);
  assert.equal(read.content.length, 2);
  assert.equal(read.content[0].type, "heading");
  assert.deepEqual(read.content[0].attrs, { level: 1 });
  assert.equal(read.content[1].content[0].text, "第一段内容");
  // 非播种者在 live 阶段不再 setContent：phase 不会给它 "seed"
  assert.equal(
    richDocCollabPhase({ room: { status: "synced", needsSeed: false }, contentReady: true, seeded: false }),
    "live",
  );
});

test("并发：同一段落里两人同时打字都保留，且两边收敛", { skip: !Y }, () => {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const editorA = fakeEditor(a);
  editorA.setContent(WORK);
  sync(a, b);
  const editorB = fakeEditor(b);
  editorA.insertAt(1, 0, "【甲】");
  editorB.insertAt(1, editorB.paragraphText(1).length, "【乙】");
  sync(a, b);
  assert.equal(editorA.paragraphText(1), "【甲】第一段内容【乙】");
  assert.equal(editorB.paragraphText(1), editorA.paragraphText(1));
  assert.deepEqual(richDocFromY(a), richDocFromY(b));
});

test("并发：同一位置同时插入也收敛（顺序一致即可，内容都在）", { skip: !Y }, () => {
  const a = new Y.Doc();
  const b = new Y.Doc();
  fakeEditor(a).setContent(WORK);
  sync(a, b);
  fakeEditor(a).insertAt(1, 2, "AAA");
  fakeEditor(b).insertAt(1, 2, "BBB");
  sync(a, b);
  const text = fakeEditor(a).paragraphText(1);
  assert.equal(text, fakeEditor(b).paragraphText(1));
  assert.ok(text.includes("AAA") && text.includes("BBB"));
  assert.equal(text.replace("AAA", "").replace("BBB", ""), "第一段内容");
});

test("外部新版本：保存者整篇替换进协同文档，别人同步后看到新内容", { skip: !Y }, async () => {
  const saver = new Y.Doc();
  const peer = new Y.Doc();
  const saverEditor = fakeEditor(saver);
  saverEditor.setContent(WORK);
  sync(saver, peer);

  let listener = null;
  const marked = [];
  let cleaned = 0;
  followRichDocExternalRevisions({
    room: {
      onExternalRevision: (cb) => {
        listener = cb;
        return () => {};
      },
      markSaved: (id) => marked.push(id),
    },
    read: async () => [
      { type: "heading", attrs: { level: 1 }, text: "AI 改写的标题" },
      { type: "paragraph", text: "AI 写的第一段" },
      { type: "paragraph", text: "AI 写的第二段" },
    ],
    apply: (blocks) => saverEditor.setContent(blocks),
    markClean: () => {
      cleaned += 1;
    },
  });
  listener("rev-ai", "ai");
  await new Promise((resolve) => setTimeout(resolve, 0));
  sync(saver, peer);
  assert.deepEqual(marked, ["rev-ai"]);
  assert.equal(cleaned, 1);
  const read = richDocFromY(peer);
  assert.equal(read.content.length, 3);
  assert.equal(read.content[0].content[0].text, "AI 改写的标题");
});
