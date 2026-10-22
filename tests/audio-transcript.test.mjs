import assert from "node:assert/strict";
import test from "node:test";

import {
  cutPlanForSentence,
  keepWindowsAfterCut,
  sentencesFromAsrStatus,
  submitBailianAsr,
} from "../src/shell/media-editors/audio-transcript.ts";

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

test("keepWindowsAfterCut returns the surviving windows and rejects bad ranges", () => {
  assert.deepEqual(keepWindowsAfterCut(10, 2, 4), [
    { start: 0, end: 2 },
    { start: 4, end: 10 },
  ]);
  assert.deepEqual(keepWindowsAfterCut(10, 0, 3), [{ start: 3, end: 10 }]);
  assert.deepEqual(keepWindowsAfterCut(10, 5, 5), []);
  assert.deepEqual(keepWindowsAfterCut(0, 0, 1), []);
});
