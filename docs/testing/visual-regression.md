# 视觉与交互回归闸 · 运行手册

> 交付物 `W10`。这道闸守的是本波调好的动效、按钮、弹层、素材卡片**不要在三个月内漂回去**。
>
> 为什么需要它：`oceanleo-sites/apps` 里 0 个 `use client`，31 个租户站的全部交互都在
> `@oceanleo/ui`。**这里改一行会同时出现在 31 个站上。** 而既有 216 份
> `tests/*.test.mjs` 断言的是 DOM 结构，测不到时长、曲线与手感。

---

## 快速上手

```bash
# 判定（基线必须已存在）。CI 与本地都跑这条。
npm run test:visual

# 定 / 更新基线。谁有权跑见 §谁有权更新基线。
npm run test:visual:update

# 透传任何 playwright 参数
npm run test:visual -- --grep w04
npm run test:visual -- --project=visual w01-motion-tokens
```

两条 script 都指向 `tests/visual/docker/run.sh`，**它刻意不提供「在宿主跑」的开关**，
理由见 §为什么必须在容器里。

首次运行会自动构建 runner 镜像（装 `@playwright/test@1.61.0`，约 1 分钟）。
基线镜像 `mcr.microsoft.com/playwright:v1.61.0-noble`（3.45GB）**不会自动拉**——
它太大，而这台机器上常有十几个 agent 并发，一次静默拉取足以把磁盘 IO 压停。
要拉就显式拉：

```bash
docker pull mcr.microsoft.com/playwright:v1.61.0-noble
```

### 这台机器上的注意事项

- `docker.sock` 只在**非沙箱**下可见。在 Cursor 子 agent 里跑要用
  `required_permissions: ["all"]`（`[实测] 2026-08-31`）。
- 重活走 IO 闸排队，别裸跑：

  ```bash
  bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- npm run test:visual
  ```

- 这是本仓最吃内存的一条命令（chromium + 单 worker）。开跑前看一眼 `free -h`；
  可用内存低于 ~2GB 时**排队等**，不要硬上。`[实测] 2026-08-31` 有过一批 agent
  被内存压死的记录，而 OOM 的表现是「随机某几张图截失败」——最难查的一类假阳性。
- 大批量基线**拆小批**跑（按 spec 文件或 `--grep`），不要一把梭。

---

## 目录结构

| 路径 | 是什么 |
|---|---|
| `playwright.config.ts` | 仓根。两个 project：`visual`（截图）与 `budget`（延迟） |
| `tests/visual/docker/` | `Dockerfile` + `run.sh`，闸的唯一入口 |
| `tests/visual/harness/` | 零依赖夹具服务器 + 预渲染 + 被测主体登记表 |
| `tests/visual/helpers/` | 确定性 fixture、逐条阈值、预算判定 |
| `tests/visual/specs/` | 九组 spec + 交互延迟预算 spec |
| `tests/visual/baselines/` | 截图基线，按 project / spec 文件分目录 |
| `tests/visual/budgets/interaction-budget.json` | 延迟预算基线 |
| `tests/visual/.artifacts/` | 报告与失败产物，不提交 |

**与既有测试的关系**：`npm test` 的 glob 是 `tests/*.test.mjs`（仅顶层），
本套件全部在 `tests/visual/` 下且用 `.spec.ts` 后缀，**结构上不可能被它拾取**。
这是「既有测试一份未改」的结构性保证，不靠自觉。

---

## 为什么必须在容器里

三条理由，每一条都单独足够。

1. **字形。** 基线图里绝大多数像素是文字。宿主与容器的字体族、hinting、subpixel
   策略只要差一点，整套基线当场全红——而那种红不指向任何真实回归。
   宿主裸跑 `npx playwright test` 得到的图与基线**逐字不同**。
2. **补装路走死过两次**（`W10.md` P0 有实测记录）：容器里缺 `libglib`，`apt-get`
   自己跑不起来（缺 `libapt-pkg.so.6.0`）；借宿主机的库会把宿主 glibc 拖进来炸
   `__nptl_change_stack_perm`。所以浏览器只用官方镜像预装的那套。
3. **driver 版本单一事实源。** 版本钉死 `1.61.0`，与仓内既有 `playwright-core@1.61.0`
   对齐。两份 driver 漂移会让「同一份代码在两台机器上截出两张图」，那是基线的死因。

`Dockerfile` 的 `FROM` 与 `run.sh` 的 `BASE_IMAGE` 必须逐字一致。
**改版本号 = 作废全部基线**，必须同时更新本文件。

### runner 的包装在哪儿，为什么宿主工作树不脏

官方镜像给了浏览器（`/ms-playwright`），**没给** `@playwright/test`。
runner 把它装在 `/pw`——一个与被测仓完全无关的前缀——再软链 `/pw/node_modules → /node_modules`。

node 的模块解析从文件所在目录逐级向上找：

```
/work/tests/visual/specs/node_modules → … → /work/node_modules → /node_modules
```

