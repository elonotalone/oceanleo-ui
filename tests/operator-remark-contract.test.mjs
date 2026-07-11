import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  appendOperatorRemark,
  getActiveOperatorRemark,
  OPERATOR_REMARK_MAX_LENGTH,
  setActiveOperatorRemark,
  withOperatorRemarkRequest,
} from "../src/lib/operator-remark.ts";

const functionAgent = await readFile(
  new URL("../src/shell/FunctionAgentChat.tsx", import.meta.url),
  "utf8",
);
const operatorConsole = await readFile(
  new URL("../src/shell/OperatorConsole.tsx", import.meta.url),
  "utf8",
);

test("备注只在最终 prompt 末尾追加", () => {
  assert.equal(appendOperatorRemark("生成一张海报", ""), "生成一张海报");
  assert.equal(
    appendOperatorRemark(" 生成一张海报 ", " 面向儿童\n不要小字 "),
    "生成一张海报\n\n补充备注：\n面向儿童\n不要小字",
  );
  assert.equal(OPERATOR_REMARK_MAX_LENGTH, 4000);
});

test("每个 OperatorConsole app 提供共享备注，操作台与 agent 共用", () => {
  assert.match(operatorConsole, /<OperatorRemarkProvider/);
  assert.match(functionAgent, /<OperatorRemarkField disabled=\{sessionReadOnly\}/);
  assert.match(functionAgent, /appendOperatorRemark\(/);
  assert.match(functionAgent, /operatorRemark/);
});

test("瘦客户端适配器只改 prompt 或最后一条 user message", () => {
  globalThis.window = {};
  setActiveOperatorRemark("不要出现品牌名");
  assert.equal(getActiveOperatorRemark(), "不要出现品牌名");
  assert.deepEqual(
    withOperatorRemarkRequest({
      prompt: "生成海报",
      negative_prompt: "模糊",
      query: "原始检索词",
    }),
    {
      prompt: "生成海报\n\n补充备注：\n不要出现品牌名",
      negative_prompt: "模糊",
      query: "原始检索词",
    },
  );
  assert.deepEqual(
    withOperatorRemarkRequest({
      messages: [
        { role: "user", content: "第一问" },
        { role: "assistant", content: "回答" },
        { role: "user", content: "继续生成" },
      ],
    }),
    {
      messages: [
        { role: "user", content: "第一问" },
        { role: "assistant", content: "回答" },
        {
          role: "user",
          content: "继续生成\n\n补充备注：\n不要出现品牌名",
        },
      ],
    },
  );
  setActiveOperatorRemark("");
  delete globalThis.window;
});
