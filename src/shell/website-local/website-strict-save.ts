/** The strict carrier also needs a server revision, never a local item receipt. */
import type { LibraryItem } from "../library-data";
import { saveFileToLibrary } from "../doc-editors/doc-io";
import { WEBSITE_SOURCE_FORMAT, type WebsiteSource } from "../website-source-carrier/website-source-schema";
import { serializeWebsiteSource } from "../website-source-carrier/website-source-validate";
import { renderSiteCoverPng } from "./website-site-cover";

export function saveStrictWebsiteRevision(item: LibraryItem, source: WebsiteSource, siteId: string, editRevision: number) {
  return saveFileToLibrary({
    item,
    siteId,
    fallbackSite: "oceanleo",
    file: new File([serializeWebsiteSource(source)], "oceanleo.website-source.json", { type: "application/json" }),
    sourceFormat: WEBSITE_SOURCE_FORMAT,
    sourceMediaType: "application/json",
    title: source.title,
    mediaType: "website",
    kind: "website",
    idempotencyKey: `website:${item.artifactId}:${item.revisionId}:${editRevision}`,
    createPreview: () => renderSiteCoverPng({
      siteName: source.title,
      themeColor: source.theme.accent,
      backgroundColor: source.theme.background,
      pages: [{ sections: source.sections.map(section => ({
        id: section.id,
        type: section.kind,
        content: { title: section.heading, subtitle: section.subheading, body: section.body },
        style: { textColor: source.theme.text, backgroundColor: section.background === "accent" ? source.theme.accent : source.theme.background },
      })) }],
    }, () => ""),
    meta: { editor: "website", editor_capability: "website-editor", editor_project_schema: WEBSITE_SOURCE_FORMAT },
    artifactRevision: { artifactType: "website", editor: "website", provenance: { editorRevision: editRevision } },
  });
}
