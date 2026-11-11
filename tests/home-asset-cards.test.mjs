import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { HOME_ASSET_CARDS_MESSAGES } from "../src/i18n/ui/messages/home-asset-cards-copy.ts";
import { LOCALES } from "../src/i18n/config.ts";
import { homeAssetSections, homeAssetCardKey } from "../src/shell/home-asset-cards-model.ts";
import { resolvePublicAssetMedia } from "../src/lib/asset-delivery.ts";

const { createRoot } = await import("react-dom/client");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.localStorage = window.localStorage;
globalThis.__homeCardsLocale = "en";
globalThis.__homeCardsMessages = HOME_ASSET_CARDS_MESSAGES;
const reactUrl = pathToFileURL(createRequire(import.meta.url).resolve("react")).href;
const ui = dataModule(`export function useUI() { return (value, vars) => {
  const common = {"prompt":"prompt", "添加 prompt":"Add prompt", "查看":"View", "我的":"Mine"};
  let text = globalThis.__homeCardsMessages[globalThis.__homeCardsLocale]?.[value] || common[value] || value;
  return text.replace(/\\{(\\w+)\\}/g, (match, key) => vars?.[key] ?? match);
}; }`);
// Preserve real storage, shell and resolver. Dialogs have their own tests; exercise their callback contract here.
const modals = dataModule(`import React from ${JSON.stringify(reactUrl)};
  export function AddPromptModal(props) {
    globalThis.__homeAddProps = props;
    return React.createElement("div", {"data-test-add":true});
  }
  export function PromptCardModal(props) {
    globalThis.__homeEditProps = props;
    return React.createElement("div", {"data-test-edit":true});
  }`);
const { HomeAssetCards } = await import(await compileModule("src/shell/HomeAssetCards.tsx", {
  "../i18n/ui/useUI": ui,
  "./HomePromptModals": modals,
}));

const card = (kind, id, extra = {}) => ({
  ref: { kind, id }, title: `${kind} ${id}`, preview: { key: `assets/charts/${id}.png` }, ...extra,
});
const image = card("platform", "same", { promptText: "Write a [subject]  ", summary: "Actual asset" });
const website = card("template", "same", { preview: { key: "tpl-material/website-demo" } });
const sections = [{ id:"essay", items:[card("platform", "doc")] }, { id:"image", items:[image] }, { id:"website", items:[website] }];
const props = { sections, siteId:"oceanleo", onPick() {}, onOpenAsset() {} };
const render = (extra = {}) => renderToStaticMarkup(React.createElement(HomeAssetCards, { ...props, ...extra }));
const storedCard = { id:"custom-old", title:"My old prompt", desc:"Stored before migration", icon:"✨", prompt:"Keep [this]", category:"Mine", custom:true };

async function mounted(extra = {}, fn) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(React.createElement(HomeAssetCards, { ...props, ...extra })));
  try { await fn(container, root); }
  finally { await act(async () => root.unmount()); container.remove(); }
}
async function click(element) {
  assert.ok(element, "click target exists");
  await act(async () => element.click());
}

test("model renders four ordered sections without reordering curated assets or conflating sources", () => {
  const second = card("platform", "second");
  const normalized = homeAssetSections([...sections, {id:"image", items:[second]}]);
  assert.deepEqual(normalized.map((section) => section.id), ["video", "image", "website", "essay"]);
  assert.deepEqual(normalized[1].items, [image, second]);
  assert.notEqual(homeAssetCardKey(image.ref), homeAssetCardKey(website.ref));
});

test("four tabs offer one panel, defaulting to the first populated type", () => {
  const doc = new window.DOMParser().parseFromString(render(), "text/html");
  assert.equal(doc.querySelectorAll('[role="tab"]').length, 4);
  assert.equal(doc.querySelector('[role="tabpanel"]').dataset.homeAssetSection, "image");
  assert.equal(doc.querySelectorAll("[data-home-asset-section]").length, 1);
  assert.equal(doc.querySelectorAll("[data-home-asset-ref]").length, 1);
});

test("category activation replaces the cards without scrolling", async () => {
  const calls = [];
  const previous = window.HTMLElement.prototype.scrollIntoView;
  window.HTMLElement.prototype.scrollIntoView = function(options) { calls.push(options); };
  try {
    await mounted({}, async (container) => {
      const button = [...container.querySelectorAll("nav button")].find((node) => node.textContent === "Website");
      await click(button);
      assert.deepEqual(calls, []);
      assert.equal(button.getAttribute("aria-selected"), "true");
      assert.equal(container.querySelectorAll("[data-home-asset-section]").length, 1);
      assert.equal(container.querySelector('[role="tabpanel"]').dataset.homeAssetSection, "website");
      assert.equal(container.querySelectorAll("[data-home-asset-ref]").length, 1);
    });
  } finally { window.HTMLElement.prototype.scrollIntoView = previous; }
});

