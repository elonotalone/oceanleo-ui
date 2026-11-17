/** Static Excel/cover representation of a selected coloured dropdown option. */
export function selectedChipColors(rule: Record<string, unknown>, value: unknown): { background: string; color: string } | null {
  if (!["list", "listMultiple"].includes(String(rule.type))) return null;
  const index = String(rule.formula1 || "").replace(/^=/, "").split(",").indexOf(String(value ?? ""));
  if (index < 0) return null;
  const background = String(rule.formula2 || "").split(",")[index]?.trim();
  if (!background || !/^#[a-f\d]{6}$/i.test(background)) return null;
  const rgb = [1, 3, 5].map(start => parseInt(background.slice(start, start + 2), 16));
  const color = rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114 > 140 ? "#111827" : "#FFFFFF";
  return { background, color };
}
