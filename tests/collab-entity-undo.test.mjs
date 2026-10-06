import assert from "node:assert/strict";
import test from "node:test";
import {
  applyStep,
  diffEntityDocs,
  EntityEditSession,
  EntityUndoStack,
} from "../src/shell/video-editor/entity-undo.ts";
import { React, act, loadEntityCollab, makeWorld, mount, settle } from "./collab-media-sim.mjs";

const { useEntityCollab } = await loadEntityCollab();
const h = React.createElement;

const docOf = (entities, order = Object.keys(entities), meta = {}) => ({ order, entities, meta });

// ------------------------------------------------------------------ 纯函数：只撤自己

test("entity-undo：撤销只改回我写过、且现在仍是我写的值；对方改过的跳过", () => {
  const stack = new EntityUndoStack({ coalesceMs: 0 });
  const base = docOf({ a: { x: 1 }, b: { x: 1 } });
  const mine = docOf({ a: { x: 2 }, b: { x: 1 } });
  assert.equal(stack.record(base, mine), true);
  // 对方在这期间把 a 又改成 9，另外加了 c
  const current = docOf({ a: { x: 9 }, b: { x: 1 }, c: { x: 5 } });
  const outcome = stack.undo(current);
  assert.equal(outcome.doc, null, "a 已被对方改过，这一步一个都没生效");
  assert.equal(outcome.skipped, 1);
  assert.equal(stack.canUndo, false);
});

test("entity-undo：对方改了别的实体，撤销只动我的，对方的保留", () => {
  const stack = new EntityUndoStack({ coalesceMs: 0 });
  const base = docOf({ a: { x: 1 }, b: { x: 1 } });
  stack.record(base, docOf({ a: { x: 2 }, b: { x: 1 } }));
  const current = docOf({ a: { x: 2 }, b: { x: 7 } }); // 对方改了 b
  const outcome = stack.undo(current);
  assert.deepEqual(outcome.doc.entities, { a: { x: 1 }, b: { x: 7 } });
  assert.equal(outcome.skipped, 0);
  const redo = stack.redo(outcome.doc);
  assert.deepEqual(redo.doc.entities, { a: { x: 2 }, b: { x: 7 } });
});

test("entity-undo：我删掉的实体撤销时放回原位；对方删掉的实体不会被我救回来", () => {
  const stack = new EntityUndoStack({ coalesceMs: 0 });
  const base = docOf({ a: { x: 1 }, b: { x: 1 }, c: { x: 1 } });
  stack.record(base, docOf({ a: { x: 1 }, c: { x: 1 } })); // 我删了 b
  const outcome = stack.undo(docOf({ a: { x: 1 }, c: { x: 1 } }));
  assert.deepEqual(outcome.doc.order, ["a", "b", "c"]);

  const stack2 = new EntityUndoStack({ coalesceMs: 0 });
  stack2.record(base, docOf({ a: { x: 2 }, b: { x: 1 }, c: { x: 1 } })); // 我改了 a
  const gone = stack2.undo(docOf({ b: { x: 1 }, c: { x: 1 } })); // 对方删了 a
  assert.equal(gone.doc, null);
  assert.equal(gone.skipped, 1);
});

test("entity-undo：400ms 内碰同一批实体的连续改动合成一步", () => {
  let now = 1000;
  const stack = new EntityUndoStack({ coalesceMs: 400, now: () => now });
  const s0 = docOf({ a: { x: 0 } });
  stack.record(s0, docOf({ a: { x: 1 } }));
  now += 100;
  stack.record(docOf({ a: { x: 1 } }), docOf({ a: { x: 2 } }));
  assert.equal(stack.undoDepth, 1);
  const outcome = stack.undo(docOf({ a: { x: 2 } }));
  assert.deepEqual(outcome.doc.entities, { a: { x: 0 } });
  // diff 与 applyStep 可单独用
  const step = diffEntityDocs(s0, docOf({ a: { x: 5 } }), 0);
  assert.equal(applyStep(docOf({ a: { x: 5 } }), step, "undo").applied, 1);
});

