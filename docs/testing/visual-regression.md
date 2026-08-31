# 视觉与交互回归闸 · 运行手册

这道闸守的是**动效、几何与手感**——既有 `tests/*.test.mjs` 断言的是 DOM 结构，
测不到时长、曲线与延迟。31 个租户站的全部交互都在本包里
（`oceanleo-sites/apps` 有 0 个 `use client`），所以这里改一行会同时出现在 31 个站上。
没有这道闸，调好的动效会在三个月内漂回去，而且没人说得出是从哪天开始的。

- 用例：`tests/visual/specs/*.spec.ts`（九组，各守一位 owner 的产出）
- 基线：`tests/visual/baselines/`
- 预算：`tests/visual/budgets/interaction-budget.json`
- 配置：`playwright.config.ts`
- 运行器：`tests/visual/docker/`

---

## 怎么跑

```bash
npm run test:visual                      # 判定（基线必须已存在）
npm run test:visual -- --project=visual  # 只跑截图那半
npm run test:visual -- --project=budget  # 只跑延迟预算那半
npm run test:visual -- tests/visual/specs/w04-button-matrix.spec.ts   # 只跑一份
```

两条 script 都指向 `tests/visual/docker/run.sh`，它做的事只有一件：
**保证这套用例永远在同一个容器里跑**。任何参数原样透传给 `playwright test`。

**这台机器上的额外纪律**（不是 Playwright 的要求，是本机的）：

```bash
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- \
  npm run test:visual -- tests/visual/specs/w04-button-matrix.spec.ts
```

同机常年并发十几个 agent。`run-heavy` 排队，不排队会把整台机器压停
（2026-08-07 有过一次事故）。**基线要按 spec 逐份建，不要一把梭**：
一次跑全套的峰值内存会和别人的 `tsc --noEmit` 撞车。

在 Cursor 子 agent 里跑还有一条：**docker.sock 在沙箱里看不见**，
必须用 `required_permissions: ["all"]`（实测 2026-08-31）。

---

## 怎么更新基线

```bash
npm run test:visual:update                                            # 全部
npm run test:visual:update -- tests/visual/specs/w05-toast.spec.ts    # 一份
```

`--update-snapshots` **同时**打开截图基线与延迟预算的写盘开关
（`run.sh` 见到它就设 `LEO_BUDGET_UPDATE=1`）。两件事共用一个开关是刻意的：
截图基线与延迟预算是同一次实测的两半，分开授权会出现
「图更新了、预算还是上个月的」这种半新半旧的基线。

预算**只减不增**（`tests/visual/helpers/budget.ts`）。实测比现有预算慢时，
`--update-snapshots` **不会**把它悄悄调宽，会判红。要放宽必须先说明
「为什么这个交互本来就该更慢」，并在交付说明里留档。

### 谁有权更新基线

**改了对应产品行为的那位 owner。不是「遇到红就更新的人」。**

这条是整道闸能不能活过三个月的分界线。基线更新是**一次声明**：
「我知道这张图变了，是我改的，改成这样是对的」。
遇到红就 `-u` 一把过，等于把闸拆了还留着壳——报表永远是绿的，
而漂移照样在发生。

判断顺序：

1. 这张图变了，是**我这次改动**的直接结果吗？不是 ⇒ 别更新，去查「假阳性」一节。
2. 是的话，变成现在这样是**我想要的**吗？说不清 ⇒ 先说清再更新。
3. 两条都是 ⇒ 更新，并在提交信息里写清哪张图为什么变。
   `git show --stat` 里看得见 `.png` 的人有权问你，你要答得上来。

reviewer 侧的一条：`tests/visual/baselines/**` 出现在 diff 里而提交信息没提图，
**这是需要打回的**，不是小事。

---

## 为什么必须在容器里

三条理由，按严重程度排：

1. **字形。** 基线图里绝大多数像素是文字。宿主与容器的字体族、hinting、
   subpixel 策略只要差一点，整套基线当场全红——**而那种红不指向任何真实回归**。
   一道会因为换台机器就全红的闸，两周内就会被所有人 `-u` 过去，然后死掉。
