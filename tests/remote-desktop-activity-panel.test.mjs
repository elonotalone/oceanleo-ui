import assert from "node:assert/strict";
import test from "node:test";
import { mountStream, act, settle } from "./helpers/remote-desktop-stream-view.mjs";

test("server reconnecting keeps the same session and counts down without new snapshots", async () => {
  const view = await mountStream();
  try {
    await act(async () => {
      view.handlers().activity({ reconnect_remaining_s: 2, idle_confirmation_required: false, idle_remaining_s: null });
      view.handlers().state("reconnecting");
    });
    assert.equal(view.screen().getAttribute("data-remote-reconnecting"), "true");
    assert.match(view.screen().querySelector("[data-remote-reconnecting-notice]").textContent, /剩余 2 秒/);
    await settle(1100);
    assert.match(view.screen().querySelector("[data-remote-reconnecting-notice]").textContent, /剩余 1 秒/);
    await act(async () => {
      view.handlers().activity({ reconnect_remaining_s: null, idle_confirmation_required: false, idle_remaining_s: null });
      view.handlers().state("active");
    });
    assert.equal(view.screen().querySelector("[data-remote-reconnecting-notice]"), null);
    assert.equal(view.log.closes.length, 0);
  } finally { await view.unmount(); }
});

test("idle confirmation is visible, sends a release on the existing session and awaits execution", async () => {
  const view = await mountStream();
  try {
    await act(async () => view.handlers().activity({ reconnect_remaining_s: null, idle_confirmation_required: true, idle_remaining_s: 300 }));
    const prompt = view.screen().querySelector("[data-remote-idle-confirm]");
    assert.match(prompt.textContent, /仍在使用吗？/);
    assert.match(prompt.textContent, /300 秒/);
    await act(async () => prompt.querySelector("button").click());
    assert.deepEqual(view.log.inputs.at(-1), { kind: "release_all" });
    assert.ok(view.screen().querySelector("[data-remote-idle-confirm]"), "send alone is not proof of execution");
    await act(async () => view.handlers().activity({ reconnect_remaining_s: null, idle_confirmation_required: false, idle_remaining_s: null }));
    assert.equal(view.screen().querySelector("[data-remote-idle-confirm]"), null);
    assert.equal(view.log.closes.length, 0);
  } finally { await view.unmount(); }
});

test("closed sessions show the actual link or idle reason", async () => {
  for (const [reason, copy] of [["link_lost", /网络中断太久/], ["idle_confirmed", /未回应仍在使用的提示/]]) {
    const view = await mountStream();
    try {
      await act(async () => view.handlers().state("closed", reason));
      assert.match(view.screen().textContent, copy);
      assert.doesNotMatch(view.screen().textContent, /no activity/);
    } finally { await view.unmount(); }
  }
});
