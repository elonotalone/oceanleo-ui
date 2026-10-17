/**
 * Read-only open of an existing website, then edit a `[客户端验收]` copy.
 * Never prints the test account. Never modifies items that were not copied here.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";

import { loadTestAccount } from "/root/projects/oceanleo-app/packages/api-client/src/test-account.mjs";
import { readDevAnonKey } from "/root/projects/oceanleo-app/packages/api-client/src/dev-anon.mjs";
import { createGoTrueAuth } from "/root/projects/oceanleo-app/packages/api-client/src/gotrue.mjs";
import { createMemoryStorage } from "/root/projects/oceanleo-app/packages/api-client/src/memory-storage.mjs";
import { createDevTransportFromAuth } from "/root/projects/oceanleo-app/packages/api-client/src/transport.mjs";
import { existingWebsiteSource } from "../src/shell/website-local/blank-website-source.ts";
import {
  CLIENT_ACCEPTANCE_TITLE_PREFIX,
  copyWebsiteSourceForClientAcceptance,
  exportWebsiteSource,
  patchWebsiteSection,
  setWebsiteTitle,
} from "../src/shell/website-local/website-source-session.ts";
import {
  parseWebsiteSource,
  validateWebsiteSource,
} from "../src/shell/website-source-carrier/website-source-validate.ts";

const EVIDENCE_DIR =
  "/root/projects/oceanleo-app/docs/react-client-rebuild/evidence/W10/website";

function asItems(data) {
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.projections)) return data.projections;
  if (Array.isArray(data)) return data;
  return [];
}

function artifactTypeOf(item) {
  return String(
    item?.artifactType || item?.artifact_type || item?.type || item?.kind || "",
  );
}

function artifactIdOf(item) {
  return String(item?.id || item?.artifactId || item?.artifact_id || "");
}

function looksLikeWebsiteSource(value) {
  return (
    value &&
    typeof value === "object" &&
    value.schema === "website-source@1" &&
    Array.isArray(value.pages) &&
    Array.isArray(value.sections)
  );
}

function extractWebsiteSource(payload) {
  if (looksLikeWebsiteSource(payload)) return payload;
  if (looksLikeWebsiteSource(payload?.websiteSource)) return payload.websiteSource;
  if (looksLikeWebsiteSource(payload?.document)) return payload.document;
  if (looksLikeWebsiteSource(payload?.json)) return payload.json;
  return null;
}

test("operator account: read existing website, copy as [客户端验收], edit locally", async () => {
  const localExisting = existingWebsiteSource("操作员已有的网站工程");
  assert.equal(validateWebsiteSource(localExisting).ok, true);
  const copied = copyWebsiteSourceForClientAcceptance(localExisting, "操作员网站副本");
  assert.equal(copied.title.startsWith(CLIENT_ACCEPTANCE_TITLE_PREFIX), true);
  const edited = setWebsiteTitle(
    patchWebsiteSection(copied, "hero", { heading: "验收副本首屏" }),
    `${CLIENT_ACCEPTANCE_TITLE_PREFIX} 验收副本网站工程`,
  );
  const reopened = parseWebsiteSource(exportWebsiteSource(edited));
  assert.equal(reopened.sections.find((section) => section.id === "hero").heading, "验收副本首屏");

  const live = {
    loggedIn: false,
    listed: 0,
    openedExisting: false,
    sourceFormat: "",
    copiedLocally: true,
    note: "local existingWebsiteSource fixture used as the opened project",
  };
  const account = loadTestAccount();
  const anonKey = readDevAnonKey();
  if (account && anonKey) {
    const auth = createGoTrueAuth({
      anonKey,
      storage: createMemoryStorage(),
      fetch,
    });
    const signed = await auth.signInWithPassword(account.email, account.password);
    live.loggedIn = signed.ok === true;
    if (signed.ok) {
      const transport = createDevTransportFromAuth(auth, { fetch });
      const mine = await transport.request({
        method: "GET",
        path: "/v1/library/mine",
        query: { artifactType: "website", limit: "20" },
      });
      const search = await transport.request({
        method: "GET",
        path: "/v1/library/search",
        query: { artifactType: "website", limit: "20" },
      });
      const mineItems = asItems(mine.data);
      const publicItems = asItems(search.data);
      live.listed = mineItems.length + publicItems.length;
      const candidate =
        mineItems.find((item) => artifactTypeOf(item) === "website") ||
        publicItems.find((item) => artifactTypeOf(item) === "website");
      const candidateId = artifactIdOf(candidate);
      if (candidateId) {
        const item = await transport.request({
          method: "GET",
          path: `/v1/library/items/${candidateId}`,
        });
        live.openedExisting = item.ok === true;
        live.sourceFormat = String(
          item.data?.sourceFormat || candidate.sourceFormat || "",
        );
        const extracted = extractWebsiteSource(item.data);
        if (extracted) {
          const parsed = parseWebsiteSource(JSON.stringify(extracted));
          const liveCopy = copyWebsiteSourceForClientAcceptance(
            parsed,
            "网关已有网站",
          );
          assert.equal(liveCopy.title.startsWith(CLIENT_ACCEPTANCE_TITLE_PREFIX), true);
          live.note = "parsed live website-source@1 and copied locally; original untouched";
        } else {
          live.note =
            "opened a website artifact read-only; payload was not website-source@1 so local fixture copy was edited";
        }
      }
    }
  }

  await mkdir(EVIDENCE_DIR, { recursive: true });
  await writeFile(
    `${EVIDENCE_DIR}/operator-copy.json`,
    `${JSON.stringify(
      {
        clientAcceptancePrefix: CLIENT_ACCEPTANCE_TITLE_PREFIX,
        localCopyTitle: reopened.title,
        live: {
          loggedIn: live.loggedIn,
          listed: live.listed,
          openedExisting: live.openedExisting,
          sourceFormat: live.sourceFormat,
          copiedLocally: live.copiedLocally,
          note: live.note,
        },
      },
      null,
      2,
    )}\n`,
  );
  assert.equal(reopened.title.startsWith(CLIENT_ACCEPTANCE_TITLE_PREFIX), true);
});
