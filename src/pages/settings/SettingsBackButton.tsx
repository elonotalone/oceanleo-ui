"use client";

import { BackButton } from "../../ui/BackButton";
import { useUI } from "../../i18n/ui/useUI";

export function SettingsBackButton({
  onClick,
  label,
  className = "",
}: {
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  const tt = useUI();
  const caption = label ? tt(label) : tt("返回");
  return (
    <BackButton data-settings-back="" onClick={onClick} className={className} label={caption} />
  );
}
