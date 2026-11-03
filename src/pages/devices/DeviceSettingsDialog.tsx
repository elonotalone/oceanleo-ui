"use client";

import type { ComponentProps } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { DeviceSettingsPanel } from "../settings/DeviceSettingsSection";
import { DeviceDialog } from "./DeviceDialog";

/** Compatibility for embedding consumers. The devices page opens Settings itself. */
export function DeviceSettingsDialog({ onClose, ...props }: ComponentProps<typeof DeviceSettingsPanel> & { onClose: () => void }) {
  const tt = useUI();
  return <DeviceDialog title={tt("设备详情")} onClose={onClose} testId="settings">
    <DeviceSettingsPanel {...props} />
  </DeviceDialog>;
}
