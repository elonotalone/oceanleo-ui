"use client";

import type { ReactElement } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import type { BayApp } from "../../../lib/bay/apps";

export function AppLoginHint({ app }: { app: BayApp }): ReactElement {
  const tt = useUI();
  return (
    <p data-bay-app-login-hint data-bay-app-id={app.id} className="mt-3 text-[12px] leading-5 text-neutral-500">
      {tt("这个网站或软件支持用 OceanLeo 账号登录。页内窗口里登录不了，需要登录的功能请点「在新窗口打开」。")}
    </p>
  );
}
