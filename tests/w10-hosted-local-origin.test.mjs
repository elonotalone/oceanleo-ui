/**
 * UC-6: local hosted origins are loopback http(s) only. They are never
 * `*`, never `oceanleo.app`, and never a family production origin. See
 * docs/architecture/oceanleo-untrusted-content-isolation.md.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  configureClientHost,
  createMemoryAuthStorage,
  resetClientHostConfigForTests,
} from "../src/contracts/client-host-config.ts";
import {
  clientHostedEmbedContext,
  hostedEmbedBaseForPlatform,
  hostedKernelChromeHidden,
  readLocalHostedOrigin,
} from "../src/shell/hosted-local-origin.ts";

const deck = readFileSync("src/shell/advanced-routes/DeckHostedRoute.tsx", "utf8");
const docs = readFileSync("src/shell/advanced-routes/RichDocHostedRoute.tsx", "utf8");

test("local hosted origin is opt-in, exact origin, loopback http(s) only", () => {
  // UC-6: capability injection cannot mint a production or UGC origin.
  assert.equal(readLocalHostedOrigin("slides"), "");
  assert.equal(
    readLocalHostedOrigin("slides", ["local-hosted:slides=http://127.0.0.1:4173"]),
    "http://127.0.0.1:4173",
  );
  assert.equal(
    readLocalHostedOrigin("docs", ["local-hosted:docs=https://evil.example/docs"]),
    "",
  );
  assert.equal(
    readLocalHostedOrigin("slides", ["local-hosted:slides=http://127.0.0.1:4173/app"]),
    "",
  );
  assert.equal(
    readLocalHostedOrigin("slides", ["local-hosted:slides=https://slides.oceanleo.app"]),
    "",
  );
  assert.equal(
    readLocalHostedOrigin("docs", ["local-hosted:docs=https://docs.oceanleo.com"]),
    "",
  );
});

test("hosted routes still default to hostedEditorOrigin and can take a local override", () => {
  // UC-6: web default still posts to the family hosted origin.
  assert.match(deck, /hostedEditorOrigin\("slides"\)/);
  assert.match(deck, /hostedEmbedBaseForPlatform/);
  assert.match(docs, /richDocHostedEmbedBase/);
  assert.match(docs, /hostedEmbedBaseForPlatform/);
});

test("editor.html host context merges injected capabilities over empty React host caps", () => {
  resetClientHostConfigForTests();
  configureClientHost({
    family: "com",
    portalOrigin: "https://oceanleo.com",
    gatewayOrigin: "https://api.dev.oceanleo.com",
    identityOrigin: "https://auth.oceanleo.com",
    identityAnonKey: "dev-local-anon-placeholder",
    authStorage: createMemoryAuthStorage(),
    locale: "zh",
    platform: "desktop",
    capabilities: ["native-shell", "local-hosted:docs=http://127.0.0.1:4173"],
  });
  const ctx = clientHostedEmbedContext({
    environment: { platform: "web", capabilities: [] },
  });
  assert.equal(ctx.platform, "desktop");
  assert.equal(ctx.capabilities.includes("local-hosted:docs=http://127.0.0.1:4173"), true);
  resetClientHostConfigForTests();
});

test("native hosts never fall back to family origins; web keeps family", () => {
  const family = "https://slides.oceanleo.app";
  const local = ["local-hosted:slides=http://127.0.0.1:4173"];
  assert.equal(
    hostedEmbedBaseForPlatform("slides", family, { platform: "web" }),
    family,
  );
  assert.equal(
    hostedEmbedBaseForPlatform("slides", family, {
      platform: "desktop",
      capabilities: local,
    }),
    "http://127.0.0.1:4173",
  );
  assert.equal(
    hostedEmbedBaseForPlatform("slides", family, { platform: "desktop" }),
    "",
  );
  assert.equal(hostedKernelChromeHidden("normal", "web"), true);
  assert.equal(hostedKernelChromeHidden("normal", "desktop"), false);
  assert.equal(hostedKernelChromeHidden("pro", "web"), false);
});
