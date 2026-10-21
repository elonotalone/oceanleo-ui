import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const [sourcePath, artifactId, revisionId] = process.argv.slice(2);
if (!sourcePath || !artifactId || !revisionId) {
  throw new Error(
    "usage: inspect-published-design-open.mjs <source.json> <artifact-id> <revision-id>",
  );
}

globalThis.window ||= {
  location: {
    href: "https://design.oceanleo.com/",
    origin: "https://design.oceanleo.com",
  },
};

const {
  designArtifactClosureDigest,
  validateDesignCompositeSource,
} = await import("../../src/shell/design-composite-commit.ts");
const bytes = await readFile(sourcePath);
if (bytes.length === 0 || bytes.length > 20_000_000) {
  throw new Error("published design source must be between 1 byte and 20 MB");
}
const parsed = JSON.parse(bytes.toString("utf8"));
const sourceDigest = createHash("sha256").update(bytes).digest("hex");
const dependencyDigests = [
  ...new Set([
    sourceDigest,
    ...(Array.isArray(parsed.assets)
      ? parsed.assets.map((asset) =>
          String(asset?.sha256 || "")
            .trim()
            .toLowerCase()
            .replace(/^sha256:/, ""),
        )
      : []),
  ]),
];

// This local projection enables a structural open-validation check. It is not
// a claim that the server's pinned source-closure record was independently read.
const closureDigest = await designArtifactClosureDigest(sourceDigest);
const sourceUrl = `https://api.oceanleo.com/v1/library/items/${artifactId}/source`;
const item = {
  key: `${artifactId}:${revisionId}`,
  source: "artifact",
  id: artifactId,
  title: "Pinned design source",
  kind: "image",
  siteId: "oceanleo.app",
  favorite: false,
  meta: {},
  artifactId,
  revisionId,
  artifactType: "composite_image",
  artifact: {
    schema: "oceanleo.artifact.v1",
    artifactId,
    revisionId,
    artifactType: "composite_image",
    sourceFormat: "oceanleo.design-document.v1",
    editorCapability: "design-canvas",
    integrity: { ok: true },
    renditions: {
      source: {
        purpose: "source",
        revisionId,
        url: sourceUrl,
        mediaType: "application/json",
        format: "json",
        digest: sourceDigest,
      },
      preview: {
        purpose: "preview",
        revisionId,
        url: sourceUrl,
        mediaType: "image/png",
        format: "png",
        digest: "e".repeat(64),
      },
      full: {
        purpose: "full",
        revisionId,
        url: sourceUrl,
        mediaType: "image/png",
        format: "png",
        digest: "e".repeat(64),
      },
    },
    scene: {
      schema: "oceanleo.design-document.v1",
      sceneRevisionId: revisionId,
      closureStatus: "complete",
      closureDigest,
      dependencyRevisionIds: [],
    },
    sourceClosure: {
      revisionId,
      status: "complete",
      digest: closureDigest,
      sourceDigest,
      dependencyDigests,
      dependencyRevisionIds: [],
      firstParty: true,
    },
  },
};

const evidence = await validateDesignCompositeSource(
  new Blob([bytes], { type: "application/json" }),
  item,
  { validation: "open" },
);
const elements = parsed?.document?.elements;
if (!Array.isArray(elements)) {
  throw new Error("validated carrier has no document element list");
}
const counts = Object.fromEntries(
  [...new Set(elements.map((element) => element.type))]
    .sort()
    .map((type) => [
      type,
      elements.filter((element) => element.type === type).length,
    ]),
);

console.log(
  JSON.stringify(
    {
      sourcePath,
      bytes: bytes.length,
      sourceDigest,
      artifactId,
      revisionId,
      sourceKind: evidence.sourceKind,
      sourceMode: evidence.sourceMode,
      layerCount: elements.length,
      counts,
      elementIds: elements.map((element) => element.id),
      closureEvidence: evidence.closureEvidence,
      closureProjection: "locally constructed; not server source-closure evidence",
    },
    null,
    2,
  ),
);
