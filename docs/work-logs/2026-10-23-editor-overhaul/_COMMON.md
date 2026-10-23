# 共同须知（每位 owner 必须读完）

## 1. 开工

1. 先跑 `bash /opt/cursor-workspaces/oceandino/scripts/agent-bootstrap.sh`，再读 `/opt/cursor-workspaces/oceandino/AGENTS.md`（内核）。
2. 读本目录的 `00-dispatch.md`（操作员裁定 D1–D14、文件所有权 §3、统一编辑栏词表 §4、保存判据 §5、跨 owner 接口 §6），再读你自己的 `tasks/<ID>.md`。
3. 你跑的是 Opus 5.5。不要再派子 agent。
4. 你的活要**自己收口到底**：在你独占的文件里能做完的，就不要当成断点交回来。只有确实落在别人文件里的事，才写进 `signals/<你>-to-<他>.md`。

## 2. 红线（这就是全部红线，派发词里不再重复；违反即本份活作废）

1. **不碰生产。** 验证时不请求 `oceanleo.com`、`api.oceanleo.com`、CN 前端。不部署，不 `git push`（任何仓），不跑 `oceanleo-ui-bump.sh` / sites-push，不碰 Vercel，不同步 oceanbizs。
2. **不用操作员账号。** 浏览器和任何写操作只用验收账号 `oceanleo-acl-accept@oceanleo.internal`（`harness/mint.sh` 的默认值）。
   - 开发版网关写的就是生产库，所以绝不对操作员（`3296855f-5acd-49bc-bba0-629bad087cda`）的数据做任何写操作。
   - 只读 SQL（`supabase-sql oceanleo "select …"`）可以查，但查到的操作员数据只写结论，不贴内容。
   - `dev-client-test-account.env` 里是操作员本人的账号，禁用。
3. **只改你独占的文件**（`00-dispatch.md` §3）。
   - 公共出口（`src/index.ts`、`src/shell/index.ts`、`plugin-chrome/index.ts`）、`public-api.snapshot.json`、`package.json`、锁文件、`src/i18n/ui/messages/` 下除你自己那一册以外的文件：一律只读，需要改就写进交付的「请父 agent 代改」。
   - 不装依赖。
4. **git 纪律。**
   - 只在 `main` 上，不建分支，不 stash / reset / checkout / rebase。
   - 只能 `git add <你的具体文件>`，然后 `git commit -m "editor-overhaul(<ID>): …" -- <同一批具体文件>`。不许 `git add -A`、`git commit -a`，也不许提交整目录（本目录下你自己的 `signals/<ID>-*`、`verdicts/<ID>-*`、`evidence/<ID>/` 清单除外）。
   - 别人未提交的改动一个字都不许动、不许 stage、不许提交。
   - 新文件一产出就 `git add`。碰到 `index.lock` 时等几秒再试。
   - 提交尾行：`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
5. **安全边界不放松。**
   - CORS、cookie、iframe sandbox、postMessage、origin 检查一律不许放宽。要碰这些地方，先跑 `bash /opt/cursor-workspaces/oceandino/scripts/oceanleo-security-gate.sh`。
   - UGC 运行沙箱（网站、游戏、MCP app）保持原样。
6. **10-22 原生编辑器规矩照旧。**
   - 不挂整套第三方或子站网页当编辑器。
   - 专业编辑页只有 grid / pdf / website 三件有。
   - 不许出现编辑器内的 File/Edit/View 菜单栏和第三方品牌。
   - 只用 MIT / Apache / BSD / MPL 代码，AGPL 一行都不许进。
7. **不许假成功、死按钮、灰占位。**
   - 服务器确认之前不许显示「已保存」。不吞错误。
   - 按钮点了必须有看得见的效果，做不到就删掉，并写进交付。
8. **开发槽是全波共用的。** 共享源码一改，槽就热更新，所有人都受影响。所以：
   - 不许让任何文件在磁盘上处于编译不过的状态超过一分钟：要么一次写完整，要么先在 `/tmp` 里改好再落盘。
   - 不许重启、停止或重建 `oceanleo-dev-preview` 和槽，槽有问题写信号给父 agent。
9. **网关容器与常驻进程。**
   - `docker restart oceanleo-api` 只有 W04、W05 可以做（backend 改动要靠它生效）。每次重启前先在 journal 记一行，每次都批量改完再重启，不许频繁重启。
   - 任何人都不许停 `oceandino-terminal-relay` 或 `cursor-agent`。
10. **存量用户文档不许静默改写**：格式不支持的只读打开，并给出「一键转换」。
11. **浏览器。**
    - 只用 `harness/` 的流程，每个场景跑完就关。同一时刻你最多一个 Chromium。
    - 截图放 `evidence/<ID>/`，大文件不提交。
12. **全量测试套件只由父 agent 跑。** 你只跑 focused tests 和类型检查。

## 3. 怎么干活

**命令**（在 `/root/projects/oceanleo-ui`）：
- focused test：
  `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<file>.test.mjs`
- 类型检查（约 55 秒，单槽排队，只在里程碑跑；别人也在改，只判你自己文件里的错）：
  `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- npx tsc --noEmit -p .`
- backend（W04 / W05）：
  `cd /root/projects/oceanleo/backend && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- python -m pytest -q tests/<file>`

**文件规模**：被行数闸登记的文件（`tests/advanced-canva-interactions.test.mjs`、`tests/media-editors.test.mjs` 里列的那些）必须 < 600 行，你新建的文件也守 600 行。已经很大的旧文件（如 `GridUniverStage.tsx`）不许再明显变大，新逻辑抽到新模块。

**文案**：
- 新 UI 文字一律写成 `tt("中文原文")`，同时在你那一册 `src/i18n/ui/messages/editor-overhaul-copy-<id>.ts` 里给出 16 个非中文语种的译文。英文要地道、简短。
- 闸 `tests/i18n-tt-key-coverage.test.mjs` 会红，交付前跑它。

**测试**：
- 只测已删除行为的旧用例，删掉或改成断言新行为，并在交付里逐条写原因。
- 仍成立的保护（安全、数据不丢）只能改对象，不许放松。
- 每件事至少加一条会因回退而变红的回归测试。

**浏览器验收**（父 agent 已实测可用）：
- 开发槽 `https://p-511af16886fbb22b5ab2367528b458ba.dev.oceanleo.com`，验收账号已能登录。
- 跑法：

  ```bash
  cd /root/projects/oceanleo-ui/docs/work-logs/2026-10-23-editor-overhaul
  bash harness/mint.sh | OUT_DIR=/tmp/<id>-x THEME=light node harness/run.mjs <你的场景.mjs> [参数…]
  ```

  `THEME=dark` 测深色；`VIEWPORT=1280x800` 改尺寸。
