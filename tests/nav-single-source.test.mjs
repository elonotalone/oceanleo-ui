// ============================================================================
// 导航单一事实源的门禁（W24 2026-08-31）
// ----------------------------------------------------------------------------
// 这份测试锁的病是**已经真实发过一次**的：`/explore` 页 2026-07-27 建好并部署，
// 门户侧栏却整整一个月没有入口，用户只能手打 URL 才进得去。根因是外壳有两套
// 各自手写的导航（共享包 `workspaceNav()` 与门户 `usePrimaryNav()`），
// 一边加页另一边不会跟。
//
// 既有门禁 `oceanleo-capability-parity-gate.sh` 的 C3b 只比对「有 page 就必须有
// href」，接不住图标 / i18n key / 次序这三类漂移，也接不住「共享侧加了一页、
// 门户整条缺席」——后者正是 `/explore` 那次的形态。所以这里从数据本身下断言。
//
// 为什么能 import 真实实现而不是复刻一份再断言复刻品：`nav-source/index.ts`
// 是**纯 TS、零 JSX、零 React**，`--experimental-strip-types` 直接吃得下。
// 往那个文件里加一行 `import ... from "react"` 或任何 JSX，本文件当场红。
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  NAV_SOURCE,
  navEntries,
  navIdsForScope,
  navEntryById,
} from "../src/shell/nav-source/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, "..", "src", rel), "utf8");

const workspacePagesSource = src("shell/WorkspacePages.tsx");
const appShellSource = src("shell/AppShell.tsx");
const transitionCss = src("shell/nav-source/route-transition.css");

// ---------------------------------------------------------------------------
// 1. 事实源自身的完整性
// ---------------------------------------------------------------------------

test("nav-source: id 唯一，且每一项至少落位在一套外壳里", () => {
  const ids = NAV_SOURCE.map((e) => e.id);
  assert.equal(
    new Set(ids).size,
    ids.length,
    `nav id 重复：${ids.filter((id, i) => ids.indexOf(id) !== i).join(", ")}`,
  );
  for (const entry of NAV_SOURCE) {
    const scopes = Object.keys(entry.placements);
    assert.ok(
      scopes.length > 0,
      `${entry.id} 一套外壳都没落位——那它是死数据，删掉或给它一个 placement`,
    );
  }
});

test("nav-source: 同一外壳同一分区内 order 不撞（撞了次序就不确定）", () => {
  for (const scope of ["workspace", "portal"]) {
    for (const section of ["primary", "footer"]) {
      const orders = NAV_SOURCE.filter((e) => {
        const p = e.placements[scope];
        return p && (p.section ?? "primary") === section;
      }).map((e) => e.placements[scope].order);
      assert.equal(
        new Set(orders).size,
        orders.length,
        `${scope}/${section} 的 order 有重复：${orders.join(", ")}`,
      );
    }
  }
});

test("nav-source: 站外项不写死地址（域名由域名家族在运行时解析）", () => {
  for (const entry of NAV_SOURCE) {
    if (!entry.external) continue;
    assert.equal(
      entry.href,
      undefined,
      `${entry.id} 是站外项却写了 href=${entry.href}；` +
        `任何写死的可注册域都是把用户送出境的那条路（contracts/domain-family.ts）`,
    );
  }
});

test("nav-source: exact 只给首页（其余项前缀匹配，否则子路由不高亮）", () => {
  for (const entry of NAV_SOURCE) {
    if (!entry.exact) continue;
    assert.equal(entry.href, "/", `${entry.id} 不是首页却标了 exact`);
  }
});

// ---------------------------------------------------------------------------
// 2. `/explore` 那个病的门禁：共享侧有的页，门户必须也有落位
// ---------------------------------------------------------------------------

test("门户是共享导航的扩展，不是另一份：workspace 的每一页在 portal 都有落位", () => {
  const missing = NAV_SOURCE.filter(
    (e) => e.placements.workspace && !e.placements.portal,
  ).map((e) => e.id);
  assert.deepEqual(
    missing,
    [],
    `这些页在共享外壳里有、门户里没有：${missing.join(", ")}。\n` +
      `这就是 /explore 2026-07-27 那次事故的形态（页上线了、门户一个月没入口）。\n` +
      `门户比功能站多出的项用 placements.portal 扩展，但共享侧的页一个都不许漏。`,
  );
});

