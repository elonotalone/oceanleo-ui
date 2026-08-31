# 动效系统（Motion System）

Status: 操作员 2026-08-31 裁定走候选 B。本文是规范，不是提案。

## Product outcome

31 个租户站 + 门户共用一套**变量化**的动效词汇：时长、曲线、位移幅度、层级延迟
都从 token 取，禁止在组件里写裸时长与裸曲线。手势驱动的动效（拖拽、平移缩放、
甩动）由**一个**第一方弹簧原语提供真实的速度保持与可打断性。
`prefers-reduced-motion` 在 token 层一次性降级，不由每个组件各自处理。

改一个包等于改 31 个站（`01-verified-facts.md` §2.1），所以这套词汇的
一致性由包的公共 API 快照与门禁保证，不靠约定。

## 现状读数（决定这份规范靶心的三个数）

来自 `docs/work-logs/2026-08/oceanleo-experience-upgrade/01-verified-facts.md` §2.3：

- 裸 `transition`（不带时长）**607** 条，显式 `duration-*` 仅 **62** 条
  ⇒ **约 90% 的动效跑在 Tailwind 默认的同一档上**。所有元素同速同节奏、
  没有层级、没有质感——这就是「死板」的量化定义。
- `cubic-bezier` 去重 8 条，其中**同一条曲线两种写法**
  （`.21,1.02,.73,1` 与 `0.21, 1.02, 0.73, 1` 各 4 次）——token 漂移的签名。
- `prefers-reduced-motion` 在 332,746 行里只有 **2** 处。

已有的资产**不要推倒**：`v-*` / `leo-*` 那 15 条 keyframes 与 `.v-page` 的
0→320ms 错峰是好东西，本规范是把它们**变量化并补全缺失的三类**，不是替换。

## 五类动效，只有第四类需要真实物理

| 类 | 说明 | 现状 | 归属机制 |
|---|---|---|---|
| ① 状态 | hover / focus / press / selected / disabled | 有，跑默认档 | **CSS token** |
| ② 进出场 | 弹层、对话框、面板、toast 的出现与消失 | 只有入场；`anchored-popover` 完全没有 | **CSS token + `@starting-style`** |
| ③ 布局形变 | 元素改位置/尺寸，或 A 变成 B | **无** | **View Transitions API** |
| ④ 手势驱动 | 值由指针实时驱动，松手后物理收敛 | 各处手写，无速度 | **第一方 spring 原语** |
| ⑤ 持续与编排 | 骨架微光、spinner、进度、列表错峰 | 不错 | **CSS token**（沿用现有 keyframes） |

## Dispatch architecture comparison

| 候选 | 成熟度与互操作 | 保证与环境契合 | 活动部件与已知失效模式 |
| --- | --- | --- | --- |
| **A. 纯 CSS / WAAPI，零依赖** | 全部走浏览器原生；与既有 `gen-theme-css.mjs` 管线天然契合 | 零字节增量；①②⑤ 在合成器线程执行，动画期间 0 JS/帧；Playwright `animations:'disabled'` 可确定性关停 ⇒ 视觉回归零抖动；reduced-motion 一条媒体查询全局降级 | **④ 无解**：`linear()` 是预计算曲线，中途打断重定向时 CSS 拿不到当前速度作为新动画初速度，会顿一下。③ 要每处手写 FLIP。React 里退场要手写延迟卸载状态机。若为 ④ 各处手写弹簧数学，会重演「8 条曲线两种写法」 |
| **B. CSS token 为主 + 一个第一方 spring 原语（选中）** | ①②⑤ 用 CSS token 与 `@starting-style`；③ 用 View Transitions；④ 用**一个** 200–300 行的第一方弹簧，只在约 10 个手势点被调用 | 保留 A 的全部收益于 90% 的面；④ 拿到真实速度保持与可打断性；弹簧是自己的代码 ⇒ 能进 `api:check` 快照、能写单测、能用 `architecture:check` 限制只允许特定目录 import；可增量落地（token → 原语 → 逐点迁移） | 要自己维护弹簧数学（一个纯函数，可测试）；View Transitions 需 `@supports` 降级；spring 驱动的动效在视觉回归里需要「跳到终态」的测试钩子 |
| C. 引入 Motion / framer-motion | API 舒服，③④ 开箱即用，真实弹簧与速度继承 | — | **会打掉视觉回归门禁**：Playwright 的 `animations:'disabled'` 只关 CSS 动画/过渡，不停 JS 驱动的 rAF 弹簧；**主线程成本**叠加在已经很挤的 fabric/three/ECharts/ProseMirror 之上；**库习语渗透 263 个 shell 文件**，与 `api:check` 公共 API 快照、`architecture:check` 域边界、以及 `plugin-chrome/tokens.ts:3-5`「刻意不新增第四套变量」的纪律直接冲突；约 30–50KB（min+gz），相对刚从 625KB 砍到 404KB 的首屏是 +7~12% |

