import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AUTOSAVE_ERROR_LOGIN_EXPIRED,
  AUTOSAVE_ERROR_NETWORK,
  AUTOSAVE_ERROR_SERVER_BUSY,
  mapAutosaveErrorMessage,
} from "../src/lib/auth/autosave-error-message.ts";

test("三类保存失败对应三句人话", () => {
  assert.equal(
    mapAutosaveErrorMessage({ status: 401, error: "JWT expired" }),
    AUTOSAVE_ERROR_LOGIN_EXPIRED,
  );
  assert.equal(
    mapAutosaveErrorMessage({ status: 403, error: "forbidden" }),
    AUTOSAVE_ERROR_LOGIN_EXPIRED,
  );
  assert.equal(
    mapAutosaveErrorMessage({ status: 0, error: "Failed to fetch" }),
    AUTOSAVE_ERROR_NETWORK,
  );
  assert.equal(
    mapAutosaveErrorMessage({ status: 503, error: "bad gateway" }),
    AUTOSAVE_ERROR_SERVER_BUSY,
  );
});

test("没有状态码时按原文归类，其它截断 80 字", () => {
  assert.equal(
    mapAutosaveErrorMessage({ error: "登录后才能访问素材库。" }),
    AUTOSAVE_ERROR_LOGIN_EXPIRED,
  );
  assert.equal(
    mapAutosaveErrorMessage({ error: "网络错误：无法连接到登录服务" }),
    AUTOSAVE_ERROR_NETWORK,
  );
  const long = "x".repeat(120);
  assert.equal(mapAutosaveErrorMessage({ error: long }), long.slice(0, 80));
  assert.equal(mapAutosaveErrorMessage({}), undefined);
});

test("钩子返回 errorMessage，失败结果带人话字段", () => {
  const hook = readFileSync(
    new URL("../src/shell/use-advanced-autosave.ts", import.meta.url),
    "utf8",
  );
  const context = readFileSync(
    new URL("../src/shell/advanced-session-context.tsx", import.meta.url),
    "utf8",
  );
  assert.match(hook, /errorMessage/);
  assert.match(hook, /mapAutosaveErrorMessage/);
  assert.match(hook, /return \{ state, errorMessage, flushLatest, retry \}/);
  assert.match(context, /errorMessage\?: string/);
  assert.match(context, /status\?: number/);
});
