import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  hitsInPaths,
  inventoryHostCoupling,
} from "../src/client-ui/scan-host-coupling.ts";
import { isActivePath } from "../src/client-ui/navigation.ts";

const here = dirname(fileURLToPath(import.meta.url));
const uiRoot = join(here, "..");
const portalRoot = "/root/projects/oceanleo";

function read(path) {
  return { path: relative(uiRoot, path) || path, source: readFileSync(path, "utf8") };
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

test("path matching does not need a browser or Next", () => {
  assert.equal(isActivePath("/library", "/library"), true);
  assert.equal(isActivePath("/library/foo", "/library"), true);
  assert.equal(isActivePath("/projects", "/library"), false);
  assert.equal(isActivePath("/projects/abc", "/projects", true), false);
  assert.equal(isActivePath("/", "/", true), true);
});

test("client-ui core has no Next or browser globals", () => {
  const files = walk(join(uiRoot, "src/client-ui"))
    .filter(
      (path) =>
        !path.includes("/client-ui/web/") &&
        !path.endsWith("scan-host-coupling.ts"),
    )
    .map(read);
  const hits = inventoryHostCoupling(files);
  assert.deepEqual(
    hits,
    [],
    `shared layer is not RN-safe:\n${hits.map((hit) => `${hit.path}:${hit.line} ${hit.kind} ${hit.text}`).join("\n")}`,
  );
});

test("real host coupling inventory from AppShell, clone-shell, library, projects", () => {
  const files = [
    read(join(uiRoot, "src/shell/AppShell.tsx")),
    {
      path: "portal/app/_components/clone-shell.tsx",
      source: readFileSync(join(portalRoot, "app/_components/clone-shell.tsx"), "utf8"),
    },
    read(join(uiRoot, "src/shell/ArtifactLibrary.tsx")),
    read(join(uiRoot, "src/shell/MyLibrary.tsx")),
    {
      path: "portal/app/library/page.tsx",
      source: readFileSync(join(portalRoot, "app/library/page.tsx"), "utf8"),
    },
    {
      path: "portal/app/projects/page.tsx",
      source: readFileSync(join(portalRoot, "app/projects/page.tsx"), "utf8"),
    },
  ];
  const hits = inventoryHostCoupling(files);
  const byPath = (suffix) => hits.filter((hit) => hit.path.endsWith(suffix));

  const appShell = byPath("src/shell/AppShell.tsx");
  assert.ok(
    appShell.some((hit) => hit.kind === "next-import" && hit.text.includes("next/link")),
    "AppShell still imports next/link (prefetch contract)",
  );
  assert.ok(
    appShell.some((hit) => hit.kind === "next-import" && hit.text.includes("next/navigation")),
    "AppShell still imports next/navigation (existing tests lock usePathname)",
  );
  assert.ok(
    appShell.some((hit) => hit.kind === "hostname-guess"),
    "AppShell help link still reads window.location.host (help-link.test lock)",
  );

  const cloneShell = byPath("clone-shell.tsx");
  assert.ok(
    cloneShell.some((hit) => hit.kind === "next-import"),
    "clone-shell remains the Next web chrome; adapter wraps it rather than deleting Link",
  );
  assert.ok(
    /NextWebHostProvider/.test(readFileSync(join(portalRoot, "app/_components/clone-shell.tsx"), "utf8")),
    "real portal entry injects NextWebHostProvider",
  );

  const artifactLibrary = byPath("ArtifactLibrary.tsx");
  assert.equal(
    artifactLibrary.filter((hit) => hit.kind === "next-import").length,
    0,
    "ArtifactLibrary itself does not import Next",
  );

  const libraryPage = byPath("library/page.tsx");
  assert.ok(
    libraryPage.every((hit) => hit.kind !== "next-import"),
    "portal /library page does not import Next; it mounts shared ArtifactLibrary",
  );
  assert.match(
    files.find((file) => file.path.endsWith("library/page.tsx")).source,
    /ArtifactLibrary/,
  );

  const projectsPage = byPath("projects/page.tsx");
  assert.ok(
    projectsPage.some((hit) => hit.kind === "next-import" && hit.text.includes("next/link")),
    "portal /projects is still Next-coupled; extracting it needs a whitelist expansion",
  );

  const myLibrary = byPath("MyLibrary.tsx");
  assert.equal(
    myLibrary.filter((hit) => hit.kind === "next-import").length,
    0,
    "MyLibrary has no Next imports; remaining window events are listed, not rewritten (dirty file)",
  );
  assert.ok(hitsInPaths(hits, (path) => path.endsWith("AppShell.tsx")).length > 0);

  const core = readFileSync(join(uiRoot, "src/client-ui/core.ts"), "utf8");
  assert.doesNotMatch(core, /from ["']\.\/surfaces\//);
  assert.doesNotMatch(core, /from ["']\.\/local\/library-host["']/);
});
