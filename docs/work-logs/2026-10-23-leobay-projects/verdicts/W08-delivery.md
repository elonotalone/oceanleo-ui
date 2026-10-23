# W08 交卷：平台通知进 LeoChat（境内外同一套）、铃铛去留、未读合计、深链（含内容处置挂载）

owner：W08（重派轮）。起点 `75f3baaf`（上一轮留下的 `host-state.ts`）。提交：`0852a111`、`9c485f11`、`0f1d53a1`、`1db15767`（交卷文件本身是最后一个）。
不 push、不重启容器、不写库、没开浏览器；只改了任务书边界内的文件（清单见 §6）。

## 1. 用户现在怎么看到平台通知

境内、海外登录后**完全同一套代码路径**（没有任何按域名家族 / LeoBay 在不在本站的分支，测试里有源码守卫）。

1. **入口**：LeoChat 的「聊天」列表**最上方固定一行「通知」**（暖色铃铛头像、红色未读数、副标题 = 最新一条通知的标题、右上角时间；没有通知写「还没有通知」）。固定在搜索框与会话列表之间，不随会话滚走；搜索时让位。三处显示 LeoChat 的地方都有：左下角图标开的**小窗**、`/leochat`**整页**、对话页**右侧栏**。
2. **列表**：点这一行进「通知」视图（二级视图，占详情位：小窗 / 窄屏里是整块内容区，放大 / 整页 / 右侧栏的宽布局里在右边，左边仍是聊天列表且「通知」行亮着，标签仍停在「聊天」）。每条：未读红点 + 粗体标题、正文（2 行）、时间（今天 时:分 / 昨天 时:分 / 月日 时:分 / 年月日）、有去处的画箭头；已读的变灰。顶栏：返回、**「全部标记已读」**（有未读才出现）。底部「加载更多」（每次 30 条，最多 200）。空态、加载中、出错重试、「旧列表 + 刷新失败」细提示都有。
3. **点一条**：先**本地立即标为已读**（不等网络；失败则以服务端为准重取回滚），再跳到它的链接（落点表见 §3）。标题与正文只当文字渲染，不渲染 HTML。
4. **内容处置（cases）**：`kind === "moderation"` 或链接指向内容处置的通知，点开 = `cases` 视图，挂 W09 的 `MessagesContentCases({ caseId, onBack })`；它**不出现在任何常驻导航里**（标签只有「聊天 / 联系人」），也不被「上次停在哪」记住，只经通知或深链进入；返回 = 回到通知列表。
5. **文案**：通知标题 / 说明过 `tt()`。后端 `TALENT_NOTIFICATION_EVENTS` 的 33 种 LeoBay 交易事件（库里 35 条通知几乎全是它们）的固定句式补了 16 语译文，海外用户读自己的语言；含用户内容的动态句子（如「「hi」没有完成」）不在词典里，原样显示。

## 2. 深链表（合同 I-4）

| 地址 | 结果 |
|---|---|
| `?im=notices` | 打开 LeoChat 的通知列表 |
| `?im=cases` | 打开内容处置（列出全部） |
| `?im=cases:<案件 id>` | 打开内容处置并**直接展开那一件**（id 校验 `^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$`；非法整条当没有；`%3A` 与 `:` 等价） |
| `?im=<会话 id>[&im_seq=n]` / `?im=inbox` / `?im=people` / `?im_invite=<码>` | 与以前一致 |

- 任何站、任何页面都可带 `?im=`：LeoChat 小窗在那一页打开，随后地址栏清掉（浮层不是路由）；门户规范地址 `/leochat?im=cases`。
- 序列化 `buildImSearch` 与解析互逆（冒号照原样写 `cases:<id>`）。`oceanleo:im-open` 事件的 detail 也认 `{ view: "notices" | "cases", caseId }`（`caseId` 只给 cases，坏值丢掉）。
- `cases` 不进 `oceanleo:leochat:last`（存成聊天），所以刷新 / 再开 / 左下角图标都不会落在它上面；`notices` 记得住。

## 3. 通知链接的落点表（`notices/notice-links.ts`，只看链接，不看域名家族）

