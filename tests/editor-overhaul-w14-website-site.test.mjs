// W14 (2026-10-23 editor overhaul): the website editor edits the site document
// (`site.json` inside a website-source@1 bundle) — the format of nearly every
// stored website — with the unified edit bar, and saves without breaking the bundle.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  deleteSection,
  duplicateSection,
  isSiteBundleManifest,
  isSiteDoc,
  moveSection,
  setSectionContent,
  setSectionStyle,
  siteEnvelopeOf,
  siteImagePaths,
} from "../src/shell/website-local/website-site-doc.ts";
import {
  applySiteBarCommand,
  normalizePick,
  siteLinkPath,
  siteSelectionContext,
} from "../src/shell/website-local/website-site-bar.ts";
import {
  siteImagePathFor,
  siteManifestWith,
  validateSiteImage,
} from "../src/shell/website-local/website-site-files.ts";
import {
  puckToSiteSections,
  siteSectionsToPuck,
} from "../src/shell/website-local/website-site-puck-map.ts";
import { EDIT_BAR_CANON } from "../src/shell/edit-bar-canon-table.ts";

const tt = (text, vars) => (vars ? text.replace(/\{(\w+)\}/g, (_, key) => String(vars[key])) : text);

function site() {
  const hero = {
    id: "hero-1",
    type: "hero",
    content: {
      eyebrow: "鞋靴",
      title: "每一步",
      subtitle: "精选好鞋",
      primaryCtaLabel: "立即咨询",
      primaryCtaHref: "/contact",
      image: { keyword: "鞋", alt: "首图", url: "images/a.webp" },
    },
    style: { backgroundColor: "#0f172a", textColor: "#ffffff", alignment: "center" },
  };
  const about = {
    id: "about-1",
    type: "about",
    content: { title: "关于", body: ["第一段", "第二段"], bullets: ["15 年", "皮鞋"] },
    style: { backgroundColor: "#ffffff", textColor: "#0f172a", alignment: "left" },
  };
  const footer = {
    id: "footer-1",
    type: "footer",
    content: { title: "页脚", links: [{ label: "首页", href: "/" }] },
    style: {},
  };
  const sections = [hero, about, footer];
  return {
    siteName: "鞋靴旗舰店",
    themeColor: "#0ea5e9",
    backgroundColor: "#ffffff",
    sections: JSON.parse(JSON.stringify(sections)),
    pages: [
      { id: "home", name: "首页", path: "/", sections },
      { id: "contact", name: "联系", path: "/contact", sections: [JSON.parse(JSON.stringify(footer))] },
    ],
  };
}

const manifest = {
  schema: "website-source@1",
  entrypoint: "index.html",
  files: [
    { path: "index.html", sha256: "1".repeat(64), byteSize: 600, mediaType: "text/html" },
    { path: "site.json", sha256: "2".repeat(64), byteSize: 4000, mediaType: "application/json" },
    { path: "assets/app.js", sha256: "3".repeat(64), byteSize: 18000, mediaType: "text/javascript" },
    { path: "images/a.webp", sha256: "4".repeat(64), byteSize: 9000, mediaType: "image/webp" },
  ],
};

test("bundle manifests and site documents are told apart from the strict carrier", () => {
  assert.equal(isSiteBundleManifest(manifest), true);
  assert.equal(siteEnvelopeOf(JSON.stringify(manifest))?.kind, "bundle");
  assert.equal(siteEnvelopeOf(JSON.stringify(site()))?.kind, "structured");
  assert.equal(isSiteDoc(site()), true);
  // strict website-source@1 (theme + pages[].sectionIds) stays on its own path
  const strict = { schema: "website-source@1", version: 1, title: "x", theme: { accent: "#000", background: "#fff", text: "#000" }, pages: [{ id: "home", path: "/", title: "x", sectionIds: ["a"] }], sections: [{ id: "a", kind: "hero" }] };
  assert.equal(siteEnvelopeOf(JSON.stringify(strict)), null);
  assert.equal(siteEnvelopeOf("not json"), null);
});