2. **driver 版本。** 版本钉死在 `1.61.0`，与仓内既有 `playwright-core@1.61.0` 对齐
   （`Dockerfile` 的 `FROM` 与 `run.sh` 的 `BASE_IMAGE` 逐字一致，两处不一致 = 基线报废）。
   两份 driver 漂移会让「同一份代码在两台机器上截出两张图」。
3. **补装路走死过两次**（`W10.md` P0 的实测记录）：容器里缺 `libglib`，
   `apt-get` 自己跑不起来（缺 `libapt-pkg.so.6.0`）；借宿主机的库会把宿主 glibc
   拖进来炸 `__nptl_change_stack_perm`。所以浏览器只用官方镜像预装的那份。

所以 `run.sh` **刻意不提供「在宿主跑」的开关**。
真要在宿主上 debug，直接 `npx playwright test`——但那时截出来的图
**不许当基线提交**，`playwright.config.ts` 的 `LEO_VISUAL_IN_CONTAINER`
分支就是用来区分这两种运行的。

镜像本身**刻意不自动 pull**（3.45GB，静默拉取足以把这台机器的 IO 压停）。
第一次要人显式拉：

```bash
docker pull mcr.microsoft.com/playwright:v1.61.0-noble
```

runner 镜像（`leo-visual-runner:1.61.0`，官方镜像 + `@playwright/test`）
由 `run.sh` 在缺失时自动 build，约一分钟。它把 `@playwright/test` 装在容器的 `/pw`，
**不往宿主工作树写一个字节的 node_modules**。

---

## 假阳性：先查什么

按命中率排序，从上往下查。

### 1. token 全空 ⇒ 产物陈旧，不是回归

`w01-motion-tokens` 报「计算值是空串」时，八成是 `src/theme/ui.css` 没跟上。

夹具页链的是**产物** `ui.css`（正是 31 个站在生产里加载的那一份），
不是源文件 `globals.css`。token 写进 `globals.css` 却没跑 `npm run build:css` 时，
产物里不会有它们——**源码看着是对的，用户那边一点效果都没有**。
这不是假阳性，这是闸抓到的真问题，只是归属在 W01 不在改动者。

```bash
rg -c -- '--leo-dur-1' src/theme/globals.css src/theme/ui.css
rg -c -- '--leo-d-'    src/theme/ui.css     # 对照组：这条必须有命中
```

第二条是对照组，防止正则本身写错。**零命中是最贵的一类断言**，
本仓已经因为「零命中当事实」栽过三次。

本套件**刻意不跑** `build:css`：那会改写 `globals.css` / `ui.css` 两份产品源码。

### 2. 整套图差几个像素 ⇒ 弹簧没落到终态

Playwright 的 `animations:'disabled'` 只关 CSS 动画与过渡，**不停 JS 驱动的 rAF 弹簧**。
所以截图前必须调 `window.__leoMotionJumpAllToRest()`
（`tests/visual/helpers/fixture.ts` 的 `openCase()` 每次必调，用例绕不过去）。

钩子那道门是 `src/lib/motion/index.ts` 的
「`NODE_ENV !== 'production'` **或** `<html>` 带 `data-leo-motion-test`」，
夹具页靠后者。属性名被改 ⇒ `w02-edit-bar` 那条会**先红**，
而不是等到八组截图一起开始随机漂移。

### 3. 某一格每次都不一样 ⇒ 动态内容没 mask

时间戳、随机 id、头像、体积数字。清单在
`tests/visual/harness/client/harness.js` 的 `MASK_SELECTORS`。
新增一类动态内容而没加进去，表现就是「那一格每跑一次都不同」。
补选择器，别调阈值。

### 4. 一张图差得很小但一直红 ⇒ 看阈值，别调全局

阈值逐条写死在 `tests/visual/helpers/thresholds.ts`，每条带一句为什么。
未登记的用例直接 `throw`，不会静默用默认值。

**不许在 `playwright.config.ts` 里放宽全局阈值**：一处放宽 0.05,
九组用例一起失去分辨率，而且三个月后没人记得是谁放的。
要放宽就在 `thresholds.ts` 里放，连同理由，让 reviewer 看得见。