宿主的 `/work/node_modules` 里有 `react` / `typescript` / `fabric`（harness 要用，
必须能找到），但没有 `@playwright/test`，于是解析自然穿过它落到镜像的 `/node_modules` 上。
**结果：被测仓的包从宿主树取，runner 的包从镜像取，两边不互相污染，宿主一个字节都不动。**

挂载是读写的，这是刻意的：基线图与预算 JSON 要落回工作树才能被提交。

`--ipc=host` 是官方镜像的硬要求：默认 64MB `/dev/shm` 会让 chromium OOM 崩溃。

---

## 怎么更新基线

```bash
npm run test:visual:update
```

这一条开关同时授权**两件事**：写截图基线、写延迟预算。
两件事必须同一个开关——截图基线与延迟预算是同一次实测的两半，分开授权会出现
「图更新了、预算还是上个月的」这种半新半旧的基线。

### 预算只减不增

`tests/visual/helpers/budget.ts` 的规则：

- 没有基线且**没开** update ⇒ **判红**。不静默建基线是刻意的：静默建等于第一次跑
  什么数都算合格，闸在诞生当天就恒绿。
- 没有基线且开了 update ⇒ 记录首轮基线。
- 有基线，实测超了 ⇒ **判红**，即使在 update 模式下也不放宽。
- 有基线，实测更快 ⇒ update 模式下**往下收**。

所以「跑一遍 update 就绿了」对预算**不成立**。要放宽必须先说明为什么这个交互本来就该
更慢，并在交付说明里留档。

### 基线只给真的渲染出来了的用例建

缺席的主体**不要为了凑绿去建基线**。给一张空白图当基线，等于把这一格永久标成
「已守住」，而它从来没被守过。

---

## 遇到假阳性先查什么

按顺序。前两条覆盖了目前实测到的绝大多数。

### 1. token 全是空串 ⇒ 先查产物新鲜度，不是查闸

**这是第一诊断。** 夹具页链的是 `src/theme/ui.css`——那是 `npm run build:css` 的产物，
**也正是 31 个租户站在生产里加载的那一份**。

token 写进 `src/theme/globals.css` 但没跑 `build:css` 时，产物里不会有它们，
计算值就是空串：**源码看着是对的，用户那边一点效果都没有。**

`[实测] 2026-08-31`：`--leo-dur-*` 在 `globals.css` 命中、在 `ui.css` 零命中；
两份 mtime 分别是 08-31 16:08 与 **08-19 21:19**。也就是产物比源码旧了 12 天。

复核（**两条都跑**，第二条是对照组，防止正则本身写错）：

```bash
rg -c -- '--leo-dur-1' src/theme/globals.css src/theme/ui.css
rg -c -- '--leo-d-'    src/theme/ui.css        # 对照组：这条必须有命中
```

确认是产物陈旧 ⇒ **归 W01**，跑 `npm run build:css` 并把产物一起提交。

**本套件刻意不替你跑 `build:css`**：它会改写 `globals.css` 与 `ui.css` 两份**产品源码**，
而 W10 的硬红线是不碰产品源码（`W10.md` §禁区）。

### 2. 在宿主裸跑了

字形不同，整套红。用 `npm run test:visual`，不要 `npx playwright test`。

### 3. 随机差几个像素 ⇒ 确定性的三件事掉了一件

三件措施缺一条这套闸就是假阳性工厂。它们**收在 fixture 里，用例没有办法绕过**：

| # | 措施 | 落在哪 |
|---|---|---|
| ① | `animations: 'disabled'` 关 CSS 动画与过渡 | `playwright.config.ts` 的 `toHaveScreenshot` |
| ② | `window.__leoMotionJumpAllToRest()` 把 spring 落到终态 | `helpers/fixture.ts` 的 `settle()` |
| ③ | mask 时间戳 / 随机 id / 头像 / 体积数字 | `helpers/fixture.ts` 的 `maskLocators()` |

②**为什么不能省**：Playwright 的 `animations:'disabled'` 只关 CSS 动画与过渡，
**不停 JS 驱动的 rAF 弹簧**。没有它，其余八组的截图都会在「弹簧还在动」的随机某一帧上
拍下来。钩子缺失一律**判红，不许绕过**（`W10.md` P2②）——绕过就等于替 owner 把红染绿。

### 4. 内存不够

OOM 的表现是「随机某几张图截失败」。看 `free -h`，排队重跑，别调阈值。

### 5. 阈值：不许全局放宽

逐条阈值在 `tests/visual/helpers/thresholds.ts`，**每条都带一句「为什么不用默认值」**。
全局默认 `maxDiffPixelRatio: 0.01` 在 `playwright.config.ts`。

**不许在 config 里放宽**：一处放宽 0.05，九组用例就一起失去分辨率，而且没人记得是谁放的。
真需要放宽就在 `thresholds.ts` 里给那一条写死并写明理由。
没登记阈值的用例会直接抛错，这是刻意的。

