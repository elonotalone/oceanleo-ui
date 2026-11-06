import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panels = readFileSync(new URL("../src/shell/website-platform/WebsiteManagementPanels.tsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../src/shell/website-platform/WebsiteDashboard.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../src/lib/website-platform-api.ts", import.meta.url), "utf8");

test("website dashboard exposes the four management panels", () => {
  for (const id of ["website-management-domain", "website-management-login", "website-management-users", "website-management-statistics"]) {
    assert.match(panels, new RegExp(`data-testid=\\"${id}\\"`));
  }
  assert.match(dashboard, /<WebsiteManagementPanels projectId=/);
});

test("management API uses the existing website domain, auth users, and analytics routes", () => {
  assert.match(api, /\/v1\/website-projects\/\$\{segment\(projectId\)\}\/domains/);
  assert.match(api, /\/database\/auth\/users/);
  assert.match(api, /\/analytics\/summary/);
  assert.doesNotMatch(api, /domains`[^\n]*settings\/domains/);
});

test("domain panel displays DNS records returned by the existing hosting route", () => {
  assert.match(panels, /dns_records/);
  assert.match(panels, /CNAME.*TXT/);
  assert.match(panels, /pending_dns|verification_status/);
});
