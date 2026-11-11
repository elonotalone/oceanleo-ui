import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  NAV_SOURCE,
  navEntries,
  navIdsForScope,
  navEntryById,
} from "../src/shell/nav-source/index.ts";

const source = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const expected = ["home", "bay", "leochat", "projects", "devices", "workspace", "schedules", "library", "history"];

test("every family site receives the same nine primary navigation entries", () => {
  assert.deepEqual(navEntries("portal").map((entry) => entry.id), expected);
  assert.deepEqual(navEntries("portal", {}, "footer"), []);
  assert.equal(new Set(NAV_SOURCE.map((entry) => entry.id)).size, NAV_SOURCE.length);
  for (const entry of NAV_SOURCE) {
    assert.deepEqual(Object.keys(entry.placements), ["portal"], `${entry.id} must not have a separate sub-site placement`);
  }
  const orders = NAV_SOURCE.map((entry) => entry.placements.portal.order);
  assert.equal(new Set(orders).size, orders.length);
});

test("all sites use the main site's New Task label and icon and shared project/device entries", () => {
  const entries = navEntries("portal");
  assert.deepEqual(entries[0], {
    id: "home", href: "/", external: false, labelKey: "newTask", labelSource: "nav",
    iconId: "newTask", exact: true, section: "primary", supportsDisclosure: false,
  });
  assert.equal(entries.find((entry) => entry.id === "projects").href, "/projects");
  assert.equal(entries.find((entry) => entry.id === "devices").href, "/devices");
  assert.equal(entries.find((entry) => entry.id === "devices").labelKey, "我的设备");
  assert.equal(entries.find((entry) => entry.id === "workspace").iconId, "panel");
  assert.equal(entries.find((entry) => entry.id === "history").supportsDisclosure, true);
});

test("retired per-site visibility options cannot hide shared sections", () => {
  assert.deepEqual(navEntries("portal", {
    withExplore: false, withBay: false, withWorkspace: false, withMessages: false,
    withPlayground: true, withTalent: true,
  }), navEntries("portal"));
  assert.ok(!navEntries("portal").some((entry) => entry.id === "playground"));
});

test("navigation metadata and lookup agree; only the homepage uses exact matching", () => {
  assert.deepEqual(navIdsForScope("portal"), [...NAV_SOURCE]
    .sort((a, b) => a.placements.portal.order - b.placements.portal.order).map((entry) => entry.id));
  for (const entry of NAV_SOURCE) {
    assert.equal(navEntryById(entry.id), entry);
    if (entry.exact) assert.equal(entry.href, "/");
    if (entry.external) assert.equal(entry.href, undefined);
  }
});

test("navigation stays plain data, without a React or JSX dependency", () => {
  const text = source("shell/nav-source/index.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(text, /from\s*["']react(?:\/[^"']*)?["']/);
  assert.doesNotMatch(text, /<[A-Za-z][^>]*\/>/);
});

test("shared route transitions retain reduced-motion and browser fallback support", () => {
  const css = source("shell/nav-source/route-transition.css");
  const hook = source("shell/nav-source/use-route-navigation.ts");
  assert.match(css, /@supports\s*\(view-transition-name:\s*none\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /::view-transition-old\(root\)/);
  assert.match(css, /::view-transition-new\(root\)/);
  assert.doesNotMatch(css, /@keyframes/);
  assert.match(hook, /useTransition\(/);
  assert.match(hook, /startViewTransition/);
  assert.match(hook, /prefers-reduced-motion:\s*reduce/);
  assert.match(hook, /closeMessages\(\)/);
});