---

## 谁有权更新基线

**改了对应产品行为的那位 owner。不是遇到红就更新的人。**

这条是本文件唯一的纪律条款，写清楚是因为它最容易被绕过：`--update-snapshots` 跑一遍
就全绿了，而那样这道闸在它最该说话的那一天恰好变哑。

流程：

1. 红了 ⇒ 先按 §遇到假阳性先查什么 排掉假阳性。
2. 确认是**真的行为变了** ⇒ 找 `tests/visual/harness/subjects.mjs` 里那条的 `owner`。
   登记表的 `owner` 一栏不是装饰：红的时候第一件事是知道去找谁，不是去猜。
3. **由那位 owner 更新基线，并在他自己的提交里说明改了什么、为什么**。
   新基线图要和产品改动进同一个提交——这样 review 时能一眼看到「谁改了哪张图」
   （`snapshotPathTemplate` 刻意把基线与用例放在同一棵目录树下）。
4. 不确定是不是真变了 ⇒ 别更新，问 owner。**红着比假绿着好。**

---

## 这道闸守不住什么

**这一节不许含糊。** 上面写的每一条能力都有边界，说清边界才知道还缺什么。

### 夹具是预渲染静态 HTML，没有客户端 React

harness 刻意**不用 Next 做**，用零依赖静态服务器 + 逐主体预渲染。理由：

仓里唯一可用的打包器是靠 `auto-install-peers` 带进来的 `next`，但 `next build` 要编译
整棵被测源码树；而**这道闸与它守的九份改动是同一波并发**——任何人手里有一份编辑到
一半的文件，闸就整套编不出来。**一道会被队友半成品打哑的闸不是闸。**
逐主体编译把爆炸半径关进单个用例：主体缺席只变成九分之一条红。

代价就是没有客户端 hydration。于是：

**守得住**

- `motion-system.md` 的 ①状态 ②进出场 ⑤持续编排 三类
  （这三类本来就是纯 CSS 驱动，占动效面九成）
- token 解析成的最终计算值（六档时长、五条曲线、位移、错峰、reduced-motion 降级）
- 几何（`getBoundingClientRect` 逐字段）
- 挂载节点数（虚拟化有没有被摘掉）
- `:hover` / `:active` / `:focus-visible` —— 它们是**浏览器级伪类**，不需要 React，
  用 `locator.hover()` 与键盘 Tab 就能在静态页上真实触发。
  这是原计划里最容易想歪的一处：不必伪造 class。

**守不住**

需要真实客户端状态机的那部分。今天有三个主体落在这一侧，**它们都已经交卷了，
不是欠账**：

| 主体 | owner | 为什么渲染不出 |
|---|---|---|
| `FloatingContextToolbar` | W02 | 走 `createPortal`，且要活的 `controller.portalRoot`；`renderToStaticMarkup` 出空串 |
| `AnchoredPopover` | W03 | 定位靠对真实锚点量 `getBoundingClientRect()`，SSR 无布局；同样走 portal |
| `MaterialLibrary` | W06 | 挂了一串 effect 与外部订阅，SSR 只出骨架 |

以及 `W10.md` P3 点名的三条交互 —— `overlay-open` / `editor-route-switch` /
`edit-bar-collapse` —— 同理量不到。

### 两种红必须分开读，否则会记错人头

这是本套件最要紧的一条纪律，`helpers/fixture.ts` 里是两个不同的断言：

| 断言 | 红的含义 | 记谁头上 |
|---|---|---|
| `expectSubjectPresent` | owner 还没把主体交出来，或导出改名了 | **owner** |
| `expectSubjectCoverable` | 主体**在位**，是这道闸够不着 | **W10**（闸的覆盖边界） |

混成一条会直接违反 `_COMMON.md` §8「不许在别人半成品的工作树上给别人下判决」。

**为什么仍然判红而不是 skip**：skip 会从报表里消失，三个月后没人记得这几格从来没被
守过。红着才有人问，问了才会有人去补 hydration 那一步。

### 解封条件

给夹具页加客户端 hydration。那需要一个能编译被测源码树的打包器——也就是要么等
`next build` 在这棵树上稳定下来，要么给本套件单独引一个 `esbuild`
（今天 `esbuild` / `vite` / `webpack` **都不在位**，`_COMMON.md` §2 红线 6 也不许随便引）。
**这是本套件明确未做的一步，不是忘了。**

### 还有一件：判「不存在」要用 AST，不要用 grep

`_COMMON.md` §7b③ 记了三次工具用错导致的假事实。本套件自己也栽过一次：
登记表原先按台账「`src/ui/index.tsx` 没有 Button」推出「Button 不存在」，
而 `Button` 其实在 `src/ui/Button.tsx:250`，只是没从桶文件再导出。
**照原样跑会对唯一一个已经交卷的 owner 报假红。**

⇒ 判红前先确认导出名与模块路径。「A 文件里没有」不等于「仓里没有」。
台账里的事实会过期。
