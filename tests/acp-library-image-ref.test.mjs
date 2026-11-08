// A pasted picture sent to a computer task comes back as an ACP image block whose uri is
// `oceanleo-attachment://<artifact>/<revision>/<name>`; the bubble needs that pair to show a thumbnail.
import assert from "node:assert/strict";
import test from "node:test";

import { libraryRefFromUri } from "../src/acp/messages.ts";

const ART = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REV = "BBBBBBBB-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("artifact + revision uri gives the Library reference", () => {
  assert.deepEqual(libraryRefFromUri(`oceanleo-attachment://${ART}/${REV}/粘贴图片-1.png`), { artifact_id: ART, revision_id: REV.toLowerCase() });
});

test("older artifact-only uris, foreign schemes and junk give nothing (file chip stays)", () => {
  assert.equal(libraryRefFromUri(`oceanleo-attachment://${ART}/a.png`), null);
  assert.equal(libraryRefFromUri(`file:///${ART}/${REV}/a.png`), null);
  assert.equal(libraryRefFromUri(undefined), null);
  assert.equal(libraryRefFromUri(`oceanleo-attachment://${ART}/not-a-uuid/a.png`), null);
});
