/**
 * F09：文档里的评论、回复、已解决也在多人之间实时同步。
 *
 * 不起浏览器、不起真 TipTap：用
 *   - 真 `Y.Doc`（两个客户端靠「互相应用更新」同步，可暂停以模拟同时操作）；
 *   - 真 ProseMirror 文档与真批注 mark（锚点、孤儿结算都是真的）；
 *   - 真的 `useRichDocReview` 与 `useRichDocReviewCollab` 两个 hook 源码
 *     （用 TypeScript 转译后放进 vm，配一个能记状态的最小 React），
 * 所以「只读不能写」「保存取到的就是共享评论」测的是真 hook，不是复制出来的逻辑。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { getSchema } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import ts from "typescript";
import * as Y from "yjs";

import * as anchors from "../src/shell/doc-editors/richdoc-review/review-anchors.ts";
import * as collab from "../src/shell/doc-editors/richdoc-review/review-collab.ts";
import * as marks from "../src/shell/doc-editors/richdoc-review/review-marks.ts";
import * as types from "../src/shell/doc-editors/richdoc-review/review-types.ts";
import * as track from "../src/shell/doc-editors/richdoc-review/track-changes.ts";

const {
  RICHDOC_REVIEW_COLLAB_FIELD,
  RICHDOC_REVIEW_COLLAB_META_FIELD,
  readSharedReview,
  mergeSharedIntoSidecar,
} = collab;
const { attachReviewSidecar, readReviewSidecar, emptyReviewSidecar, createCommentRecord } = types;

const schema = getSchema([Document, Paragraph, Text, ...marks.richDocReviewExtensions()]);
const REVIEW_DIR = "../src/shell/doc-editors/richdoc-review/";

// ── 最小 React：记 state / ref / memo / effect，由测试显式 render ───────────────

const reactState = { current: null };
const fakeReact = {
  useState(initial) {
    const run = reactState.current;
    const i = run.cursor++;
    if (!(i in run.slots)) run.slots[i] = typeof initial === "function" ? initial() : initial;
    return [
      run.slots[i],
      (value) => {
        run.slots[i] = typeof value === "function" ? value(run.slots[i]) : value;
      },
    ];
  },
  useRef(initial) {
    const run = reactState.current;
    const i = run.cursor++;
    return (run.slots[i] ??= { current: initial });
  },
  useMemo(fn, deps) {
    return fakeReact.useCallback(fn, deps, true);
  },
  useCallback(fn, deps, isMemo = false) {
    const run = reactState.current;
    const i = run.cursor++;
    const prev = run.slots[i];
    if (prev && deps && prev.deps.length === deps.length && deps.every((d, j) => Object.is(d, prev.deps[j]))) {
      return prev.value;
    }
    const value = isMemo ? fn() : fn;
    run.slots[i] = { deps, value };
    return value;
  },
  useEffect(fn, deps) {
    const run = reactState.current;
    const i = run.cursor++;
    const prev = run.slots[i];
    if (prev && deps && prev.deps.length === deps.length && deps.every((d, j) => Object.is(d, prev.deps[j]))) {
      return;
    }
    const entry = { deps, cleanup: prev ? prev.cleanup : undefined };
    run.slots[i] = entry;
    run.pending.push(() => {
      entry.cleanup?.();
      entry.cleanup = fn() || undefined;
    });
  },
};

function loadHook(file) {
  const source = readFileSync(new URL(`${REVIEW_DIR}${file}`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mocks = {
    react: fakeReact,
    "./review-anchors": anchors,
    "./review-collab": collab,
    "./review-marks": marks,
    "./review-types": types,
    "./track-changes": track,
  };
  const exports = {};
  // 同一个 realm 里跑（不用 runInNewContext）：否则 hook 里造出来的数组、对象原型不同，
  // assert.deepEqual 会因为跨 realm 而误报。
  const factory = new vm.Script(`(function (exports, require, console) {${code}\n})`).runInThisContext();
  factory(
    exports,
    (name) => {
      if (!(name in mocks)) throw new Error(`hook 里出现了测试没给的依赖：${name}`);
      return mocks[name];
    },
    console,
  );
  return exports;
}

const { useRichDocReview } = loadHook("use-richdoc-review.ts");
const { useRichDocReviewCollab, richDocReviewReadOnly } = loadHook("use-richdoc-review-collab.ts");

// ── 两个（或三个）模拟客户端 ────────────────────────────────────────────────

function paragraphDoc(text) {
  return schema.node("doc", null, [schema.node("paragraph", null, [schema.text(text)])]);
}

class World {
  constructor() {
    this.clients = [];
    this.paused = false;
  }

  join(name, options = {}) {
    const client = new Client(this, name, options);
    this.clients.push(client);
    client.doc.on("update", (update, origin) => {
      if (origin === "net") return;
      client.outbox.push(update);
      if (!this.paused) this.deliver(client);
    });
    // 真实流程里每个客户端载入完文档都会读一次工程档（hydrate），之后才可能编辑。
    if (!options.manualHydrate) {
      this.flush();
      client.act((api) => api.hydrateFromProject(options.file || {}));
    }
    return client;
  }

  deliver(from) {
    const updates = from.outbox.splice(0);
    for (const peer of this.clients) {
      if (peer === from || peer.offline) continue;
      for (const update of updates) Y.applyUpdate(peer.doc, update, "net");
      peer.render();
    }
  }

  /** 两端互相补齐全部没收到的更新（暂停之后恢复；后加入的人也靠它拿到全量）。 */
  flush() {
    this.paused = false;
    for (const a of this.clients) {
      for (const b of this.clients) {
        if (a === b || a.offline || b.offline) continue;
        Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc, Y.encodeStateVector(b.doc)), "net");
      }
      a.outbox.length = 0;
    }
    for (const client of this.clients) client.render();
  }

  /** 正文改动同时落到每个人的文档里（真实里它走协同扩展；这里只需要「各自正文一致」）。 */
  applyBody(from, tr) {
    for (const peer of this.clients) {
      if (peer === from) continue;
      let next = peer.editor.state.tr;
      for (const step of tr.steps) next = next.step(step);
      peer.editor.state = peer.editor.state.apply(next);
      peer.bump();
    }
  }
}