## Decision

**选 B。**

决定性的一条：`linear()` 唯一真正做不到的事是**打断时保留速度**，而这只影响第 ④ 类；
第 ④ 类在本产品里是**可枚举的少数点**（下 §手势点清单，10 处）。
为 10 个点引一个会渗透 263 个文件的库，代价不对等。

否决 A 的理由不是它不够好，而是**它会把弹簧数学散进 10 个文件**——那正是本规范
要消灭的漂移形状。一个共享原语与十份手写数学的区别，就是 token 与裸值的区别。

否决 C 的决定性理由是**门禁不兼容**：本波同时要建视觉回归闸（`interaction-baseline`
另文），而 C 会让那道闸变成假阳性工厂。先建闸再引库，顺序不能反。

## Falsifying assumption

这条链在下面任一情况下不成立：

1. 有第 ④ 类之外的动效需要打断时保留速度——则 CSS 覆盖 90% 的前提破了；
2. 手势点数量超过 20——则「第一方原语更便宜」的算术翻转，应重新评估 C；
3. `@starting-style` + `transition-behavior: allow-discrete` 在目标浏览器矩阵上
   无法覆盖弹层退场——则 ② 需要另找机制。

## 规范一 · Motion token

全部 token 由 `scripts/gen-theme-css.mjs` 生成进 `src/theme/globals.css` 的
`THEME:GENERATED` 标记区（管线见 `01-verified-facts.md` §2.2）。
**不新建第二个 CSS 文件**，也不新增第四套变量前缀——沿用 `--leo-` 命名空间。

### 时长阶梯

六档，覆盖现有全部实测值（0.18 / 0.25 / 0.3 / 0.34 / 0.45 / 0.5s 与
Tailwind 的 75 / 150 / 200 / 300 / 500）：

| Token | 值 | 用途 |
|---|---|---|
| `--leo-dur-1` | `90ms` | 即时反馈：按下、勾选、开关拨动 |
| `--leo-dur-2` | `140ms` | 状态变化：hover、颜色、边框 |
| `--leo-dur-3` | `200ms` | 小件进出场：tooltip、popover、菜单 |
| `--leo-dur-4` | `280ms` | 面板/对话框进场、抽屉 |
| `--leo-dur-5` | `380ms` | 页面级、大面形变 |
| `--leo-dur-6` | `520ms` | 大幅 morph、庆祝态 |

**层级规则（这条比数值本身重要）**：同一视觉层级的元素用同一档；
跨层级差**恰好一档**。禁止「所有东西都 150ms」。

### 曲线

