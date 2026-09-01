// 插件文档存储契约（`src/shell/plugin-store/`）的自测。
//
// 这一层要替掉的是「把文档存住」的八条路。所以这份文件盯的不是某个 adapter 的写法，
// 而是三个每件插件都问过、过去每件插件答案都不一样的问题：
//   1. 存没存住 —— 写完能不能原样读回来；
//   2. 撞版本了怎么办 —— 冲突是一等公民，不许混进泛化的 write failed，
//      更不许被外层装饰器降级成 failed（降级一次就等于允许覆盖别人的修改）；
//   3. 崩了还在不在 —— 缓存与草稿两层安全网各自要在什么时刻生效、什么时刻清掉。
// 外加一条：capabilities 是 store 的自述，自述与实际能力对不上比没有自述更糟——
// 插件会照着一个不存在的能力画界面。
//
// IndexedDB 与 localStorage 都用替身：契约测试不碰真浏览器存储。
import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const {
  PluginStoreError,
  asPluginStoreError,
  blobDocument,
  createHostDocStore,
  createMemoryStore,
  isPluginStoreError,
  normalizePluginDocument,
  pluginStoreCacheKey,
  treeDocument,
  withLocalCache,
  withRecovery,
} = await import(
  await compileModule("src/shell/plugin-store/index.ts", {
    // 真实现是 IndexedDB（oceanleo-advanced-recovery/drafts）。这里换成同形状的
    // 内存替身，好让「崩在哪一步」变成可点名复现的一行断言。
    "../../advanced-recovery-store": dataModule(`
      const state = {
        records: new Map(),
        failWrite: null,
        failRead: null,
        failDelete: null,
      };
      globalThis.__pluginStoreRecoveryDouble = state;
      export async function writeAdvancedRecovery(record) {
        if (state.failWrite) throw state.failWrite;
        state.records.set(record.key, { ...record });
      }
      export async function readAdvancedRecovery(key) {
        if (state.failRead) throw state.failRead;
        return state.records.get(key) ?? null;
      }
      export async function deleteAdvancedRecovery(key) {
        if (state.failDelete) throw state.failDelete;
        state.records.delete(key);
      }
    `),
  })
);

const recoveryDouble = globalThis.__pluginStoreRecoveryDouble;

test.beforeEach(() => {
  recoveryDouble.records.clear();
  recoveryDouble.failWrite = null;
  recoveryDouble.failRead = null;
  recoveryDouble.failDelete = null;
});

/** window.localStorage 的最小替身。 */
function fakeStorage() {
  const entries = new Map();
  return {
    entries,
    getItem: (key) => (entries.has(key) ? entries.get(key) : null),
    setItem: (key, value) => {
      entries.set(key, String(value));
    },
    removeItem: (key) => {
      entries.delete(key);
    },
  };
}

/** 陈列馆那条「路径 + 字符串」的哑通道的替身。 */
function fakeDocHost({ watchable = true } = {}) {
  const listeners = new Set();
  const state = { content: "", writes: [], logs: [] };
  const host = {
    async readDoc() {
      return state.content;
    },
    async writeDoc(path, content) {
      state.content = content;
      state.writes.push({ path, content });
    },
    log: (message) => state.logs.push(message),
  };
  if (watchable) {
    host.watchDoc = (_path, onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    };
  }
  state.pushExternal = (content) => {
    state.content = content;
    for (const listener of [...listeners]) listener();
  };
  return { host, state };
}

// ============================================================================
// 1. 两个 adapter 跑同一张用例表
// ----------------------------------------------------------------------------
// 抄两份的下场是：改了 memory-store 的行为，host-doc-store 那份没人跟着改，
// 「同一个契约」当场分叉成两个。所以下面这五条是表驱动的，加一个 adapter
// 就在表里加一行，断言一个字都不用抄。
// ============================================================================

const STORE_TABLE = [
  {
    name: "内存 store",
    make() {
      const store = createMemoryStore();
      return {
        store,
        external: (content) =>
          store.poke(blobDocument(content, { revisionId: "别人的版本" })),
      };
    },
  },
  {
    name: "宿主 doc 通道",
    make() {
      const { host, state } = fakeDocHost();
      return {
        store: createHostDocStore({ host, path: "剧本.md" }),
        external: (content) => state.pushExternal(content),
      };
    },
  },
  {
    name: "宿主 doc 通道（宿主没给 watchDoc）",
    make() {
      const { host, state } = fakeDocHost({ watchable: false });
      return {
        store: createHostDocStore({ host, path: "剧本.md" }),
        external: (content) => state.pushExternal(content),
      };
    },
  },
];