class Client {
  constructor(world, name, options) {
    this.world = world;
    this.name = name;
    this.doc = new Y.Doc();
    this.outbox = [];
    this.offline = false;
    this.run = { slots: [], cursor: 0, pending: [], revision: 0 };
    this.room = { active: true, live: true, readOnly: false };
    const client = this;
    this.editor = {
      state: EditorState.create({ schema, doc: options.body || paragraphDoc("hello world, 第二句话在这里") }),
      view: {
        dispatch(tr) {
          client.editor.state = client.editor.state.apply(tr);
          client.world.applyBody(client, tr);
          client.bump();
        },
      },
    };
    this.attribution = { author: `u-${name}`, authorName: name };
    this.render();
  }

  bump() {
    this.run.revision += 1;
    this.render();
  }

  /** 像 React 一样：effect 里改了 state 就再渲染，直到稳定（最多 4 轮）。 */
  render(depth = 0) {
    const run = this.run;
    run.cursor = 0;
    reactState.current = run;
    const review = useRichDocReview({
      editor: this.editor,
      revision: run.revision,
      attribution: this.attribution,
    });
    useRichDocReviewCollab({
      review,
      editor: this.editor,
      room: { doc: this.doc },
      active: this.room.active,
      live: this.room.live,
      readOnly: this.room.readOnly,
    });
    reactState.current = null;
    this.api = review;
    const jobs = run.pending.splice(0);
    for (const job of jobs) job();
    if (jobs.length && depth < 4) return this.render(depth + 1);
    return review;
  }

