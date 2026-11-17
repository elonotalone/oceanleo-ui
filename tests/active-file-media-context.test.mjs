// Adapter contract tests, not a substitute for the real Library composition test.
import assert from "node:assert/strict";
import test from "node:test";
import { boundedAgentContent } from "../src/shell/plugin-command/bounded-agent-content.ts";

const deliver = async () => {};

test("bounded source excerpts remain valid JSON, explicitly truncated and credential-free", () => {
  const source = { title: "当前项目", access_token: "do-not-send", tracks: Array.from({ length: 200 }, (_, i) => ({
    id: `clip-${i}`, text: '字幕\\"\n'.repeat(2000), nested: { visible: true },
  })) };
  source.cycle = source;
  const context = boundedAgentContent(source);
  assert.equal(context.ready, true);
  assert.equal(context.truncated, true);
  const encoded = JSON.stringify(context.content);
  assert.ok(encoded.length <= 5500, `actual JSON length ${encoded.length}`);
  assert.equal(JSON.parse(encoded).title, "当前项目");
  assert.match(encoded, /clip-0/);
  assert.doesNotMatch(encoded, /do-not-send/);
  assert.match(context.note, /节选/);
  assert.equal(source.access_token, "do-not-send", "source editor data is never mutated");
});
