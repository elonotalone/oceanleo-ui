import { existsSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { siblingRepoUrl } from "./sibling-repo-url.mjs";

/** Prefer the same wave's paired checkout; retain the main-checkout fallback. */
export function pairedRepoUrl(repo, relativePath = "") {
  const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
  const name = basename(root).replace(/oceanleo-ui$/, repo);
  const paired = resolve(dirname(root), name);
  const repoRoot = name !== basename(root) && existsSync(paired)
    ? paired : fileURLToPath(siblingRepoUrl(repo, ""));
  return new URL(relativePath, pathToFileURL(`${repoRoot}/`));
}
