import assert from "node:assert/strict";
import test from "node:test";
import { applyLibraryCurrentIdentityToSearch, clearLibraryCurrentIdentity, getLibraryCurrentIdentity, registerLibraryIdentityWriter, resetLibraryCurrentIdentityForTests } from "../src/shell/library-current-identity.ts";

test("close removes both item identities and preview mode without losing collection state", () => {
  assert.equal(applyLibraryCurrentIdentityToSearch("?item=a&entry=b&mode=preview&q=hello&type=image&tab=library", { artifactId: "", entryId: "" }), "q=hello&type=image&tab=library");
});

test("close uses the existing route writer and preserves router state and fragment", () => {
  const previous = globalThis.window;
  const writes = [];
  const state = { nextRouter: { tree: ["library"] } };
  globalThis.window = { location: { pathname: "/library", search: "?item=a&entry=b&mode=preview&q=hello", hash: "#shelf" }, history: { state, replaceState(...args) { writes.push(args); } } };
  try {
    registerLibraryIdentityWriter((search, href) => writes.push([search, href]));
    clearLibraryCurrentIdentity("closed-action");
    assert.equal(getLibraryCurrentIdentity(), null);
    assert.deepEqual(writes, [[state, "", "/library?q=hello#shelf"], ["q=hello", "/library?q=hello#shelf"]]);
  } finally { globalThis.window = previous; resetLibraryCurrentIdentityForTests(); }
});