test("EntityEditSession：对方的改动只更新基准，不进我的栈", () => {
  const to = (s) => docOf(Object.fromEntries(s.map((i) => [i.id, { v: i.v }])));
  const from = ({ order, entities }) => order.map((id) => ({ id, ...entities[id] }));
  const session = new EntityEditSession({
    toEntities: to,
    fromEntities: from,
    stack: new EntityUndoStack({ coalesceMs: 0 }),
  });
  session.noteKnown([{ id: "a", v: 1 }]);
  session.noteKnown([{ id: "a", v: 1 }, { id: "b", v: 5 }]); // 对方加了 b
  assert.equal(session.stack.undoDepth, 0);
  assert.equal(session.noteLocal([{ id: "a", v: 2 }, { id: "b", v: 5 }]), true);
  assert.equal(session.stack.undoDepth, 1);
  const result = session.undo([{ id: "a", v: 2 }, { id: "b", v: 5 }]);
  assert.deepEqual(result.state, [{ id: "a", v: 1 }, { id: "b", v: 5 }]);
});

// ------------------------------------------------------------------ 两个客户端共享一份文档

/** 一个最小「编辑器」：状态是 {items, title}；记录脏标记、保存次数、选中、播放头、视角。 */
function makeClientEditor(key, world, captured) {
  const toEntities = (state) =>
    docOf(
      Object.fromEntries(state.items.map((item) => [item.id, { v: item.v }])),
      state.items.map((item) => item.id),
      { title: state.title },
    );
  const fromEntities = ({ order, entities, meta }) => ({
    items: order.map((id) => ({ id, ...entities[id] })),
    title: meta.title ?? "",
  });
  function Editor() {
    const [state, setState] = React.useState({ items: [{ id: "a", v: 1 }, { id: "b", v: 1 }], title: "t" });
    const [selected, setSelected] = React.useState("a");
    const [playhead, setPlayhead] = React.useState(1234);
    const [dirty, setDirty] = React.useState(false);
    const [revision, setRevision] = React.useState(0);
    const [nativeUndoDepth, setNativeUndoDepth] = React.useState(0);
    const saves = React.useRef(0);
    const collab = useEntityCollab({
      item: { artifactId: key, title: "x" },
      editorKind: "video",
      rootName: "oceanleo:test",
      toEntities,
      fromEntities,
      local: state,
      historyCoalesceMs: 0,
      applyRemote: (next) => setState(next),
      applyLocal: (next) => {
        setState(next);
        setDirty(true);
        setRevision((value) => value + 1);
      },
    });
    // 自动保存：只在 dirty 且改动版本变了才存。
    const lastSaved = React.useRef(0);
    React.useEffect(() => {
      if (dirty && revision !== lastSaved.current) {
        lastSaved.current = revision;
        saves.current += 1;
      }
    }, [dirty, revision]);
    captured[key] = {
      state,
      selected,
      playhead,
      dirty,
      saves: saves.current,
      collab,
      nativeUndoDepth,
      edit(updater) {
        setState((prev) => updater(prev));
        setDirty(true);
        setRevision((value) => value + 1);
        setNativeUndoDepth((value) => value + 1);
      },
      select: setSelected,
      seek: setPlayhead,
    };
    return null;
  }
  return Editor;
}

async function twoClients() {
  const world = makeWorld();
  const captured = {};
  const A = makeClientEditor("A", world, captured);
  const B = makeClientEditor("B", world, captured);
  const mountedA = await mount(h(A));
  await settle();
  await world.sync();
  const mountedB = await mount(h(B));
  await settle();
  await world.sync();
  return { world, captured, mountedA, mountedB };
}

