import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  configureClientHost,
  createMemoryAuthStorage,
  getHostNavItems,
  resetClientHostConfigForTests,
} from "../src/client-ui/host-config.ts";

const portalShell = readFileSync(
  "/root/projects/oceanleo/app/_components/clone-shell.tsx",
  "utf8",
);

function hostConfig(overrides = {}) {
  return {
    family: "com",
    portalOrigin: "https://oceanleo.com",
    gatewayOrigin: "https://api.dev.oceanleo.com",
    identityOrigin: "https://auth.oceanleo.com",
    identityAnonKey: "host-anon-key",
    authStorage: createMemoryAuthStorage(),
    locale: "zh",
    platform: "desktop",
    capabilities: ["native-shell"],
    ...overrides,
  };
}

test.beforeEach(() => {
  resetClientHostConfigForTests();
});

test.afterEach(() => {
  resetClientHostConfigForTests();
});

test("unconfigured host nav is empty (website sidebar unchanged)", () => {
  resetClientHostConfigForTests();
  assert.equal(getHostNavItems(), getHostNavItems());
  assert.deepEqual(getHostNavItems(), []);
});

test("injected navItems are the sidebar source clone-shell reads", () => {
  configureClientHost(
    hostConfig({
      navItems: [
        { href: "/native/files", label: "Files", section: "primary", icon: "folder" },
        { href: "/native/security", label: "Security", section: "footer" },
      ],
    }),
  );
  assert.deepEqual(getHostNavItems(), [
    { href: "/native/files", label: "Files", section: "primary", icon: "folder" },
    { href: "/native/security", label: "Security", section: "footer" },
  ]);
});

test("omitting navItems on a later configure keeps the previous rows", () => {
  configureClientHost(
    hostConfig({
      navItems: [{ href: "/native/files", label: "Files", section: "primary" }],
    }),
  );
  configureClientHost(hostConfig({ family: "cn" }));
  assert.deepEqual(getHostNavItems(), [
    { href: "/native/files", label: "Files", section: "primary" },
  ]);
});

test("explicit empty navItems clears the sidebar slot", () => {
  configureClientHost(
    hostConfig({
      navItems: [{ href: "/native/files", label: "Files", section: "primary" }],
    }),
  );
  configureClientHost(hostConfig({ navItems: [] }));
  assert.deepEqual(getHostNavItems(), []);
});

test("nav hrefs reject schemes, protocol-relative, and blank labels", () => {
  configureClientHost(
    hostConfig({
      navItems: [
        { href: "javascript:alert(1)", label: "x", section: "primary" },
        { href: "//evil.example", label: "x", section: "primary" },
        { href: "/javascript:alert(1)", label: "x", section: "primary" },
        { href: "https://oceanleo.com/library", label: "x", section: "primary" },
        { href: "/", label: "home", section: "primary" },
        { href: "/ok", label: "  ", section: "primary" },
        { href: "/native/files", label: "Files", section: "primary" },
        { href: "/native/files", label: "Dup", section: "footer" },
      ],
    }),
  );
  assert.deepEqual(getHostNavItems(), [
    { href: "/native/files", label: "Files", section: "primary" },
  ]);
});

test("clone-shell reads getHostNavItems, not getBootExtensions", () => {
  assert.match(portalShell, /getHostNavItems/);
  assert.match(portalShell, /onClientHostConfigChange/);
  assert.match(portalShell, /useHostAwarePathname/);
  assert.match(portalShell, /data-oceanleo-host-nav/);
  assert.match(portalShell, /useHostNavItems/);
  assert.doesNotMatch(portalShell, /getBootExtensions\s*\(/);
  assert.doesNotMatch(portalShell, /from ["'][^"']*client-web/);
  assert.doesNotMatch(portalShell, /from ["'][^"']*boot-store/);
  assert.doesNotMatch(
    portalShell,
    /href:\s*["']\/native\//,
    "website chrome must not hardcode desktop panel paths",
  );
});
