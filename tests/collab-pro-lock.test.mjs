import assert from "node:assert/strict";
import test from "node:test";

import { attachProModeLock, decideProEntry } from "../src/shell/collab/pro-mode-lock.ts";
import {
  currentPluginMode,
  resetPluginModeCache,
  setPluginMode,
} from "../src/shell/plugin-chrome/plugin-mode-store.ts";

const ME = { id: "me", name: "我", color: "c", avatar_url: null };
const OTHER = { id: "other", name: "小王", color: "c", avatar_url: null };
const tick = () => new Promise((r) => setTimeout(r, 5));

function fakeRoom(over = {}) {
  const subs = new Set();
  const room = {
    role: "editor",
    status: "synced",
    self: ME,
    lock: null,
    acquires: 0,
    releases: 0,
    acquireResult: true,
    async acquireLock() {
      this.acquires += 1;
      if (this.acquireResult) this.lock = { holder: ME, mode: "pro", expires_at: "" };
      return this.acquireResult;
    },
    releaseLock() {
      this.releases += 1;
      if (this.lock?.holder.id === ME.id) this.lock = null;
    },
    subscribe(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    emit() {
      for (const cb of subs) cb();
    },
    ...over,
  };
  return room;
}

test("decideProEntry：没有房间 / 没连上 / 被拒绝 → 放行；viewer → 拦；别人持锁 → 拦并带上是谁", async () => {
  assert.deepEqual(await decideProEntry(null), { ok: true });
  for (const status of ["connecting", "offline", "denied", "disabled"]) {
    assert.deepEqual(await decideProEntry(fakeRoom({ status })), { ok: true }, status);
  }
  assert.deepEqual(await decideProEntry(fakeRoom({ role: "viewer" })), { ok: false, reason: "viewer" });
  const locked = fakeRoom({ acquireResult: false, lock: { holder: OTHER, mode: "pro", expires_at: "" } });
  assert.deepEqual(await decideProEntry(locked), { ok: false, reason: "locked", holder: OTHER });
  const free = fakeRoom();
  assert.deepEqual(await decideProEntry(free), { ok: true });
  assert.equal(free.acquires, 1);
  // 已经是自己持锁：不重复去拿
  assert.deepEqual(await decideProEntry(free), { ok: true });
  assert.equal(free.acquires, 1);
});

test("公共切换点 setPluginMode：拿到锁才进专业模式；退出时释放", async () => {
  resetPluginModeCache();
  const room = fakeRoom();
  const blocked = [];
  const detach = attachProModeLock({ pluginId: "t-lock-a", room, onBlocked: (v) => blocked.push(v) });
  setPluginMode("t-lock-a", "pro");
  assert.equal(currentPluginMode("t-lock-a"), "normal", "拿锁是异步的，拿到之前不切换");
  await tick();
  assert.equal(currentPluginMode("t-lock-a"), "pro");
  assert.equal(room.acquires, 1);
  assert.equal(blocked.length, 0);
  assert.equal(room.lock?.holder.id, "me");
  setPluginMode("t-lock-a", "normal");
  assert.equal(currentPluginMode("t-lock-a"), "normal");
  assert.equal(room.releases >= 1, true);
  assert.equal(room.lock, null);
  detach();
});

test("拿不到锁 → 拦下、模式不变、提示谁在用", async () => {
  resetPluginModeCache();
  const room = fakeRoom({ acquireResult: false, lock: { holder: OTHER, mode: "pro", expires_at: "" } });
  const blocked = [];
  const detach = attachProModeLock({ pluginId: "t-lock-b", room, onBlocked: (v) => blocked.push(v) });
  setPluginMode("t-lock-b", "pro");
  await tick();
  assert.equal(currentPluginMode("t-lock-b"), "normal");
  assert.deepEqual(blocked, [{ ok: false, reason: "locked", holder: OTHER }]);
  detach();
});

test("viewer 进不了专业模式；没挂锁的插件与离开专业模式不受影响", async () => {
  resetPluginModeCache();
  const room = fakeRoom({ role: "viewer" });
  const blocked = [];
  const detach = attachProModeLock({ pluginId: "t-lock-c", room, onBlocked: (v) => blocked.push(v.reason) });
  setPluginMode("t-lock-c", "pro");
  await tick();
  assert.equal(currentPluginMode("t-lock-c"), "normal");
  assert.deepEqual(blocked, ["viewer"]);
  detach();
  // 解除后（组件卸载）同一个插件恢复无把关行为：同步生效
  setPluginMode("t-lock-c", "pro");
  assert.equal(currentPluginMode("t-lock-c"), "pro");
  setPluginMode("t-lock-c", "normal");
  // 另一个从没挂过锁的插件
  setPluginMode("t-lock-d", "pro");
  assert.equal(currentPluginMode("t-lock-d"), "pro");
});

test("打开作品时上次记住的就是专业模式：房间就绪后补拿锁，拿不到退回普通模式", async () => {
  resetPluginModeCache();
  setPluginMode("t-lock-e", "pro"); // 先记住 pro（此时没有把关）
  const room = fakeRoom({ status: "connecting", acquireResult: false, lock: { holder: OTHER, mode: "pro", expires_at: "" } });
  const blocked = [];
  const detach = attachProModeLock({ pluginId: "t-lock-e", room, onBlocked: (v) => blocked.push(v.reason) });
  await tick();
  assert.equal(currentPluginMode("t-lock-e"), "pro", "还没连上：先不动");
  room.status = "synced";
  room.emit();
  await tick();
  await tick();
  assert.equal(currentPluginMode("t-lock-e"), "normal");
  assert.deepEqual(blocked, ["locked"]);
  detach();
});

test("在专业模式里锁被别人拿走 → 退回普通模式", async () => {
  resetPluginModeCache();
  const room = fakeRoom();
  const blocked = [];
  const detach = attachProModeLock({ pluginId: "t-lock-f", room, onBlocked: (v) => blocked.push(v.reason) });
  setPluginMode("t-lock-f", "pro");
  await tick();
  assert.equal(currentPluginMode("t-lock-f"), "pro");
  room.acquireResult = false;
  room.lock = { holder: OTHER, mode: "pro", expires_at: "" };
  room.emit();
  await tick();
  await tick();
  assert.equal(currentPluginMode("t-lock-f"), "normal");
  assert.deepEqual(blocked, ["locked"]);
  detach();
});

test("detach 释放锁并注销把关", async () => {
  resetPluginModeCache();
  const room = fakeRoom();
  const detach = attachProModeLock({ pluginId: "t-lock-g", room, onBlocked() {} });
  setPluginMode("t-lock-g", "pro");
  await tick();
  const before = room.releases;
  detach();
  assert.equal(room.releases, before + 1);
  assert.equal(room.lock, null);
});
