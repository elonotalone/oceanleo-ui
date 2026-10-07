// W03 R4：LeoDev 槽上「去某站处理」必须停在当前槽 origin，不能送到正式站。
import test from "node:test";
import assert from "node:assert/strict";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { isLeoDevPreviewHost } from "../src/lib/auth/config.ts";

const SLOT_HOST = "p-9eb457fcce0b00b75abc9133119f56f8.dev.oceanleo.com";
const SLOT_ORIGIN = `https://${SLOT_HOST}`;
const DESIGN_HOST = "design.oceanleo.com";
const DESIGN_ORIGIN = `https://${DESIGN_HOST}`;

const AUTH_SIGNED_OUT = dataModule(`
export const AUTH_STATE_EVENT = "oceanleo:auth-state";
export function cachedAccessToken() { return null; }
export async function accessToken() { return null; }
`);

const AUTH_CONFIG = dataModule(`
export function isLeoDevPreviewHost(host) {
  const h = String(host || "").trim().toLowerCase().replace(/\\.$/, "").split(":")[0];
  return /^p-[0-9a-f]{32}\\.dev\\.oceanleo\\.com$/.test(h);
}
`);

function familyStub() {
  return dataModule(`
export function currentDomainFamily() { return "com"; }
export function currentDomainProfile() { return { portalOrigin: "https://oceanleo.com" }; }
export function currentFamilySubsiteOrigin(label) { return "https://" + label + ".oceanleo.com"; }
`);
}

async function loadState() {
  return import(
    await compileModule("src/shell/bay/shell/bay-state.ts", {
      "../../../contracts/domain-family": familyStub(),
      "../../../lib/auth/client": AUTH_SIGNED_OUT,
      "../../../lib/auth/config": AUTH_CONFIG,
    })
  );
}

function installLocation(hostname, origin) {
  const previous = globalThis.window;
  globalThis.window = { location: { hostname, host: hostname, origin } };
  return () => {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  };
}

function hrefHost(href) {
  return new URL(href).hostname;
}

function isProductionOceanLeoHost(host) {
  const h = String(host || "").toLowerCase();
  if (h === "oceanleo.com" || h.endsWith(".oceanleo.com")) {
    return !h.endsWith(".dev.oceanleo.com") && h !== "dev.oceanleo.com";
  }
  return false;
}

test("isLeoDevPreviewHost 认槽位宿主，不认正式子站", () => {
  assert.equal(isLeoDevPreviewHost(SLOT_HOST), true);
  assert.equal(isLeoDevPreviewHost(DESIGN_HOST), false);
  assert.equal(isLeoDevPreviewHost("slide.oceanleo.com"), false);
  assert.equal(isLeoDevPreviewHost("p-nothex.dev.oceanleo.com"), false);
  assert.equal(isLeoDevPreviewHost("evil.dev.oceanleo.com"), false);
});

test("LeoDev 槽：bayHrefOnSite 的 host 等于当前槽，不指向正式站", async () => {
  const restore = installLocation(SLOT_HOST, SLOT_ORIGIN);
  try {
    const state = await loadState();
    const href = state.bayHrefOnSite("ppt", { kind: "demand", id: "d9" });
    assert.equal(href, `${SLOT_ORIGIN}/bay?bay=demand:d9`);
    assert.equal(hrefHost(href), SLOT_HOST);
    assert.equal(isProductionOceanLeoHost(hrefHost(href)), false);
    assert.ok(!href.includes("slide.oceanleo.com"));
    assert.ok(!href.includes("https://ppt.oceanleo.com"));
    assert.equal(state.bayHrefOnSite("design", { kind: "demand", id: "d9" }), `${SLOT_ORIGIN}/bay?bay=demand:d9`);
    assert.equal(state.bayHrefOnSite("oceanleo", { kind: "feed" }), `${SLOT_ORIGIN}/bay?bay=feed`);
  } finally {
    restore();
  }
});

test("正式宿主 design.oceanleo.com：仍可指向家族子站", async () => {
  const restore = installLocation(DESIGN_HOST, DESIGN_ORIGIN);
  try {
    const state = await loadState();
    const href = state.bayHrefOnSite("ppt", { kind: "demand", id: "d9" });
    assert.equal(href, "https://slide.oceanleo.com/bay?bay=demand:d9");
    assert.equal(hrefHost(href), "slide.oceanleo.com");
    assert.equal(state.bayHrefOnSite("video", { kind: "order", id: "o1" }), "https://video.oceanleo.com/bay?bay=order:o1");
  } finally {
    restore();
  }
});