test("edits land on the page and on the mirrored top-level sections", () => {
  let doc = setSectionStyle(site(), 0, "hero-1", "textColor", "#c2410c");
  doc = setSectionContent(doc, 0, "hero-1", ["image", "alt"], "新替代文字");
  assert.equal(doc.pages[0].sections[0].style.textColor, "#c2410c");
  assert.equal(doc.sections[0].style.textColor, "#c2410c");
  assert.equal(doc.sections[0].content.image.alt, "新替代文字");
  doc = moveSection(doc, 0, "about-1", "front");
  assert.deepEqual(doc.pages[0].sections.map((s) => s.id), ["about-1", "hero-1", "footer-1"]);
  assert.deepEqual(doc.sections.map((s) => s.id), ["about-1", "hero-1", "footer-1"]);
  const dup = duplicateSection(doc, 0, "hero-1");
  assert.equal(dup.id, "hero-1-copy");
  assert.deepEqual(dup.doc.pages[0].sections.map((s) => s.id), ["about-1", "hero-1", "hero-1-copy", "footer-1"]);
  // other pages untouched
  assert.deepEqual(dup.doc.pages[1].sections.map((s) => s.id), ["footer-1"]);
  const removed = deleteSection(dup.doc, 0, "hero-1-copy");
  assert.equal(removed.pages[0].sections.length, 3);
  // the last section of a page cannot be deleted
  assert.equal(deleteSection(removed, 1, "footer-1"), removed);
  assert.deepEqual(siteImagePaths(removed), ["images/a.webp"]);
});

test("text pick → canonical text bar; only fields the site runtime paints", () => {
  const doc = site();
  const pick = normalizePick(doc, 0, { sectionId: "hero-1", field: "title", kind: "text" });
  const context = siteSelectionContext(doc, 0, pick, tt);
  assert.equal(context.bar, "text");
  const ids = context.controls.map((c) => c.id);
  assert.deepEqual(ids, ["text-color", "align", "arrange", "duplicate", "delete"]);
  for (const id of ids) assert.ok(EDIT_BAR_CANON[id], `${id} is canonical`);
  // never offered: the runtime has no field for them (would be a fake success)
  for (const id of ["font-size", "bold", "italic", "underline", "font-family", "radius", "border", "opacity"]) {
    assert.equal(ids.includes(id), false, id);
  }
  assert.deepEqual(context.controls.find((c) => c.id === "align").options.map((o) => o.value), ["left", "center"]);
  // first section: it can only move down
  assert.deepEqual(context.controls.find((c) => c.id === "arrange").options.map((o) => o.value), ["backward", "back"]);
  const colored = applySiteBarCommand(doc, 0, pick, { controlId: "text-color", value: "#123456" });
  assert.equal(colored.doc.pages[0].sections[0].style.textColor, "#123456");
  const aligned = applySiteBarCommand(doc, 0, pick, { controlId: "align", value: "left" });
  assert.equal(aligned.doc.pages[0].sections[0].style.alignment, "left");
  // bad values do nothing
  assert.equal(applySiteBarCommand(doc, 0, pick, { controlId: "text-color", value: "red;}" }).type, "none");
  assert.equal(applySiteBarCommand(doc, 0, pick, { controlId: "align", value: "justify" }).type, "none");
});

test("a button label gets the link control that writes its paired href", () => {
  const doc = site();
  assert.deepEqual(siteLinkPath("primaryCtaLabel", doc.pages[0].sections[0].content), ["primaryCtaHref"]);
  assert.deepEqual(siteLinkPath("links.0.label", doc.pages[0].sections[2].content), ["links", 0, "href"]);
  assert.equal(siteLinkPath("title", doc.pages[0].sections[0].content), null);
  const pick = normalizePick(doc, 0, { sectionId: "hero-1", field: "primaryCtaLabel", kind: "text" });
  const context = siteSelectionContext(doc, 0, pick, tt);
  assert.equal(context.controls.find((c) => c.id === "link").value, "/contact");
  const linked = applySiteBarCommand(doc, 0, pick, { controlId: "link", value: " /about " });
  assert.equal(linked.doc.pages[0].sections[0].content.primaryCtaHref, "/about");
});

test("image pick → image bar (replace, alt); section pick → fill + object group", () => {
  const doc = site();
  const pick = normalizePick(doc, 0, { sectionId: "hero-1", field: "image.url", kind: "image" });
  assert.equal(pick.field, "image");
  const context = siteSelectionContext(doc, 0, pick, tt);
  assert.equal(context.bar, "image");
  assert.deepEqual(context.controls.map((c) => c.id), ["replace", "alt", "arrange", "duplicate", "delete"]);
  assert.deepEqual(applySiteBarCommand(doc, 0, pick, { controlId: "replace" }), { type: "replace-image", sectionId: "hero-1", field: "image" });
  const alt = applySiteBarCommand(doc, 0, pick, { controlId: "alt", value: "换了" });
  assert.equal(alt.doc.pages[0].sections[0].content.image.alt, "换了");
  const section = normalizePick(doc, 0, { sectionId: "about-1", field: "", kind: "text" });
  const sectionBar = siteSelectionContext(doc, 0, section, tt);
  assert.equal(sectionBar.bar, "shape");
  assert.deepEqual(sectionBar.controls.map((c) => c.id), ["fill", "arrange", "duplicate", "delete"]);
  const filled = applySiteBarCommand(doc, 0, section, { controlId: "fill", value: "#fef3c7" });
  assert.equal(filled.doc.pages[0].sections[1].style.backgroundColor, "#fef3c7");
  const moved = applySiteBarCommand(doc, 0, section, { controlId: "arrange", value: "forward" });
  assert.deepEqual(moved.doc.pages[0].sections.map((s) => s.id), ["about-1", "hero-1", "footer-1"]);
  const dup = applySiteBarCommand(doc, 0, section, { controlId: "duplicate" });
  assert.equal(dup.select.sectionId, "about-1-copy");
  // a one-section page offers neither delete nor arrange
  const lone = siteSelectionContext(doc, 1, normalizePick(doc, 1, { sectionId: "footer-1", field: "", kind: "text" }), tt);
  assert.deepEqual(lone.controls.map((c) => c.id), ["fill", "duplicate"]);
});

