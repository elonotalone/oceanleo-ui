"use client";

// 各站 `/leochat` 整页。属性是合同定的，不许改；实现由第四波 W4 整份重写。
import type { ReactElement } from "react";

export interface LeoChatPageProps {
  siteKey: string;
  /** 站点主色；这张页目前不用它，留着是为了各站路由文件的写法和 `/bay` 一样。 */
  accent?: string;
}

export function LeoChatPage(_props: LeoChatPageProps): ReactElement | null {
  return null;
}
