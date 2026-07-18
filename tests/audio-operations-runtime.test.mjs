import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAudioSampleOperation,
  isAudioEditOperation,
} from "../src/shell/media-editors/audio-operations.ts";
import {
  MAX_AUDIO_PROJECT_OPERATIONS,
  prepareCheckpointedAudioMutation,
  validAudioOperationProject,
} from "../src/shell/media-editors/audio-checkpoint.mjs";

function block(values, sampleRate = 10) {
  return {
    sampleRate,
    channels: [Float32Array.from(values)],
  };
}

function rounded(values) {
  return [...values].map((value) => Math.round(value * 1_000_000) / 1_000_000);
}

function validAudioProject(value) {
  return validAudioOperationProject(value, isAudioEditOperation);
}

function cloneBlock(source) {
  return {
    sampleRate: source.sampleRate,
    channels: source.channels.map((channel) => Float32Array.from(channel)),
  };
}

function checkpointBlock(source) {
  return {
    sampleRate: source.sampleRate,
    channels: source.channels.map((channel) =>
      Float32Array.from(channel, (sample) => {
        const clamped = Math.max(-1, Math.min(1, sample));
        const pcm = Math.trunc(clamped * (clamped < 0 ? 0x8000 : 0x7fff));
        return pcm / 0x8000;
      }),
    ),
  };
}

function combinedOperation(index) {
  if (index % 3 === 0) {
    return {
      type: "gain",
      start: 0.01,
      end: 0.19,
      multiplier: index % 2 === 0 ? 1.001 : 0.999,
    };
  }
  if (index % 3 === 1) {
    return {
      type: "fade",
      edge: index % 2 === 0 ? "in" : "out",
      duration: 0.01,
      start: 0.02,
      end: 0.18,
    };
  }
  return {
    type: "effects",
    start: 0.03,
    end: 0.17,
    speed: 1,
    lowGainDb: 0.1,
    midGainDb: -0.1,
    highGainDb: 0.05,
  };
}

function assertSameBlock(actual, expected) {
  assert.equal(actual.sampleRate, expected.sampleRate);
  assert.equal(actual.channels.length, expected.channels.length);
  actual.channels.forEach((channel, index) => {
    assert.deepEqual(rounded(channel), rounded(expected.channels[index]));
  });
}

test("region gain changes selected samples only", () => {
  const operation = {
    type: "gain",
    start: 0.2,
    end: 0.6,
    multiplier: 2,
  };
  const result = applyAudioSampleOperation(
    block([1, 1, 1, 1, 1, 1, 1, 1]),
    operation,
  );
  assert.deepEqual(rounded(result.channels[0]), [1, 1, 2, 2, 2, 2, 1, 1]);
  assert.equal(isAudioEditOperation(operation), true);
});

test("region fades anchor their envelope to selection edges", () => {
  const source = block([1, 1, 1, 1, 1, 1, 1, 1]);
  const fadeIn = applyAudioSampleOperation(source, {
    type: "fade",
    edge: "in",
    duration: 0.3,
    start: 0.2,
    end: 0.6,
  });
  const fadeOut = applyAudioSampleOperation(source, {
    type: "fade",
    edge: "out",
    duration: 0.3,
    start: 0.2,
    end: 0.6,
  });
  assert.deepEqual(rounded(fadeIn.channels[0]), [1, 1, 0, 0.5, 1, 1, 1, 1]);
  assert.deepEqual(rounded(fadeOut.channels[0]), [1, 1, 1, 1, 0.5, 0, 1, 1]);
});

test("composable speed and EQ chain replaces one region and preserves its neighbors", () => {
  const source = block([0, 1, 2, 3, 4, 5, 6, 7], 10);
  const operation = {
    type: "effects",
    start: 0.2,
    end: 0.6,
    speed: 2,
    lowGainDb: 0,
    midGainDb: 0,
    highGainDb: 0,
  };
  const result = applyAudioSampleOperation(source, operation);
  assert.equal(result.channels[0].length, 6);
  assert.deepEqual(rounded(result.channels[0]), [0, 1, 2, 4, 6, 7]);

  const reopenedOperation = JSON.parse(JSON.stringify(operation));
  assert.equal(isAudioEditOperation(reopenedOperation), true);
  assert.deepEqual(
    rounded(applyAudioSampleOperation(source, reopenedOperation).channels[0]),
    rounded(result.channels[0]),
  );
});

test("three-band EQ produces finite output inside the selected region only", () => {
  const sampleRate = 48_000;
  const values = Array.from({ length: 4_800 }, (_, index) => {
    const time = index / sampleRate;
    return (
      0.2 * Math.sin(2 * Math.PI * 100 * time) +
      0.2 * Math.sin(2 * Math.PI * 1_000 * time) +
      0.2 * Math.sin(2 * Math.PI * 8_000 * time)
    );
  });
  const source = block(values, sampleRate);
  const result = applyAudioSampleOperation(source, {
    type: "effects",
    start: 0.02,
    end: 0.08,
    speed: 1,
    lowGainDb: 12,
    midGainDb: -9,
    highGainDb: 6,
  });
  const first = Math.floor(0.02 * sampleRate);
  const last = Math.ceil(0.08 * sampleRate);
  assert.deepEqual(
    rounded(result.channels[0].subarray(0, first)),
    rounded(source.channels[0].subarray(0, first)),
  );
  assert.deepEqual(
    rounded(result.channels[0].subarray(last)),
    rounded(source.channels[0].subarray(last)),
  );
  assert.ok(
    result.channels[0]
      .subarray(first, last)
      .every((sample) => Number.isFinite(sample)),
  );
  assert.notDeepEqual(
    rounded(result.channels[0].subarray(first, first + 100)),
    rounded(source.channels[0].subarray(first, first + 100)),
  );
});

