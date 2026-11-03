import assert from "node:assert/strict";
import test from "node:test";
import { previewPathUrl } from "../src/shell/website-platform/website-preview-model.ts";

const host = "https://p-fixture.ws.oceanleo.app";
const owner = "synthetic-owner.synthetic-signature";

// UC-1, UC-7: protected navigation keeps only the runtime-issued host-bound capability.
test("protected paths retain the runtime assertion and useful path fields", () => {
  const built = new URL(previewPathUrl(`${host}/?__oceanleo_owner=${owner}&base_only=discard`, "/admin?tab=users#details"));
  assert.equal(built.origin, host);
  assert.equal(built.pathname, "/admin");
  assert.equal(built.hash, "#details");
  assert.equal(built.searchParams.get("tab"), "users");
  assert.deepEqual(built.searchParams.getAll("__oceanleo_owner"), [owner]);
  assert.equal(built.searchParams.has("base_only"), false);
  const encoded = new URL(previewPathUrl(`${host}/?__oceanleo_owner=${owner}`, "/admin?q=a%20b+~&literal=%26"));
  assert.ok(encoded.search.startsWith("?q=a%20b+~&literal=%26&__oceanleo_owner="));
});

// UC-1, UC-7: user path input never overrides or duplicates the trusted assertion.
test("path-supplied assertions are replaced including encoded duplicate names", () => {
  const built = new URL(previewPathUrl(`${host}/?__oceanleo_owner=${owner}`,
    "/admin?__oceanleo_owner=foreign&%5f%5foceanleo_owner=second&tab=settings"));
  assert.deepEqual(built.searchParams.getAll("__oceanleo_owner"), [owner]);
  assert.equal(built.searchParams.get("tab"), "settings");
});

// UC-1, UC-7: an unsigned base cannot gain an owner assertion from the path field.
test("an unsigned runtime base drops path-supplied owner assertions", () => {
  const built = new URL(previewPathUrl(host + "/", "/public?__oceanleo_owner=foreign&tab=home"));
  assert.equal(built.searchParams.has("__oceanleo_owner"), false);
  assert.equal(built.searchParams.get("tab"), "home");
});

// UC-1, UC-7: ambiguous runtime assertions and cross-origin/credentialed URLs fail closed.
test("ambiguous bases and foreign path targets cannot receive the assertion", () => {
  for (const base of [`${host}/?__oceanleo_owner=`, `${host}/?__oceanleo_owner=one&__oceanleo_owner=two`,
    "https://oceanleo.app/", "https://oceanleo.com/", "https://user:secret@p-fixture.ws.oceanleo.app/", "http://p-fixture.ws.oceanleo.app/"]) {
    assert.equal(previewPathUrl(base, "/admin"), "");
  }
  for (const path of ["//foreign.example/admin", "/\\foreign.example/admin", "https://foreign.example/admin", "javascript:alert(1)"]) {
    assert.equal(previewPathUrl(`${host}/?__oceanleo_owner=${owner}`, path), "");
  }
});
