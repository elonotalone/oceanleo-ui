import assert from "node:assert/strict";
import test from "node:test";

import { validAgentChips } from "../src/shell/hosted-editor/index.ts";
import {
  VIDEO_AGENT_CHIPS,
  buildVideoReviewProposal,
  videoAgentChipsAreValid,
  videoToolsManifestChips,
} from "../src/shell/video-editor/designcombo/l4-chips.ts";

test("video chips pass the host validator and stay at eight", () => {
  assert.equal(videoAgentChipsAreValid(), true);
  assert.equal(validAgentChips(VIDEO_AGENT_CHIPS), true);
  assert.equal(VIDEO_AGENT_CHIPS.length, 8);
  assert.equal(videoToolsManifestChips().manifestVersion, 2);
});

test("review proposal is objects-only and does not bump revision", () => {
  const proposal = buildVideoReviewProposal({
    proposalId: "p-1",
    commandId: "video.add-caption",
    summaryBefore: "无字幕",
    summaryAfter: "有一句字幕",
    objects: [
      { id: "c1", op: "add", label: "字幕", before: "", after: "hello" },
    ],
    revision: 4,
  });
  assert.ok(proposal);
  assert.equal(proposal.revision, 4);
  assert.ok(proposal.objects);
  assert.equal("diff" in proposal && proposal.diff !== undefined, false);
});