  /** 本地发起一次操作：做完立刻重渲染一次（和 React 一样，之后再有变化再渲染）。 */
  act(fn) {
    const result = fn(this.api);
    this.render();
    return result;
  }

  select(from, to) {
    const state = this.editor.state;
    this.editor.state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
    this.bump();
  }

  setRoom(next) {
    this.room = { ...this.room, ...next };
    this.render();
  }

  get comments() {
    return this.api.getSidecar().comments;
  }

  comment(id) {
    return this.comments.find((item) => item.id === id);
  }

  /** 把本地看到的批注规整成可比较的样子：忽略孤儿时间戳（它是各端各自结算的）。 */
  view() {
    return this.api
      .getSidecar()
      .comments.map((item) => ({
        id: item.id,
        body: item.body,
        author: item.author,
        resolved: item.resolved,
        orphaned: item.orphaned,
        replies: item.replies.map((reply) => `${reply.author}:${reply.body}`),
      }))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  }
}

function addComment(client, body, from = 1, to = 6) {
  client.select(from, to);
  return client.act((api) => api.addComment(body));
}

/** 工程档：正文 + sidecar（保存时 `use-rich-doc-editor` 就是这样挂上去的）。 */
function projectOf(client) {
  return attachReviewSidecar({ type: "doc", content: [] }, client.api.getSidecar());
}

function commentRecord(id, body, extra = {}) {
  return createCommentRecord({
    author: "u-file",
    authorName: "文件",
    id,
    body,
    quotedText: "hello",
    createdAt: extra.createdAt || "2026-10-06T00:00:00.000Z",
  });
}

function bodyWithAnchors(...ids) {
  // 「hello」第一个词连着盖上每条批注的锚点。
  let state = EditorState.create({ schema, doc: paragraphDoc("hello world, 第二句话在这里") });
  for (const id of ids) {
    state = state.apply(state.tr.addMark(1, 6, schema.marks.richdocComment.create({ commentId: id })));
  }
  return state.doc;
}

// ── 测试 ────────────────────────────────────────────────────────────────────

test("甲加评论，乙马上在批注栏里看到内容、作者和划线", () => {
  const world = new World();
  const a = world.join("甲");
  const b = world.join("乙");
  const id = addComment(a, "这里数据要更新");
  assert.ok(id, "甲建出了评论");

  const seen = b.comment(id);
  assert.ok(seen, "乙收到了评论");
  assert.equal(seen.body, "这里数据要更新");
  assert.equal(seen.author, "u-甲");
  assert.equal(seen.authorName, "甲");
  assert.equal(seen.quotedText, "hello");
  assert.equal(seen.orphaned, false);
  // 划线是正文里的 mark，一并同步；乙的批注视图里它有位置。
  const views = anchors.commentViews(b.editor.state.doc, b.api.getSidecar());
  assert.deepEqual(views.find((v) => v.id === id).range, { from: 1, to: 6 });
  assert.deepEqual(a.view(), b.view());
});

test("乙直接回复，甲马上看到；回复带着乙的名字", () => {
  const world = new World();
  const a = world.join("甲");
  const b = world.join("乙");
  const id = addComment(a, "这里数据要更新");
  b.act((api) => api.replyToComment(id, "收到，我来改"));
  assert.deepEqual(a.comment(id).replies.map((r) => [r.authorName, r.body]), [["乙", "收到，我来改"]]);
  assert.deepEqual(a.view(), b.view());
});

test("两人同时回复同一条评论：两条回复都在，两边顺序一致", () => {
  const world = new World();
  const a = world.join("甲");
  const b = world.join("乙");
  const id = addComment(a, "这里数据要更新");
  world.paused = true; // 两个人互相还没看到对方的回复
  a.act((api) => api.replyToComment(id, "甲的回复"));
  b.act((api) => api.replyToComment(id, "乙的回复"));
  assert.equal(a.comment(id).replies.length, 1);
  assert.equal(b.comment(id).replies.length, 1);
  world.flush();

  for (const client of [a, b]) {
    assert.deepEqual(
      client.comment(id).replies.map((r) => r.body).sort(),
      ["乙的回复", "甲的回复"],
      `${client.name} 那边两条回复都在`,
    );
  }
  assert.deepEqual(a.view(), b.view(), "两边顺序、内容完全一致");
  assert.equal(readSharedReview(a.doc).comments[0].replies.length, 2);
});

