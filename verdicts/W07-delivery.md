# W07 交付

## 结果

已完成六个可复用项目工作空间原语，并从现有
`@oceanleo/ui/shell` 入口公开：

- `ProjectWorkspaceFrame`
- `ProjectTabNav`
- `ProjectToolbar`
- `ProjectEmptyState`
- `ProjectConfigCard`
- `ProjectModal`

原语只负责布局、响应式交互和可访问性。实现没有 fetch、项目 API、
router 或门户业务状态；`package.json` 已有 `./shell` 入口，因此没有新增
deep export，也没有修改版本。

窄屏配置是有触发器、Esc/backdrop close、打开聚焦和关闭焦点恢复的 drawer；
桌面配置列由 `clamp(20rem,24vw,22.5rem)` 限定为 320–360px，配置 children
只渲染一份。Tab 支持 Left/Right/Home/End、roving tabIndex 和 disabled 跳过。
Modal 复用既有共享 Modal 的 portal、focus trap、Esc 与 backdrop 行为。

## 提交

产品与契约：

- `abb59ed` — 六个共享原语、props/types 与 shell 导出。
- `b3fa4ab` — focused contract、public API snapshot 与可见 drawer 的
  `aria-hidden` 修正。

journal/state：

- `5ff4558` — 开工状态与机器事实。
- `823cf7e` — 既有能力复用结论。
- `3d9d7bd` — 产品提交记录。
- `d013bd7` — focused test 结果与修正记录。
- `7367714` — 最终验证、最终状态与交卷文件。

delivery：

- `7367714` — 本交付文件首次提交。

## 验证

- mandatory bootstrap：通过，`oceanleo-ui` 在 `main`。
- `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --test tests/project-workspace-primitives.test.mjs`
  - 7 passed，0 failed。
- `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- pnpm typecheck`
  - `tsc --noEmit` exit 0。
- `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node scripts/public-api-snapshot.mjs --check`
  - exit 0，snapshot 当前。
- 写交卷文件前，W07 全部独占路径 `git status --short -- <paths>` 为空。

未做浏览器、Playwright、截图或真机验证；本任务明确未授权。未 bump、tag、
install、deploy 或 push。

## 阻塞

无。
