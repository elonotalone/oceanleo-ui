import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { remoteDesktopRemainingSeconds, remoteDesktopErrorCopy } from "../src/pages/remote-desktop-input";

describe("remote desktop recovery and idle explanations", () => {
  it("counts down the three minute recovery budget without incoming messages", () => {
    const started = 100_000;
    const deadline = started + 180_000;
    assert.equal(remoteDesktopRemainingSeconds(deadline, started), 180);
    assert.equal(remoteDesktopRemainingSeconds(deadline, started + 179_000), 1);
    assert.equal(remoteDesktopRemainingSeconds(deadline, started + 180_001), 0);
    assert.equal(remoteDesktopRemainingSeconds(null, started), null);
    assert.equal(remoteDesktopRemainingSeconds(Number.NaN, started), null);
  });
  it("rounds a partial second up and reuses a server-supplied shorter budget", () => {
    assert.equal(remoteDesktopRemainingSeconds(10_001, 10_000), 1);
    assert.equal(remoteDesktopRemainingSeconds(12_000, 10_000), 2);
  });
  it("distinguishes lost connection from a confirmed idle session", () => {
    assert.match(remoteDesktopErrorCopy("link_lost"), /网络中断太久/);
    assert.match(remoteDesktopErrorCopy("idle_confirmed"), /未回应仍在使用的提示/);
    assert.notEqual(remoteDesktopErrorCopy("link_lost"), remoteDesktopErrorCopy("idle_confirmed"));
    assert.match(remoteDesktopErrorCopy("viewer_idle"), /心跳中断/);
  });
});