test("甲解决，乙看到已解决；乙重开，甲也跟着重开", () => {
  const world = new World();
  const a = world.join("甲");
  const b = world.join("乙");
  const id = addComment(a, "这里数据要更新");
  a.act((api) => api.resolveComment(id, true));
  assert.equal(b.comment(id).resolved, true);
  assert.equal(b.comment(id).resolvedBy, "u-甲");
  assert.ok(b.comment(id).resolvedAt);

  b.act((api) => api.resolveComment(id, false));
  assert.equal(a.comment(id).resolved, false);
  assert.equal(a.comment(id).resolvedAt, undefined);
  assert.deepEqual(a.view(), b.view());
});

test("甲解决的同时乙在回复：已解决和回复互不覆盖", () => {
  const world = new World();
  const a = world.join("甲");
  const b = world.join("乙");
  const id = addComment(a, "这里数据要更新");
  world.paused = true;
  a.act((api) => api.resolveComment(id, true));
  b.act((api) => api.replyToComment(id, "还有一处也要改"));
  world.flush();
  for (const client of [a, b]) {
    assert.equal(client.comment(id).resolved, true);
    assert.deepEqual(client.comment(id).replies.map((r) => r.body), ["还有一处也要改"]);
  }
});

test("甲删除评论，乙那边评论和划线一起消失；并发回复不会让它复活", () => {
  const world = new World();
  const a = world.join("甲");
  const b = world.join("乙");
  const id = addComment(a, "这条要删");
  const other = addComment(a, "这条留着", 8, 12);
  world.paused = true;
  a.act((api) => api.removeComment(id));
  b.act((api) => api.replyToComment(id, "乙在删除的同时回复"));
  world.flush();

  for (const client of [a, b]) {
    assert.equal(client.comment(id), undefined, `${client.name} 那边已删除`);
    assert.ok(client.comment(other), "别的评论不受影响");
    assert.equal(anchors.collectCommentAnchors(client.editor.state.doc).has(id), false, "划线也摘了");
  }
  assert.deepEqual(a.view(), b.view());
});

test("一方删掉带划线的正文：两边的评论都变成孤儿，结果一致，没有一边在一边没了", () => {
  const world = new World();
  const a = world.join("甲");
  const b = world.join("乙");
  const id = addComment(a, "这句话要改");
  addComment(b, "这里要补充", 8, 12);

  // 甲把「hello」整个删掉（正文改动一并到乙那边）
  const tr = a.editor.state.tr.delete(1, 6);
  a.editor.view.dispatch(tr);

  const after = (client) => client.view().map(({ id: cid, orphaned }) => [cid, orphaned]);
  assert.deepEqual(after(a), after(b), "两边结算结果一致");
  assert.equal(a.comment(id).orphaned, true);
  assert.equal(b.comment(id).orphaned, true);
  assert.equal(a.comments.filter((c) => c.orphaned).length, 1, "只有被删的那条是孤儿");
  // 孤儿是由正文推出来的：共享里不存，所以不会把一条临时孤儿传给别人。
  const sharedRaw = a.doc.getMap(RICHDOC_REVIEW_COLLAB_FIELD).get(id).toJSON();
  assert.equal("orphaned" in sharedRaw, false);
  assert.equal("orphanedAt" in sharedRaw, false);
  assert.equal(readSharedReview(a.doc).comments.some((c) => c.orphaned), false);
});

