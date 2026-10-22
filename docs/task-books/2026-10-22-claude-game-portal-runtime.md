# Main-site game runtime (portal host) — owner `claude_game_runtime_1022`

Parent: Claude Code session continuing a Codex session that died on quota
(operator 2026-10-22). Model: Claude Sonnet 5.5, medium effort, no fast mode —
operator's explicit choice. Parent owns integration, full typechecks, the
dev-gateway refresh, Caddy, oceandino docs and every commit. Do not commit,
push, install packages, deploy, restart containers, reload Caddy, or use a
browser. Main-only shared worktree; never `git checkout`/`stash`/`reset`;
never revert files you do not own.

Read first: `/opt/cursor-workspaces/oceandino/AGENTS.md`,
`/root/.oceanleo-workstation/INSTRUCTIONS.md`, packs
`/root/.cursor/rules/oceanleo.mdc` and `/root/.cursor/rules/untrusted-content.mdc`;
run `bash /opt/cursor-workspaces/oceandino/scripts/agent-bootstrap.sh`.

## Operator goal (authoritative)

On the main site (portal repo `/root/projects/oceanleo`, oceanleo.com; dev =
LeoDev slot `https://p-511af16886fbb22b5ab2367528b458ba.dev.oceanleo.com/`,
hot reload, linked to the local `/root/projects/oceanleo-ui`) games must be
both playable and editable **on the site itself**:

- 游玩: the game runs in place, with restart / fullscreen / back.
- 编辑: the editor opens on the main site and the user can modify and test-play.
- Saving makes the play entry open the saved version; editing someone else's
  template saves to the user's own copy.
- If only play is allowed or there is no editable source, say why.

Today: 「开始游玩」 opens `game.oceanleo.com` in a new tab, and the editor shows
「可玩预览需要宿主站注册沙箱容器（registerGamePreviewHost）」 because the portal
never registered a preview host or iteration runner.

## Binding architecture decision

`/opt/cursor-workspaces/oceandino/docs/architecture/oceanleo-library-game-play.md`
(2026-10-16, "主站库打开游戏"): fetch the saved artifact bytes, assemble the full
document in the page, run it in an iframe whose `sandbox` is only
`allow-scripts` (+ `allow-pointer-lock`, the existing UGC token set) and never
`allow-same-origin`, via `srcDoc`; the document carries `connect-src 'none'`;
the host handshake is designed for the opaque origin (`event.origin ===
"null"`, `event.source` check, channel id, then MessagePort only). Editor
preview uses the same loader. Play must not depend on any sandbox host.
Also read UC-1…UC-7 in
`/opt/cursor-workspaces/oceandino/docs/architecture/oceanleo-untrusted-content-isolation.md` §8.

The previous Codex owner started a different design that contradicts this
(short-lived files on a new `r-<32hex>.oceanleo.app` Caddy namespace, no UGC
protocol, needs a Caddy reload). **Remove it**: `backend/app/game_preview.py`,
`backend/app/routers/game_preview_router.py`, the `game_preview_router` import
and `include_router` lines in `backend/app/main.py` (that file has other
uncommitted edits — remove only those two lines), `app/_components/game-runtime-client.ts`,
and in `/opt/multisite-docker`: delete `caddy/sites/oceanleo-game-preview.caddy`
and only the `import oceanleo_game_preview` line in `caddy/sites/oceanleo-app.caddy`
(that file has unrelated uncommitted edits by other work — keep them).

## Reference implementation (read-only)

`/root/projects/game` working tree — **read only**: it holds another session's
uncommitted 2026-10-16 stored-play work; do not modify, format or commit
anything there. Relevant: `components/UgcGameFrame.tsx`,
`app/_console/SandboxPreviewHost.tsx`, `app/play/artifact/{artifact-play-lookup.ts,artifact-play-ref.ts,ugc-play-context.ts,UgcArtifactPlayer.tsx}`,
`lib/ugc/{bundle.ts,host.ts,guest-bridge.ts,protocol.ts,sandbox-attributes.ts,stored-play.ts,context-bridge.ts,score-guard.ts,sandbox-id.ts}`,
`public/leoplay-engine.js`, `public/leoplay-skeleton.js`,
`tests/ugc-stored-play.test.ts`, `tests/ugc-sandbox.test.ts`.

## Deliver

1. Port the minimal needed runtime into the portal (suggested
   `lib/game-runtime/**`, plus `public/leoplay-engine.js` and
   `public/leoplay-skeleton.js` copied byte-for-byte for legacy five-slot `js`
   bundles). Keep sandbox tokens, CSP, size limits, sha256 verification,
   envelope unwrapping and the handshake semantics identical; drop what the
   main site does not need (namespace-C sandbox ids/origins, score submission
   to leaderboards, first-party compiled games). Head each file with a comment
   naming its source-of-truth file in the game repo and the decision doc.