| 通知 | 落点 |
|---|---|
| `kind` 为 `moderation`（含 `moderation.*`），或链接是 `/account/content-cases`、`/settings/content-cases[/<id>]`、`?im=cases[:<id>]`（含另一个家族的绝对地址，如 `https://oceanleo.cn/account/content-cases`） | **cases 视图**；案件 id：链接里的为先，其次 `meta.case_id`；不合法的丢掉 |
| `/bay?bay=conversation:<tid>`、`/leochat?im=<会话>`、`/…?im=<会话>&im_seq=n`、`/leochat?c=<会话>` | 对应**会话**（交易会话 = `talent:<tid>`），留在 LeoChat |
| `/bay?bay=<任一合法 Bay 深链>`（order / demand / help / app / app-thread / app-manage / settings / mine:* …）、光一个 `/bay` | **`openBay`**（先收起小窗再去）；本站没有 LeoBay（境内）时只标已读、不跳、不画箭头——不替用户去另一个家族的站 |
| `/leochat`、`?im=inbox|people|notices` | LeoChat 自己的栏目 |
| 本站其余路径（`/history?task=…`、`/projects/<id>`、`/settings/…`、`/computers/…`） | 站内跳转（外壳的 `router.push`，不整页刷新），先收小窗 |
| 别的主机的 http(s) 地址（含同家族的子站、用户内容域） | 新窗口，`noopener,noreferrer` |
| 空、非 http(s)、`//host`、`javascript:`/`data:`、带账号密码、超 2048 字、会被 URL 解析器换主机的相对写法（`/\evil.com`、`/<tab>/evil.com`） | **不跳**（fail closed），只标已读 |

`/leochat?c=…&call=…`（通话推送）和 `?im_invite=` 要让整页 / 宿主自己的深链流程去处理，按「站内跳转」。

## 4. 未读合计规则与刷新

- **合计 = 会话未读（IM `unread.total`，静音会话本来就不进）+ 平台通知未读（`/v1/notifications` 的全局 `unread_count`）**；脏值（负数 / NaN / 非数字）当 0，小数取整，显示 99+ 封顶。
- 用在：左下角 LeoChat 图标角标、**标签页标题** `(N) …`、小窗 / 整页 / 右侧栏「聊天」标签的数字。「联系人」标签仍只是联系请求数。收件箱「通知」行上的数字 = 通知未读（只有 1 条也写数字）。
- **新通知到达**：IM 实时通道里没有任何通知事件（`ImEvent` 联合与后端 `app/im` 都查过），所以用轮询：登录后每 **60 秒**取一次 `GET /v1/notifications?limit=30`（一次拿到未读数和最新标题），沿用铃铛原来的 `COUNT_POLL_MS = 60000`（测试读铃铛源码钉成相等）；**标签页切回可见立即取**；LeoChat 一打开 / 通知视图一打开立即取；后台标签不取；登出清空；所有使用方共用一份轮询。
- 通知仓对这些情形有专门处理并有测试：取数期间用户标了已读 → 丢掉旧响应再取（不闪回未读，已做变异验证）、标已读失败 → 回服务端为准、全部已读时更早没取下来的未读也由服务端清、`refresh` 先于第一个使用方、登出后进行中的响应作废。

## 5. 铃铛去留

`NotificationBell` 登录后两版都 `return null`、未登录又没有通知，**从 `SidebarAccountCluster` 拿掉了**。文件与公开导出**保留不渲染**（`shell/account/index.ts` 的导出、公开 API 快照、`tests/leodev-cn-edition`（要 `portalHref(item.link)`）、`tests/im-overlay-layout`（要 `if (imOn || bayOn) return null`）、门户 `device-status-popover` 测试都还引用它），文件头已写明「已不再渲染」。全仓没有任何组件再 `<NotificationBell/>`（测试守卫）。

## 6. 文件清单

新增（`src/shell/messages/notices/`）：`notice-links.ts`（链接落点分类，纯）、`notice-unread.ts`（未读合计，纯）、`notice-present.ts`（时间口径，纯）、`notice-store.ts`（通知仓，依赖可注入）、`use-notices.ts`（浏览器接线 + 钩子）、`open-notice.ts`（点一条：标已读 + 落点执行层）、`NoticesView.tsx`、`InboxNoticesRow.tsx`、`MessagesSubView.tsx`（notices / cases 二级视图的唯一挂载点）、`notice-icons.tsx`；`tests/lbp-w08-notices.test.mjs`。

