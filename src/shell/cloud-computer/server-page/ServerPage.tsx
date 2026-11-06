"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { CloudComputerClient, Computer } from "../../../lib/cloud-computer-api";
import { serverPageHref } from "./href";

export type ServerPageCard = "acp" | "cli" | "terminal";

export type ServerPageProps = {
  computerId: string;
  client?: CloudComputerClient;
  computers?: Computer[];
  upgradePollIntervalMs?: number;
  upgradePollAttempts?: number;
};

/** Compatibility adapter for code that still mounts the retired server page. */
export function ServerPage({ computerId }: ServerPageProps) {
  const router = useRouter();
  const target = serverPageHref(computerId);
  useEffect(() => {
    if (computerId) router.replace(target);
  }, [computerId, router, target]);
  return null;
}
