# @oceanleo/ui

OceanLeo 全家桶**统一前端外壳**——单一事实源。所有 `*.oceanleo.com` 产品站
（**除 crm**）共享这一个包，获得完全一致的：

- 左侧边栏 + 右上**模型选择**（text / image / video / threed / audio 全分类）
- token 余额 + 账户区
- 账户页 / 设置页 / **API 页**（模型市场 2D 选择器 + 价格）
- 统一主题（配色 / 圆角 / 字号 / `v-*` 动画 / 滚动条）
- 统一 SSO（`.oceanleo.com` 跨子域 cookie）+ 网关调用

> 以后改一处（此包），所有站 bump 版本重新部署即对齐——彻底消灭
> 「各站 copy-paste 漂移」的技术债。设计文档：oceandino repo
> `docs/architecture/oceanleo-shared-ui.md`。

## 各站如何接入

1. 装依赖（git 依赖，Vercel 原生支持，无需 registry 认证）：

```json
"dependencies": {
  "@oceanleo/ui": "github:elonotalone/oceanleo-ui#v0.1.0"
}
```

2. `next.config.*` 加：

```js
transpilePackages: ["@oceanleo/ui"]
```

3. `tailwind.config.*` 加：

```js
import preset from "@oceanleo/ui/tailwind-preset";
export default {
  presets: [preset],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./node_modules/@oceanleo/ui/src/**/*.{ts,tsx}",
  ],
};
```

4. `app/globals.css` 顶部（Tailwind 指令之后）引入**预编译的 ui.css**——它已包含
   共享组件用到的全部工具类 + 字体/底色/动画/滚动条。**这样消费端的 Tailwind 不必
   扫描 node_modules**（pnpm git 依赖目录名含 `#`，Tailwind v4 的 `@source` 无法
   正确 glob，故采用预编译产物，v3/v4 站都适用）：

```css
@import "@oceanleo/ui/theme/ui.css";
```

   > `theme/ui.css` 是构建产物（`pnpm build:css` 由 Tailwind 编译本包源码生成），
   > 已提交进仓库。改了共享组件的 class 后，必须重跑 `pnpm build:css` 再提交。

5. 外壳：

```tsx
import { AppShell } from "@oceanleo/ui/shell";

<AppShell
  brand={{ name: "LeoImage", accent: "#6366f1", logo: <Logo/> }}
  nav={NAV}
  userEmail={email}
  credits={credits}
  modelCategories={["image"]}         // 这站要哪些模型分类
  onModelChange={(m) => setModel(m)}
>
  {children}
</AppShell>
```

6. 通用页面：

```tsx
import { ApiPage, AccountPage, SettingsPage } from "@oceanleo/ui/pages";
// 各自包进本站 <AppShell> 即可
```

## 包结构

```
src/
  shell/   AppShell · Sidebar · ModelPicker · AiAssistant · icons
  pages/   ApiPage · AccountPage · SettingsPage
  ui/      Modal · ConfirmDialog · Switch · Select · Skeleton · …
  lib/auth SSO（config/client/account/middleware）+ 网关 + 模型选择
  theme/   globals.css · tailwind-preset.ts
```

## 实时预览

`ui.oceanleo.com` 是本包的活样板间（`demo/`）——改完组件先在那里看效果。
