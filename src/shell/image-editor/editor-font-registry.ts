/** Own-hosted bytes for new Noto choices and fonts already present in materials. */
import { EDITOR_FONT_MANIFEST } from "./editor-font-manifest";
import { MATERIAL_FONT_MANIFEST } from "./material-font-manifest";
import { editorFontFamily } from "./editor-font-family";

type FontSubset = { path: string; unicodeRange: string };
export type EditorFontSpec = {
  family: string; prefix: string; style: string; weightRange: string;
  minWeight: number; maxWeight: number; subsets: readonly FontSubset[];
};
const specs: EditorFontSpec[] = [
  ...EDITOR_FONT_MANIFEST.fonts.map(font => ({
    family: font.family, prefix: EDITOR_FONT_MANIFEST.prefix, style: "normal",
    weightRange: `${font.axes.wght[0]} ${font.axes.wght[2]}`,
    minWeight: font.axes.wght[0], maxWeight: font.axes.wght[2], subsets: font.subsets,
  })),
  ...MATERIAL_FONT_MANIFEST.fonts.map(font => {
    const range = font.weightRange.split(" ").map(Number);
    return { family: font.family, prefix: MATERIAL_FONT_MANIFEST.prefix, style: font.style,
      weightRange: font.weightRange, minWeight: range[0], maxWeight: range.at(-1)!, subsets: font.subsets };
  }),
];
export const DELIVERED_EDITOR_FONT_FAMILIES = [...new Set(specs.map(font => font.family))];

/** Prefer a real matching face; static families keep CSS weight/style synthesis. */
export function editorFontSpec(family: string, weight: number, style: string): EditorFontSpec | undefined {
  const canonical = editorFontFamily(family).toLowerCase();
  let matching = specs.filter(font => font.family.toLowerCase() === canonical);
  const styled = matching.filter(font => font.style === style);
  const normal = matching.filter(font => font.style === "normal");
  matching = styled.length ? styled : normal.length ? normal : matching;
  const distance = (font: EditorFontSpec) => Math.max(font.minWeight - weight, weight - font.maxWeight, 0);
  return matching.sort((a, b) => distance(a) - distance(b))[0];
}