- 场景写法：`export default async ({ page, context, log, shot, helpers, args }) => {…}`。`helpers` 有 `gotoApp`、`uploadFiles`、`saveState`、`waitSaved`。参照 `harness/examples/probe-library.mjs`。场景文件放 `evidence/<ID>/scenarios/`，提交。
- token 走管道，绝不打印、不落盘。`mint.sh` 拒绝写到终端。
- 准备素材：
  - 能上传的类型：`harness/fixtures/`（pdf docx txt md xlsx pptx png mp3 mp4 glb）先复制成 `/tmp/<id>/[<ID>] 名字.扩展名`，再 `helpers.uploadFiles(page, [...])`。标题带你的 ID，别人才认得出是谁的。
  - deck / website / game / 视频画布：在对应编辑器里从素材库或公共素材打开一份模板，动一下就会 fork 进验收账号的库。
- 直接看数据库（只读，只查验收账号）：

  ```bash
  supabase-sql oceanleo "select r.id, r.created_at, v.title, v.artifact_type, v.ordinal from artifact_roots r join artifact_revisions v on v.id=r.current_revision_id where r.owner_principal_id in ('2ffeef37-102a-431b-b2c2-51c5675dba79','user:2ffeef37-102a-431b-b2c2-51c5675dba79') and r.retired_at is null order by r.created_at desc limit 20"
  ```

- 保存协议（`00-dispatch.md` §5）每个编辑器 owner 都要自己跑一遍，结果写进交付；V02 会独立再判一遍。

**两档主题**：`THEME=light` 和 `THEME=dark` 各截一张你负责的每个界面，存 `evidence/<ID>/`。标准见 D6 / D7。不许出现浅色岛（白底面板、白色弹层），也不许有看不清的字。

## 4. 接班文件（被打断时只丢最后一步）

- `signals/<ID>-state.md`：每个大步骤开始**之前**更新，写四件事：已确认的事实（每条标 [实测] / [读码] / [待核]）、正在做的这一步、下一步打算做什么、复现所需的确切命令。
- `signals/<ID>-journal.md`：每得到一条实测结论就追加一行，并随产品代码一起提交。
- 每 15 分钟左右必有一次提交。任何时候被杀，`main` 上都要有你到那一刻为止的全部成果。
- 动手前和交付前，各读一遍 `signals/*-to-<ID>.md`，看有没有转给你的事。

## 5. 交付

写 `verdicts/<ID>-delivery.md` 并提交，内容包括：
- 做了什么：用户看得到的变化，加上文件清单（删 / 改 / 增）。
- 提交号。
- 确切的验证命令与结果：focused tests、类型检查、浏览器场景，附截图路径。
- 保存协议的逐条结果（编辑器 owner）。
- 删掉的测试和原因。
- 转给别人的事。
- 请父 agent 代改的公共文件。
- 如实的剩余问题。

然后用一段简短总结回复，并给出交付文件路径。你的回报只是主张，父 agent 和验收位会在自己的 shell 里核。