for (const entry of STORE_TABLE) {
  test(`${entry.name}：写进去的字节能原样读回来`, async () => {
    const { store } = entry.make();
    const receipt = await store.write(blobDocument("第一章"), {
      reason: "manual-save",
    });
    assert.ok(receipt.savedAt > 0, "回执没有落盘时刻，界面说不出「几点存的」");
    const doc = await store.read();
    assert.equal(doc.kind, "blob");
    assert.equal(doc.content, "第一章");
  });

  test(`${entry.name}：capabilities.watch 说什么，watch() 就得做到什么`, () => {
    const { store, external } = entry.make();
    let ticks = 0;
    const stop = store.watch(() => {
      ticks += 1;
    });
    // 退订函数是接口的一部分：拿不到函数，插件卸载时就没法收手。
    assert.equal(typeof stop, "function");
    external("外面改了");
    if (store.capabilities.watch) {
      assert.equal(ticks, 1);
      stop();
      external("外面又改了");
      assert.equal(ticks, 1, "退订之后还在收，卸载的组件会被接着 setState");
    } else {
      assert.equal(ticks, 0, "自述没有 watch 却真的回调了，自述就是假的");
      stop();
      stop();
    }
  });

  test(`${entry.name}：capabilities.cas 说什么，expectedRevision 就按什么处理`, async () => {
    const { store } = entry.make();
    await store.write(blobDocument("底稿"), { reason: "manual-save" });
    const base = await store.read();
    if (store.capabilities.cas) {
      await store.write(blobDocument("跟上基线的修改"), {
        reason: "autosave",
        expectedRevision: base.revisionId,
      });
      assert.equal((await store.read()).content, "跟上基线的修改");
      return;
    }
    // 静默忽略 expectedRevision 等于把「乐观锁生效了」的假象交给插件，
    // 那么真撞车的时候就是一次无声的覆盖。
    await assert.rejects(
      store.write(blobDocument("以为有乐观锁的修改"), {
        reason: "autosave",
        expectedRevision: "r-1",
      }),
      (error) => {
        assert.ok(isPluginStoreError(error));
        assert.equal(error.disposition, "unavailable");
        assert.equal(error.expectedRevision, "r-1");
        return true;
      },
    );
    assert.equal((await store.read()).content, "底稿");
  });

  test(`${entry.name}：capabilities.revisions 说什么，回执里就有没有版本号`, async () => {
    const { store } = entry.make();
    const receipt = await store.write(blobDocument("正文"), {
      reason: "manual-save",
    });
    if (store.capabilities.revisions) {
      assert.ok(receipt.revisionId);
      assert.equal((await store.read()).revisionId, receipt.revisionId);
      return;
    }
    assert.equal(
      receipt.revisionId,
      undefined,
      "没有版本历史却发版本号，插件会照着画一个点不开的历史按钮",
    );
  });

  test(`${entry.name}：capabilities.multiFile 说什么，多文件树就收不收`, async () => {
    const { store } = entry.make();
    const tree = treeDocument([
      { path: "index.html", content: "<h1>你好</h1>" },
    ]);
    if (store.capabilities.multiFile) {
      await store.write(tree, { reason: "manual-save" });
      const doc = await store.read();
      assert.equal(doc.kind, "tree");
      assert.deepEqual(
        doc.files.map((file) => file.path),
        ["index.html"],
      );
      return;
    }
    await assert.rejects(
      store.write(tree, { reason: "manual-save" }),
      (error) => {
        assert.equal(error.disposition, "unavailable");
        return true;
      },
    );
  });
}

// ============================================================================
// 2. 冲突是一等公民
// ============================================================================