| Token | 值 | 用途 |
|---|---|---|
| `--leo-ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | 默认；位置/尺寸变化 |
| `--leo-ease-decelerate` | `cubic-bezier(0.05, 0.7, 0.1, 1)` | 入场（从无到有） |
| `--leo-ease-accelerate` | `cubic-bezier(0.3, 0, 0.8, 0.15)` | 退场（从有到无） |
| `--leo-ease-emphasis` | `cubic-bezier(0.21, 1.02, 0.73, 1)` | **保留既有品牌曲线**，全部 `v-*` 入场已在用，不许改值 |
| `--leo-ease-spring` | `linear(…)` | 物理弹簧近似，见下 |

⚠️ `--leo-ease-emphasis` 的值**必须逐字等于**现在 `globals.css:556-574` 里
那条 `cubic-bezier(0.21, 1.02, 0.73, 1)`。本波顺带消掉它的第二种写法
（`.21,1.02,.73,1`），但**不改数值**——改品牌曲线不在本波范围。

### `linear()` 弹簧曲线的生成方式（规范性）

**不许手写这串数字。** `--leo-ease-spring` 的 stop 列表必须由
[Linear Easing Generator](https://linear-easing-generator.netlify.app/)
按下列参数生成，并把参数原样写进 CSS 注释，供后人复算：

```
stiffness: 210    damping: 20    mass: 1    简化精度: 3 位小数
```

同时必须给不支持 `linear()` 的浏览器留降级（`@supports` 或声明顺序）：

```css
--leo-ease-spring: var(--leo-ease-emphasis);          /* 降级 */
@supports (animation-timing-function: linear(0, 1)) {
  --leo-ease-spring: linear(/* 生成器产物，注释里写死上面四个参数 */);
}
```

### 位移幅度与错峰

| Token | 值 | 用途 |
|---|---|---|
| `--leo-move-xs` / `-sm` / `-md` | `2px` / `6px` / `12px` | 入场位移；`v-fade-up` 现用 6px，归入 `-sm` |
| `--leo-stagger` | `55ms` | 列表错峰步长；沿用 `.v-page` 现值 |
| `--leo-stagger-max` | `320ms` | 错峰封顶；沿用 `.v-page` 现值 |

### reduced-motion（一次性全局降级）

现状只有 2 处、且只覆盖 `v-fade/scale/pop` 与 `.v-page`，
**不覆盖** `v-shimmer` / `v-spin` / `v-blink` / `v-sheen` / `v-bounce-dot` /
`v-pulse-dot` 与全部 Tailwind `animate-*`。规范做法：

```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --leo-dur-1: 0ms; --leo-dur-2: 0ms; --leo-dur-3: 0ms;
    --leo-dur-4: 0ms; --leo-dur-5: 0ms; --leo-dur-6: 0ms;
    --leo-stagger: 0ms; --leo-stagger-max: 0ms;
    --leo-move-xs: 0px; --leo-move-sm: 0px; --leo-move-md: 0px;
  }
}
```

**载荷指示器例外**：`v-spin` / `v-shimmer` / `v-bounce-dot` / `v-pulse-dot`
表达的是「系统还在做事」，归零会让用户以为卡死。它们**保留动画但放慢并降幅**，
不归零；这一条要在 CSS 里写明理由。

## 规范二 · Spring 原语

落点 `src/lib/motion/spring.ts`（新目录）。**全包只允许有这一份弹簧实现**，
由 `architecture:check` 的域边界规则锁死：除 §手势点清单里的文件外，
任何文件 import 它都判红。

### API

```ts
export interface SpringConfig {
  stiffness: number;      // 默认 210
  damping: number;        // 默认 20
  mass?: number;          // 默认 1
  restDelta?: number;     // 默认 0.01，位移收敛阈值
  restSpeed?: number;     // 默认 0.05，速度收敛阈值
}

export interface SpringValue {
  readonly current: number;
  readonly velocity: number;
  readonly settled: boolean;
  /** 手势期间直接写值，并由内部速度追踪器记录瞬时速度 */
  set(value: number): void;
  /** 松手后交给弹簧；从当前速度起算，这就是可打断性的全部含义 */
  setTarget(value: number): void;
  /** 外部注入初速度（例如从指针速度追踪器接管） */
  setVelocity(v: number): void;
  /** 订阅每帧值；调用方自己写 DOM，原语不碰 DOM */
  onChange(cb: (value: number, velocity: number) => void): () => void;
  stop(): void;
  /** 立即落到终态。reduced-motion 与视觉回归测试都走这条 */
  jumpToRest(): void;
}

