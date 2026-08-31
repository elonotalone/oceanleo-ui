/**
 * 「冻成基线的数字，必须在干净检出上取」的机检器（`_COMMON.md §7b⑪`）。
 *
 * 病根：16 位 owner 同仓并发，共享工作树上随时挂着别人未提交的改动。
 * 在这样一棵树上量出来的上限 / 下限 / 清单长度，标定的是一棵 **git 里并不存在的树**，
 * 于是「本机绿、干净检出红」。`V1` 一棒抓出两例：
 *   - `motion-token-adoption` 的棘轮上限冻在 11，干净检出实测 12；
 *   - `edit-bar-gesture-coverage` 的「13 件」取自主题表，那张表在 HEAD 上只有 10 件。
 *
 * 光靠纪律守不住这条，所以给它一个机检形状：
 * **冻数字的时候把取值那一刻的 commit 一起写下来**，闸自己把那个 commit 的树解出来重量一遍，
 * 对不上就红。脏工作树上量出来的数字过不了这一关——因为那棵树 commit 里没有。
 *
 * 这不是「工作树必须干净」的检查（并发下那会天天红，也不该由闸来管别人的在途改动），
 * 而是「**基线的出处必须可复现**」的检查。
 *
 * ============================================================================
 * ⚠️ 用之前先回答一个问题：**你的扫描面出不出本仓？**（W35 2026-08-31 实测）
 * ----------------------------------------------------------------------------
 * `measureOnCommittedTree()` 把子树解到 `os.tmpdir()`，也就是 `/tmp/xxx`。
 * 于是量的时候，那棵树的**邻居全没了**。
 *
 * 扫描面只在本仓 `src/` 之内的闸（`motion-token-adoption`、`hit-target-budget`、
 * `grid-formula-legacy-entry` …）不受影响，放心用。
 *
 * 但凡判据要读**同级仓**（`i18n-tt-key-coverage` 靠「仓根往上一级」找三个 extracted
 * 插件与 `oceandino/plugin-gallery`），解到 `/tmp` 之后那些根一个都不在场，
 * 扫描面会**静默塌掉**，量出来的数比真值小——而且不报错，因为「缺哪个跳哪个」
 * 本来就是那道闸的设计。
 *
 * `[实测]` 同一个 commit `acd8192`，同一份 `i18n-tt-key-coverage`：
 *   在 `/root/projects/oceanleo-ui`   → 判出真缺口（`website-views.ts` 缺 16 语）
 *   在 `/tmp/w35-clean` 的 worktree   → 五个同级仓全缺席，扫描面塌到只剩 17 条 key，
 *                                       红在「取样失效」，真缺口反而被挡在后面看不见
 * 两处都红、红的条数还一样，**光看条数发现不了**（`W33 R4` 的 9 红就是这么对上的）。
 *
 * ⇒ 跨仓扫描的闸，要么别用这个 helper 量跨仓的部分，
 *   要么像 `i18n-tt-key-coverage.test.mjs` 那样按 `git rev-parse --git-common-dir`
 *   推**主工作树**的位置，并加一条「一个同级仓都不在场就判红」的守卫。
 * ============================================================================
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function git(repo, args, options = {}) {
  return spawnSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 512,
    ...options,
  });
}

/**
 * 把 `commit` 的指定子树解到临时目录，交给 `measure(root)` 量一次，量完删掉。
 *
 * 走 `git archive` 而不是 `git stash` / `git checkout`：**一个字节都不碰工作树**，
 * 并发同事的在途改动不受影响，闸也读不到它们。
 *
 * @returns `{ ok: true, sha, value }`，或 `{ ok: false, reason }`。
 *          拿不到就把理由带回去让调用方 **判红**，不许静默跳过（`_COMMON.md §7b⑩`）。
 */
export function measureOnCommittedTree({ repo, commit, pathspecs = [], measure }) {
  const resolved = git(repo, ["rev-parse", "--verify", `${commit}^{commit}`]);
  if (resolved.status !== 0) {
    return {
      ok: false,
      reason:
        `解不出基线 commit ${commit}——浅克隆、或这不是一个 git 检出。` +
        `git 说：${(resolved.stderr || "").trim()}`,
    };
  }
  const sha = resolved.stdout.trim();
  const archive = git(repo, ["archive", "--format=tar", sha, ...pathspecs], {
    encoding: "buffer",
  });
  if (archive.status !== 0) {
    return { ok: false, reason: `git archive ${sha} 失败：${String(archive.stderr).trim()}` };
  }
  const dir = mkdtempSync(join(tmpdir(), "clean-tree-baseline-"));
  try {
    const untar = spawnSync("tar", ["-x", "-C", dir], { input: archive.stdout });
    if (untar.status !== 0) {
      return { ok: false, reason: `解包失败：${String(untar.stderr).trim()}` };
    }
    return { ok: true, sha, value: measure(dir) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * 给报错文案用：当前工作树上，这些路径里哪些是脏的。
 *
 * 只在**已经要红了**的时候调它，用来回答「我这条红是不是因为树脏」——
 * 这正是 `W30` / `W31` 当时缺的那句话。它自己不判色。
 */
export function dirtyAmong(repo, paths) {
  const status = git(repo, ["status", "--porcelain", "--", ...paths]);
  if (status.status !== 0) return [];
  return status.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).trim());
}
