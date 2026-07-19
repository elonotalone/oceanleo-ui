import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  applyAudioSampleOperation,
  isAudioEditOperation,
} from "../src/shell/media-editors/audio-operations.ts";

function block(values, sampleRate = 20) {
  return {
    sampleRate,
    channels: [Float32Array.from(values)],
  };
}

function clone(source) {
  return {
    sampleRate: source.sampleRate,
    channels: source.channels.map((channel) => Float32Array.from(channel)),
  };
}

function rounded(source) {
  return [...source.channels[0]].map(
    (value) => Math.round(value * 1_000_000) / 1_000_000,
  );
}

test("Audio actions are icon controls while host owns export and history", async () => {
  const [route, view, toolbar, workbench] = await Promise.all([
    readFile(resolve("src/shell/advanced-routes/AudioRoute.tsx"), "utf8"),
    readFile(
      resolve("src/shell/media-editors/AudioWorkbenchView.tsx"),
      "utf8",
    ),
    readFile(
      resolve("src/shell/media-editors/AudioContextToolbar.tsx"),
      "utf8",
    ),
    readFile(
      resolve("src/shell/media-editors/AudioWorkbench.tsx"),
      "utf8",
    ),
  ]);
  assert.match(view, /AudioIconButton/);
  assert.match(view, /aria-label=\{label\}/);
  assert.match(toolbar, /iconOnly:\s*true/g);
  assert.match(toolbar, /id:\s*"crop"[\s\S]*icon:\s*"crop"/);
  assert.match(toolbar, /id:\s*"delete"[\s\S]*icon:\s*"delete"/);
  assert.match(route, /history:\s*\{[\s\S]*undo:\s*editor\.undo/);
  assert.match(route, /directDownload:[\s\S]*onTrigger:\s*editor\.download/);
  assert.match(route, /capture:\s*editor\.captureRecovery/);
  assert.match(route, /restore:\s*editor\.restoreRecovery/);
  assert.match(workbench, /encodeWav\(source\)/);
  assert.match(workbench, /type:\s*"effects"[\s\S]*speed:\s*effectSpeed/);
  assert.match(view, /试听速度/);
});

test("crop, fade, gain and speed survive undo, recovery replay and export state", () => {
  const original = block(
    Array.from({ length: 40 }, (_, index) =>
      Math.sin((2 * Math.PI * index) / 13),
    ),
  );
  const operations = [
    { type: "crop", start: 0.2, end: 1.8 },
    { type: "fade", edge: "in", duration: 0.25 },
    { type: "gain", multiplier: 0.5 },
    {
      type: "effects",
      start: 0.25,
      end: 1.25,
      speed: 1.5,
      lowGainDb: 0,
      midGainDb: 0,
      highGainDb: 0,
    },
  ];
  operations.forEach((operation) =>
    assert.equal(isAudioEditOperation(operation), true),
  );

  const undo = [];
  let rendered = clone(original);
  for (const operation of operations) {
    undo.push(clone(rendered));
    rendered = applyAudioSampleOperation(rendered, operation);
  }
  assert.ok(rendered.channels[0].length < original.channels[0].length);
  assert.ok(rendered.channels[0].every(Number.isFinite));

  const beforeSpeed = undo.pop();
  assert.ok(beforeSpeed);
  const redo = applyAudioSampleOperation(beforeSpeed, operations.at(-1));
  assert.deepEqual(rounded(redo), rounded(rendered));

  const recovery = JSON.parse(
    JSON.stringify({
      sourceUrl: "https://cdn.example/source.wav",
      operations,
    }),
  );
  let reopened = clone(original);
  for (const operation of recovery.operations) {
    reopened = applyAudioSampleOperation(reopened, operation);
  }
  assert.deepEqual(rounded(reopened), rounded(rendered));
});
