import assert from "node:assert/strict";
import test from "node:test";

import {
  canonical,
  canSelect,
  checkedAgo,
  groupOffers,
  matchesModel,
  PROVIDER_DISPLAY_ORDER,
  squash,
} from "../src/lib/model-search.ts";

const CANONICAL_VECTORS = [
  ["ZHIPU/GLM-5.1", "glm51"],
  ["glm-5.1", "glm51"],
  ["z-ai/glm-5.1", "glm51"],
  ["GLM 5.1", "glm51"],
  ["deepseek-ai/DeepSeek-V3.2", "deepseekv32"],
  ["deepseek-v3.2", "deepseekv32"],
  ["~moonshotai/kimi-latest", "kimilatest"],
  ["moonshotai/kimi-k2.6", "kimik26"],
  ["kimi/kimi-k2.6", "kimik26"],
  ["MiniMax/MiniMax-M2.7", "minimaxm27"],
  ["openai/gpt-oss-120b", "gptoss120b"],
  ["z-ai/glm-5.3:batch", "glm53"],
  ["qwen/qwen3.8-max:free", "qwen38max"],
  ["Qwen/Qwen3-235B-A22B-Instruct-2507", "qwen3235ba22binstruct2507"],
  ["Tripo/Tripo-P1.0", "tripop10"],
  ["通义千问-Plus", "通义千问plus"],
];

test("§11 canonical 16 条向量", () => {
  for (const [input, expected] of CANONICAL_VECTORS) {
    assert.equal(canonical(input), expected, input);
  }
});

test("squash 只做小写去空白与删字符，不去前缀", () => {
  assert.equal(squash("ZHIPU/GLM-5.1"), "zhipu/glm51");
  assert.equal(squash("通义千问-Plus"), "通义千问plus");
});

test("matchesModel：glm 5.1 命中 ZHIPU/GLM-5.1 与 z-ai/glm-5.1", () => {
  assert.equal(
    matchesModel("glm 5.1", { id: "ZHIPU/GLM-5.1", label: "GLM-5.1", provider_label: "百炼" }),
    true,
  );
  assert.equal(
    matchesModel("glm 5.1", { id: "z-ai/glm-5.1", label: "GLM-5.1", provider_label: "智谱" }),
    true,
  );
  assert.equal(
    matchesModel("glm 5.1", { id: "deepseek-v3.2", label: "DeepSeek-V3.2", provider_label: "深度求索" }),
    false,
  );
});

test("groupOffers 里 tripo、stability 排在 azure 之后、openai 之前", () => {
  assert.deepEqual(
    [...PROVIDER_DISPLAY_ORDER],
    [
      "bailian",
      "volcano",
      "tencent",
      "baidu",
      "alibaba_intl",
      "deepinfra",
      "openrouter",
      "azure",
      "tripo",
      "stability",
      "openai",
      "anthropic",
    ],
  );
  const groups = groupOffers([
    {
      key: "openai:shared-model",
      id: "shared-model",
      provider: "openai",
      label: "Shared",
      category: "threed",
    },
    {
      key: "tripo:shared-model",
      id: "shared-model",
      provider: "tripo",
      label: "Shared",
      category: "threed",
    },
    {
      key: "azure:shared-model",
      id: "shared-model",
      provider: "azure",
      label: "Shared",
      category: "threed",
    },
    {
      key: "stability:shared-model",
      id: "shared-model",
      provider: "stability",
      label: "Shared",
      category: "threed",
    },
    {
      key: "anthropic:shared-model",
      id: "shared-model",
      provider: "anthropic",
      label: "Shared",
      category: "threed",
    },
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(
    groups[0].offers.map((item) => item.provider),
    ["azure", "tripo", "stability", "openai", "anthropic"],
  );
});

test("groupOffers 按 canonical(id) 合并并按 §1 厂商顺序排", () => {
  const groups = groupOffers(
    [
      {
        key: "tencent:z-ai/glm-5.1",
        id: "z-ai/glm-5.1",
        provider: "tencent",
        label: "GLM-5.1 Tencent",
        category: "text",
      },
      {
        key: "bailian:ZHIPU/GLM-5.1",
        id: "ZHIPU/GLM-5.1",
        provider: "bailian",
        label: "GLM-5.1 Bailian",
        category: "text",
      },
      {
        key: "volcano:glm-5.1",
        id: "glm-5.1",
        provider: "volcano",
        label: "GLM-5.1 Volcano",
        category: "text",
      },
    ],
    PROVIDER_DISPLAY_ORDER,
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].canonical, "glm51");
  assert.deepEqual(
    groups[0].offers.map((item) => item.provider),
    ["bailian", "volcano", "tencent"],
  );
  assert.equal(groups[0].label, "GLM-5.1 Bailian");
});

test("canSelect 四种情况", () => {
  assert.equal(canSelect({ selectable: true, status: "available" }, []), true);
  assert.equal(canSelect({ selectable: false, status: "unpriced" }, []), false);
  assert.equal(canSelect({ status: "byok_only", provider: "openai" }, ["openai"]), true);
  assert.equal(canSelect({ status: "byok_only", provider: "openai" }, []), false);
});

test("checkedAgo 边界", () => {
  const now = new Date("2026-10-05T04:00:00Z");
  assert.deepEqual(checkedAgo("2026-10-05T04:00:00Z", now), { n: 0, unit: "minute" });
  assert.deepEqual(checkedAgo("2026-10-05T03:01:00Z", now), { n: 59, unit: "minute" });
  assert.deepEqual(checkedAgo("2026-10-05T03:00:00Z", now), { n: 1, unit: "hour" });
  assert.deepEqual(checkedAgo("2026-10-04T05:00:00Z", now), { n: 23, unit: "hour" });
  assert.deepEqual(checkedAgo("2026-10-04T04:00:00Z", now), { n: 1, unit: "day" });
  assert.deepEqual(checkedAgo("not-a-date", now), { n: 0, unit: "minute" });
});