test("基线过期时抛 conflict，并把两边的版本都摆出来", async () => {
  const store = createMemoryStore({ initial: blobDocument("初稿") });
  const mine = await store.write(blobDocument("我读到的版本"), {
    reason: "manual-save",
  });
  store.poke(blobDocument("别人后来写的", { revisionId: "别人的版本" }));

  await assert.rejects(
    store.write(blobDocument("基于旧基线的修改"), {
      reason: "autosave",
      expectedRevision: mine.revisionId,
    }),
    (error) => {
      assert.ok(isPluginStoreError(error));
      // 冲突和网络 500 长成一个样的时候，插件只会一起当「保存失败」重放，
      // 于是别人的修改被自己这份旧字节盖掉——这正是 disposition 存在的理由。
      assert.equal(error.disposition, "conflict");
      // 少一个字段，UI 就只能说「保存失败」，说不出「你的基线是哪一版、现在是哪一版」。
      assert.equal(error.expectedRevision, mine.revisionId);
      assert.equal(error.actualRevision, "别人的版本");
      return true;
    },
  );
  assert.equal(
    store.peek().content,
    "别人后来写的",
    "都判冲突了还是把字节写了进去",
  );
});

test("自述没有 cas 的 store 收到 expectedRevision 必须拒绝，不许假装校验过", async () => {
  const store = createMemoryStore({
    initial: blobDocument("初稿", { revisionId: "mem-1" }),
    capabilities: { cas: false },
  });
  await assert.rejects(
    store.write(blobDocument("以为有乐观锁的修改"), {
      reason: "autosave",
      expectedRevision: "mem-1",
    }),
    (error) => {
      assert.equal(error.disposition, "unavailable");
      assert.equal(error.expectedRevision, "mem-1");
      return true;
    },
  );
  assert.equal(store.peek().content, "初稿");
});

// ============================================================================
// 3. 脏数据不许走到编辑器模型里
// ============================================================================

test("形状对不上的存档一律当成「没有草稿」，不许 as 回来", () => {
  const dirty = [
    ["null", null],
    ["undefined", undefined],
    ["一个数组", [{ kind: "blob", content: "正文" }]],
    ["还没解析的 JSON 字符串", '{"kind":"blob","content":"正文"}'],
    ["缺 kind", { content: "正文" }],
    ["不认识的 kind", { kind: "document", content: "正文" }],
    ["blob 的 content 不是字符串", { kind: "blob", content: { text: "正文" } }],
    ["tree 的 files 不是数组", { kind: "tree", files: "index.html" }],
    ["tree 的条目缺 path", { kind: "tree", files: [{ content: "1" }] }],
    ["tree 的 path 是空串", { kind: "tree", files: [{ path: "", content: "1" }] }],
    [
      "tree 的 content 不是字符串",
      { kind: "tree", files: [{ path: "a.js", content: 1 }] },
    ],
    ["上个 schema 的形状", { version: 1, text: "正文", files: [] }],
  ];
  for (const [what, value] of dirty) {
    assert.equal(
      normalizePluginDocument(value),
      null,
      `${what} 被当成了一份合法文档，它会一路走到编辑器模型里`,
    );
  }
});

test("干净的存档原样过关，顺手把认不出的字段丢掉", () => {
  assert.deepEqual(
    normalizePluginDocument({
      kind: "blob",
      content: "正文",
      mediaType: "text/markdown",
      revisionId: "rev-3",
      updatedAt: 1_700_000_000_000,
      // 上个 schema 留下的残渣，不该带进新模型。
      legacyCursor: { line: 3 },
    }),
    {
      kind: "blob",
      content: "正文",
      mediaType: "text/markdown",
      revisionId: "rev-3",
      updatedAt: 1_700_000_000_000,
    },
  );
  assert.deepEqual(
    normalizePluginDocument({
      kind: "tree",
      files: [{ path: "index.html", content: "<h1>你好</h1>" }],
      revisionId: 7,
      updatedAt: Number.NaN,
    }),
    {
      kind: "tree",
      files: [{ path: "index.html", content: "<h1>你好</h1>" }],
    },
  );
});

// ============================================================================
// 4. withLocalCache：后端不在也能把编辑器打开
// ============================================================================

test("后端读不出来时用缓存把编辑器打开，并说出这是「仅本地」", async () => {
  const storage = fakeStorage();
  const served = [];
  const inner = createMemoryStore({ initial: blobDocument("线上内容") });
  const store = withLocalCache(inner, {
    namespace: "image-draft",
    key: "asset-1",
    storage,
    onServedFromCache: (info) => served.push(info),
  });

  assert.equal((await store.read()).content, "线上内容");

  inner.failNext(new PluginStoreError("unavailable", "陈列馆这会儿不在"));
  const fallback = await store.read();
  assert.equal(fallback.content, "线上内容");
  // 不说出口，插件就会把降级态显示成 clean，用户以为已经存到云上了。
  assert.equal(served.length, 1);
  assert.equal(served[0].error.disposition, "unavailable");
  assert.ok(served[0].savedAt > 0);
});

