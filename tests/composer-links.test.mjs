import assert from "node:assert/strict";
import test from "node:test";
import { composerLinkRanges, normaliseComposerUrl } from "../src/shell/composer-links.ts";

test("recognizes protocol and www links and excludes trailing punctuation", () => {
  assert.deepEqual(composerLinkRanges("See https://example.com/a, www.example.org/path。"), [
    { from: 4, to: 25, raw: "https://example.com/a", href: "https://example.com/a" },
    { from: 27, to: 47, raw: "www.example.org/path", href: "https://www.example.org/path" },
  ]);
});

test("bare domains are not links", () => {
  assert.deepEqual(composerLinkRanges("example.com and foo.example.com"), []);
});

test("normalizes www links without changing submitted text", () => {
  assert.equal(normaliseComposerUrl("www.example.com"), "https://www.example.com");
});