2. `app/_components/game-runtime-host.tsx` → `GameRuntimeHost` consuming the
   shared `GamePreviewHostProps` (`/root/projects/oceanleo-ui/src/shell/game-editor/preview-host.ts`,
   which now has optional `source?: string`):
   - saved mode (no `source`): load the artifact projection for
     `artifactId`/`revisionId` with the current user's token when signed in
     (private copies need it; public items work without), take the full
     rendition's signed URL + digest, fetch, verify, unwrap, assemble. Refuse
     to silently play a different revision than requested.
   - draft mode (`source` given): assemble that HTML document directly (same
     validation and limits). `source` is a snapshot the editor changes only on
     run/reload, so a change of `source` means "restart with this".
   - `paused` (lifecycle via port, no reload), `reloadKey` (remount with a new
     channel), `paramDeclarations`/`paramValues` (port, no reload),
     `onRuntimeError`, `title`; loading and error states with a 重新加载 button;
     no credentials, session or signed URLs ever enter the frame
     (`signedIn: false`).
   - Keep it lazy: `app/_components/game-host-bridge.tsx` (already mounted in
     `app/layout.tsx`) registers the host via `next/dynamic` so the runtime is
     not in every page's bundle. Keep that pattern.
3. Main-site deep links: `app/play/artifact/[artifactId]/page.tsx` currently
   redirects to the game sub-site. Make it render an in-site full-page player
   for UGC artifact games (same host; back / restart / fullscreen), so links
   into `/play/artifact/<id>` stay on the main site. Leave `app/play/[slug]`
   (first-party compiled games that exist only on the game site) as is.
   Check `lib/game-play-redirect.ts` / `lib/game-play-origin.mjs` tests still
   make sense and update them.
4. Iteration (描述修改玩法): `app/_components/game-iteration-client.ts` calls the
   real backend `POST /v1/game-generate/{artifactId}/iterate`
   (`backend/app/routers/game_generate_router.py`; it loads the previous
   source server-side, runs the generation chain, commits a new revision and
   returns `{artifact, generation, billing}`). The previous owner added a
   preflight there (edit capability + expected revision, before spending
   tokens) and `backend/tests/test_game_iteration_preflight.py`. Review and
   finish both, plus `tests/game-iteration-client.test.mjs`. The shared result
   type is `{ ok: true; document; artifact?: ArtifactProjection } | { ok: false; error }`
   (`GameIterationResult` in `oceanleo-ui/src/shell/advanced-routes/GameRoute.tsx`);
   return the saved `artifact` so the editor adopts it instead of saving twice.
   Never trigger a real generation (it spends the operator's wallet). Hitting
   the dev gateway for 401/403/409 preflight paths is fine but optional.
5. Security (UC-1, UC-3, UC-6): source-level assertion tests in the portal's
   `tests/` — sandbox attribute equals the frozen token constant and lacks
   `allow-same-origin`/popups/top-navigation; the iframe uses `srcDoc` and never
   `src=`; no rendition/signed URL or `.oceanleo.app` host ever becomes an
   iframe src; the guest handshake `targetOrigin` is the exact parent origin
   (never `"*"`); the host checks `event.source`, accepted origin and channel;
   the assembled document has `connect-src 'none'`; the parent origin rejects
   `.oceanleo.app`. Comment each with its rule id + the isolation doc. Prove
   each assertion goes red by breaking one line, then restore. Run
   `bash /opt/cursor-workspaces/oceandino/scripts/oceanleo-security-gate.sh`
   before and after. Draft the matrix rows for
   `docs/architecture/oceanleo-security-regression-matrix.md` in your result
   file; the parent edits oceandino.

## Ownership

Own (portal `/root/projects/oceanleo`): `app/_components/game-*.ts(x)`,
new `lib/game-runtime/**`, new `public/leoplay-*.js`, `app/play/artifact/**`,
`lib/game-play-redirect.ts`, `lib/game-play-origin.*` (only if needed),
`tests/game-*.test.mjs` (new/existing), the deletions listed above,
`backend/app/routers/game_generate_router.py` (iterate preflight only),
`backend/tests/test_game_iteration_preflight.py`; in `/opt/multisite-docker`
only the two game-preview edits above.

Do not edit: anything in `/root/projects/oceanleo-ui` (a separate owner,
`2026-10-22-claude-game-shared-ui.md`, owns the shared UI; contract questions
go to the parent), `app/layout.tsx` (already mounts `GameHostBridge`),
`package.json`/lockfile/workflows (they carry unrelated uncommitted edits),
other backend files (a latency owner edits `typed_artifact_*`).

## Commands

Portal tests: `cd /root/projects/oceanleo && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --test <files>`.
Backend: `cd /root/projects/oceanleo/backend && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- .venv/bin/python -m pytest -q <files>`.
One portal typecheck at the end: `cd /root/projects/oceanleo && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- pnpm typecheck`
(shared-UI files under edit by the other owner may error — report only yours).
LeoDev check without a browser: `curl -s -o /dev/null -w '%{http_code}' https://p-511af16886fbb22b5ab2367528b458ba.dev.oceanleo.com/leoplay-engine.js`
and the `/play/artifact/<id>` page after your change (HTTP 200, no redirect to
`game.`). The operator's screenshots used game artifact
`8f812a82-6af1-438e-bf85-b8655bf4e6de` (「编辑器示例 • 游戏 — 海岸井字棋」, in the
operator's Library on the LeoDev slot, Edit / Pro edit / Code tabs). Use it for
read-only checks only (dev gateway `http://127.0.0.1:8008`); never write to it.

## Result

Write `/root/projects/oceanleo-ui/docs/task-books/2026-10-22-claude-game-portal-runtime-result.md`:
what was ported (file → source of truth), host behaviour per prop, the
deletions, iteration changes, security assertions with their red/green proof,
gate output, commands with pass/fail counts, LeoDev HTTP evidence, drafted
matrix rows, residual risks. Your final message repeats the essentials.