test("评论记录先于划线到达（乙先收到记录）：先显示成孤儿，划线到了就恢复，不留残影", () => {
  const world = new World();
  const a = world.join("甲");
  const b = world.join("乙");
  // 手工模拟网络乱序：先把评论记录同步给乙，正文划线稍后到
  const record = commentRecord("late-mark", "划线晚到");
  collab.writeSidecarChange(a.doc, emptyReviewSidecar(), { ...emptyReviewSidecar(), comments: [record] });
  assert.equal(b.comment("late-mark").orphaned, true, "划线还没到：暂时是孤儿");
  // 划线到达
  const tr = a.editor.state.tr.addMark(1, 6, schema.marks.richdocComment.create({ commentId: "late-mark" }));
  a.editor.state = a.editor.state.apply(tr);
  world.applyBody(a, tr);
  assert.equal(b.comment("late-mark").orphaned, false, "划线到了：孤儿标记摘掉");
});

test("首次播种：第一个人载入工程档，把里面的评论灌进共享；后加入的人不重复灌", () => {
  const world = new World();
  const file = {
    review: {
      version: 1,
      trackChangesEnabled: false,
      comments: [commentRecord("c1", "旧评论一"), commentRecord("c2", "旧评论二", { createdAt: "2026-10-06T00:00:01.000Z" })],
    },
  };
  const body = bodyWithAnchors("c1", "c2");
  const a = world.join("甲", { body, manualHydrate: true });
  a.act((api) => api.hydrateFromProject(file));
  assert.equal(readSharedReview(a.doc).seeded, true);
  assert.deepEqual(readSharedReview(a.doc).comments.map((c) => c.id), ["c1", "c2"]);

  // 乙后加入：先同步房间，再载入同一份工程档
  const b = world.join("乙", { body, manualHydrate: true });
  world.flush();
  b.act((api) => api.hydrateFromProject(file));
  // 丙也一样
  const c = world.join("丙", { body, manualHydrate: true });
  world.flush();
  c.act((api) => api.hydrateFromProject(file));
  world.flush();

  for (const client of [a, b, c]) {
    assert.deepEqual(
      client.comments.map((item) => item.id),
      ["c1", "c2"],
      `${client.name} 没有重复评论`,
    );
  }
  assert.equal(a.doc.getMap(RICHDOC_REVIEW_COLLAB_FIELD).size, 2);
  assert.deepEqual(a.view(), b.view());
  assert.deepEqual(a.view(), c.view());
});

test("播种者在 seed 阶段（房间还没到 live）载入工程档，评论照样灌进去；这时用户动作仍是只读", () => {
  const world = new World();
  const file = {
    review: { version: 1, trackChangesEnabled: true, comments: [commentRecord("c1", "旧评论")] },
  };
  const a = world.join("甲", { body: bodyWithAnchors("c1"), manualHydrate: true });
  a.setRoom({ live: false });
  assert.equal(a.api.readOnly, true, "没同步完：用户动作只读");
  a.act((api) => api.hydrateFromProject(file));
  assert.equal(readSharedReview(a.doc).seeded, true);
  assert.deepEqual(readSharedReview(a.doc).comments.map((c) => c.id), ["c1"]);
  assert.equal(readSharedReview(a.doc).trackChangesEnabled, true);
  a.act((api) => api.replyToComment("c1", "seed 阶段不能回复"));
  assert.equal(a.comment("c1").replies.length, 0);
  // 房间只读（viewer）的人载入，不往共享里灌
  const fresh = new World();
  const lone = fresh.join("只读先到", { body: bodyWithAnchors("c1"), manualHydrate: true });
  lone.setRoom({ readOnly: true });
  lone.act((api) => api.hydrateFromProject(file));
  assert.equal(readSharedReview(lone.doc).seeded, false, "只读的人不播种");
  assert.deepEqual(lone.comments.map((c) => c.id), ["c1"], "但自己仍能看到工程档里的批注");
});

