# W07 工作日志

## 2026-08-13 · 开工事实

- 已执行 `/opt/cursor-workspaces/oceandino/scripts/agent-bootstrap.sh`，仓库分支为 `main`。
- W07 独占产品路径与交付路径开工前均无未提交改动。
- navigation control plane 将 `src/shell/project-workspace.tsx` 映射到共享 UI 影响面，涉及 36 个 `ui-consumers`；本任务不做发布分发。
- 架构固定六个 `@oceanleo/ui/shell` 导出：`ProjectWorkspaceFrame`、`ProjectTabNav`、`ProjectToolbar`、`ProjectEmptyState`、`ProjectConfigCard`、`ProjectModal`。
- 硬约束：原语不发请求、不持有门户别名/API 类型/项目业务状态；窄屏配置必须可达；Modal 沿用现有可访问交互。
- 验证边界为 focused test 与 guarded `pnpm typecheck`；不使用浏览器、截图或真机。

## 2026-08-13 · 既有能力复用结论

- `src/ui/index.tsx` 的共享 `Modal` 已实现 body portal、Esc、backdrop close、焦点圈定、打开聚焦和关闭恢复；`ProjectModal` 应只补 title/close/body/footer 结构。
- `package.json` 已将 `@oceanleo/ui/shell` 指向 `src/shell/index.ts`，无需新增 deep export，也无需改版本。
- 既有主题以 `--bg`、`--card`、`--fg`、`--muted`、`--border`、`--accent` token 配合 utility class；新原语沿用同一组 token。
- public API snapshot 由 `scripts/public-api-snapshot.mjs` 从 package exports 和入口 AST 确定性生成，导出完成后运行既有 `api:snapshot`。
- 响应式右栏使用单份 children：移动端是有触发器的 drawer，桌面端进入 320–360px 栅格列，避免复制配置表单及其状态。

## 2026-08-13 · 产品实现

- 提交 `abb59ed` 新增六个共享原语及全部公开 props/types；shell 入口已显式导出。
- `ProjectWorkspaceFrame` 用受控/非受控移动 drawer 保持配置可达，支持 Esc、backdrop、打开聚焦和关闭恢复；桌面栅格列以 `clamp(20rem,24vw,22.5rem)` 固定在 320–360px。
- `ProjectTabNav` 使用原生 button tabs、roving tabIndex，并支持 Left/Right/Home/End 且跳过 disabled tab。
- `ProjectConfigCard` 的 add/open 都由原语输出原生 button，避免调用方伪造点击语义；空态和工具条保持纯 slot。
- `ProjectModal` 仅包装共享 `Modal` 的结构化 title/close/body/footer，未复制 portal 或焦点逻辑。

## 2026-08-13 · Focused test

- 首跑 7 项中 5 项通过；两项失败均被保留并定位：一项测试错误假定 JSX 属性输出顺序，另一项发现打开 drawer 时 React 会输出 `aria-hidden="false"` 而不是移除属性。
- 修正方式没有放宽产品判据：测试改为先提取目标 element tag 再逐属性断言；产品在可见状态改为不输出 `aria-hidden`。
- 重跑命令：
  `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --test tests/project-workspace-primitives.test.mjs`
- 结果：7 tests passed，0 failed，耗时约 1.7s；覆盖导出/snapshot、四 slot、320–360px 右栏、移动 drawer、键盘 tabs、原生按钮、Modal Esc/backdrop、无网络/路由。
- 测试与 snapshot 提交：`b3fa4ab`。

## 2026-08-13 · 最终验证

- heavy guard 命令：
  `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- pnpm typecheck`
- 结果：`tsc --noEmit` 通过，exit 0；disk exclusive lane 正常获取并释放。
- final focused test：7 passed / 0 failed，exit 0。
- public API check：
  `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node scripts/public-api-snapshot.mjs --check`
  通过，exit 0。
- W07 独占产品、测试、journal/state/delivery 路径在写交卷文件前均无未提交改动。
- 未执行浏览器、Playwright、截图或真机验证；未 bump、tag、install、deploy 或 push。
- 真实阻塞：无。