test("两套外壳的差异必须是**声明过的**差异，而不是漂移", () => {
  // 前任在 P0 实测到的四条漂移（图标 ×3 / i18n key ×1 / 次序 ×1），现在全部
  // 以 placements.portal 的覆盖形式**写在数据里**——声明过的差异是设计决定。
  // 这里把它们钉住：谁悄悄把门户图标改回共享默认（或反过来），当场红。
  const home = navEntryById("home");
  assert.equal(home.placements.portal.labelKey, "newTask");
  assert.equal(home.placements.portal.iconId, "newTask");
  assert.equal(navEntryById("explore").placements.portal.iconId, "search");
  assert.equal(navEntryById("workspace").placements.portal.iconId, "panel");

  // 次序差异：门户把 playground 排在 workspace 之后，租户站排在末位。
  const portalIds = navIdsForScope("portal");
  const workspaceIds = navIdsForScope("workspace");
  assert.ok(
    portalIds.indexOf("playground") < portalIds.indexOf("library"),
    "门户的 playground 应排在我的库之前（紧跟工作台）",
  );
  assert.equal(
    workspaceIds[workspaceIds.length - 1],
    "playground",
    "租户站的 playground 应排在末位",
  );
});

// ---------------------------------------------------------------------------
// 3. 派生关系：可见性开关与次序都由事实源说话
// ---------------------------------------------------------------------------

test("navEntries: 可见性开关生效，默认值符合各外壳约定", () => {
  const defaults = navEntries("workspace").map((e) => e.id);
  // 宗旨 v19：探索恒在首页与工作台之间，且默认开启。
  assert.deepEqual(defaults, ["home", "explore", "workspace", "library", "history"]);
  assert.ok(!defaults.includes("playground"), "租户站默认不显示 playground");

  const withPg = navEntries("workspace", { withPlayground: true }).map((e) => e.id);
  assert.equal(withPg[withPg.length - 1], "playground");

  const noExplore = navEntries("workspace", { withExplore: false }).map((e) => e.id);
  assert.ok(!noExplore.includes("explore"));

  // 门户：talent 默认关（境内域名家族里没有这个子站）。
  const portal = navEntries("portal").map((e) => e.id);
  assert.ok(!portal.includes("talent"), "talent 默认不渲染");
  assert.ok(navEntries("portal", { withTalent: true }).map((e) => e.id).includes("talent"));
});

test("navEntries: 分区隔离——footer 项不会漏进主导航", () => {
  const primary = navEntries("portal", {}, "primary").map((e) => e.id);
  const footer = navEntries("portal", {}, "footer").map((e) => e.id);
  assert.deepEqual(footer, ["devices", "download"]);
  for (const id of footer) {
    assert.ok(!primary.includes(id), `${id} 同时出现在主导航与 footer`);
  }
});

test("navEntries: 覆盖生效——同一页在两套外壳里取到各自声明的文案与图标", () => {
  const wsHome = navEntries("workspace").find((e) => e.id === "home");
  const portalHome = navEntries("portal").find((e) => e.id === "home");
  assert.equal(wsHome.labelKey, "home");
  assert.equal(wsHome.iconId, "home");
  assert.equal(portalHome.labelKey, "newTask");
  assert.equal(portalHome.iconId, "newTask");
  // 未覆盖的字段回落到共享默认。
  assert.equal(portalHome.href, "/");
  assert.equal(portalHome.exact, true);
});

// ---------------------------------------------------------------------------
// 4. 反面验证的落点：单侧硬编码一个菜单项 = 红
// ---------------------------------------------------------------------------