test("后加入的人载入的是旧工程档：以共享为准（已解决的不退回、已删除的不复活）", () => {
  const world = new World();
  const file = {
    review: {
      version: 1,
      trackChangesEnabled: false,
      comments: [commentRecord("c1", "留着"), commentRecord("c2", "会被删", { createdAt: "2026-10-06T00:00:01.000Z" })],
    },
  };
  const a = world.join("甲", { body: bodyWithAnchors("c1", "c2"), manualHydrate: true });
  a.act((api) => api.hydrateFromProject(file));
  a.act((api) => api.resolveComment("c1", true));
  a.act((api) => api.removeComment("c2")); // 同时摘掉正文划线

  const b = world.join("乙", { body: bodyWithAnchors("c1", "c2"), manualHydrate: true });
  world.flush();
  // 乙的正文通过协同已经和甲一致（c2 的划线没了）
  b.editor.state = a.editor.state;
  b.bump();
  b.act((api) => api.hydrateFromProject(file));

  assert.deepEqual(b.comments.map((c) => c.id), ["c1"], "已删除的评论没有复活");
  assert.equal(b.comment("c1").resolved, true, "已解决的没有退回");
  assert.deepEqual(a.view(), b.view());
});

test("两个人几乎同时第一次载入：评论按 id 合并，不会出现两份", () => {
  const world = new World();
  const file = {
    review: { version: 1, trackChangesEnabled: false, comments: [commentRecord("c1", "同一条")] },
  };
  const body = bodyWithAnchors("c1");
  const a = world.join("甲", { body, manualHydrate: true });
  const b = world.join("乙", { body, manualHydrate: true });
  world.paused = true;
  a.act((api) => api.hydrateFromProject(file));
  b.act((api) => api.hydrateFromProject(file));
  world.flush();
  assert.equal(a.doc.getMap(RICHDOC_REVIEW_COLLAB_FIELD).size, 1);
  assert.deepEqual(a.comments.map((c) => c.id), ["c1"]);
  assert.deepEqual(b.comments.map((c) => c.id), ["c1"]);
});

test("已有房间导入带批注的文档：划线还在的批注补进共享，别人也看得到", () => {
  const world = new World();
  const a = world.join("甲");
  const b = world.join("乙");
  // 甲导入了一份带批注的文件：正文里有划线，工程档里有记录
  const body = bodyWithAnchors("imp1");
  a.editor.state = EditorState.create({ schema, doc: body });
  b.editor.state = a.editor.state;
  a.bump();
  b.bump();
  a.act((api) =>
    api.hydrateFromProject({
      review: { version: 1, trackChangesEnabled: false, comments: [commentRecord("imp1", "导入的批注")] },
    }),
  );
  assert.equal(a.comment("imp1").body, "导入的批注");
  assert.equal(b.comment("imp1").body, "导入的批注");
});

test("保存：不论谁保存，工程档里都有双方的评论、回复和已解决", () => {
  const world = new World();
  const a = world.join("甲");
  const b = world.join("乙");
  const id = addComment(a, "甲的评论");
  const idB = addComment(b, "乙的评论", 8, 12);
  a.act((api) => api.replyToComment(idB, "甲回复乙"));
  b.act((api) => api.replyToComment(id, "乙回复甲"));
  b.act((api) => api.resolveComment(id, true));

  for (const saver of [a, b]) {
    const saved = readReviewSidecar(JSON.parse(JSON.stringify(projectOf(saver))));
    const byId = new Map(saved.comments.map((item) => [item.id, item]));
    assert.equal(saved.comments.length, 2, `${saver.name} 保存出来的有两条评论`);
    assert.equal(byId.get(id).body, "甲的评论");
    assert.equal(byId.get(id).resolved, true);
    assert.deepEqual(byId.get(id).replies.map((r) => r.body), ["乙回复甲"]);
    assert.equal(byId.get(idB).body, "乙的评论");
    assert.deepEqual(byId.get(idB).replies.map((r) => r.body), ["甲回复乙"]);
  }
});

