import assert from "node:assert/strict";
import test from "node:test";
import { parseTaskLink } from "../src/lib/task-link.ts";

const ID = "dc75a314-6e8d-447f-a581-8a2fc04d471a";
const DEV = "http://127.0.0.1:3000";

test("task links on family portals and the current origin parse", () => {
  for (const url of [
    `https://oceanleo.com/tasks/${ID}`,
    `https://oceanbizs.com/tasks/${ID}/`,
    `https://www.oceanleo.cn/tasks/${ID}?computerSession=abc#x`,
    `https://dev.oceanleo.com/history?task=${ID}`,
    `www.oceanleo.com/tasks/${ID}`,
    `${DEV}/tasks/${ID}`,
    `https://oceanleo.com/tasks/${ID.toUpperCase()}`,
  ]) {
    assert.deepEqual(parseTaskLink(url, DEV), { taskId: ID }, url);
  }
});

test("other hosts, user-content domains and non-task paths are not task links", () => {
  for (const url of [
    `https://evil.example/tasks/${ID}`,
    `https://notoceanleo.com/tasks/${ID}`,
    `https://oceanleo.com.evil.io/tasks/${ID}`,
    `https://p1--base.oceanleo.app/tasks/${ID}`,
    `https://x.ws.oceanleo.app/tasks/${ID}`,
    `http://127.0.0.1:4000/tasks/${ID}`,
    `https://user:pw@oceanleo.com/tasks/${ID}`,
    `https://oceanleo.com/tasks/not-a-uuid`,
    `https://oceanleo.com/tasks/${ID}/files`,
    `https://oceanleo.com/projects/${ID}`,
    `https://oceanleo.com/history`,
    `oceanleo.com/tasks/${ID}`,
    `javascript:alert(1)//oceanleo.com/tasks/${ID}`,
    "",
  ]) {
    assert.equal(parseTaskLink(url, DEV), null, url);
  }
});