### 5. 在宿主上跑出来的红

见「为什么必须在容器里」。宿主裸跑的红**不指向任何真实回归**，直接忽略。

### 6. 预算超了，但只超一点

预算是在**这台机器、这个负载**下量的（`recordedAt` 与 `note` 字段记了画像）。
换机器、或同机并发着十几个 agent 的 `npm test` 时，偏差大属正常。
先在安静时段用 `run-heavy` 重跑一次再下结论。

真的持续超预算 ⇒ 去看是不是有人给按钮加了昂贵的 `filter` / `box-shadow`。
**不要直接调宽预算**，那是这一组唯一的失效方式。

---

## 这道闸守不住什么

**这一节比上面所有内容都重要。** 一道被高估的闸比没有闸更危险：
它会让人以为某件事被守着，而它从来没被守过。

### 夹具页是预渲染的静态 HTML，没有客户端 React

`tests/visual/harness/serve.mjs` 用 node 内建 http 起一个零依赖的静态站，
逐主体 `renderToStaticMarkup`。**刻意不用 `next build`**：那要编译整棵被测源码树，
而这道闸与它守的九份改动是同一波并发造的——
任何人手里有一份编辑到一半的文件，这道闸就整套编不出来。
**一道会被队友的半成品打哑的闸不是闸。**

代价写在明处：**需要真实客户端状态机的主体，本闸够不着。**
`tests/visual/harness/subjects.mjs` 的 `render` 一栏把主体分成三态：

| `render` | 含义 | 红了归谁 |
|---|---|---|
| `"ssr"` | 纯表现型，静态渲染就出真 DOM | 本闸真能守，红了归 owner |
| `"needs-client"` | 主体**在位**，但要活的客户端才渲染得出来 | **归本闸的覆盖边界，不记 owner 人头** |
| （缺席） | 模块里根本没有那个导出 | 归 owner，还没交 |

把后两者混成一句「主体缺席」会**对已经交卷的 owner 记错人头**。
所以两种红的文案与颜色都不同（红=缺席，琥珀=覆盖不到），
判据也分成 `expectSubjectPresent` 与 `expectSubjectCoverable` 两条。

今天落在 `needs-client` 的三位：

- **W02 `FloatingContextToolbar`** —— 走 `createPortal`，要活的 `controller.portalRoot`；
- **W03 `AnchoredPopover`** —— 定位靠对真实锚点量 `getBoundingClientRect()`，SSR 无布局；
- **W06 `MaterialLibrary`** —— 挂 effect 与外部订阅，SSR 只出骨架。

**这三条是红的，而且应该保持红。** 不 skip 是刻意的：
skip 会从报表里消失，三个月后没人记得这九分之三从来没被守过。红着才有人问。

### P3 点名的三条交互今天量不到

`W10.md` P3 要的是「打开弹层 / 切换编辑器路由 / 编辑栏收缩」。
三条都需要真实客户端状态机（同上），所以
`interaction-budget.spec.ts` 的最后一条**判红存档，并刻意不落假基线**。

为什么不给个数先占位：预算文件里一旦落下 `overlay-open: 12ms`，
后人会以为这条被守着；而预算只减不增，一个假的低基线还会让真实现值永远判红，
逼着后人去调宽预算——那时这一组就彻底废了。

实际量到的是两条**浏览器级的真实交互**（悬停引发的样式重算、键盘聚焦引发的重绘），
跑在真组件 + 31 个站生产加载的那份 `ui.css` 上。
它们不是任务书要的那三条，但是今天能实测出来的真数。

### 解封条件

给夹具页加**客户端 hydration**：把 React 与被测组件打进一个浏览器可加载的 bundle。
代价是要引入打包器（本仓 `node_modules` 里没有 esbuild/vite/webpack，
`_COMMON.md` 红线 6 也不许随手加运行时依赖），
或者接受 `next build` 那条会被队友半成品打哑的路。
**这是一次独立的取舍，不该在建闸的同一棒里顺手做掉。**

