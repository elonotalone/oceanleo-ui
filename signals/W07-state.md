# W07 状态

## 已确认

- mandatory bootstrap 已通过；`oceanleo-ui` 位于 `main`，W07 独占路径开工前无改动。
- 共享入口为 `@oceanleo/ui/shell`；本份只实现无请求、无路由、无门户业务状态的项目工作空间原语。
- 新源文件影响 `ui-consumers` 的 36 个消费者，但本轮只做本地源码、focused test 与 typecheck，不 bump、不 tag、不 push。
- 未获浏览器验证许可；只做静态、单元和类型验证。
- 既有 `src/ui/index.tsx` Modal 已提供 portal、Esc、backdrop、焦点圈定与焦点恢复，`ProjectModal` 复用它而不再造一套。
- `package.json` 已公开 `./shell`；只需从 `src/shell/index.ts` 导出，不新增深层 package export。
- public API snapshot 由 `pnpm api:snapshot` 确定性生成。
- 产品实现已提交为 `abb59ed`：六个原语及其 props/types 已从 shell 入口导出。
- focused contract、public API snapshot 与显式 `aria-hidden` 修正已提交为 `b3fa4ab`。
- guarded focused test 当前 7/7 通过。
- guarded `pnpm typecheck` 通过；public API snapshot check 通过。
- W07 全部独占路径在写 delivery 前为空。

## 正在做

- W07 已完成；`verdicts/W07-delivery.md` 已提交并回填提交号。

## 下一步

- 由父任务/V owner 做独立聚合裁决；W07 不执行发布动作。

## 精确复现命令

```bash
cd /root/projects/oceanleo-ui
export PATH="/host/usr/bin:$PATH"
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --test tests/project-workspace-primitives.test.mjs
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- pnpm typecheck
```