test("两端共享一份文档：B 的改动不碰 A 的撤销栈、选中、播放头，也不触发 A 保存", async () => {
  const { world, captured, mountedA, mountedB } = await twoClients();
  try {
    // A 先做一步自己的改动
    await act(async () => captured.A.edit((s) => ({ ...s, items: s.items.map((i) => (i.id === "a" ? { ...i, v: 2 } : i)) })));
    await settle();
    await world.sync();
    const before = {
      depth: captured.A.collab.history.undoDepth,
      selected: captured.A.selected,
      playhead: captured.A.playhead,
      saves: captured.A.saves,
    };
    assert.equal(before.depth, 1);
    const savedBefore = world.rooms.A.saved.length;

    // B 改 b
    await act(async () => captured.B.edit((s) => ({ ...s, items: s.items.map((i) => (i.id === "b" ? { ...i, v: 9 } : i)) })));
    await settle();
    await world.sync();

    assert.deepEqual(captured.A.state.items.find((i) => i.id === "b"), { id: "b", v: 9 }, "B 的改动到了 A");
    assert.equal(captured.A.collab.history.undoDepth, before.depth, "A 的撤销栈长度不变");
    assert.equal(captured.A.selected, before.selected);
    assert.equal(captured.A.playhead, before.playhead);
    assert.equal(captured.A.saves, before.saves, "A 没有因为 B 的改动保存");
    assert.equal(world.rooms.A.saved.length, savedBefore);
    assert.equal(captured.A.collab.history.notice, "");
  } finally {
    await mountedA.unmount();
    await mountedB.unmount();
  }
});

test("两端共享一份文档：A 撤销自己的那步，B 的改动保留", async () => {
  const { world, captured, mountedA, mountedB } = await twoClients();
  try {
    await act(async () => captured.A.edit((s) => ({ ...s, items: s.items.map((i) => (i.id === "a" ? { ...i, v: 2 } : i)) })));
    await settle();
    await world.sync();
    await act(async () => captured.B.edit((s) => ({ ...s, items: s.items.map((i) => (i.id === "b" ? { ...i, v: 9 } : i)) })));
    await settle();
    await world.sync();

    await act(async () => captured.A.collab.history.undo());
    await settle();
    await world.sync();
    const items = (client) => Object.fromEntries(captured[client].state.items.map((i) => [i.id, i.v]));
    assert.deepEqual(items("A"), { a: 1, b: 9 }, "A 撤销了自己的改动，B 的 b=9 还在");
    assert.deepEqual(items("B"), { a: 1, b: 9 }, "B 那边也一致");
    assert.equal(captured.A.collab.history.canUndo, false);
    assert.equal(captured.A.collab.history.canRedo, true);

    await act(async () => captured.A.collab.history.redo());
    await settle();
    await world.sync();
    assert.deepEqual(items("B"), { a: 2, b: 9 });
  } finally {
    await mountedA.unmount();
    await mountedB.unmount();
  }
});

test("两端共享一份文档：对方已改过同一个实体，撤销跳过并给提示，两边的改动都在", async () => {
  const { world, captured, mountedA, mountedB } = await twoClients();
  try {
    await act(async () => captured.A.edit((s) => ({ ...s, items: s.items.map((i) => (i.id === "a" ? { ...i, v: 2 } : i)) })));
    await settle();
    await world.sync();
    await act(async () => captured.B.edit((s) => ({ ...s, items: s.items.map((i) => (i.id === "a" ? { ...i, v: 7 } : i)) })));
    await settle();
    await world.sync();
    await act(async () => captured.A.collab.history.undo());
    await settle();
    assert.equal(captured.A.state.items.find((i) => i.id === "a").v, 7, "B 的改动没被撤掉");
    assert.match(captured.A.collab.history.notice, /对方已经改过/);
  } finally {
    await mountedA.unmount();
    await mountedB.unmount();
  }
});

test("只读的一端：不推送、没有可撤销的历史，但仍收到对方的改动", async () => {
  const { world, captured, mountedA, mountedB } = await twoClients();
  try {
    world.readOnly.B = true;
    await act(async () => captured.A.edit((s) => ({ ...s, title: "A改的标题" })));
    await settle();
    await world.sync();
    assert.equal(captured.B.state.title, "A改的标题");
    assert.equal(captured.B.collab.readOnly, true);
    assert.equal(captured.B.collab.history.canUndo, false);
    assert.equal(captured.B.dirty, false);
  } finally {
    await mountedA.unmount();
    await mountedB.unmount();
  }
});
