"use client";

export type PersonalizationSectionProps = {
  accent?: string;
};

export function PersonalizationSection({ accent = "#171717" }: PersonalizationSectionProps) {
  return (
    <div
      data-settings-pane="personalization"
      className="space-y-8"
      style={{ ["--personalization-accent" as string]: accent }}
    />
  );
}