test("Puck round trip keeps string lists, styles and unknown keys", () => {
  const doc = site();
  const base = doc.pages[0].sections;
  base[1].layoutHint = "keep-me";
  const data = siteSectionsToPuck(base);
  assert.deepEqual(data.content[1].props.bullets, [{ text: "15 年" }, { text: "皮鞋" }]);
  data.content[1].props.bullets[0].text = "16 年";
  data.content[0].props.title = "改过的标题";
  const back = puckToSiteSections(data, base, doc);
  assert.deepEqual(back[1].content.bullets, ["16 年", "皮鞋"]);
  assert.deepEqual(back[1].content.body, ["第一段", "第二段"]);
  assert.equal(back[1].layoutHint, "keep-me");
  assert.equal(back[0].content.title, "改过的标题");
  assert.equal(back[0].style.alignment, "center");
  assert.deepEqual(puckToSiteSections(siteSectionsToPuck(base), base, doc), base);
});

test("save keeps the bundle: only site.json (and new images) change in the manifest", () => {
  const envelope = siteEnvelopeOf(JSON.stringify(manifest));
  const next = JSON.parse(
    siteManifestWith(envelope, [
      { path: "site.json", blobId: "project-assets:u/x/editor-staging/1/a", digest: "9".repeat(64), mediaType: "application/json", byteSize: 4100 },
      { path: "images/new.png", blobId: "project-assets:u/x/editor-staging/1/b", digest: "8".repeat(64), mediaType: "image/png", byteSize: 2048 },
    ]),
  );
  assert.equal(next.entrypoint, "index.html");
  assert.equal(next.files.length, 5);
  assert.equal(next.files.find((f) => f.path === "site.json").sha256, "9".repeat(64));
  assert.equal(next.files.find((f) => f.path === "index.html").sha256, "1".repeat(64));
  assert.equal(next.files.find((f) => f.path === "images/new.png").mediaType, "image/png");
  const taken = new Set(["images/photo.png"]);
  assert.equal(siteImagePathFor({ name: "Photo.PNG", type: "image/png" }, (p) => taken.has(p)), "images/photo-1.png");
  assert.match(siteImagePathFor({ name: "图.webp", type: "image/webp" }, () => false), /^images\/[A-Za-z0-9._-]+\.webp$/);
  assert.equal(validateSiteImage({ type: "image/svg+xml", size: 4000 }) !== "", true);
  assert.equal(validateSiteImage({ type: "image/png", size: 9 * 1024 * 1024 }) !== "", true);
  assert.equal(validateSiteImage({ type: "image/jpeg", size: 40_000 }), "");
});

test("route delegates site documents and never reloads over its own saves", () => {
  const route = readFileSync("src/shell/advanced-routes/WebsiteLocalRoute.tsx", "utf8");
  assert.match(route, /websiteSiteEnvelopeFromText\(entryText\)/);
  assert.match(route, /<WebsiteSiteWorkbench/);
  assert.match(route, /ownSavedRevisionsRef\.current\.has\(/);
  const workbench = readFileSync("src/shell/website-local/WebsiteSiteWorkbench.tsx", "utf8");
  // one Puck instance; the face is a prop, not a key
  assert.match(workbench, /key=\{`page:\$\{pageIndex\}`\}/);
  assert.match(workbench, /face=\{websiteFaceForMode\(mode\)\}/);
  // the save is a real revision; failures surface as ok:false
  assert.match(workbench, /saveSiteDocRevision\(/);
  assert.match(workbench, /ok: false as const, error/);
  const render = readFileSync("src/shell/website-local/website-site-render.tsx", "utf8");
  // D6: the preview paints with the site's colours, never host tokens
  assert.doesNotMatch(render, /var\(--awb-|var\(--pchrome-/);
  assert.doesNotMatch(render, /dangerouslySetInnerHTML|innerHTML/);
});
