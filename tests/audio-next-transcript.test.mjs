import assert from "node:assert/strict";
import test from "node:test";

import {
  AUDIO_NEXT_PROJECT_SCHEMA,
  inspectAudioProject,
  nextAudioConversionState,
  planAudioLegacyConversion,
} from "../src/shell/media-editors/audio-next-conversion.ts";
import { AUDIO_PROJECT_SCHEMA_ID } from "../src/shell/media-editors/audio-project-carrier.ts";
import {
  cutPlanForSentence,
  sentencesFromAsrStatus,
  submitBailianAsr,
} from "../src/shell/media-editors/audio-transcript.ts";
import { buildAudioReviewProposal } from "../src/shell/media-editors/audio-next-l4-chips.ts";

test("legacy audio-project is readonly until convert, and convert does not rewrite bytes", () => {
  const looked = inspectAudioProject({
    schema: AUDIO_PROJECT_SCHEMA_ID,
    sourceUrl: "https://example.invalid/a.wav",
    operations: [{ type: "effects", speed: 1, lowGainDb: 0, midGainDb: 0, highGainDb: 0 }],
  });
  assert.equal(looked.kind, "legacy");
  assert.ok(looked.differences.length >= 1);
  assert.equal(nextAudioConversionState("readonly", { type: "request" }), "converting");
  assert.equal(nextAudioConversionState("converting", { type: "resolve" }), "converted");
  const planned = planAudioLegacyConversion({
    schema: AUDIO_PROJECT_SCHEMA_ID,
    sourceUrl: "https://example.invalid/a.wav",
    operations: [{ type: "crop", start: 0, end: 1 }],
  });
  assert.equal(planned.ok, true);
  assert.equal(planned.nextSchema, AUDIO_NEXT_PROJECT_SCHEMA);
  assert.ok(planned.dropped.some((row) => row.feature.includes("操作日志")));
  const next = inspectAudioProject({ schema: AUDIO_NEXT_PROJECT_SCHEMA, sourceUrl: "x" });
  assert.equal(next.kind, "next");
});

test("opening does not skip readonly: request is the only path out", () => {
  assert.equal(nextAudioConversionState("readonly", { type: "resolve" }), "readonly");
  assert.equal(nextAudioConversionState("readonly", { type: "reject" }), "readonly");
});

test("bailian transcript sentences drive cut-by-text windows", () => {
  const timed = sentencesFromAsrStatus(
    {
      status: "SUCCEEDED",
      results: [
        {
          text: "你好。世界。",
          sentences: [
            { text: "你好。", begin_time: 0, end_time: 1200 },
            { text: "世界。", begin_time: 1300, end_time: 2500 },
          ],
        },
      ],
    },
    8,
  );
  assert.equal(timed.estimated, false);
  assert.equal(timed.sentences.length, 2);
  assert.equal(timed.sentences[0].endSeconds, 1.2);
  const plan = cutPlanForSentence(timed.sentences[0], 8);
  assert.deepEqual(plan.keep, [{ start: 1.2, end: 8 }]);
});

test("plain transcript without timestamps is estimated by character weight", () => {
  const parsed = sentencesFromAsrStatus(
    { results: [{ text: "甲。乙乙。" }] },
    10,
  );
  assert.equal(parsed.estimated, true);
  assert.equal(parsed.sentences.length, 2);
  assert.ok(parsed.sentences[1].endSeconds > parsed.sentences[0].endSeconds);
  // 「甲。」2 字、「乙乙。」3 字，共 5 字，10 秒 → 4 秒 / 6 秒。
  // 字面量，不走 sentencesFromAsrStatus，也不拿 durationSeconds 当期望（A-105）。
  const first = parsed.sentences[0];
  const second = parsed.sentences[1];
  assert.equal(first.text, "甲。");
  assert.equal(second.text, "乙乙。");
  assert.equal(first.startSeconds, 0);
  assert.equal(
    first.endSeconds,
    4,
    `「甲。」两个字该占 10 秒里的 4 秒；实际切在 ${first.startSeconds}–${first.endSeconds} 秒，短的那句几乎没剪到`,
  );
  assert.equal(second.startSeconds, 4);
  assert.equal(second.endSeconds, 10);
  const lastSpan = second.endSeconds - second.startSeconds;
  assert.equal(
    lastSpan,
    6,
    `「乙乙。」三个字该占 6 秒；实际占了 ${lastSpan} 秒，长的那句吃掉了整段`,
  );
});

test("estimated cuts keep each sentence proportional; the last line cannot swallow leftover", () => {
  // 1 / 3 / 6 字，互不相等（A-103）。等分会是约 3.33 秒一句，按字数是 1 / 3 / 6。
  const parsed = sentencesFromAsrStatus(
    { results: [{ text: "甲\n乙乙乙\n甲乙丙丁戊己" }] },
    10,
  );
  assert.equal(parsed.estimated, true);
  assert.equal(parsed.sentences.length, 3);
  assert.equal(parsed.sentences[0].text, "甲");
  assert.equal(parsed.sentences[1].text, "乙乙乙");
  assert.equal(parsed.sentences[2].text, "甲乙丙丁戊己");
  const one = parsed.sentences[0];
  const three = parsed.sentences[1];
  const six = parsed.sentences[2];
  assert.equal(one.startSeconds, 0);
  assert.equal(
    one.endSeconds,
    1,
    `一字句该占 1 秒；实际 ${one.startSeconds}–${one.endSeconds} 秒，短的那句几乎没剪到`,
  );
  assert.equal(three.startSeconds, 1);
  assert.equal(
    three.endSeconds,
    4,
    `三字句该占 3 秒（1–4）；实际 ${three.startSeconds}–${three.endSeconds} 秒`,
  );
  assert.equal(six.startSeconds, 4);
  const lastSpan = six.endSeconds - six.startSeconds;
  assert.equal(
    lastSpan,
    6,
    `末句六个字该占 6 秒；实际占了 ${lastSpan} 秒，长的那句吃掉了整段`,
  );
  assert.equal(one.endSeconds - one.startSeconds, 1);
  assert.equal(three.endSeconds - three.startSeconds, 3);
  const cutShort = cutPlanForSentence(one, 10);
  assert.ok(cutShort, "按文字剪必须拿得到一字句的窗口");
  assert.deepEqual(
    cutShort.keep,
    [{ start: 1, end: 10 }],
    `删一字句该剪掉 0–1 秒；keep 写成 ${JSON.stringify(cutShort.keep)} 等于短句几乎没剪到`,
  );
});

test("asr submit uses the existing gateway path and never a raw key", () => {
  const calls = [];
  return submitBailianAsr(
    {
      postJson: async (path, body) => {
        calls.push({ path, body });
        return { task_id: "t-1" };
      },
    },
    { siteId: "music", fileUrls: ["https://example.invalid/a.wav"] },
  ).then((result) => {
    assert.equal(result.taskId, "t-1");
    assert.equal(calls[0].path, "/v1/audio/asr");
    assert.equal(calls[0].body.key_mode, "platform");
    assert.deepEqual(calls[0].body.file_urls, ["https://example.invalid/a.wav"]);
  });
});

test("agent cut-by-text only builds a review proposal", () => {
  const proposal = buildAudioReviewProposal({
    proposalId: "p-1",
    commandId: "audio.chip.cut-by-text",
    revision: 3,
    changes: [
      {
        id: "s-0",
        label: "删句",
        before: "0s–1s 保留",
        after: "0s–1s 将删除",
      },
    ],
  });
  assert.ok(proposal);
  assert.equal(proposal.revision, 3);
  assert.equal(proposal.objects.length, 1);
});
