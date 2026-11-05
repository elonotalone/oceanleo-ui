import assert from "node:assert/strict";
import test from "node:test";

import { serverPageHref } from "../src/shell/cloud-computer/server-page/href.ts";

test("serverPageHref routes computer views through the device portal", () => {
  assert.equal(serverPageHref("cc /1"), "/devices?computer=cc+%2F1");
  assert.equal(
    serverPageHref("cc /1", { card: "acp" }),
    "/devices?computer=cc+%2F1&view=acp",
  );
  assert.equal(
    serverPageHref("cc /1", {
      card: "cli",
      program: "claude code",
      session: "chat /2",
    }),
    "/devices?computer=cc+%2F1&view=cli&program=claude+code&session=chat+%2F2",
  );
  assert.equal(
    serverPageHref("cc /1", { program: "cursor", session: "chat /2" }),
    "/devices?computer=cc+%2F1&program=cursor&session=chat+%2F2",
  );
});
