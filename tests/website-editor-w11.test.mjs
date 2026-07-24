import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildOpenAssetPayload,
  isWebsiteBlankDraft,
  websiteEmbedExtraParams,
} from "../src/shell/website-embed-params.ts";

const artifactId = "11111111-1111-4111-8111-111111111111";
const revisionId = "22222222-2222-4222-8222-222222222222";
const projectId = "33333333-3333-4333-8333-333333333333";

function websiteItem(overrides = {}) {
  return {
    key: `artifact:${artifactId}:${revisionId}`,
    source: "artifact",
    id: artifactId,
    title: "Durable website",
    kind: "website",
    siteId: "word",
    favorite: false,
    meta: {
      draft: true,
      blank: true,
      starter_id: "starter-must-not-win",
    },
    artifactId,
    revisionId,
    artifactType: "website",
    artifact: {
      artifactId,
      revisionId,
      artifactType: "website",
      project_id: projectId,
    },
    ...overrides,
  };
}

test("durable website drafts open their exact artifact revision instead of blank or starter source", () => {
  const item = websiteItem();
  assert.equal(isWebsiteBlankDraft(item), false);
  assert.deepEqual(websiteEmbedExtraParams(item), {
    projectId,
    siteId: projectId,
    artifactId,
    revisionId,
  });

  const payload = buildOpenAssetPayload(item);
  assert.equal(payload.artifactId, artifactId);
  assert.equal(payload.revisionId, revisionId);
  assert.equal(payload.meta.artifact_id, artifactId);
  assert.equal(payload.meta.revision_id, revisionId);
  assert.equal("starter_id" in payload.meta, false);
});

test("website embed must not advertise blank=1 for durable remediating tips", () => {
  const item = websiteItem({
    meta: {
      draft: true,
      blank: true,
      starter_id: "starter-must-not-win",
    },
  });
  const params = websiteEmbedExtraParams(item);
  assert.equal(params?.blank, undefined);
  assert.equal(params?.artifactId, artifactId);
  assert.equal(params?.revisionId, revisionId);
  assert.equal("starterId" in (params || {}), false);
});

test("partial website artifact identity fails closed without starter fallback", () => {
  const item = websiteItem({
    revisionId: undefined,
    artifact: undefined,
    meta: {
      draft: true,
      starter_id: "starter-must-not-win",
      artifact_id: artifactId,
    },
  });
  assert.equal(isWebsiteBlankDraft(item), false);
  assert.deepEqual(websiteEmbedExtraParams(item), {
    sourceIdentity: "invalid",
  });

  const payload = buildOpenAssetPayload(item);
  assert.equal(payload.artifactId, undefined);
  assert.equal(payload.revisionId, undefined);
  assert.equal(payload.meta.website_source_identity_invalid, true);
  assert.equal("starter_id" in payload.meta, false);
  assert.equal("artifact_id" in payload.meta, false);
});

test("durable website identity never reopens starter metadata alongside artifact params", () => {
  const item = websiteItem({
    meta: {
      draft: true,
      blank: true,
      starter_id: "starter-must-not-win",
      github_repo: "owner/repo",
      commit_sha: "abc1234",
    },
  });
  assert.deepEqual(websiteEmbedExtraParams(item), {
    projectId,
    siteId: projectId,
    artifactId,
    revisionId,
  });
  const payload = buildOpenAssetPayload(item);
  assert.equal("starter_id" in payload.meta, false);
  assert.equal("github_repo" in payload.meta, false);
  assert.equal(payload.meta.artifact_id, artifactId);
  assert.equal(payload.meta.revision_id, revisionId);
});

test("embed sender suppresses only a genuinely blank website draft", () => {
  const embed = readFileSync(
    new URL("../src/shell/workbench-embed.tsx", import.meta.url),
    "utf8",
  );
  assert.match(embed, /if \(isWebsiteBlankDraft\(item\)\) return;/);
  assert.doesNotMatch(
    embed,
    /item\.meta\.draft === true && !item\.url && !item\.previewUrl/,
  );
});
