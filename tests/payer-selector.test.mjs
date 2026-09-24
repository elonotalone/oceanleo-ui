// 「这次谁付钱」（W12，2026-09-20）的判据。
//
// 企业版在普通用户眼里唯一会多出来的东西就是输入框下沿那个小选择器。它判四件事，
// 其中两件是**反方向**的——做错了比没做更糟：
//
//   ① **没进过组织的人一个字节都不该多渲染。** 今天全部用户都在这一支上。
//      这里不满足于「PayerSelector 返回 null」，而是把 `LeoComposer` 整棵渲染两遍
//      （挂 / 不挂选择器），逐字比 innerHTML。这才是「渲染差异为零」的证据。
//   ② **`org_id` 恒随请求发出，默认是空串。** 空串在网关那边就是「个人钱包」
//      （`resolve_payer(user_id, requested_org_id="")`），所以默认值错成
//      `undefined` / 省略字段不会当场报错，只会在某天悄悄把某个人的钱记到公司账上。
//   ③ 记忆：上次选的组织下次默认选它。
//   ④ **组织停用 / 人被移出时自动回落个人。** 不回落 = 拿着一个已经无效的付费主体
//      继续发任务；回落时不提示 = 用户不知道这次的钱换成自己出了。
//
// 跑法（**必须带 loader**，裸跑 `node --test` 会在加载期打哑整例、读数是假红）：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test \
//        tests/payer-selector.test.mjs

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { ORG_MCP_STUB_SOURCE } from "./helpers/org-api-stub.mjs";
import { TOAST_BARREL_STUB_SOURCE } from "./helpers/toast-stub.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;

// ————————————————————————————————————————————————————————————————
// 0. 夹具
// ————————————————————————————————————————————————————————————————

// W11 的 `src/lib/org-api.ts` 与本文件同波并行落地。这里按 `_COMMON.md §3.8` 的
// 签名打替身，**判的是本组件怎么用那两个函数**，不是那两个函数自己——所以这份
// 测试不等 W11，W11 落地之后也不需要改。
const orgApiStub = dataModule(`
  const g = () => globalThis.__W12_ORG_API__;
  export async function listMyOrgs() { return g().listMyOrgs(); }
  export async function getOrg(orgId) { return g().getOrg(orgId); }
  ${ORG_MCP_STUB_SOURCE}
`);

const toastStub = dataModule(`
  ${TOAST_BARREL_STUB_SOURCE}
  export function useToast() {
    return {
      show: (input) => (globalThis.__W12_TOASTS__.push(input), { id: "t" }),
      info: (title, description) => (globalThis.__W12_TOASTS__.push({ kind: "info", title, description }), { id: "t" }),
      success: (title, description) => (globalThis.__W12_TOASTS__.push({ kind: "success", title, description }), { id: "t" }),
      error: (title, description) => (globalThis.__W12_TOASTS__.push({ kind: "error", title, description }), { id: "t" }),
      loading: (title, description) => (globalThis.__W12_TOASTS__.push({ kind: "loading", title, description }), { id: "t" }),
      dismiss(){}, dismissAll(){},
    };
  }
`);

const uiStub = dataModule("export function useUI(){ return (zh) => zh; }");

const OVERRIDES = {
  "../lib/org-api": orgApiStub,
  "../ui/Toast": toastStub,
  "../i18n/ui/useUI": uiStub,
  "next/navigation": dataModule(
    "export function useRouter(){ return { push(){}, replace(){}, refresh(){}, back(){} }; }\n" +
      "export function useSearchParams(){ return new URLSearchParams(); }\n" +
      "export function usePathname(){ return '/'; }",
  ),
  // 模型选择器与原生宿主桥都要碰浏览器/网关，且与本波判据无关，换成空壳让这一排安静。
  "./ModelPicker": dataModule("export function ModelGroupPicker(){ return null; }"),
  "./mobile-native-actions": dataModule(
    "export function requestTaskNotificationsOnce(){}\n" +
      "export function useNativeAttachActions(){ return []; }\n" +
      "export function useNativeHandoffEntry(){ return { action: null, panel: null }; }\n" +
      "export function useNativeTaskNotifications(){}\n",
  ),
  "./LeoEntryButton": dataModule(`
    import { createElement } from ${JSON.stringify(reactUrl)};
    export function LeoEntryButton() {
      return createElement("button", {
        type: "button",
        "data-oceanleo-leo-entry": "",
        "aria-label": "leo",
      }, "leo");
    }
  `),
  "./PromptHighlightArea": dataModule(`
    import { createElement, forwardRef } from "${reactUrl}";
    export const PromptHighlightArea = forwardRef(function PromptHighlightArea(props, _ref){
      return createElement("textarea", {
        placeholder: props.placeholder,
        defaultValue: props.value || "",
        readOnly: true,
      });
    });
    export const TemplateFillArea = PromptHighlightArea;
  `),
};

