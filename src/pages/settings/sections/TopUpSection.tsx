"use client";

import type { ReactNode } from "react";

export function TopUpSection({ wallet }: { wallet?: ReactNode }) {
  return (
    <div data-settings-pane="topup" data-billing-wallet-page="">
      {wallet}
    </div>
  );
}