修改：`messages/Inbox.tsx`（固定「通知」行，props 新增 `onOpenNotices`、`noticesActive`）、`messages/MessagesHost.tsx`（轮询、标题未读、站内跳转、二级视图、标签数字）、`messages/messages-surface.tsx`（样式）、`leochat/{leochat-body,LeoChatPage,LeoChatPanel,LeoChatButton}.tsx`、`account/{SidebarAccountCluster,NotificationBell}.tsx`、`i18n/ui/messages/lbp-w08-copy.ts`；`messages/host-state.ts` 是上一轮的（75f3baaf），这一轮没再动。`src/api/notifications.ts` 现成的客户端够用，**未改**。

被打红 / 需要同步的测试（小范围精确替换）：`im-host-state`（视图白名单四项）、`bay-shell-hooks`（视图四项；侧栏不再有铃铛）、`im-nav-entry`（顺手修掉开工前就红的第 7 条：读不存在的 `InboxFilters.tsx`）、`leochat4-surfaces`（境内整页不再 unavailable；新依赖的桩）、`leochat3-window` / `leochat-toolbar` / `call-chat-inbox`（新依赖的桩与新 props）。

## 7. 测试命令与结果原文

命令（共享 UI 单个测试，`<名>` 换成文件名）：

```
cd /root/projects/oceanleo-ui && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<名>.test.mjs
```

`tests/lbp-w08-notices.test.mjs`（新增，51 条）：

```
# tests 51
# pass 51
# fail 0
```

（覆盖：深链解析 / 序列化 / 互逆 / 非法 id；host-state 的 notices / cases 行为；链接落点分类含 fail-closed 与「不看域名家族」；未读合计；通知仓全部分支；执行层；收件箱通知行、通知视图、二级视图挂载；整页 / 右侧栏 / 小窗 / 入口角标 / 标题；与 W09 真实现对接（I-3）；三个域名家族页面上收件箱通知行逐字相同；铃铛去留；源码守卫；16 语译文。）

相关既有测试（批量脚本输出原文，`/tmp/lbp-w08/after-2.txt`）：

```
bay-shell-hooks rc=0 tests=8 pass=8 fail=0
call-chat-inbox rc=0 tests=20 pass=20 fail=0
im-acceptance-static rc=0 tests=13 pass=13 fail=0
im-host-state rc=0 tests=25 pass=25 fail=0
im-info-panel rc=0 tests=13 pass=13 fail=0
im-inbox rc=0 tests=13 pass=13 fail=0
im-nav-entry rc=0 tests=7 pass=7 fail=0
im-overlay-layout rc=0 tests=9 pass=9 fail=0
im-title-badge rc=0 tests=11 pass=11 fail=0
leochat3-window rc=0 tests=12 pass=12 fail=0
leochat4-surfaces rc=0 tests=9 pass=9 fail=0
leochat-toolbar rc=0 tests=3 pass=3 fail=0
leodev-cn-edition rc=0 tests=9 pass=9 fail=0
tpp-w5-account-parity rc=0 tests=3 pass=3 fail=0
public-api-snapshot-tracked rc=0 tests=4 pass=4 fail=0
architecture-convergence rc=0 tests=4 pass=4 fail=0
i18n-bundle-boundary rc=0 tests=5 pass=5 fail=0
```

同一批里**开工前就红、与本任务无关**的（失败原因已逐个看过）：`app-shell-model-visibility`（`messages/call/engine` 目录导入，calls-v2）、`bay-needs-demand-pane`、`bay-needs-help`、`e2-result-canvas-stability`（桩缺 `runAfterOverlayExit`）、`im-team-invite`（桩缺 `runtimePageOrigin`）、`plugin-module-hosting`（右栏标题条）、`im-conversation-store`（`applyReactionLocal` 未导出）。`bay-deal-view` 中途红过一次（W06 在改 `bay/deal`），再跑已绿。

`tests/i18n-tt-key-coverage.test.mjs`：第 1–7 条绿；第 8 条（全仓缺口）开工时红 51 条，其中 29 条是 `src/shell/messages/*` 的**老欠账**（Inbox 右键菜单、多选与转发、联系人名片、群信息，非本波新增），在我的目录里，已补 16 语；现在剩的 22 条全在 editor-overhaul 的文件里（`media-editors/AudioTranscriptSection`、`advanced-routes/VideoTimelineRoute`、`LeoAssistant`、`LibraryPdfReader`、`AgentChat`、`LibraryMediaPreview`），**我的边界里一条不剩**；第 9、10 条（基线死条目 / 棘轮）是别的工程在改的基线，不是我的。