const lazyStub = dataModule(
  "const noop = () => undefined;\n" +
    "export default new Proxy(noop, { get: () => noop });\n" +
    "export const __stub = true;\n",
);

async function load(rel) {
  return import(
    await compileModule(`src/shell/${rel}`, OVERRIDES, { missingPackageStub: lazyStub })
  );
}

const { PayerSelector, PAYER_LAST_KEY } = await load("PayerSelector.tsx");
const { LeoComposer } = await load("LeoComposer.tsx");

function org(id, name, extra = {}) {
  return {
    id,
    name,
    role: "member",
    canViewOrgPage: false,
    canViewAllTasks: false,
    currency: "CNY",
    ...extra,
  };
}

/**
 * 一台真 DOM + React 根。`listMyOrgs()` 是异步的，组件的「记忆 / 回落」判断全在
 * 列表到齐之后才允许发生，所以这里每次渲染都把微任务排空——否则判到的是加载态，
 * 是假绿。
 */
async function withDom(run, { orgApi = {}, storage = {} } = {}) {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = {
    id: canvasEntry,
    filename: canvasEntry,
    loaded: true,
    exports: {},
  };
  const { JSDOM, VirtualConsole } = await import(
    pathToFileURL(fabricRequire.resolve("jsdom")).href
  );
  if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
  else delete require.cache[canvasEntry];

  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", () => {});
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://chat.oceanleo.com/",
    virtualConsole,
  });
  const { window } = dom;
  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    localStorage: window.localStorage,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    KeyboardEvent: window.KeyboardEvent,
    MouseEvent: window.MouseEvent,
  })) {
    const had = name in globalThis;
    const previous = globalThis[name];
    restore.push(() => {
      if (had) {
        Object.defineProperty(globalThis, name, {
          configurable: true,
          writable: true,
          value: previous,
        });
      } else delete globalThis[name];
    });
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  globalThis.__W12_ORG_API__ = {
    listMyOrgs: async () => [],
    getOrg: async () => {
      throw new Error("没配 getOrg");
    },
    ...orgApi,
  };
  globalThis.__W12_TOASTS__ = [];
  for (const [key, value] of Object.entries(storage)) {
    window.localStorage.setItem(key, value);
  }

  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);

  const settle = () => act(async () => {});
  const render = async (Component, props) => {
    await act(async () => root.render(React.createElement(Component, props)));
    await settle();
  };

  try {
    return await run({
      window,
      render,
      settle,
      container,
      toasts: () => globalThis.__W12_TOASTS__,
      html: () => container.innerHTML,
      find: (selector) => container.querySelector(selector),
      findAll: (selector) => [...container.querySelectorAll(selector)],
      click: (selector) => {
        const node = container.querySelector(selector);
        assert.ok(node, `点不到 ${selector}`);
        return act(async () =>
          node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })),
        );
      },
      pick: (selector, value) => {
        const node = container.querySelector(selector);
        assert.ok(node, `找不到下拉 ${selector}`);
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLSelectElement.prototype,
          "value",
        ).set;
        return act(async () => {
          setter.call(node, value);
          node.dispatchEvent(new window.Event("change", { bubbles: true }));
        });
      },
    });
  } finally {
    await act(async () => root.unmount());
    window.close();
    delete globalThis.__W12_ORG_API__;
    delete globalThis.__W12_TOASTS__;
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}

/** 受控外壳：把 `value` 真的存起来，才判得出「回落」与「记忆」有没有生效。 */
function Controlled({ initial = "", onValue, ...rest }) {
  const [value, setValue] = React.useState(initial);
  React.useEffect(() => {
    onValue?.(value);
  }, [value, onValue]);
  return React.createElement(PayerSelector, {
    value,
    onChange: setValue,
    ...rest,
  });
}

// ————————————————————————————————————————————————————————————————
// 1. 判据①：没进过组织 = 控件不存在
// ————————————————————————————————————————————————————————————————

test("零组织：PayerSelector 一个字节都不渲染", async () => {
  await withDom(async ({ render, html }) => {
    await render(Controlled, {});
    assert.equal(html(), "", "没进过组织的人不该多出任何 DOM");
  });
});

