/**
 * UC-3 gate file (kept at this path because oceanleo-security-gate.sh runs it).
 *
 * 2026-10-22 native-editors wave: the hosted editors (slides./docs./audio./3d.
 * on oceanleo.app) are gone. The positive "hosted frame gets allow-same-origin"
 * assertions went with them. What stays is the negative half, which is the part
 * that protects users: no former hosted origin, no injected loopback origin and
 * no UGC domain may ever be trusted as an editor, receive a same-origin
 * sandbox, or be accepted as a postMessage origin.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  isTrustedEditorOrigin,
  isValidEditorTargetOrigin,
} from "../src/shell/editor-protocol.ts";
import {
  UNTRUSTED_FRAME_SANDBOX,
  embedEditorFrameSandbox,
  isTrustedEmbedEditorBase,
  sandboxGrantsScriptedSameOrigin,
} from "../src/shell/editor-sandbox-origin.ts";
import { isAllowedFamilyEmbedOverrideOrigin } from "../src/shell/family-embed-origin.ts";

const FORMER_HOSTED = [
  "https://slides.oceanleo.app",
  "https://docs.oceanleo.app",
  "https://audio.oceanleo.app",
  "https://3d.oceanleo.app",
  "https://game-ide.oceanleo.app",
  "https://flow.oceanleo.app",
  "https://slides.ws.oceanleo.app",
];

test("UC-3: former hosted-editor origins are no longer trusted anywhere", () => {
  for (const origin of FORMER_HOSTED) {
    assert.equal(isTrustedEditorOrigin(origin), false, origin);
    assert.equal(isValidEditorTargetOrigin(origin), false, origin);
    assert.equal(isTrustedEmbedEditorBase(origin), false, origin);
    assert.equal(isAllowedFamilyEmbedOverrideOrigin(origin), false, origin);
  }
});

test("UC-3: former hosted-editor origins get the untrusted sandbox (no scripted same-origin)", () => {
  for (const origin of [...FORMER_HOSTED, "https://slides.oceanleo.app/"]) {
    const sandbox = embedEditorFrameSandbox(origin);
    assert.equal(sandbox, UNTRUSTED_FRAME_SANDBOX, origin);
    assert.equal(sandboxGrantsScriptedSameOrigin(sandbox), false, origin);
  }
});

test("UC-6: injected local-hosted loopback origins are not trusted (feature removed)", () => {
  globalThis.__OCEANLEO_CLIENT_HOST_CONFIG__ = {
    platform: "desktop",
    capabilities: ["local-hosted:slides=http://127.0.0.1:4173"],
  };
  try {
    assert.equal(isTrustedEmbedEditorBase("http://127.0.0.1:4173"), false);
    assert.equal(
      sandboxGrantsScriptedSameOrigin(embedEditorFrameSandbox("http://127.0.0.1:4173")),
      false,
    );
  } finally {
    delete globalThis.__OCEANLEO_CLIENT_HOST_CONFIG__;
  }
});