test("card and prompt chip independently dispatch the exact ref and unchanged prompt", async () => {
  const opened = [], picked = [];
  await mounted({ onOpenAsset: (ref) => opened.push(ref), onPick: (text) => picked.push(text) }, async (container) => {
    const tile = container.querySelector('[data-home-asset-ref="platform:same"]');
    await click(tile.querySelector("[data-app-card-primary]"));
    assert.deepEqual(picked, [image.promptText]);
    assert.deepEqual(opened, []);
    await click(tile.querySelector("[data-app-card-main]"));
    assert.deepEqual(opened, [image.ref]);
    assert.deepEqual(picked, [image.promptText]);
    await click([...container.querySelectorAll("nav button")].find((node) => node.textContent === "Website"));
    await click(container.querySelector('[data-home-asset-ref="template:same"] [data-app-card-main]'));
    assert.deepEqual(opened, [image.ref, website.ref]);
    assert.equal(container.querySelectorAll('[role="dialog"]').length, 0);
  });
});

test("no empty prompt chips; every asset still has an independent native keyboard button", () => {
  const doc = new window.DOMParser().parseFromString(render({ sections:[{id:"image", items:[image, card("platform", "blank", {promptText:"   "})]}] }), "text/html");
  assert.equal(doc.querySelectorAll("[data-app-card-primary]").length, 1);
  assert.equal(doc.querySelectorAll("[data-home-asset-ref] button[data-app-card-main]").length, 2);
  assert.equal(doc.querySelectorAll("button button, [role=button]").length, 0);
  assert.match(doc.querySelector("[data-app-card-main]").getAttribute("aria-label"), /^Open asset:/);
  assert.match(doc.querySelector("[data-home-asset-ref]").className, /focus-within.*translate-y-0/);
});

test("card previews use the public resolver's exact asset paths and purpose for every family", () => {
  for (const family of ["cn", "com", "ws"]) {
    for (const item of [image, website]) {
      const doc = new window.DOMParser().parseFromString(render({family, sections:[{id:"image",items:[item]}]}), "text/html");
      const tile = doc.querySelector(`[data-home-asset-ref="${homeAssetCardKey(item.ref)}"]`);
      const src = resolvePublicAssetMedia(item.preview.key, {purpose:"thumb", family});
      assert.ok(tile.querySelectorAll("img").length > 0);
      assert.ok([...tile.querySelectorAll("img")].every((img) => img.getAttribute("src") === src));
    }

  }
});

test("URL previews are preserved by the resolver and real video removes the exceptional empty state", () => {
  const url = "https://example.org/poster.webp?signature=public";
  const html = render({sections:[{id:"video", items:[card("platform", "film", {preview:{url}})]}]});
  assert.match(html, /src="https:\/\/example.org\/poster.webp\?signature=public"/);
  assert.doesNotMatch(html, /data-home-asset-empty="video"/);
  assert.match(html, /platform:film/);
});

test("loading and failure retain one panel and prompt entry without falsely claiming empty video", () => {
  for (const state of [{loading:true}, {error:true}]) {
    const html = render({...state, sections:[]});
    assert.equal((html.match(/data-home-asset-section=/g) || []).length, 1);
    assert.doesNotMatch(html, /data-home-asset-empty=/);
    assert.match(html, /data-home-add-prompt/);
    assert.match(html, state.loading ? /role="status"/ : /role="alert"/);
  }
});

test("existing custom prompt storage loads, picks, edits, saves and deletes without becoming an asset", async () => {
  window.localStorage.clear();
  window.localStorage.setItem("oceanleo_home_prompts:oceanleo", JSON.stringify([storedCard]));
  const picked = [], opened = [];
  await mounted({ onPick:(text) => picked.push(text), onOpenAsset:(ref) => opened.push(ref) }, async (container) => {
    const custom = container.querySelector("[data-home-custom-prompts]");
    assert.match(custom.textContent, /My old prompt/);
    assert.equal(custom.querySelectorAll("img").length, 0);
    await click(custom.querySelector("[data-app-card-main]"));
    assert.deepEqual(picked, [storedCard.prompt]);
    assert.deepEqual(opened, []);
    await click(custom.querySelector('[aria-label="Edit prompt: My old prompt"]'));
    assert.equal(globalThis.__homeEditProps.card.id, storedCard.id);
    await act(async () => globalThis.__homeEditProps.onSave({...storedCard, title:"Updated"}));
    assert.equal(JSON.parse(window.localStorage.getItem("oceanleo_home_prompts:oceanleo"))[0].title, "Updated");
    await click(custom.querySelector('[aria-label="Edit prompt: Updated"]'));
    await act(async () => globalThis.__homeEditProps.onDelete());
    assert.deepEqual(JSON.parse(window.localStorage.getItem("oceanleo_home_prompts:oceanleo")), []);
  });
});