类型检查（共享 UI，`pnpm typecheck`）：见 §9（交卷时的结果）。

## 8. 没做完的和原因 / 需要父 agent 处理的

**请求 1（境内外完全一样的最后一段，边界外三处）**：开工时境内 `/leochat` 整页与侧栏「LeoChat」入口被三处挡住——门户 `app/leochat/page.tsx`（`if (family.cn) notFound()`）、门户 `app/_components/clone-shell.tsx`（`.filter(… "leochat" || bayEnabledHere())`）、共享 `src/shell/WorkspacePages.tsx`（同一句过滤；`nav-source/index.ts` 里还有一条旧注释）。`LeoChatPage` 本身（我的边界）已去掉 `bayEnabledHere()` 分叉。
交卷时我看到工作区里**已经有人在解这几处，且未提交**（不是我改的，我没碰也没提交）：`oceanleo/app/leochat/page.tsx`、`oceanleo/app/_components/clone-shell.tsx`、`src/shell/WorkspacePages.tsx`、`src/shell/nav-source/index.ts`，以及我边界内的 `tests/leochat4-surfaces.test.mjs` 末一例（改成「境内外都有 LeoChat」，已验证 9/9 绿）。请父 agent 把这几处**一起提交**；另有两个门户测试正钉着旧行为、现在是红的，需要同步改：`oceanleo/tests/leochat-portal-page.test.mjs`（钉 `if (family.cn) notFound()`）、`oceanleo/tests/bay-portal-hooks.test.mjs` 第 2 条（钉 `entry.id !== "leochat" || bayEnabledHere()`）。
解开之后合同 I-4 的规范地址 `/leochat?im=cases` 在境内才不再 404（用户从通知里点进来走的是站内分类，不经过这条路由，不受影响；邮件 / 外部链接会撞上）。

**请求 2**：无需改 `shell/index.ts` / 公开 API 快照 / `bay-state.ts` / `shell-overhaul-copy.ts`（我的分表 `LBP_W08_MESSAGES` 已被聚合器注册，仍是原来的导出名，现在包含 3 块内容）。

没做的：
- 没开浏览器 / 没截图（本任务未批准）：视觉只靠结构、类名与 jsdom 渲染测试保证；真机上的间距、暗色、动效请验收时看一眼（通知行复用了会话行的圆角 / 悬停 / 高亮样式，新增的几条 CSS 在 `messages-surface.tsx`）。
- 通知里**含用户内容的动态句子**（任务失败、项目邀请、密钥库请求、内容处置正文等）后端只写中文，没法在前端译；要译需服务端按语言出文。
- 手机 App 的「通知」屏没动（只读参考）；网页点一条即标已读，与它的「已读」滑动 / 全部已读对齐的是语义，不是逐像素。

## 9. 交卷时的类型检查与门户

（见本文件末尾追加的一节；若没有追加，说明 heavy 槽一直在排队，我没能拿到结果——共享 UI 在 `0852a111` 之后的第一次整仓 `pnpm typecheck` 是 0 个错误。）

## 10. 对别的 owner 的接口说明

- **W09**：`MessagesSubView` 是 `cases` 视图的唯一挂载点，传 `caseId`（`?im=cases:<id>` 或通知链接 / `meta.case_id` 里的合法 id；没有就是 `null`）和 `onBack`（→ 通知列表）。已用你的真实现跑过对接测试（案件展开、返回、找不到的 id 有提示）。后端通知请保持 `kind="moderation"`，链接写 `/leochat?im=cases` 或 `/leochat?im=cases:<id>`（相对或绝对都认；旧的 `/account/content-cases`、`/settings/content-cases` 也认），能在 `meta.case_id` 里放案件 id 更好。
- **W05 / W06 / W02**：后端交易事件通知的标题与说明是**逐字**当 `tt()` 的 key 用的（`lbp-w08-copy.ts` 后半）；谁改了 `app/notifications.py` 里的句子，请同时改那里，否则该句回退成中文。
