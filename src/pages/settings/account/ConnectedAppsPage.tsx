"use client";

// 设置 → 账户 → 「用 OceanLeo 账号登录的应用」。列表、首次 / 最近登录时间、撤回授权（二次确认）都在
// `MyAppLoginGrants` 里；这一页只是把它放进账户子页。两版（境内 / 海外）完全一样，不按域名分叉。

import { MyAppLoginGrants } from "../../../shell/bay/applogin/MyAppLoginGrants";

export function ConnectedAppsPage() {
  return (
    <div data-connected-apps="" className="space-y-4">
      <MyAppLoginGrants />
    </div>
  );
}

export default ConnectedAppsPage;
