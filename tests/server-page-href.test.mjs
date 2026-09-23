import assert from "node:assert/strict";
import test from "node:test";

import { serverPageHref } from "../src/shell/cloud-computer/server-page/href.ts";

test("serverPageHref 编码服务器并按合同组合 card/program/session", () => {
  assert.equal(serverPageHref("cc /1"), "/computers/cc%20%2F1");
  assert.equal(
    serverPageHref("cc /1", { card: "acp" }),
    "/computers/cc%20%2F1?card=acp",
  );
  assert.equal(
    serverPageHref("cc /1", {
      card: "cli",
      program: "claude code",
      session: "chat /2",
    }),
    "/computers/cc%20%2F1?card=cli&program=claude+code&session=chat+%2F2",
  );
  assert.equal(
    serverPageHref("cc /1", { program: "cursor", session: "chat /2" }),
    "/computers/cc%20%2F1?program=cursor&session=chat+%2F2",
  );
});