test("WorkspacePages 不许自持第二张页面表（单侧硬编码判红）", () => {
  assert.match(
    workspacePagesSource,
    /from "\.\/nav-source"/,
    "WorkspacePages 必须从 nav-source 取数",
  );
  assert.match(
    workspacePagesSource,
    /navEntries\("workspace"/,
    "workspaceNav() 必须调用 navEntries()，而不是自己列页",
  );

  // 三张被删掉的表，任何一张回来都是漂移源复活。
  const forbidden = [
    [/const\s+HREF\s*[:=]/, "路由表 HREF"],
    [/const\s+ICON\s*:\s*Record<WorkspacePage/, "图标表 ICON: Record<WorkspacePage,…>"],
    [/const\s+pages\s*:\s*WorkspacePage\[\]\s*=\s*\[/, "本地页面清单 pages: WorkspacePage[]"],
  ];
  for (const [pattern, what] of forbidden) {
    assert.doesNotMatch(
      workspacePagesSource,
      pattern,
      `WorkspacePages 里又出现了${what}——加一页请改 nav-source/index.ts，不要在这里再写一张表`,
    );
  }

  // pageFromPath 的路由前缀也必须来自事实源（这里曾是第 4 张硬编码表）。
  assert.doesNotMatch(
    workspacePagesSource,
    /if\s*\(\s*p\.startsWith\("\/explore"\)\s*\)/,
    "pageFromPath 又把路由前缀写死了",
  );
});

test("nav-source 必须保持纯数据（零 JSX、零 React），否则测试拿不到真实派生", () => {
  // 先剥注释：那份文件的文件头**逐字引用了** `import ... from "react"` 来说明
  // 这条禁令，不剥的话我这条断言命中的是注释而不是代码（`_COMMON.md` §7b③：
  // 零命中与误命中都要先验正则本身，本波已经栽过三次）。
  const navSource = src("shell/nav-source/index.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(navSource, /from\s+"react"/, "nav-source 不许 import react");
  assert.doesNotMatch(navSource, /<\/?[A-Z][A-Za-z]*[\s/>]/, "nav-source 不许出现 JSX");
});

// ---------------------------------------------------------------------------
// 5. 路由过渡：不重挂载 + 降级 + 即时反馈
// ---------------------------------------------------------------------------

test("route surface 仍然不重挂载（AppShell:927-933 的既有约束）", () => {
  assert.match(
    appShellSource,
    /data-oceanleo-route-surface[\s\S]{0,80}className="contents"/,
    "route surface 的 data 属性与 display:contents 必须都在",
  );
  // 这三种写法都会把活着的 app 卸掉重建，正是那条约束禁止的东西。
  assert.doesNotMatch(
    appShellSource,
    /data-oceanleo-route-surface[^>]*key=\{/,
    "route surface 上出现了 key={…}：换 key 就是重挂载，会丢掉 app 的编辑状态",
  );
  assert.doesNotMatch(
    appShellSource,
    /data-oceanleo-route-surface[^>]*(animate|motion\.)/,
    "route surface 上挂了入场动效：那要靠重挂载才能重播",
  );
});

test("路由过渡走 View Transitions，且降级与 reduced-motion 都在", () => {
  assert.match(
    transitionCss,
    /@supports\s*\(view-transition-name:\s*none\)/,
    "必须用 @supports 做硬闸：不支持的浏览器一条规则都不该拿到",
  );
  assert.match(
    transitionCss,
    /prefers-reduced-motion:\s*reduce/,
    "reduced-motion 下必须自己关一次，不能等 token 层落地",
  );
  assert.match(transitionCss, /::view-transition-old\(root\)/);
  assert.match(transitionCss, /::view-transition-new\(root\)/);

  // 降级形态不许是会重挂载的 CSS 动画。
  assert.doesNotMatch(
    transitionCss,
    /@keyframes/,
    "route 过渡里出现 @keyframes：入场动画要靠重挂载才能重播，违反 AppShell:927-933",
  );

  // 红线 9：不许裸时长与裸曲线，token 缺席时该属性算成 0s（退回今天的瞬时行为）。
  const declarations = transitionCss.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(declarations, /animation-duration:\s*var\(--leo-dur-5\)/);
  assert.doesNotMatch(
    declarations,
    /animation-duration:\s*[^;]*\d+m?s/,
    "出现了裸时长（红线 9：一律从 token 取，且不配裸值 fallback）",
  );
  assert.doesNotMatch(
    declarations,
    /cubic-bezier\(/,
    "出现了裸曲线（红线 9：从 --leo-ease-* 取）",
  );
});

test("导航点击有第一帧即时反馈（useTransition 的 pending 目标驱动高亮）", () => {
  assert.match(
    appShellSource,
    /useRouteNavigation\(/,
    "AppShell 必须用 useRouteNavigation 接管导航点击",
  );
  assert.match(
    appShellSource,
    /isActive\(pendingHref \?\? pathname, item\)/,
    "高亮必须先看 pendingHref：不然点了要等路由落地才有反应",
  );
  const hook = src("shell/nav-source/use-route-navigation.ts");
  assert.match(hook, /useTransition\(/);
  assert.match(hook, /startViewTransition/);
  assert.match(
    hook,
    /prefers-reduced-motion:\s*reduce/,
    "hook 侧也要判 reduced-motion：关了动效就不该起过渡",
  );
});
