import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const api = readFileSync(new URL("../src/lib/website-platform-api.ts", import.meta.url), "utf8");

// The one source-level guard allowed by T10 R2: custom domains must stay on
// website_domains_router, never the legacy integrations settings route.
test("website management client does not call the legacy settings domain route", () => {
  assert.doesNotMatch(api, /\/settings\/domains/);
});
