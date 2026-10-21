import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { resetUserEditSession, userEditItemKey, userMutationGeneration } from "../src/shell/user-edit-session.ts";

const { applyHostedDeckUserEditSession } = await import(await compileModule(
  "src/shell/advanced-routes/DeckHostedRoute.tsx",
  {
    "../../i18n/ui/useUI": dataModule("export function useUI(){ return value => value; }"),
    "../AdvancedWorkbenchShell": dataModule("export function AdvancedWorkbenchShell(){ return null; }"),
    "../../client-ui/host-context": dataModule("export function useOptionalClientHost(){ return null; }"),
    "next/dynamic": dataModule("export default function dynamic(){ return function Placeholder(){ return null; }; }"),
  },
));

test("hosted slide mutations notify the stable artifact autosave key across saved revisions", () => {
  resetUserEditSession();
  const item = { key: "artifact:slides-root:r1", id: "legacy-row", artifactId: "slides-root" };
  const opened = { item, kind: "dirty", dirty: true, openedContentIdentity: "opened", contentIdentity: "opened", source: { slides: [] } };
  assert.equal(applyHostedDeckUserEditSession(opened), 1);
  assert.equal(userMutationGeneration(userEditItemKey(item)), 1);
  assert.equal(userMutationGeneration(item.key), 0, "revision-dependent keys are not the autosave subscription");
  assert.equal(applyHostedDeckUserEditSession({ ...opened, item: { ...item, key: "artifact:slides-root:r2" } }), 2);
  assert.equal(userMutationGeneration("slides-root"), 2);
  for (const patch of [{ kind: "restore" }, { kind: "init" }, { dirty: false }, { applyingInit: true }, { source: null }, { openedContentIdentity: "departed" }]) {
    assert.equal(applyHostedDeckUserEditSession({ ...opened, ...patch }), 2);
  }
  resetUserEditSession();
});