test("后端回来之后写穿透到后端，缓存跟着更新到落盘后的版本", async () => {
  const storage = fakeStorage();
  const inner = createMemoryStore({ initial: blobDocument("线上内容") });
  const store = withLocalCache(inner, {
    namespace: "image-draft",
    key: "asset-1",
    storage,
  });
  await store.read();

  const receipt = await store.write(blobDocument("离线时改的内容"), {
    reason: "manual-save",
  });
  assert.equal(inner.peek().content, "离线时改的内容");
  assert.equal(store.peekCache().content, "离线时改的内容");
  // 缓存里留着落盘前的版本号，下次带着它做 CAS 会凭空撞出一个冲突。
  assert.equal(store.peekCache().revisionId, receipt.revisionId);
});

test("缓存 key 由 pluginStoreCacheKey 产出，不同插件、不同文档互不串台", async () => {
  const storage = fakeStorage();
  const build = (namespace, key, content) =>
    withLocalCache(createMemoryStore({ initial: blobDocument(content) }), {
      namespace,
      key,
      storage,
    });
  const image = build("image-draft", "asset-1", "图片编辑器的内容");
  const design = build("design-canvas", "asset-1", "设计画布的内容");
  const another = build("image-draft", "asset-2", "另一张图的内容");

  assert.equal(image.cacheKey, pluginStoreCacheKey("image-draft", "asset-1"));
  assert.equal(
    new Set([image.cacheKey, design.cacheKey, another.cacheKey]).size,
    3,
    "两份不同的文档共用一个缓存键，降级时会读到别人的内容",
  );

  await Promise.all([image.read(), design.read(), another.read()]);
  assert.equal(image.peekCache().content, "图片编辑器的内容");
  assert.equal(design.peekCache().content, "设计画布的内容");
  assert.equal(another.peekCache().content, "另一张图的内容");
});

test("缓存里躺着上个版本写的字节时，当作没有缓存", async () => {
  const storage = fakeStorage();
  const inner = createMemoryStore({ initial: blobDocument("线上内容") });
  const store = withLocalCache(inner, {
    namespace: "image-draft",
    key: "asset-1",
    storage,
  });
  storage.setItem(
    store.cacheKey,
    JSON.stringify({
      schema: "oceanleo.plugin-store-cache.v0",
      savedAt: 1,
      doc: { kind: "blob", content: "上个 schema 写的内容" },
    }),
  );
  assert.equal(store.peekCache(), null);

  inner.failNext(new PluginStoreError("unavailable", "陈列馆这会儿不在"));
  // 没有可信缓存时不许静默给一份空文档：那会把用户的正文当成「本来就是空的」。
  await assert.rejects(store.read(), (error) => {
    assert.equal(error.disposition, "unavailable");
    return true;
  });
});

// ============================================================================
// 5. withRecovery：崩在去抖窗口里也不丢
// ============================================================================

test("写失败之后草稿还在，用户下次进来能把它捞回来", async () => {
  const inner = createMemoryStore({ initial: blobDocument("已落盘的内容") });
  const store = withRecovery(inner, {
    editorId: "image",
    recoveryKey: "image:asset-1",
  });

  inner.failNext(new PluginStoreError("failed", "网络断了"));
  await assert.rejects(
    store.write(blobDocument("没保住的修改"), {
      reason: "autosave",
      expectedRevision: "mem-1",
    }),
  );

  const draft = await store.readRecoveredDraft();
  assert.ok(draft, "写失败了草稿也没了，那这层安全网等于不存在");
  assert.equal(draft.doc.content, "没保住的修改");
  assert.equal(draft.reason, "autosave");
  assert.equal(draft.baseRevision, "mem-1");
  // 恢复是要用户点头的动作：read() 仍然给后端内容，草稿得显式取。
  assert.equal((await store.read()).content, "已落盘的内容");
});