export function createSpring(initial: number, config?: SpringConfig): SpringValue;
export function createSpring2D(initial: { x: number; y: number }, config?: SpringConfig): {
  readonly current: { x: number; y: number };
  readonly velocity: { x: number; y: number };
  set(v: { x: number; y: number }): void;
  setTarget(v: { x: number; y: number }): void;
  onChange(cb: (v: { x: number; y: number }) => void): () => void;
  stop(): void;
  jumpToRest(): void;
};

/** 指针速度追踪：滑动窗口取最近 ~50ms 的位移/时间，抗抖动 */
export function createPointerVelocityTracker(): {
  sample(x: number, y: number, timeStamp: number): void;
  velocity(): { x: number; y: number };
  reset(): void;
};
```

### 实现约束（规范性）

1. **半隐式欧拉积分**，固定子步长 ≤ 1/120 s；一帧内按 `deltaTime` 跑整数个子步，
   避免掉帧时弹飞。
2. **单一 rAF 循环**：所有活跃 spring 共用一个 driver，不是每个 spring 一个 rAF。
   全部 settled 时**必须停掉** rAF（空转的 rAF 是本规范要防的主线程成本）。
3. **原语不碰 DOM。** 只吐数值，调用方在 `onChange` 里写 `transform`。
   这条保证它可以在 jsdom 里纯函数测试。
4. **只驱动合成器属性**：调用方写入的必须是 `transform` / `opacity`。
   写 `left` / `top` / `width` 判红。
5. **reduced-motion**：`createSpring` 内部读一次 `matchMedia('(prefers-reduced-motion: reduce)')`，
   为真时 `setTarget` 等价于 `jumpToRest`。
6. **测试钩子**：暴露 `__leoMotionJumpAllToRest()` 挂在 `window` 上（仅当
   `process.env.NODE_ENV !== 'production'` 或存在 `data-leo-motion-test` 属性时）。
   视觉回归套件在截图前调用它——这是 spring 与 Playwright `animations:'disabled'`
   共存的唯一办法，缺了它 §Falsifying 的第 3 条就会被触发。

### 手势点清单（唯一允许 import 弹簧的文件）

共 **10 处**。清单变更需要改本文并同步 `architecture:check` 规则。

| # | 文件 | 手势 |
|---|---|---|
| 1 | `src/shell/edit-bar-dock-controller.tsx` | 编辑栏拖拽 / 停靠吸附 / 收缩为圆形 |
| 2 | `src/shell/FloatingContextToolbar.tsx` | 编辑栏位置的 `translate3d` 收敛 |
| 3 | `src/shell/SplitWorkspace.tsx` | 分栏分隔条 |
| 4 | `src/shell/video-editor/TimelineArea.tsx` | 时间轴片段拖拽 / 标尺甩动 |
| 5 | `src/shell/doc-editors/DeckStage.tsx` | 幻灯元素拖拽 |
| 6 | `src/shell/media-editors/PdfStage.tsx` | 平移 / 缩放收敛 |
| 7 | `src/shell/image-editor/fabric-controller-core.ts` | 缩放收敛（平移交给 fabric 自身） |
| 8 | `src/shell/LeoAssistant.tsx` | 可拖拽面板 |
| 9 | `src/shell/ExplorePlayableFeed.tsx` | 竖向吸附 feed |
| 10 | `R5 design/packages/gallery-editor/src/editor/canvas/useCanvasPointerInteractions.ts` | 画布拖拽 + 吸附回弹 |

**明确排除**：`OrgCanvas.tsx` / `OrgWorkflowBoard.tsx`（平移缩放归 `@xyflow/react` 自己）、
`model3d-runtime.mjs`（归 three 的 `OrbitControls`）、
`cloud-browser-interaction.ts`（远端指针注入，不是本地动效）。

## 规范三 · 进出场（第 ② 类）

用原生能力，**不引 AnimatePresence，也不手写延迟卸载状态机**：

```css
.leo-overlay {
  transition:
    opacity var(--leo-dur-3) var(--leo-ease-decelerate),
    transform var(--leo-dur-3) var(--leo-ease-decelerate),
    display var(--leo-dur-3) allow-discrete,
    overlay var(--leo-dur-3) allow-discrete;
}
@starting-style { .leo-overlay { opacity: 0; transform: scale(0.96); } }
.leo-overlay[hidden] { opacity: 0; transform: scale(0.96); }
```

`src/ui/index.tsx` 的 `Modal` 现在用 `setTimeout(onClose, 140)` 与 CSS 脱钩，
本波改为由 `transitionend` 驱动，时长从 `--leo-dur-3` 取。

**动效必须有来源（origin-correct）**：弹层从触发它的那个按钮长出来，
不是从屏幕中间淡入。`transform-origin` 由 `anchored-popover.tsx` 已有的锚点几何
推导——那套几何是现成的，本规范只是要求用它。

## 规范四 · 布局形变（第 ③ 类）

用 View Transitions API。**必须尊重一条既有约束** `[读码]`：
`src/shell/AppShell.tsx:927-933` 刻意关掉了路由入场动效，理由是
`/workspace → /workspace/<app>` 不能为了重放动画而重挂载活着的 app。
View Transitions 恰好满足这条——它不重挂载，只对前后两帧做快照过渡。
所以**这不是推翻那条决定，是用对的机制实现它当初想要的东西**。

## Proof and acceptance

开工前的一次性证明（throwaway，不进产品）：

在同一个真实手势点（**编辑栏拖拽松手回弹**，清单第 1 项）上，用同一段指针轨迹，
分别以 `--leo-ease-spring` 的 `linear()` 与本文的 spring 原语各实现一次，
录制两条 60fps 的 `transform` 时序，证明：

1. 松手后**不打断**时，两者的位移曲线差异 < 2px（说明 `linear()` 对静态场景够用，
   §Decision 里「90% 用 CSS」的前提成立）；
2. 松手后 120ms **再次抓起并反向拖动**时，`linear()` 版本出现 ≥ 1 帧的位置跳变，
   spring 版本速度连续（这就是候选 B 存在的全部理由；若不出现跳变，
   §Falsifying 第 1 条成立，应退回候选 A）。

生产验收（永久机检）：

- `tests/motion-tokens.test.mjs`：`globals.css` 的 `THEME:GENERATED` 区必须含全部
  token；`--leo-ease-emphasis` 的值逐字等于既有品牌曲线；reduced-motion 区把
  六档时长全部归零，且载荷指示器四条**不**归零。
- `tests/motion-no-raw-duration.test.mjs`：`src/` 下**新增**的 `duration-[0-9]`
  与内联 `transition: …ms` 判红（存量 62 处进 `PENDING_RAW_DURATION` 预算锁，
  只减不增）。
- `tests/motion-spring-ownership.test.mjs`：import `lib/motion/spring` 的文件
  必须在 §手势点清单里，多一个判红。
- `tests/motion-spring-math.test.mjs`：纯函数测试——给定初值/初速/目标，
  积分结果单调收敛、`settled` 会翻真、`jumpToRest` 后 `current === target`
  且 rAF 已停。
- `tests/motion-compositor-only.test.mjs`：手势点清单里的文件，其
  `onChange` 回调写入的属性只能是 `transform` / `opacity`（AST 判，不是 grep——
  playbook 记过一次「父 agent 的 grep 表不全，以 AST 为准」的教训）。
