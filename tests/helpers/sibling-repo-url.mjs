import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Linked worktrees need the main checkout's siblings, rather than the worktree
// container directory. Keep the same fallback for a source-only checkout.
export function siblingRepoUrl(repo, relativePath) {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const probe = spawnSync("git", ["-C", root, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" });
  const parent = probe.status === 0 && probe.stdout.trim()
    ? dirname(dirname(probe.stdout.trim())) : dirname(root.replace(/\/$/, ""));
  return pathToFileURL(resolve(parent, repo, relativePath));
}