test("零组织：LeoComposer 那一排挂不挂选择器，innerHTML 逐字相同", async () => {
  const props = {
    value: "做个网站",
    onChange() {},
    onSubmit() {},
    onAttachFiles() {},
    leoSuggest: true,
  };
  const withSelector = await withDom(async ({ render, html }) => {
    await render(LeoComposer, { ...props, showPayerSelector: true });
    return html();
  });
  const withoutSelector = await withDom(async ({ render, html }) => {
    await render(LeoComposer, { ...props, showPayerSelector: false });
    return html();
  });
  assert.ok(withoutSelector.length > 0, "对照组自己得先渲染出东西来");
  assert.equal(
    withSelector,
    withoutSelector,
    "没有组织的用户，输入框这一排的渲染差异必须为零",
  );
});

// ————————————————————————————————————————————————————————————————
// 2. 判据③：选项与记忆
// ————————————————————————————————————————————————————————————————

test("多组织：选项数 = 组织数 + 1（个人钱包恒在第一个）", async () => {
  await withDom(
    async ({ render, findAll, find }) => {
      await render(Controlled, {});
      const options = findAll("option");
      assert.equal(options.length, 3, "两个组织应得到 3 个选项");
      assert.equal(options[0].value, "", "第一个必须是个人钱包（空串）");
      assert.equal(options[0].textContent, "个人钱包");
      assert.deepEqual(
        options.slice(1).map((node) => [node.value, node.textContent]),
        [
          ["org-a", "海狮科技"],
          ["org-b", "蓝鲸传媒"],
        ],
      );
      assert.ok(find("select"), "多组织时必须渲染一个下拉");
    },
    { orgApi: { listMyOrgs: async () => [org("org-a", "海狮科技"), org("org-b", "蓝鲸传媒")] } },
  );
});

test("选中项写进 localStorage，下次默认选它", async () => {
  const listMyOrgs = async () => [org("org-a", "海狮科技"), org("org-b", "蓝鲸传媒")];

  // 第一程：用户手选「蓝鲸传媒」。
  await withDom(
    async ({ render, pick, window, find }) => {
      await render(Controlled, {});
      assert.equal(find("select").value, "", "没记过时默认个人钱包");
      await pick("select", "org-b");
      assert.equal(
        window.localStorage.getItem(PAYER_LAST_KEY),
        "org-b",
        "手选之后必须记在 oceanleo.payer.last 上",
      );
      assert.equal(find("select").value, "org-b");
    },
    { orgApi: { listMyOrgs } },
  );

  // 第二程：新一次会话，什么都没传，应当自己选回上次那个。
  const seen = [];
  await withDom(
    async ({ render, find }) => {
      await render(Controlled, { onValue: (v) => seen.push(v) });
      assert.equal(find("select").value, "org-b", "下次默认应当是上次选的组织");
      assert.equal(seen.at(-1), "org-b", "记忆必须经 onChange 通知出去，宿主才发得对");
    },
    { orgApi: { listMyOrgs }, storage: { [PAYER_LAST_KEY]: "org-b" } },
  );
});

test("选回个人钱包：记忆被清掉，而不是记下一个空串", async () => {
  await withDom(
    async ({ render, pick, window }) => {
      await render(Controlled, {});
      await pick("select", "");
      assert.equal(
        window.localStorage.getItem(PAYER_LAST_KEY),
        null,
        "个人钱包不写这个键",
      );
    },
    {
      orgApi: { listMyOrgs: async () => [org("org-a", "海狮科技")] },
      storage: { [PAYER_LAST_KEY]: "org-a" },
    },
  );
});

// ————————————————————————————————————————————————————————————————
// 3. 判据④：组织停用 / 人被移出 → 自动回落个人 + 一次轻提示
// ————————————————————————————————————————————————————————————————

test("记忆里那个组织已停用：自动回落个人，并清掉记忆", async () => {
  await withDom(
    async ({ render, find, window, toasts }) => {
      // 列表里只剩「海狮科技」——「蓝鲸传媒」已停用或此人已被移出，
      // 按 §3.3 的 orgs_of 契约它就不会再出现在这里。
      await render(Controlled, { initial: "org-b" });
      assert.equal(find("select").value, "", "失效的组织必须回落到个人钱包");
      assert.equal(
        window.localStorage.getItem(PAYER_LAST_KEY),
        null,
        "失效的记忆要清掉，否则下次打开还会再弹一次",
      );
      const hints = toasts();
      assert.equal(hints.length, 1, "只提示一次，不许每次渲染都弹");
      assert.equal(hints[0].kind, "info", "这是轻提示，不是报错");
      assert.equal(hints[0].title, "已切回个人钱包");
    },
    {
      orgApi: { listMyOrgs: async () => [org("org-a", "海狮科技")] },
      storage: { [PAYER_LAST_KEY]: "org-b" },
    },
  );
});

