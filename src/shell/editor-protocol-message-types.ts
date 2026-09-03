// 嵌入式编辑器协议的指令白名单（两个方向各一份）。
//
// 为什么单独一份文件：`editor-protocol.ts` 撞上了 600 行的拆分闸
// （`tests/advanced-canva-interactions.test.mjs`）。拆出来的这两份是纯词表——
// 没有分支、没有 origin 判定、没有本机地址，所以搬走它们不会把任何判定挪出
// `editor-protocol.ts`：`asEditorToHostMessage` / `asHostToEditorMessage` 里那两句
// `!…MESSAGE_TYPES.has(type)` 的前置拦截仍然留在原处，
// `tests/untrusted-content-sandbox-origin.test.mjs` 盯的就是那两句的字面。
//
// 两处读源码文本的协议断言（`tests/advanced-workbench.test.mjs`）已经把本文件
// 加进拼接，所以「必须出现某指令」与「不许用 endsWith 匹配主域」这两类判据的
// 覆盖面是扩大的，不是缩小的。
//
// 改动这两份词表就是改协议表面：新增一条指令必须同时改
// `untrusted-content-sandbox-origin.test.mjs` 里那两个 size 断言，那道闸是故意
// 让人不能顺手加指令的。

/** 来自 frame 的消息只允许这些指令；不含任何「代我调用 API」式通用代理。 */
export const EDITOR_TO_HOST_MESSAGE_TYPES = new Set([
  "artifact-created",
  "artifact-updated",
  "close-request",
  "dirty",
  "error",
  "export-result",
  "history-changed",
  "material-result",
  "project-manifest",
  "project-result",
  "ready",
  "recovery-result",
  "recovery-snapshot",
  // v2：agent 改动进 L4 审阅的提案。**不是**通用代理——它只描述一次待批改动，
  // 不带任何 URL、不带任何「代我调用」的动词，落地仍要宿主发 review-decision。
  "review-proposal",
  "selection-changed",
  "selection-result",
  "tools-manifest",
  "viewport-changed",
]);

export const HOST_TO_EDITOR_MESSAGE_TYPES = new Set([
  "dispose",
  "export-request",
  // v2：L3 专业模式下收起/展开内核自带的工具栏与面板。
  "hide-chrome",
  "init",
  "material-insert",
  "open-asset",
  "project-action",
  "project-view",
  "recovery-capture",
  "recovery-restore",
  // v2：用户在 L4 审阅面板上对某条提案的裁决。没有它，Hosted 件永远不知道
  // 提案是被接受还是被拒绝，规范 §7 判据 3 就落不了地。
  "review-decision",
  "save-request",
  "save-result",
  "selection-command",
  // v2：L0 专业模式开关。默认 normal（R3）。
  "set-mode",
  "set-host-layout",
  "viewport-command",
]);