test("Add prompt keeps presets, creates persistent custom cards and supports use from the editing dialog", async () => {
  window.localStorage.clear();
  const picked = [];
  await mounted({onPick:(text) => picked.push(text)}, async (container) => {
    await click(container.querySelector("[data-home-add-prompt]"));
    assert.ok(globalThis.__homeAddProps.presets.length > 0);
    await act(async () => globalThis.__homeAddProps.onAdd({...storedCard, id:"preset", custom:false}));
    await act(async () => globalThis.__homeAddProps.onClose());
    const stored = JSON.parse(window.localStorage.getItem("oceanleo_home_prompts:oceanleo"));
    assert.equal(stored.length, 1);
    assert.match(stored[0].id, /^custom-/);
    await click(container.querySelector('[aria-label="Edit prompt: My old prompt"]'));
    await act(async () => globalThis.__homeEditProps.onUse(stored[0].prompt));
    assert.deepEqual(picked, [storedCard.prompt]);
    assert.equal(container.querySelectorAll("[data-test-edit]").length, 0);
  });
});

test("site switch isolates existing prompts and closes dialogs before new site's cards can be saved", async () => {
  window.localStorage.clear();
  window.localStorage.setItem("oceanleo_home_prompts:oceanleo", JSON.stringify([storedCard]));
  await mounted({}, async (container, root) => {
    await click(container.querySelector('[aria-label="Edit prompt: My old prompt"]'));
    await act(async () => root.render(React.createElement(HomeAssetCards, {...props, siteId:"other"})));
    assert.doesNotMatch(container.querySelector("[data-home-custom-prompts]").textContent, /My old prompt/);
    assert.equal(container.querySelectorAll("[data-test-edit]").length, 0);
    assert.equal(window.localStorage.getItem("oceanleo_home_prompts:other"), null);
    assert.equal(JSON.parse(window.localStorage.getItem("oceanleo_home_prompts:oceanleo"))[0].id, storedCard.id);
  });
});

test("new UI copy covers every locale, with English fallback outside Chinese locales", () => {
  for (const locale of LOCALES) {
    const table = HOME_ASSET_CARDS_MESSAGES[locale];
    assert.deepEqual(Object.keys(table), Object.keys(HOME_ASSET_CARDS_MESSAGES.zh));
    if (!locale.startsWith("zh")) assert.ok(Object.values(table).every((text) => !/[\u3400-\u9fff]/u.test(text)), locale);
  }
  for (const locale of LOCALES) {
    globalThis.__homeCardsLocale = locale;
    const html = render({sections:[], loading:true});
    if (!locale.startsWith("zh")) assert.doesNotMatch(html, /[\u3400-\u9fff]/u);
  }
  globalThis.__homeCardsLocale = "en";
});

const { groupAppMaterials } = await import(await compileModule("src/shell/AppMaterialsPanel.tsx", { "../i18n/ui/useUI": ui }));
const appMaterials = [
  { id:"web-1", appId:"landing", siteKey:"website", title:"Landing sample", artifactType:"website", previewKey:"assets/charts/web-1.png" },
  { id:"web-2", appId:"landing", siteKey:"website", title:"Second sample", artifactType:"website" },
  { id:"deck-1", appId:"slides", siteKey:"ppt", title:"Wrong site", artifactType:"deck" },
  { id:"web-3", app_id:"store", site_key:"website", app_name:"Shop", title:"Store sample", artifact_type:"website" },
];

test("app material grouping preserves order, names, typed rows and site isolation", () => {
  const groups = groupAppMaterials([...appMaterials, appMaterials[0]], "website", {landing:"Landing pages"});
  assert.deepEqual(groups.map(({appId,name}) => ({appId,name})), [{appId:"landing",name:"Landing pages"},{appId:"store",name:"Shop"}]);
  assert.deepEqual(groups[0].materials, appMaterials.slice(0,2));
  assert.equal(groups[0].materials[0].artifactType, "website");
  assert.deepEqual(groupAppMaterials(appMaterials,"ppt").map(group => group.materials[0].id), ["deck-1"]);
});

test("sub-site card opens the app's complete materials without prompt pairing; main stays on asset tabs", async () => {
  const opened = [], picked = [];
  await mounted({siteId:"website",materials:appMaterials,appNames:{landing:"Landing pages"},onOpenApp:group=>opened.push(group),onPick:text=>picked.push(text)}, async container => {
    assert.equal(container.querySelectorAll("[data-home-material-app]").length,2);
    assert.equal(container.querySelector('[role="tablist"]'),null);
    assert.equal(container.querySelector('[data-app-card-primary]'),null);
    assert.equal(container.querySelector('[data-home-custom-prompts]'),null);
    await click(container.querySelector('[data-home-material-app="landing"] [data-app-card-main]'));
    assert.equal(opened.length,1);
    assert.deepEqual(opened[0].materials, appMaterials.slice(0,2));
    assert.equal(opened[0].name,"Landing pages");
    assert.deepEqual(picked,[]);
  });
  assert.match(render(), /role="tablist"/);
  assert.doesNotMatch(render(), /data-home-material-app=/);
});
