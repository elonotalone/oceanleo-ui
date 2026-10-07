import assert from "node:assert/strict";
import test from "node:test";

import {
  displayLocation,
  formatLastActiveLine,
  formatRelativeLastActive,
  iconForBrowser,
  parseDeviceLabel,
} from "../src/pages/settings/account/device-presentation.ts";

test("解析 Chrome · Windows 为浏览器 / 系统 / chrome 图标", () => {
  const parsed = parseDeviceLabel("Chrome · Windows");
  assert.equal(parsed.browser, "Chrome");
  assert.equal(parsed.os, "Windows");
  assert.equal(parsed.icon, "chrome");
  assert.equal(parsed.display, "Chrome · Windows");
});

test("Edge / Firefox / Safari / 空标签落到对应图标，不造系统图标 id", () => {
  assert.equal(parseDeviceLabel("Edge · Windows").icon, "edge");
  assert.equal(parseDeviceLabel("Firefox · macOS").icon, "firefox");
  assert.equal(parseDeviceLabel("Safari · iOS").icon, "safari");
  assert.equal(parseDeviceLabel("").icon, "other");
  assert.equal(iconForBrowser("Chromium"), "chrome");
  assert.equal(iconForBrowser("Microsoft Edge"), "edge");
});

test("6 秒前是 {n} 秒前，不是刚刚", () => {
  const now = Date.parse("2026-10-01T12:00:06.000Z");
  const iso = "2026-10-01T12:00:00.000Z";
  assert.equal(formatRelativeLastActive(iso, now), "6 秒前");
  assert.equal(formatLastActiveLine(iso, now), "上次活动 6 秒前");
  assert.doesNotMatch(formatRelativeLastActive(iso, now), /刚刚/);
  assert.doesNotMatch(formatLastActiveLine(iso, now), /刚刚/);
});

test("满 4 分钟是「上次活动 4 分钟前」，不是 min ago 短写", () => {
  const now = Date.parse("2026-10-01T12:00:00.000Z");
  assert.equal(
    formatLastActiveLine("2026-10-01T11:56:00.000Z", now),
    "上次活动 4 分钟前",
  );
});

test("满 1 分钟走已有 {m} 分钟前；59 秒仍用秒", () => {
  const now = Date.parse("2026-10-01T12:01:00.000Z");
  assert.equal(
    formatRelativeLastActive("2026-10-01T12:00:01.000Z", now),
    "59 秒前",
  );
  assert.equal(
    formatRelativeLastActive("2026-10-01T12:00:00.000Z", now),
    "1 分钟前",
  );
  assert.equal(
    formatRelativeLastActive("2026-10-01T11:56:00.000Z", now),
    "5 分钟前",
  );
});

test("location 为空不编造城市；完整 IP 不当城市", () => {
  assert.equal(displayLocation(""), "");
  assert.equal(displayLocation(undefined), "");
  assert.equal(displayLocation(null), "");
  assert.equal(displayLocation("Singapore"), "Singapore");
  assert.equal(displayLocation("203.0.113.77"), "");
});
