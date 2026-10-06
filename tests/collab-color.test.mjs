import assert from "node:assert/strict";
import test from "node:test";

import { colorForUser, fnv1a32 } from "../src/shell/collab/color.ts";

// 样例由后端 W04 的 app.collab.protocol.user_color / fnv1a32 实际算出（pycrdt 环境，2026-10-06）。
const SAMPLES = [
  ["00000000-0000-0000-0000-000000000001", 3175583038, "hsl(358, 70%, 45%)"],
  ["9f1c2b7e-3a4d-4e55-8b6a-1c2d3e4f5a6b", 2908251984, "hsl(264, 70%, 45%)"],
  ["a", 3826002220, "hsl(340, 70%, 45%)"],
  ["用户-小海", 1177805036, "hsl(236, 70%, 45%)"],
  ["7d3e8a10-55aa-4b2c-9d0e-ffeeddccbbaa", 211795541, "hsl(341, 70%, 45%)"],
  ["abc🙂", 3305129313, "hsl(273, 70%, 45%)"],
];

test("fnv1a32 与后端同一算法（UTF-8 字节）", () => {
  for (const [id, hash] of SAMPLES) assert.equal(fnv1a32(id), hash, id);
});

test("colorForUser 与后端 user_color 逐字一致", () => {
  for (const [id, , color] of SAMPLES) assert.equal(colorForUser(id), color, id);
});

test("同一个 id 永远同一个颜色，空串也有确定值", () => {
  assert.equal(colorForUser("x"), colorForUser("x"));
  assert.equal(fnv1a32(""), 0x811c9dc5);
  assert.match(colorForUser(""), /^hsl\(\d{1,3}, 70%, 45%\)$/);
});
