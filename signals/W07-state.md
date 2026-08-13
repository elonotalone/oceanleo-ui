# W07 状态

## 已确认

- mandatory bootstrap 已通过；`oceanleo-ui` 位于 `main`，W07 独占路径开工前无改动。
- 共享入口为 `@oceanleo/ui/shell`；本份只实现无请求、无路由、无门户业务状态的项目工作空间原语。
- 新源文件影响 `ui-consumers` 的 36 个消费者，但本轮只做本地源码、focused test 与 typecheck，不 bump、不 tag、不 push。
- 未获浏览器验证许可；只做静态、单元和类型验证。
- 既有 `src/ui/index.tsx` Modal 已提供 portal、Esc、backdrop、焦点圈定与焦点恢复，`ProjectModal` 复用它而不再造一套。
- `package.json` 已公开 `./shell`；只需从 `src/shell/index.ts` 导出，不新增深层 package export。
- public API snapshot 由 `pnpm api:snapshot` 确定性生成。

## 正在做

- 实现六个无业务状态原语；窄屏右栏使用有触发器、可关闭且可恢复焦点的 drawer，桌面宽度限定为 320–360px。

## 下一步

- 更新 public API snapshot 和 focused test。
- 通过 IO guard 运行 focused test 与 `pnpm typecheck`。

## 精确复现命令

```bash
cd /root/projects/oceanleo-ui
export PATH="/host/usr/bin:$PATH"
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --test tests/project-workspace-primitives.test.mjs
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- pnpm typecheck
```
