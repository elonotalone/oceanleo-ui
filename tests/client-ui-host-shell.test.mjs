import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { isActivePath } from "../src/client-ui/navigation.ts";
import {
  configureClientHost,
  createMemoryAuthStorage,
  resetClientHostConfigForTests,
} from "../src/client-ui/host-config.ts";
import {
  HOST_LOCATION_EVENT,
  hostAwareActivePath,
  isClientHostConfigured,
  patchHostHistory,
  pushHostLocation,
  readHostLocationPath,
  readShellUserEmail,
  resolveHostSession,
  subscribeHostLocation,
} from "../src/client-ui/web/host-shell-state.ts";

const portalShell = readFileSync(
  "/root/projects/oceanleo/app/_components/clone-shell.tsx",
  "utf8",
);
const appShell = readFileSync(
  new URL("../src/shell/AppShell.tsx", import.meta.url),
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

function installMemoryHistory(pathname = "/") {
  const listeners = new Map();
  let path = pathname;
  const history = {
    pushState(_state, _title, href) {
      path = String(href || path).split("?")[0] || "/";
    },
    replaceState(_state, _title, href) {
      path = String(href || path).split("?")[0] || "/";
    },
  };
  const scope = {
    history,
    location: {
      get pathname() {
        return path;
      },
    },
    addEventListener(type, fn) {
      const group = listeners.get(type) || new Set();
      group.add(fn);
      listeners.set(type, group);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent(event) {
      for (const fn of listeners.get(event.type) || []) fn(event);
      return true;
    },
  };
  globalThis.window = scope;
  return { scope, pathOf: () => path };
}

test.beforeEach(() => {
  resetClientHostConfigForTests();
  delete globalThis.window;
});

test.afterEach(() => {
  resetClientHostConfigForTests();
  delete globalThis.window;
});

test("unconfigured path stays on the Next pathname", () => {
  assert.equal(isClientHostConfigured(), false);
  assert.equal(hostAwareActivePath("/", "/library", false), "/");
  assert.equal(isActivePath("/", "/library"), false);
  assert.equal(isActivePath("/", "/"), true);
});

test("host-configured /library selects 我的库, not 我的任务", () => {
  configureClientHost(hostConfig());
  assert.equal(isClientHostConfigured(), true);
  const live = hostAwareActivePath("/", "/library", true);
  assert.equal(live, "/library");
  assert.equal(isActivePath(live, "/"), false);
  assert.equal(isActivePath(live, "/library"), true);
});

test("silent pushState('/library') notifies host location subscribers", () => {
  installMemoryHistory("/");
  configureClientHost(hostConfig());
  patchHostHistory();
  let ticks = 0;
  const stop = subscribeHostLocation(() => {
    ticks += 1;
  });
  window.history.pushState({}, "", "/library");
  assert.equal(readHostLocationPath(), "/library");
  assert.equal(hostAwareActivePath("/", readHostLocationPath(), true), "/library");
  assert.ok(ticks >= 1, `expected location event, got ${ticks}`);
  stop();
});

test("pushHostLocation is a no-op on the website and writes history in host mode", () => {
  installMemoryHistory("/");
  assert.equal(pushHostLocation("/library"), false);
  assert.equal(readHostLocationPath(), "/");
  configureClientHost(hostConfig());
  const pushed = [];
  assert.equal(
    pushHostLocation("/library", (href) => {
      pushed.push(href);
    }),
    true,
  );
  assert.deepEqual(pushed, ["/library"]);
});

test("readShellUserEmail prefers host session when configured", async () => {
  let fallbackCalls = 0;
  const fallback = async () => {
    fallbackCalls += 1;
    return null;
  };
  assert.equal(await readShellUserEmail(undefined, fallback), null);
  assert.equal(fallbackCalls, 1);
  assert.equal(resolveHostSession({ getUserEmail: async () => "a@b.c" }), null);

  configureClientHost(hostConfig());
  const session = {
    getUserEmail: async () => "elon@oceanleo.com",
    subscribe: () => () => {},
    signOut: async () => {},
  };
  assert.equal(await readShellUserEmail(session, fallback), "elon@oceanleo.com");
  assert.equal(fallbackCalls, 1);
  assert.equal(resolveHostSession(session), session);
});

test("clone-shell wires host location and host session", () => {
  assert.match(portalShell, /useHostAwarePathname/);
  assert.match(portalShell, /pushHostLocation/);
  assert.match(portalShell, /readShellUserEmail\(host\?\.session, getUserEmail\)/);
  assert.match(portalShell, /host\?\.session\?\.subscribe/);
  assert.match(portalShell, /signedIn=\{Boolean\(userEmail\)\}/);
  assert.doesNotMatch(portalShell, /getBootExtensions\s*\(/);
});

test("AppShell uses the same host path and session helpers", () => {
  assert.match(appShell, /useHostAwarePathname/);
  assert.match(appShell, /readShellUserEmail/);
  assert.match(appShell, /resolvedEmail/);
  assert.match(appShell, /signedIn=\{Boolean\(resolvedEmail\)\}/);
});

test("host location event name stays stable", () => {
  assert.equal(HOST_LOCATION_EVENT, "oceanleo:host-location");
});
