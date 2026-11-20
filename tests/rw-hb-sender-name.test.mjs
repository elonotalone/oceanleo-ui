// Sender name above the bubble (wave 2026-11-20 roles, unit HB; rulings (6), (m)): another person's name sits directly
// above their bubble inside the bubble's right-aligned column, with an initial on a background defined in light and
// dark; the viewer's own messages carry no name; the /share snapshot page renders no names at all.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import "./helpers/w1-jsdom-window.mjs";

globalThis.React = React;
const tt = dataModule(`export function useUI(){return (value,vars)=>value.replace(/\\{(\\w+)\\}/g,(_,key)=>String(vars?.[key]??"{"+key+"}"));}`);
const { AgentTranscriptBubble } = await import(await compileModule("src/shell/AgentTranscriptBubble.tsx", {
  "../i18n/ui/useUI": tt,
  "./Markdown": dataModule(`export const Markdown=({children})=>children; export const TypewriterMarkdown=({children})=>children; export const HighlightedText=({text})=>text; export const splitHighlights=(text)=>[{text,match:false}];`),
  "next/link": dataModule(`export default function Link(p){return globalThis.React.createElement("a",p,p.children);}`),
}));

const other = { user_id: "member-b", name: "测试甲", initial: "测" };
const message = { id: 7, role: "user", kind: "text", content: "Please check the contract", author: other,
  meta: { attachments: [{ name: "a.pdf", url: "https://example.test/a.pdf" }] } };
function render(props) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(React.createElement(AgentTranscriptBubble, { message, showAuthors: true, ...props }));
  return host;
}

test("another person's name is the first line of the right-aligned bubble column, directly above the bubble", () => {
  const host = render({ viewerUserId: "owner-a" });
  const column = host.querySelector('[data-testid="task-user-bubble"]');
  assert.ok(column.classList.contains("items-end"), "bubble column is right-aligned");
  const label = column.firstElementChild;
  assert.ok(label.matches("[data-message-author]"), "name sits inside the bubble's column, before attachments and text");
  assert.equal(host.querySelectorAll("[data-message-author]").length, 1);
  assert.equal(label.textContent, "测测试甲");
  const initial = label.querySelector('span[aria-hidden="true"]');
  assert.ok(initial.classList.contains("bg-stone-200"), "light background is a defined colour");
  assert.ok(initial.classList.contains("dark:bg-neutral-700"), "dark background is a defined colour");
  assert.doesNotMatch(host.innerHTML, /background-secondary/);
});

test("the viewer's own messages and unknown viewers never show a name", () => {
  assert.equal(render({ viewerUserId: other.user_id }).querySelector("[data-message-author]"), null);
  assert.equal(render({ viewerUserId: null }).querySelector("[data-message-author]"), null);
  assert.equal(render({ viewerUserId: "owner-a", showAuthors: false }).querySelector("[data-message-author]"), null);
});

test("the label reads the person's name from the server, never an email", () => {
  const named = render({ viewerUserId: "owner-a", message: { ...message, author: { user_id: "x", name: "River Lee", initial: "R" } } });
  assert.match(named.querySelector("[data-message-author]").textContent, /River Lee/);
  const email = render({ viewerUserId: "owner-a", message: { ...message, author: { user_id: "x", name: "river@example.com", initial: "r" } } });
  assert.doesNotMatch(email.innerHTML, /example\.com/);
});

test("the /share snapshot page renders no sender names", () => {
  const replay = readFileSync(new URL("../src/shell/replay/AgentReplayPage.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(replay, /AgentTranscriptBubble|AcpTranscript|showAuthors|data-message-author/);
});
