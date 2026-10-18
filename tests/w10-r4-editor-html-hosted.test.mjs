/**
 * R4: editor.html hosted cores must open a blank local document, never
 * `*.oceanleo.app`, and native/desktop must keep PPTist insert chrome.
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
  hostedEmbedBaseForPlatform,
  hostedKernelChromeHidden,
} from "../src/shell/hosted-local-origin.ts";
import {
  audioHostedEmbedBase,
  resolveAudioHostedFrameSrc,
} from "../src/shell/media-editors/audio-hosted-embed.ts";
import {
  model3dHostedEmbedBase,
  resolveModel3DHostedFrameSrc,
} from "../src/shell/media-editors/model3d-hosted-embed.ts";
import { preferLocalRemoteEditor } from "../src/shell/client-local-editors.ts";
import {
  w10BlankPptistDocument,
  w10BlankUmoDocument,
  w10LocalHostedCapability,
  w10WorkbenchItem,
} from "../src/shell/w10-editor-mounts.ts";

const deckSrc = readFileSync("src/shell/advanced-routes/DeckHostedRoute.tsx", "utf8");
const docsSrc = readFileSync("src/shell/advanced-routes/RichDocHostedRoute.tsx", "utf8");
const INJECTED = "http://127.0.0.1:47831";

function hostConfig(overrides = {}) {
  return {
    family: "com",
    portalOrigin: "https://oceanleo.com",
    gatewayOrigin: "https://api.dev.oceanleo.com",
    identityOrigin: "https://auth.oceanleo.com",
    identityAnonKey: "dev-local-anon-placeholder",
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

test("w10WorkbenchItem supplies inline blank deck/umo so ArtifactRendition is not a missing URL", () => {
  const deck = w10WorkbenchItem("deck");
  const umo = w10WorkbenchItem("umo-hosted");
  assert.equal(deck.url, undefined);
  assert.equal(deck.meta.blank, true);
  assert.equal(deck.meta.slides.format, "pptist.slides.v2");
  assert.ok(Array.isArray(deck.meta.slides.slides));
  assert.equal(umo.meta.blank, true);
  assert.equal(umo.meta.project.format, "umo.tiptap.v1");
  assert.match(String(w10BlankPptistDocument("x").title), /x/);
  assert.equal(w10BlankUmoDocument("y").title, "y");
});

test("desktop editor.html slot does not fall back to docs/slides/audio/3d.oceanleo.app", () => {
  configureClientHost(hostConfig());
  assert.equal(preferLocalRemoteEditor("deck", { platform: "desktop" }), true);
  assert.equal(
    hostedEmbedBaseForPlatform("slides", "https://slides.oceanleo.app", {
      platform: "desktop",
    }),
    "",
  );
  assert.equal(
    hostedEmbedBaseForPlatform("docs", "https://docs.oceanleo.app", {
      platform: "desktop",
    }),
    "",
  );
  assert.equal(audioHostedEmbedBase(), "");
  assert.equal(model3dHostedEmbedBase(), "");
  assert.equal(
    resolveAudioHostedFrameSrc({
      src: "",
      instanceId: "audio-1",
      hostOrigin: "http://127.0.0.1:9",
      title: "本地音频",
    }),
    "",
  );
  assert.equal(
    resolveModel3DHostedFrameSrc({
      src: "",
      instanceId: "mesh-1",
      hostOrigin: "http://127.0.0.1:9",
      title: "本地三维",
    }),
    "",
  );
});

test("injected local-hosted origins fill audio/3d frame src when wrapHostedFrame passes empty", () => {
  configureClientHost(
    hostConfig({
      capabilities: [
        "native-shell",
        w10LocalHostedCapability("audio", INJECTED),
        w10LocalHostedCapability("3d", "http://127.0.0.1:47834"),
      ],
    }),
  );
  assert.equal(audioHostedEmbedBase(), INJECTED);
  const audioSrc = resolveAudioHostedFrameSrc({
    src: "",
    instanceId: "audio-1",
    hostOrigin: "https://oceanleo.com",
    title: "本地音频",
  });
  assert.match(audioSrc, /^http:\/\/127\.0\.0\.1:47831\//);
  assert.match(audioSrc, /embed=1/);
  assert.doesNotMatch(audioSrc, /audio\.oceanleo\.app/);
  const modelSrc = resolveModel3DHostedFrameSrc({
    src: "",
    instanceId: "mesh-1",
    hostOrigin: "https://oceanleo.com",
    title: "本地三维",
  });
  assert.match(modelSrc, /^http:\/\/127\.0\.0\.1:47834\//);
  assert.doesNotMatch(modelSrc, /3d\.oceanleo\.app/);
});

test("Deck/Umo routes read host-config slot and keep website embed params", () => {
  assert.match(deckSrc, /clientHostedEmbedContext/);
  assert.match(deckSrc, /hostedEmbedBaseForPlatform/);
  assert.match(deckSrc, /hostedKernelChromeHidden/);
  assert.match(deckSrc, /toHostedDocument\(/);
  assert.match(docsSrc, /clientHostedEmbedContext/);
  assert.match(docsSrc, /UMO_DOC_FORMAT/);
  assert.equal(hostedKernelChromeHidden("normal", "web"), true);
  assert.equal(hostedKernelChromeHidden("normal", "desktop"), false);
});
