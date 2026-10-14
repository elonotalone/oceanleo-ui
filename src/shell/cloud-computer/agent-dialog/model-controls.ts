import type { DialogConfigOption, DialogModel } from "./types";

/** Prefer ACP's configuration catalog: legacy Codex model IDs also encode effort. */
export function modelControls(
  program: string,
  models: DialogModel[],
  options: DialogConfigOption[],
  selected: string,
  remembered: Record<string, Record<string, string>> = {},
) {
  const config = options.find((option) => option.category === "model" || option.id === "model");
  if (config?.options.length) {
    const choices = config.options.map((choice): DialogModel => {
      const metadata = models.find((model) => model.id === choice.value)
        || (program === "codex" ? models.find((model) => model.id.startsWith(`${choice.value}[`)) : undefined);
      return { ...metadata, id: choice.value, name: choice.name, default: choice.value === config.current };
    });
    const current = choices.some((model) => model.id === selected) ? selected
      : choices.find((model) => program === "codex" && selected.startsWith(`${model.id}[`))?.id
        || String(config.current || "");
    return { models: choices, selected: current, memoryModel: current, effort: null };
  }
  if (program !== "codex") return { models, selected, memoryModel: selected, effort: null };
  const variants = models.flatMap((model) => {
    const match = model.id.match(/^(.+)\[([^\[\]]+)\]$/);
    return match ? [{ model, base: match[1], effort: match[2] }] : [];
  });
  if (!variants.length || variants.length !== models.length) {
    return { models, selected, memoryModel: selected, effort: null };
  }
  const active = variants.find((variant) => variant.model.id === selected);
  const bases = [...new Set(variants.map((variant) => variant.base))];
  const choices = bases.map((base) => {
    const family = variants.filter((variant) => variant.base === base);
    const pick = family.find((variant) => variant.model.id === selected)
      || family.find((variant) => variant.effort === remembered[base]?.reasoning_effort)
      || family.find((variant) => variant.effort === active?.effort)
      || family.find((variant) => variant.model.default) || family[0];
    return { ...pick.model, name: pick.model.name.replace(/\s*\([^()]+\)$/, "") };
  });
  return {
    models: choices,
    selected: active ? choices.find((choice) => choice.id.startsWith(`${active.base}[`))?.id || selected : selected,
    memoryModel: active?.base || selected,
    effort: active ? {
      current: selected,
      options: variants.filter((variant) => variant.base === active.base && variant.model.usable !== false)
        .map((variant) => ({ value: variant.model.id, name: variant.effort })),
    } : null,
  };
}
