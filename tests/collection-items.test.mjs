import './helpers/w1-jsdom-window.mjs';
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const { CollectionItemCard, CollectionItemRow, CollectionItemList } = await import(await compileModule("src/shell/collection-items.tsx"));
const ui = dataModule('export const useUI = () => (s) => s;');
const { AppDirectory } = await import(await compileModule("src/shell/AppDirectory.tsx", { "../i18n/ui/useUI": ui }));

for (const Item of [CollectionItemCard, CollectionItemRow]) {
  test(`${Item.name}: renders separate primary and favorite controls`, () => {
    const props = { cover: React.createElement("img", { src: "/cover.jpg", alt: "" }), title: "Example", metadata: "Image · Today", onOpen() {}, actions: React.createElement("button", { type: "button", onClick() {} }, "Favorite") };
    const html = renderToStaticMarkup(React.createElement(Item, props));
    const host = document.createElement("div");
    host.innerHTML = html;
    assert.equal(host.querySelector(".leo-collection-open").tagName, "BUTTON");
    assert.equal(host.querySelectorAll("button").length, 2);
    assert.equal(host.querySelector("button button"), null);
    assert.match(html, /text-\[13px\] font-medium/);
    assert.match(html, /text-\[11px\]/);
    assert.doesNotMatch(html, /<button[^>]*>(?:(?!<\/button>)[\s\S])*<button/);
  });
  test(`${Item.name}: native links preserve address and selected/drag markers`, () => {
    const html = renderToStaticMarkup(React.createElement(Item, { cover: "cover", title: "Project", onOpen() {}, openHref: "/projects/one", selected: true, containerProps: { draggable: true, "data-entry": "one" } }));
    assert.match(html, /<a href="\/projects\/one"/);
    assert.match(html, /data-selected="true"/);
    assert.match(html, /draggable="true"/);
    assert.match(html, Item === CollectionItemRow ? /h-9 w-9/ : /aspect-video/);
  });
}

test("list uses one enclosing border and shared dividers", () => {
  const html = renderToStaticMarkup(React.createElement(CollectionItemList, null, "entries"));
  assert.match(html, /divide-y divide-neutral-100/);
  assert.match(html, /rounded-xl border border-neutral-200/);
});

test("cards without metadata keep the same reserved second line", () => {
  const props = { cover: "cover", title: "Project", onOpen() {} };
  const body = (values) => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(React.createElement(CollectionItemCard, values));
    return host.querySelectorAll("p");
  };
  const empty = body(props), filled = body({ ...props, metadata: "Image" });
  assert.equal(empty.length, 2);
  assert.equal(empty[1].textContent, "\u00a0");
  assert.equal(empty[1].className, filled[1].className);
});

test("live Workspace AppDirectory cards retain actions and use Library geometry", () => {
  const html = renderToStaticMarkup(React.createElement(AppDirectory, { items: [{ id: "one", name: "One", icon: "✦", added: true }], onOpen() {}, onAdd() {} }));
  assert.match(html, /data-collection-card="one"/);
  assert.match(html, /aspect-video/);
  assert.match(html, /text-\[13px\] font-medium/);
  assert.match(html, /aria-pressed="true"/);
  assert.doesNotMatch(html, /aspect-\[4\/3\]/);
});
