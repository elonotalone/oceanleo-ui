// PDF 专业页：worker 拿不到绝对 wasm 地址时会永远停在
// 「Initializing plugins...」。这里钉两件事——相对路径必须收成绝对 URL；
// 初始化超时必须变成报错态，不许继续转圈。

import assert from "node:assert/strict";
import test from "node:test";

import {
  PDFIUM_INIT_TIMEOUT_MS,
  PDFIUM_UPSTREAM_DEFAULT_WASM_URL,
  absolutizePdfiumWasmUrl,
  isVendorCdnUrl,
  pdfiumInitTimeoutMessage,
  pdfiumInitWatch,
} from "../src/shell/media-editors/pdf-next-runtime.ts";

test("根相对 wasm 地址对 blob worker 必须收成绝对 URL", () => {
  assert.equal(
    absolutizePdfiumWasmUrl(
      "/_next/static/media/pdfium.0at9nb296pr2h.wasm",
      "https://p-example.dev.oceanleo.com",
    ),
    "https://p-example.dev.oceanleo.com/_next/static/media/pdfium.0at9nb296pr2h.wasm",
  );
  assert.equal(
    absolutizePdfiumWasmUrl(
      "https://oceanleo.com/static/pdfium.wasm",
      "https://p-example.dev.oceanleo.com",
    ),
    "https://oceanleo.com/static/pdfium.wasm",
  );
  assert.equal(absolutizePdfiumWasmUrl("/static/pdfium.wasm", ""), "/static/pdfium.wasm");
  assert.equal(isVendorCdnUrl(PDFIUM_UPSTREAM_DEFAULT_WASM_URL), true);
});

test("初始化超时 → 报错态，就绪则不算超时", () => {
  const pending = pdfiumInitWatch({
    startedAtMs: 0,
    nowMs: PDFIUM_INIT_TIMEOUT_MS - 1,
    ready: false,
  });
  assert.equal(pending.status, "pending");

  const timedOut = pdfiumInitWatch({
    startedAtMs: 0,
    nowMs: PDFIUM_INIT_TIMEOUT_MS,
    ready: false,
  });
  assert.equal(timedOut.status, "timeout");
  assert.match(timedOut.message || "", /内核加载失败/);
  assert.equal(pdfiumInitTimeoutMessage().includes("内核加载失败"), true);

  const ready = pdfiumInitWatch({
    startedAtMs: 0,
    nowMs: PDFIUM_INIT_TIMEOUT_MS + 5_000,
    ready: true,
  });
  assert.equal(ready.status, "ready");
  assert.equal(ready.message, undefined);
});