test("修订开关是这份文档的设置：一个人打开，另一个人那边也开；只读的人切不动", () => {
  const world = new World();
  const a = world.join("甲");
  const b = world.join("乙");
  a.act((api) => api.setTrackChangesEnabled(true));
  assert.equal(b.api.getSidecar().trackChangesEnabled, true);
  assert.equal(b.api.trackChangesEnabled, true);
  assert.equal(a.doc.getMap(RICHDOC_REVIEW_COLLAB_META_FIELD).get("trackChanges"), true);

  b.setRoom({ readOnly: true });
  b.act((api) => api.setTrackChangesEnabled(false));
  assert.equal(a.api.getSidecar().trackChangesEnabled, true, "只读的人关不掉");
  assert.equal(b.api.getSidecar().trackChangesEnabled, true);

  b.setRoom({ readOnly: false });
  b.act((api) => api.setTrackChangesEnabled(false));
  assert.equal(a.api.getSidecar().trackChangesEnabled, false);
});

test("只读的人看得到评论，但不能加、回复、解决、删除，也不能接受或拒绝修订", () => {
  const world = new World();
  const a = world.join("甲");
  const v = world.join("乙（只读）");
  const id = addComment(a, "这里数据要更新");
  v.setRoom({ readOnly: true });
  assert.equal(v.api.readOnly, true);
  assert.ok(v.comment(id), "只读的人能看到评论");

  v.select(8, 12);
  assert.equal(v.act((api) => api.addComment("我想加一条")), "");
  v.act((api) => api.replyToComment(id, "我想回复"));
  v.act((api) => api.resolveComment(id, true));
  v.act((api) => api.removeComment(id));
  v.act((api) => api.acceptAllChanges());
  v.act((api) => api.rejectAllChanges());

  for (const client of [a, v]) {
    assert.equal(client.comments.length, 1, `${client.name} 那边没有多出评论`);
    assert.equal(client.comment(id).replies.length, 0);
    assert.equal(client.comment(id).resolved, false);
  }
  assert.equal(anchors.collectCommentAnchors(v.editor.state.doc).has(id), true, "划线也没被摘");
  assert.equal(readSharedReview(a.doc).comments.length, 1);

  // 恢复可写后又能写了
  v.setRoom({ readOnly: false });
  v.act((api) => api.replyToComment(id, "现在可以回复了"));
  assert.deepEqual(a.comment(id).replies.map((r) => r.body), ["现在可以回复了"]);
});

test("只读与阶段规则：没同步完不能写；房间被拒（不在协同里）时不受限", () => {
  assert.equal(richDocReviewReadOnly({ active: true, live: true, readOnly: false }), false);
  assert.equal(richDocReviewReadOnly({ active: true, live: true, readOnly: true }), true);
  assert.equal(richDocReviewReadOnly({ active: true, live: false, readOnly: false }), true);
  assert.equal(richDocReviewReadOnly({ active: false, live: false, readOnly: true }), false);
});

test("没有房间（单人、离线、房间被拒）：评论只在本地，行为和以前一样", () => {
  const world = new World();
  const solo = world.join("独自");
  solo.setRoom({ active: false, live: false, readOnly: false });
  const id = addComment(solo, "只有我自己");
  assert.ok(id);
  assert.equal(solo.comment(id).body, "只有我自己");
  assert.equal(solo.doc.getMap(RICHDOC_REVIEW_COLLAB_FIELD).size, 0, "没往共享里写任何东西");
  solo.act((api) => api.hydrateFromProject({ review: { version: 1, trackChangesEnabled: true, comments: [commentRecord("f1", "文件里的")] } }));
  assert.deepEqual(solo.comments.map((c) => c.id), ["f1"], "载入工程档原样采用");
  assert.equal(solo.doc.getMap(RICHDOC_REVIEW_COLLAB_FIELD).size, 0);
});