### 其它守不住的

- **真实字体渲染**：容器里字体族被钉死（`page-template.mjs` 的 `FONT_STACK`），
  用户机器上装了什么字体，这里看不见。
- **跨浏览器**：只有 chromium。Safari 的合成器差异不在覆盖范围内。
- **真实网络与数据**：夹具是确定性的，没有加载态抖动、没有慢接口。
- **`build:css` 之后的产物是否正确**：本闸只读产物，不生成产物。

---

## 接线

`tests/visual/harness/prerender.mjs` 的 `FIXTURE_PROPS` 是**夹具喂给被测组件的 props**。
**这是本套件唯一需要 owner 回填的地方，也是必须回填的地方。**

为什么它一开始就是「猜」出来的：建闸与它守的九份改动是同一波并发造的。
开工实测时 W01–W09 一件都还没落地（`--leo-dur-*` 与 `__leoMotionJumpAllToRest`
在 `src/` 下零命中，对照组已自证），所以那一刻**无从知道**这些组件最终的 prop 拼写。
每条都按 `motion-system.md` 的语义给了最可能的形状。

拼错不会让闸哑火——`renderCase()` 会把它渲染成 `.leo-missing` 并判红点名 owner。
但那是一条**假红**，而假红是这道闸最快的死法。所以：

**组件落地或改了 props 面的那一棒，顺手核一次 `FIXTURE_PROPS` 里自己那条。**
一分钟的事，比后人花半小时查一条假红便宜得多。

已经核过的（`[实测] 2026-08-31`，出处写在各条的注释里）：

| 主体 | 核了什么 |
|---|---|
| `button` | `variant`/`size`/`disabled`/`children` 逐条对过 `src/ui/Button.tsx:250-267` |
| `materialGrid` | prop 名是 `materials` 不是 `items`（`material-library-view.tsx:95`） |
| `chunkIsolation` | `{ kind, attempts, onRetry, onReload }`，两个回调必须给空函数 |

最后一条值得单独说：回调**不给**就可能在渲染期解引用报错，
而那种错会被 `resolveSubject()` 的 try/catch 收成「主体缺席」——
等于把已经交卷的 W09 冤枉成没交卷。
`prerender.mjs` 为此把「源码里声明了这个导出吗」（`sourceDeclaresExport()`，读源码）
与「加载得动吗」分成两个独立判断，正是为了不把闸自己的毛病记到 owner 头上。

---

## 基线在哪、怎么读

```
tests/visual/baselines/{projectName}/{testFilePath}/{arg}{ext}
```

例如 `tests/visual/baselines/visual/w04-button-matrix.spec.ts/w04-button-matrix.png`。
基线与用例同仓、同目录树，就是为了 review 时一眼看到「谁改了哪张图」。

延迟预算在 `tests/visual/budgets/interaction-budget.json`，每条带四个字段：
`p95Ms` / `samples` / `recordedAt` / `note`。
**当前的数以那份文件为准**，本手册刻意不抄一份会过期的副本。

失败产物（trace / diff 图 / HTML 报告）在 `tests/visual/.artifacts/`，已 gitignore。
看 diff 最快的一条：

```bash
npx playwright show-report tests/visual/.artifacts/html
```

---

## 与既有 225 份测试的关系

`npm test` 的 glob 是 `tests/*.test.mjs`（**仅顶层**）。
本套件全部在 `tests/visual/` 下且用 `.spec.ts` 后缀，**结构上不可能被它拾取**。
这是结构性保证，不是自觉：想让 `npm test` 跑到这套东西，
得先改 glob，而那是个显式动作。

两套闸各守一层，不重叠：

- `tests/*.test.mjs` 守**结构**（DOM 里有没有这个节点、行为对不对）；
- 本套件守**最终解析值、像素与延迟**（用户浏览器里真正发生的那一份）。

`w01` 与 W01 自己的 `tests/motion-tokens.test.mjs` 是同一对关系：
那边断言源文件写了什么，这边断言产物解析出了什么。
**两条都要有**——2026-08-31 实测到的正是「源文件对、产物空」这种情况。
