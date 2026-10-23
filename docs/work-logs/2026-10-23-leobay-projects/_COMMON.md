# leobay-projects 波 · 共同须知（每位 owner 必读）

父 agent 写，2026-10-23。本波由操作员 elonlee63 拍板：「彻底做好」。只在开发版收尾，不上线。

## 0. 先做的事

```bash
bash /opt/cursor-workspaces/oceandino/scripts/agent-bootstrap.sh
```

读你自己的任务书 `tasks/<ID>.md`（同目录）和本文件。合同总表在 `00-contract.md`。

## 1. 仓与环境（父任务已验，不必重查）

| 仓 | 路径 | 说明 |
|---|---|---|
| 共享 UI `@oceanleo/ui` | `/root/projects/oceanleo-ui` | LeoBay、LeoChat、设置、库、工作台都在 `src/shell/` |
| 门户 | `/root/projects/oceanleo` | 项目页 `components/project/*`、条款页 `app/legal/*`、设置附加栏 `app/settings/*`；后端 `backend/` |

- 门户的 `node_modules/@oceanleo/ui` 是指向本地 `/root/projects/oceanleo-ui` 的软链：门户 typecheck 直接看到你在共享 UI 里的改动。
- 开发预览（LeoDev 门户槽，dev 模式热更新，链本地共享 UI）：`https://p-511af16886fbb22b5ab2367528b458ba.dev.oceanleo.com/`
- 开发网关容器 `oceanleo-api` 直接挂载 `/root/projects/oceanleo/backend`，**不热更新**；改了后端只有父 agent 重启它。你不许重启任何容器。
- 开发网关写的是**生产库**：禁止任何写库、DDL、迁移。只读 SQL 可以：`supabase-sql oceanleo "<select…>"`。

## 2. 命令

```bash
# 共享 UI 类型检查（重活，必须走 heavy 槽）
cd /root/projects/oceanleo-ui && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- pnpm typecheck
# 共享 UI 单个测试（轻活）
cd /root/projects/oceanleo-ui && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<名字>.test.mjs
# 门户类型检查（重活）
cd /root/projects/oceanleo && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- pnpm typecheck
# 后端测试
cd /root/projects/oceanleo/backend && .venv/bin/python -m pytest tests/<文件>.py -q
```

- **基线红**：共享 UI 的 `pnpm typecheck` 在本波开工前已有 3 条错，全在 `src/shell/workflow-carrier/video-project-doc.ts`（别的工程的）。你的判据是「不新增错误」，不是全绿。不要去修那个文件。
- 不许跑全量测试套件（`pnpm test`）；只跑与你文件相关的测试。父 agent 最后统一跑。
- 文案闸：`tests/i18n-tt-key-coverage.test.mjs` 要求每个 `tt("…")` 的中文原文在 17 种语言里都有译文。你新增的每条文案都必须让它过；**不许改这个测试文件本身**（别的工程在改它的基线）。

## 3. 同仓有别的工程在并发（重要）

`editor-overhaul` 波此刻正在 `oceanleo-ui` 里提交。另有一处不明归属的**未提交改动**：
`oceanleo-ui/src/shell/AppDirectory.tsx`、`oceanleo-ui/src/shell/AppMarket.tsx`、`oceanleo-ui/src/architecture/public-api.snapshot.json`、
门户 `app/projects/page.tsx`、`package.json`、`pnpm-lock.yaml`、`.github/workflows/oceanleo-cn-frontend.yml`。
**这些文件一律不许改、不许提交、不许 `git checkout`/`git stash`/`git reset`。**

提交纪律：
- 只提交你边界内的路径，写法固定为 `git commit -m "<消息>" -- <路径…>`（`--` 在 `-m` 之后）。
- 禁止 `git add -A`、`git add .`、`git commit -a`、按共享目录整目录提交（`tests/`、`src/i18n/ui/messages/` 都是共享目录：写具体文件名）。
- 新文件一产出就 `git add <文件>`。每拿到一个能成立的结果就提交一次，大约 15 分钟一次。不 push。
- 提交消息前缀 `leobay-projects(<ID>): `，结尾加一行 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`。
- 共享测试文件（多位 owner 都可能碰）只用小范围精确替换，不许整文件重写。

## 4. 进度落盘（被打断时只靠它续接）

- `signals/<ID>-journal.md`：每得到一条实测结论追加一行并提交。
- `signals/<ID>-state.md`：每个大步骤开始**之前**更新：已确认的事实 / 正在做的这一步 / 下一步 / 复现命令。
- 交卷：`verdicts/<ID>-delivery.md`：改了什么（用户看到什么变化）、文件清单、测试命令与结果原文、没做完的和原因、对别的 owner 的接口说明。交卷文件提交后再结束。

## 5. 产品决定（全波统一，不许各自发明）

### 5.1 LeoBay 种类的名字（操作员拍板，彻底统一）

| 内部值 | 中文 | English |
|---|---|---|
| `service` | 人工服务 | Human service |
| 逛 Bay 的 `asset` 栏 / 发布的 `digital` | 现成文件 | Ready-made files |
| `app` | 网站与软件服务 | Website & software service |
| `lesson` | 课程 | Lessons |
| `other` | 其他 | Other |

- 旧叫法「服务 / 素材 / 作品」（英文 Services / Assets / Works）作为**种类名**一律退役。「成品文件」统一改成「现成文件」。
- 泛指某一件东西时不要硬套长名字：「作品页」→「详情页」，「关注的作品」→「关注的」+ 合适名词（如「关注的网站与软件服务」太长时用「我关注的」），按句子自然改；原则是**任何地方都不再用退役名字指代一个种类**。「服务条款」「服务器」这类非种类词不动。
- 出售 / 求购 两个词保留（For sale / Wanted）。

### 5.2 下拉的显示规则（W01 实现共用件，所有调用方照此传参）

- 按键上**只写当前值**，不再写「名称：值」两截（参考 Slack：「All channels ⌄」）。
- 「全部」选项必须自带名词：「全部站点 / All sites」「全部类型 / All types」「全部类别 / All categories」。**禁止**按键上只剩光秃秃的「全部 / All」。
- 值本身离开名称看不懂的要改名（例：「我的」作为来源 → 「我上传的 / My uploads」）。
- 样式：白底、浅灰细边、圆角矩形（非全圆胶囊）、粗体、右侧下箭头；高度与字号对齐页头搜索框（h-9、13–14px）。选了具体值（非「全部」）时边框加深以示生效。

### 5.3 白底的用法（操作员原话：整个版面加白底等于没加，白底是用来分隔的）

页面底色上不铺整页白板；白色只用于分隔区域的卡片（参考项目页的主区卡片与配置卡片）。页头、筛选行、底部输入框周围都不加白底。

### 5.4 其他

- 不开浏览器、不截图（本任务未批准）。验证靠类型检查、测试、HTTP。
- 用户看得见的每一句都过 `tt()`，新中文原文写进你自己的分表 `src/i18n/ui/messages/lbp-w<NN>-copy.ts`（父已建空表并注册；写法见文件头，17 语种全给）。已有词条直接复用，**不要在你的分表里重定义已有的中文原文**。
- 不改 `src/shell/bay/shell/bay-state.ts`、`src/shell/index.ts`、`src/i18n/ui/messages/shell-overhaul-copy.ts`、`src/i18n/ui/messages/index.ts`、`src/architecture/public-api.snapshot.json`。确需改时写进交卷的「对父 agent 的请求」。
- 不许 push、不许 bump、不许触发 Vercel、不许 `sync.sh`。
