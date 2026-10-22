import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isStaleModel3DRemoteScene } from "../src/shell/media-editors/model3d-collab-guard.ts";

const ART = "1ad86d53-ad95-4360-a6be-e32b597354a2";
const OLD = "9a21029f-7ffc-4d88-80a0-0057f5a9f396";
const CURRENT = "ed0281b8-2a82-4e92-8427-2546679f366c";
const remote = (provenance) => ({
  checkpointUrl: "https://api.dev.oceanleo.com/v1/artifact-renditions/access/expired",
  operations: [],
  provenance,
  view: {},
});

test("room state seeded from an older revision of the same artifact is stale", () => {
  // Real shape of collab_rooms.state for item 1ad86d53: provenance pinned to rev 1.
  assert.equal(
    isStaleModel3DRemoteScene(remote({ artifactId: ART, revisionId: OLD, format: "gltf" }), {
      artifactId: ART,
      itemRevisionId: CURRENT,
      sourceRevisionId: CURRENT,
    }),
    true,
  );
  // glb checkpoints carry no sourceRevisionId; fall back to the opened revision.
  assert.equal(
    isStaleModel3DRemoteScene(remote({ artifactId: ART, revisionId: OLD }), {
      artifactId: ART,
      itemRevisionId: CURRENT,
    }),
    true,
  );
});

test("legitimate collaborator states are still applied", () => {
  const current = { artifactId: ART, itemRevisionId: CURRENT, sourceRevisionId: OLD };
  // gltf base kept across checkpoint saves: same base revision -> not stale.
  assert.equal(
    isStaleModel3DRemoteScene(remote({ artifactId: ART, revisionId: OLD }), current),
    false,
  );
  // glb checkpoint (no revision identity) and other-artifact import -> not stale.
  assert.equal(isStaleModel3DRemoteScene(remote({ artifactId: "", revisionId: "" }), current), false);
  assert.equal(
    isStaleModel3DRemoteScene(
      remote({ artifactId: "0c425a94-19e8-49b7-aba8-dd05bfa19c08", revisionId: OLD }),
      current,
    ),
    false,
  );
  assert.equal(isStaleModel3DRemoteScene(remote(undefined), current), false);
  assert.equal(isStaleModel3DRemoteScene(null, current), false);
});

test("Model3DRoute drops stale room scenes before applyRemoteScene", () => {
  const route = readFileSync(
    new URL("../src/shell/advanced-routes/Model3DRoute.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    route,
    /isStaleModel3DRemoteScene\(state, \{[\s\S]*?\}\)\s*\) \{\s*return;\s*\}\s*editor\.applyRemoteScene\(state\)/,
  );
});