test("远端数据不可信：超长、缺字段、类型不对的记录被削掉或忽略，不抛", () => {
  const doc = new Y.Doc();
  const root = doc.getMap(RICHDOC_REVIEW_COLLAB_FIELD);
  const bad = new Y.Map();
  bad.set("body", "x".repeat(50_000));
  bad.set("resolved", "yes");
  bad.set("replies", "not-a-map");
  root.set("bad", bad);
  root.set("notamap", "string");
  const good = new Y.Map();
  good.set("body", "正常");
  good.set("createdAt", "2026-10-06T00:00:00.000Z");
  root.set("good", good);
  const shared = readSharedReview(doc);
  assert.deepEqual(shared.comments.map((c) => c.id).sort(), ["bad", "good"]);
  assert.equal(shared.comments.find((c) => c.id === "bad").body.length, 20_000);
  assert.equal(shared.comments.find((c) => c.id === "bad").resolved, false);
  assert.deepEqual(shared.comments.find((c) => c.id === "bad").replies, []);
  assert.equal(shared.seeded, false);
});

test("没变化的合并返回同一个引用（React 不用重渲染）", () => {
  const doc = new Y.Doc();
  collab.seedSharedReview(doc, { version: 1, trackChangesEnabled: false, comments: [commentRecord("c1", "一")] });
  const shared = readSharedReview(doc);
  const first = mergeSharedIntoSidecar(emptyReviewSidecar(), shared);
  assert.equal(mergeSharedIntoSidecar(first, shared), first);
});

test("源码：侧栏与工具栏的批注、修订按钮在只读时灰掉；路由只在协同里换成房间里的自己做作者", () => {
  const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
  const rail = read(`${REVIEW_DIR}RichDocCommentRail.tsx`);
  assert.ok((rail.match(/disabled=\{readOnly/g) || []).length >= 8, "侧栏的 8 个动作按钮都按只读灰掉");
  const toolbar = read("../src/shell/doc-editors/RichDocContextToolbar.tsx");
  for (const id of ["add-comment", "toggle-track-changes", "delete-tracked", "accept-all-changes", "reject-all-changes"]) {
    const at = toolbar.indexOf(`id: "richdoc.${id}"`);
    assert.ok(at > 0, id);
    assert.match(toolbar.slice(at, at + 520), /reviewReadOnly/, `${id} 只读时灰掉`);
    assert.match(toolbar, new RegExp(`case "richdoc\\.${id}"[\\s\\S]{0,160}if \\(reviewReadOnly\\) break;`), `${id} 命令入口也拦`);
  }
  const route = read("../src/shell/advanced-routes/RichDocRoute.tsx");
  assert.match(route, /useRichDocReviewCollab\(\{[\s\S]*?review: editor\.review/);
  assert.match(route, /author: String\(collabRoom\.self\.id\)/);
  const copy = read("../src/i18n/ui/messages/collab-docs-copy.ts");
  assert.equal((copy.match(/reviewReadOnly:/g) || []).length, 17, "17 种语言都有只读说明");
});

test("源码：每个会改评论或修订的入口都先查只读；共享字段名与布局固定", () => {
  const hook = readFileSync(new URL(`${REVIEW_DIR}use-richdoc-review.ts`, import.meta.url), "utf8");
  const guarded = hook.match(/readOnlyRef\.current/g) || [];
  assert.ok(guarded.length >= 10, `只读判断出现 ${guarded.length} 次，少于 10 处入口`);
  assert.equal(RICHDOC_REVIEW_COLLAB_FIELD, "oceanleo:richdoc-review");
  assert.equal(RICHDOC_REVIEW_COLLAB_META_FIELD, "oceanleo:richdoc-review-meta");
  // 正文字段不动（F04 的回放读它）
  assert.equal(readFileSync(new URL("../src/shell/collab/adapters/richdoc.ts", import.meta.url), "utf8").includes('"oceanleo:richdoc"'), true);
});
