// Read-only acceptance: stdin is an owner-checked, pinned gateway projection.
// Print only identity/integrity/layer counts, never document text or access URLs.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const [sourcePath, expectedArtifactId, expectedRevisionId] = process.argv.slice(2);
assert.ok(sourcePath && expectedArtifactId && expectedRevisionId, "source and pinned IDs required");
globalThis.window ||= {
  location: {
    href: "https://p-511af16886fbb22b5ab2367528b458ba.dev.oceanleo.com/",
    origin: "https://p-511af16886fbb22b5ab2367528b458ba.dev.oceanleo.com",
  },
};
const [{ normalizeArtifactProjection }, { artifactProjectionToLibraryItem }, { validateDesignCompositeSource }] = await Promise.all([
  import("../../src/shell/artifact-contract.ts"),
  import("../../src/shell/library-data.ts"),
  import("../../src/shell/design-composite-commit.ts"),
]);
const projection = normalizeArtifactProjection(JSON.parse(readFileSync(0, "utf8")));
assert.ok(projection, "real gateway projection normalizes");
assert.equal(projection.artifactId, expectedArtifactId);
assert.equal(projection.revisionId, expectedRevisionId);
assert.equal(projection.integrity.ok, true, "gateway projection is internally consistent");
const bytes = readFileSync(sourcePath);
assert.ok(bytes.length > 0 && bytes.length <= 20_000_000, "bounded source bytes");
const digest = createHash("sha256").update(bytes).digest("hex");
assert.equal(projection.renditions.source.digest.replace(/^sha256:/, ""), digest);
const evidence = await validateDesignCompositeSource(
  new Blob([bytes], { type: "application/json" }),
  artifactProjectionToLibraryItem(projection, { forEdit: true }),
  { validation: "open" },
);
const source = JSON.parse(bytes.toString("utf8"));
assert.equal(evidence.sourceKind, "carrier-document");
assert.equal(source.document.elements.length, 51);
const counts = source.document.elements.reduce((acc, element) => {
  acc[element.type] = (acc[element.type] || 0) + 1;
  return acc;
}, {});
assert.deepEqual(counts, { rect: 20, ellipse: 5, text: 26 });
console.log(JSON.stringify({
  artifactId: projection.artifactId,
  revisionId: projection.revisionId,
  sourceDigest: digest,
  sourceKind: evidence.sourceKind,
  sourceMode: evidence.sourceMode,
  layerCount: source.document.elements.length,
  counts,
  closureEvidence: evidence.closureEvidence,
  closureProjection: "real owner-checked gateway detail",
}));
