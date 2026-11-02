import { describe, it, expect } from "vitest";
import { remoteDesktopRemainingSeconds, remoteDesktopErrorCopy } from "../src/pages/remote-desktop-input";

describe("remote desktop recovery and idle explanations", () => {
  it("counts down the three minute recovery budget without incoming messages", () => {
    const started = 100_000;
    const deadline = started + 180_000;
    expect(remoteDesktopRemainingSeconds(deadline, started)).toBe(180);
    expect(remoteDesktopRemainingSeconds(deadline, started + 179_000)).toBe(1);
    expect(remoteDesktopRemainingSeconds(deadline, started + 180_001)).toBe(0);
    expect(remoteDesktopRemainingSeconds(null, started)).toBeNull();
    expect(remoteDesktopRemainingSeconds(Number.NaN, started)).toBeNull();
  });
  it("rounds a partial second up and reuses a server-supplied shorter budget", () => {
    expect(remoteDesktopRemainingSeconds(10_001, 10_000)).toBe(1);
    expect(remoteDesktopRemainingSeconds(12_000, 10_000)).toBe(2);
  });
  it("distinguishes lost connection from a confirmed idle session", () => {
    expect(remoteDesktopErrorCopy("link_lost")).toContain("网络中断太久");
    expect(remoteDesktopErrorCopy("idle_confirmed")).toContain("未回应仍在使用的提示");
    expect(remoteDesktopErrorCopy("link_lost")).not.toBe(remoteDesktopErrorCopy("idle_confirmed"));
    expect(remoteDesktopErrorCopy("viewer_idle")).toContain("心跳中断");
  });
});
