import assert from "node:assert/strict";
import test from "node:test";
import { composerLinkRanges, normaliseComposerUrl, openComposerLink } from "../src/shell/composer-links.ts";

test("recognizes protocol and www links and excludes Chinese and ASCII punctuation", () => {
  const text = "URL https://example.com/a，www.example.org/path。 (http://example.net/x),";
  assert.deepEqual(composerLinkRanges(text), [
    { from: 4, to: 25, raw: "https://example.com/a", href: "https://example.com/a" },
    { from: 26, to: 46, raw: "www.example.org/path", href: "https://www.example.org/path" },
    { from: 49, to: 69, raw: "http://example.net/x", href: "http://example.net/x" },
  ]);
});

test("bare domains are not links and links inside text are detected", () => {
  assert.deepEqual(composerLinkRanges("example.com and foo.example.com"), []);
  assert.deepEqual(composerLinkRanges("前缀https://example.com后缀"), [{ from: 2, to: 21, raw: "https://example.com", href: "https://example.com" }]);
});

test("closedOnly waits for whitespace or blur at the end of the editor", () => {
  assert.deepEqual(composerLinkRanges("https://example.com", true), []);
  assert.equal(composerLinkRanges("https://example.com ", true).length, 1);
});

test("normalizes www links and icon opens a safe new tab", () => {
  assert.equal(normaliseComposerUrl("www.example.com"), "https://www.example.com");
  const calls = [];
  globalThis.window = { open: (...args) => { calls.push(args); return {}; } };
  openComposerLink("www.example.com");
  assert.deepEqual(calls[0], ["https://www.example.com", "_blank", "noopener,noreferrer"]);
  delete globalThis.window;
});