test("余额读失败：只显示组织名，不显示余额、也不显示错误", async () => {
  await withDom(
    async ({ render, find, container, toasts }) => {
      await render(Controlled, { initial: "org-a" });
      assert.equal(find("select").value, "org-a", "余额挂了不该影响选择本身");
      const text = container.textContent || "";
      assert.ok(text.includes("海狮科技"), "组织名照常显示");
      assert.doesNotMatch(text, /¥|\$/, "读不到余额就一个金额都别显示");
      assert.equal(toasts().length, 0, "余额读失败不是用户要处理的事，不许弹提示");
    },
    {
      orgApi: {
        listMyOrgs: async () => [org("org-a", "海狮科技")],
        getOrg: async () => {
          throw new Error("500");
        },
      },
    },
  );
});

test("余额读到了：跟在组织名旁边显示", async () => {
  await withDom(
    async ({ render, container }) => {
      await render(Controlled, { initial: "org-a" });
      assert.match(
        container.textContent || "",
        /¥12\.34/,
        "1234 分应当按账本货币格式化成 ¥12.34",
      );
    },
    {
      orgApi: {
        listMyOrgs: async () => [org("org-a", "海狮科技")],
        getOrg: async () => ({
          ...org("org-a", "海狮科技"),
          balanceMinor: 1234,
          minTopupMinor: 100000,
        }),
      },
    },
  );
});

// ————————————————————————————————————————————————————————————————
// 4. 判据②：`org_id` 恒随请求发出
// ————————————————————————————————————————————————————————————————

test("LeoComposer：org_id 出现在交给 onSubmit 的请求体里，默认是空串", async () => {
  await withDom(async ({ render, click }) => {
    const calls = [];
    await render(LeoComposer, {
      value: "做个网站",
      onChange() {},
      onSubmit: (...args) => calls.push(args),
    });
    await click('button[aria-label="发送"]');

    assert.equal(calls.length, 1, "点一次发送应当只提交一次");
    const [prompt, payer] = calls[0];
    assert.equal(prompt, "做个网站");
    assert.ok(payer, "付费主体必须恒有值，不许是 undefined");
    assert.ok(
      Object.hasOwn(payer, "org_id"),
      "字段名固定为 org_id —— 网关的 resolve_payer 只认这个",
    );
    assert.equal(payer.org_id, "", "没进过组织的人默认空串 = 个人钱包");
  });
});

test("LeoComposer：选了组织之后，org_id 就是那个组织", async () => {
  await withDom(
    async ({ render, click, pick }) => {
      const calls = [];
      await render(LeoComposer, {
        value: "做个网站",
        onChange() {},
        onSubmit: (...args) => calls.push(args),
      });
      await pick('[data-payer-selector] select', "org-b");
      await click('button[aria-label="发送"]');

      assert.equal(calls.at(-1)[1].org_id, "org-b");
    },
    {
      orgApi: {
        listMyOrgs: async () => [org("org-a", "海狮科技"), org("org-b", "蓝鲸传媒")],
        getOrg: async () => {
          throw new Error("500");
        },
      },
    },
  );
});

// ————————————————————————————————————————————————————————————————
// 5. P3：窄屏与键盘
// ————————————————————————————————————————————————————————————————

test("选择器挂在左组（会换行的那半边），发送键那半边不受影响", async () => {
  await withDom(
    async ({ render, find }) => {
      await render(LeoComposer, {
        value: "做个网站",
        onChange() {},
        onSubmit() {},
      });
      const selector = find("[data-payer-selector]");
      assert.ok(selector, "有组织时选择器必须出现");

      // 左组是 `flex-wrap` 的那一半；右组装着 `shrink-0` 的发送键。
      // 选择器一旦跑进右组，窄屏上就会去挤发送键——这正是 P3 要挡的那件事。
      const leftGroup = find(".flex-wrap");
      assert.ok(leftGroup, "左组还在");
      assert.ok(leftGroup.contains(selector), "选择器必须在会换行的左组里");

      const send = find('button[aria-label="发送"]');
      assert.ok(send, "发送键还在");
      assert.ok(!leftGroup.contains(send), "发送键仍在另一半，不与选择器争宽度");
      assert.match(send.className, /shrink-0/, "发送键仍是 shrink-0");
    },
    { orgApi: { listMyOrgs: async () => [org("org-a", "海狮科技")] } },
  );
});

test("键盘可达：用的是原生 select，且有 aria-label", async () => {
  await withDom(
    async ({ render, find }) => {
      await render(Controlled, {});
      const node = find("select");
      assert.ok(node, "原生 select 自带键盘可达与屏幕阅读器支持");
      assert.equal(node.getAttribute("aria-label"), "这次谁付钱");
      assert.ok(
        !node.hasAttribute("disabled") && node.tabIndex >= 0,
        "不许把它做成 tab 不到的东西",
      );
    },
    { orgApi: { listMyOrgs: async () => [org("org-a", "海狮科技")] } },
  );
});