test("成功落盘之后草稿被清掉，旧草稿不许永远盖住新内容", async () => {
  const inner = createMemoryStore({ initial: blobDocument("已落盘的内容") });
  const store = withRecovery(inner, {
    editorId: "image",
    recoveryKey: "image:asset-1",
  });

  inner.failNext(new PluginStoreError("failed", "网络断了"));
  await assert.rejects(
    store.write(blobDocument("第一次没保住"), { reason: "autosave" }),
  );
  assert.ok(await store.readRecoveredDraft());

  await store.write(blobDocument("这次保住了"), { reason: "manual-save" });
  assert.equal(
    await store.readRecoveredDraft(),
    null,
    "存成功了草稿还在，下次开文档会拿一份更旧的内容问用户要不要恢复",
  );
  assert.equal(inner.peek().content, "这次保住了");
});

test("还没到 write 的键入级改动也镜像下来，去抖窗口里崩掉不算白改", async () => {
  const inner = createMemoryStore({ initial: blobDocument("已落盘的内容") });
  const store = withRecovery(inner, {
    editorId: "image",
    recoveryKey: "image:asset-1",
  });

  await store.noteDirty(blobDocument("刚敲了两个字"));
  const draft = await store.readRecoveredDraft();
  assert.equal(draft.doc.content, "刚敲了两个字");
  // 镜像只碰草稿层，不许顺手往后端写一次。
  assert.equal(inner.peek().content, "已落盘的内容");
});

test("草稿层自己坏了只上报，不许把正片的保存一起带走", async () => {
  const inner = createMemoryStore({ initial: blobDocument("已落盘的内容") });
  const reported = [];
  const store = withRecovery(inner, {
    editorId: "image",
    recoveryKey: "image:asset-1",
    onRecoveryError: (error, phase) => reported.push(phase),
  });

  recoveryDouble.failWrite = new Error("IndexedDB 被隐私模式挡了");
  const receipt = await store.write(blobDocument("照样要存住"), {
    reason: "manual-save",
  });
  assert.ok(receipt.savedAt > 0);
  assert.equal(inner.peek().content, "照样要存住");
  assert.deepEqual(reported, ["mirror"]);
});

// ============================================================================
// 6. 装饰器不许把内层的判定降级
// ============================================================================

test("已经是 PluginStoreError 的原样透传，不重新包一层", () => {
  const conflict = new PluginStoreError("conflict", "别人先改了", {
    expectedRevision: "mem-1",
    actualRevision: "mem-2",
  });
  const passed = asPluginStoreError(conflict, "failed", "写入失败");
  // 重新包一层就会把 conflict 变成 failed，两个版本号也一起丢掉。
  assert.equal(passed, conflict);
  assert.equal(passed.disposition, "conflict");
  assert.equal(passed.expectedRevision, "mem-1");
  assert.equal(passed.actualRevision, "mem-2");

  const wrapped = asPluginStoreError(new Error("连不上"), "failed", "写入失败");
  assert.ok(isPluginStoreError(wrapped));
  assert.equal(wrapped.disposition, "failed");
  assert.match(wrapped.message, /写入失败/);
  assert.match(wrapped.message, /连不上/);
});

test("缓存与恢复叠在外面之后，内层判定的 conflict 仍然是 conflict", async () => {
  const inner = createMemoryStore({ initial: blobDocument("初稿") });
  const mine = await inner.write(blobDocument("我读到的版本"), {
    reason: "manual-save",
  });
  inner.poke(blobDocument("别人后来写的", { revisionId: "别人的版本" }));

  const store = withLocalCache(
    withRecovery(inner, {
      editorId: "richdoc",
      recoveryKey: "richdoc:asset-1",
    }),
    { namespace: "richdoc", key: "asset-1", storage: fakeStorage() },
  );

  await assert.rejects(
    store.write(blobDocument("基于旧基线的修改"), {
      reason: "autosave",
      expectedRevision: mine.revisionId,
    }),
    (error) => {
      // 降级成 failed 的代价很具体：AdvancedPersistenceController 会退避重试，
      // 把这份旧字节再送一次，正好覆盖掉别人的修改。
      assert.equal(error.disposition, "conflict");
      assert.equal(error.expectedRevision, mine.revisionId);
      assert.equal(error.actualRevision, "别人的版本");
      return true;
    },
  );
});
