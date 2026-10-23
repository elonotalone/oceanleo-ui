import assert from "node:assert/strict";
import original from "./w07-fork.mjs";

export default async function (session) {
  const forks = [];
  const revisions = [];
  session.page.on("response", async (response) => {
    const path = new URL(response.url()).pathname;
    if (response.request().method() !== "POST") return;
    if (/:fork$/.test(path)) forks.push(response.status());
    if (/\/revisions$/.test(path)) revisions.push({ status: response.status(), path });
  });
  await original(session);
  assert.deepEqual(forks, [200], "one public open must resolve its fork once");
  assert.equal(revisions.length, 3, "three edits must publish three revisions");
  assert.ok(revisions.every((r) => r.status === 200));
  assert.equal(new Set(revisions.map((r) => r.path)).size, 1, "all edits must use the same fork");
  const forkId = revisions[0].path.split("/").at(-2);
  assert.equal(new URL(session.page.url()).searchParams.get("item"), forkId);
  session.log("PASS one fork, three edits, stable address", forkId);
}