test("invalid effect chains are rejected before mutating samples", () => {
  assert.equal(
    isAudioEditOperation({
      type: "effects",
      start: 0,
      end: 1,
      speed: 0,
      lowGainDb: 0,
      midGainDb: 0,
      highGainDb: 0,
    }),
    false,
  );
  assert.throws(
    () =>
      applyAudioSampleOperation(block([1, 2]), {
        type: "gain",
        multiplier: Number.NaN,
      }),
    /参数无效/,
  );
});

test("501 mixed gain/fade/effects mutations checkpoint, save, and reopen without loss", async () => {
  const initial = block(
    Array.from(
      { length: 200 },
      (_, index) => 0.3 * Math.sin((2 * Math.PI * index) / 37),
    ),
    1_000,
  );
  const assets = new Map([["audio://initial", cloneBlock(initial)]]);
  let source = cloneBlock(initial);
  let sourceUrl = "audio://initial";
  let operations = [];
  let applied = 0;
  let checkpointCount = 0;

  for (let index = 0; index < 501; index += 1) {
    const result = await prepareCheckpointedAudioMutation({
      source,
      sourceUrl,
      operations,
      operation: combinedOperation(index),
      isOperation: isAudioEditOperation,
      createCheckpoint: async (rendered) => {
        checkpointCount += 1;
        const canonical = checkpointBlock(rendered);
        const url = `audio://checkpoint-${checkpointCount}`;
        assets.set(url, cloneBlock(canonical));
        return { sourceUrl: url, source: canonical };
      },
      applyOperation: (current, operation) => {
        applied += 1;
        return applyAudioSampleOperation(current, operation);
      },
    });
    assert.equal(result.ok, true);
    source = result.source;
    sourceUrl = result.sourceUrl;
    operations = result.operations;
  }

  assert.equal(applied, 501);
  assert.equal(checkpointCount, 1);
  assert.equal(sourceUrl, "audio://checkpoint-1");
  assert.equal(operations.length, 1);
  const project = { sourceUrl, operations };
  assert.equal(validAudioProject(project), true);

  const saved = JSON.parse(JSON.stringify({
    schema: "oceanleo.audio.v1",
    version: 1,
    data: project,
  }));
  assert.equal(validAudioProject(saved.data), true);
  let reopened = cloneBlock(assets.get(saved.data.sourceUrl));
  for (const operation of saved.data.operations) {
    reopened = applyAudioSampleOperation(reopened, operation);
  }
  assertSameBlock(reopened, source);
  assert.ok(source.channels[0].every(Number.isFinite));
});

test("the 501st mutation is rejected atomically when checkpoint upload fails", async () => {
  const initial = block(
    Array.from({ length: 200 }, (_, index) => (index % 17) / 20 - 0.4),
    1_000,
  );
  const operations = Array.from(
    { length: MAX_AUDIO_PROJECT_OPERATIONS },
    (_, index) => combinedOperation(index),
  );
  let rendered = cloneBlock(initial);
  for (const operation of operations) {
    rendered = applyAudioSampleOperation(rendered, operation);
  }
  const originalJournal = JSON.stringify(operations);
  let pendingApplyCount = 0;

  const result = await prepareCheckpointedAudioMutation({
    source: rendered,
    sourceUrl: "audio://initial",
    operations,
    operation: combinedOperation(MAX_AUDIO_PROJECT_OPERATIONS),
    isOperation: isAudioEditOperation,
    createCheckpoint: async () => {
      throw new Error("network unavailable");
    },
    applyOperation: (current, operation) => {
      pendingApplyCount += 1;
      return applyAudioSampleOperation(current, operation);
    },
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /500 次.*本次编辑未应用.*原状态仍可保存/);
  assert.equal(pendingApplyCount, 0);
  assert.equal(JSON.stringify(operations), originalJournal);
  const recoverableProject = {
    sourceUrl: "audio://initial",
    operations: JSON.parse(originalJournal),
  };
  assert.equal(validAudioProject(recoverableProject), true);
  assert.equal(
    validAudioProject({
      sourceUrl: "audio://initial",
      operations: [...recoverableProject.operations, combinedOperation(500)],
    }),
    false,
  );
  assert.equal(
    validAudioProject({
      sourceUrl: "audio://initial",
      operations: new Array(1),
    }),
    false,
  );
  let reopened = cloneBlock(initial);
  for (const operation of recoverableProject.operations) {
    reopened = applyAudioSampleOperation(reopened, operation);
  }
  assertSameBlock(reopened, rendered);
});
