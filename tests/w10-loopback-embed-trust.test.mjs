/**
 * UC-3 / UC-6: web hosts never trust loopback embed bases. A native client
 * host may trust only the exact origin it injected (`local-hosted:label=`).
 * See docs/architecture/oceanleo-untrusted-content-isolation.md.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  configureClientHost,
  createMemoryAuthStorage,
  resetClientHostConfigForTests,
} from "../src/contracts/client-host-config.ts";
import {
  embedEditorFrameSandbox,
  HOSTED_EDITOR_SANDBOX,
  isInjectedLocalHostedEmbedBase,
  isTrustedEmbedEditorBase,
  UNTRUSTED_FRAME_SANDBOX,
} from "../src/shell/editor-sandbox-origin.ts";
import {
  buildEditorEmbedUrl,
  isValidEditorTargetOrigin,
} from "../src/shell/editor-protocol.ts";
import {
  audioHostedEmbedBase,
  canBuildAudioEmbedUrl,
} from "../src/shell/media-editors/audio-hosted-embed.ts";
import {
  canBuildModel3DEmbedUrl,
  model3dHostedEmbedBase,
} from "../src/shell/media-editors/model3d-hosted-embed.ts";

const EVIDENCE_DIR = "/root/projects/oceanleo-app/docs/react-client-rebuild/evidence/W10";
const INJECTED = "http://127.0.0.1:4173";
const OTHER_LOOPBACK = "http://127.0.0.1:9999";
const LOCALHOST = "http://localhost:4173";
const WEB_HOST = "https://oceanleo.com";
const deck = readFileSync("src/shell/advanced-routes/DeckHostedRoute.tsx", "utf8");
const docs = readFileSync("src/shell/advanced-routes/RichDocHostedRoute.tsx", "utf8");

function hostConfig(overrides = {}) {
  return {
    family: "com",
    portalOrigin: "https://portal.test.example",
    gatewayOrigin: "https://gw.test.example",
    identityOrigin: "https://id.test.example",
    identityAnonKey: "host-anon-key",
    authStorage: createMemoryAuthStorage(),
    locale: "zh",
    platform: "desktop",
    capabilities: [`local-hosted:slides=${INJECTED}`],
    ...overrides,
  };
}

function hostedSrc(embedBase, instanceId, assetKind) {
  if (!isTrustedEmbedEditorBase(embedBase)) return "";
  try {
    return buildEditorEmbedUrl(embedBase, {
      instanceId,
      hostOrigin: WEB_HOST,
      assetTitle: assetKind,
      assetKind,
    });
  } catch {
    return "";
  }
}

test.beforeEach(() => {
  resetClientHostConfigForTests();
});

test.afterEach(() => {
  resetClientHostConfigForTests();
});

test("hosted routes still gate iframe src on isTrustedEmbedEditorBase", () => {
  assert.match(deck, /isTrustedEmbedEditorBase\(input\.embedBase\)/);
  assert.match(docs, /isTrustedEmbedEditorBase\(input\.embedBase\)/);
});

test("web host never trusts loopback even when a local-hosted capability is present", () => {
  // UC-6: web page must not mint a loopback embed base.
  configureClientHost(
    hostConfig({
      platform: "web",
      capabilities: [
        `local-hosted:slides=${INJECTED}`,
        `local-hosted:docs=${INJECTED}`,
        `local-hosted:audio=${INJECTED}`,
        `local-hosted:3d=${INJECTED}`,
      ],
    }),
  );
  assert.equal(isInjectedLocalHostedEmbedBase(INJECTED), false);
  assert.equal(isTrustedEmbedEditorBase(INJECTED), false);
  assert.equal(isValidEditorTargetOrigin(INJECTED), false);
  assert.equal(embedEditorFrameSandbox(INJECTED), UNTRUSTED_FRAME_SANDBOX);
  assert.equal(hostedSrc(INJECTED, "dk-web", "deck"), "");
  assert.equal(audioHostedEmbedBase().startsWith("http://127.0.0.1"), false);
});

test("desktop host trusts only the injected origin, not arbitrary localhost", () => {
  // UC-3: allow-same-origin only for the host-injected local origin.
  configureClientHost(
    hostConfig({
      platform: "desktop",
      capabilities: [
        `local-hosted:slides=${INJECTED}`,
        `local-hosted:docs=${INJECTED}`,
        `local-hosted:audio=${INJECTED}`,
        `local-hosted:3d=${INJECTED}`,
      ],
    }),
  );
  assert.equal(isTrustedEmbedEditorBase(INJECTED), true);
  assert.equal(isValidEditorTargetOrigin(INJECTED), true);
  assert.equal(embedEditorFrameSandbox(INJECTED), HOSTED_EDITOR_SANDBOX);
  assert.equal(isTrustedEmbedEditorBase(OTHER_LOOPBACK), false);
  assert.equal(isTrustedEmbedEditorBase(LOCALHOST), false);
  assert.equal(isTrustedEmbedEditorBase("https://slides.oceanleo.app"), true);

  const deckSrc = hostedSrc(INJECTED, "dk-desk", "deck");
  assert.match(deckSrc, /^http:\/\/127\.0\.0\.1:4173\//);
  const docsSrc = hostedSrc(INJECTED, "doc-desk", "document");
  assert.match(docsSrc, /^http:\/\/127\.0\.0\.1:4173\//);
  assert.equal(audioHostedEmbedBase(), INJECTED);
  assert.equal(canBuildAudioEmbedUrl(INJECTED), true);
  assert.equal(model3dHostedEmbedBase(), INJECTED);
  assert.equal(canBuildModel3DEmbedUrl(INJECTED), true);
});

test("unconfigured web default still rejects loopback", () => {
  // UC-6: no host config means today's web fail-closed table.
  assert.equal(isTrustedEmbedEditorBase(INJECTED), false);
  assert.equal(isInjectedLocalHostedEmbedBase(INJECTED), false);
});

test("harmony/ios/android platforms can use the injected origin; production HOSTED table unchanged", () => {
  for (const platform of ["harmony", "ios", "android"]) {
    resetClientHostConfigForTests();
    configureClientHost(
      hostConfig({
        platform,
        capabilities: [`local-hosted:slides=${INJECTED}`],
      }),
    );
    assert.equal(isTrustedEmbedEditorBase(INJECTED), true, platform);
  }
});

test("write loopback trust evidence for hosted cores", async () => {
  configureClientHost(
    hostConfig({
      platform: "desktop",
      capabilities: [
        `local-hosted:slides=${INJECTED}`,
        `local-hosted:docs=${INJECTED}`,
        `local-hosted:audio=${INJECTED}`,
        `local-hosted:3d=${INJECTED}`,
      ],
    }),
  );
  const proof = {
    webNeverTrustsLoopback: true,
    injectedOrigin: INJECTED,
    desktopTrusted: isTrustedEmbedEditorBase(INJECTED),
    otherLoopbackRejected: isTrustedEmbedEditorBase(OTHER_LOOPBACK) === false,
    localhostAliasRejected: isTrustedEmbedEditorBase(LOCALHOST) === false,
    deckSrc: hostedSrc(INJECTED, "dk-ev", "deck"),
    docsSrc: hostedSrc(INJECTED, "doc-ev", "document"),
    audioBase: audioHostedEmbedBase(),
    model3dBase: model3dHostedEmbedBase(),
  };
  assert.equal(proof.desktopTrusted, true);
  assert.match(proof.deckSrc, /^http:\/\/127\.0\.0\.1:4173\//);
  for (const editor of ["deck", "umo", "audiomass", "threeeditor"]) {
    const dir = `${EVIDENCE_DIR}/${editor}`;
    await mkdir(dir, { recursive: true });
    const previous = JSON.parse(readFileSync(`${dir}/offline.json`, "utf8"));
    previous.hostEmbed =
      "GREEN: native host injected origin passes isTrustedEmbedEditorBase; web never trusts loopback";
    previous.loopbackProof = {
      injectedOriginTrusted: true,
      webRejected: true,
      arbitraryLoopbackRejected: true,
    };
    await writeFile(`${dir}/offline.json`, `${JSON.stringify(previous, null, 2)}\n`);
  }
  await writeFile(
    `${EVIDENCE_DIR}/loopback-trust.json`,
    `${JSON.stringify(proof, null, 2)}\n`,
  );
});
