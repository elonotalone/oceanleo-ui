import type { SelectionContext, SelectionCommand } from "../selection-context";
import { WEBSITE_SOURCE_CONSTANTS, type WebsiteSource } from "../website-source-carrier/website-source-schema";
import { removeWebsiteSection, reorderWebsiteSections } from "./website-source-session";

/** Strict carriers expose only fields their schema can actually retain. */
export function strictWebsiteSelection(source: WebsiteSource, pageId: string, id: string, tt: (text: string) => string): SelectionContext | null {
  const page = source.pages.find(page => page.id === pageId);
  if (!id || !page?.sectionIds.includes(id)) return null;
  const index = page.sectionIds.indexOf(id);
  return {
    version: 1, kind: "website-text", bar: "text", id, label: tt("已选文字"),
    controls: [
      { id: "text-color", kind: "color", label: tt("文字色"), value: source.theme.text },
      ...(page.sectionIds.length > 1 ? [{ id: "arrange", kind: "select" as const, label: tt("层级"), value: null,
        options: [
          ...(index > 0 ? [{ value: "front", label: tt("移到页面最上") }, { value: "forward", label: tt("上移一块") }] : []),
          ...(index < page.sectionIds.length - 1 ? [{ value: "backward", label: tt("下移一块") }, { value: "back", label: tt("移到页面最下") }] : []),
        ] }] : []),
      { id: "duplicate", kind: "action", label: tt("复制一份") },
      ...(page.sectionIds.length > WEBSITE_SOURCE_CONSTANTS.C5_PAGE_SECTION_IDS_MIN ? [{ id: "delete", kind: "action" as const, label: tt("删除"), danger: true }] : []),
    ],
  };
}

export function applyStrictWebsiteCommand(source: WebsiteSource, pageId: string, id: string, command: Pick<SelectionCommand, "controlId" | "value">): WebsiteSource {
  const page = source.pages.find(page => page.id === pageId);
  const section = source.sections.find(section => section.id === id);
  if (!page || !section || !page.sectionIds.includes(id)) return source;
  if (command.controlId === "text-color" && /^#[0-9a-f]{6}$/i.test(String(command.value))) {
    return { ...source, theme: { ...source.theme, text: String(command.value) } };
  }
  if (command.controlId === "delete") return removeWebsiteSection(source, pageId, id);
  if (command.controlId === "duplicate") {
    let copyId = `${id.slice(0, 36)}-copy`;
    for (let n = 2; source.sections.some(section => section.id === copyId); n++) copyId = `${id.slice(0, 36)}-copy${n}`;
    const ids = [...page.sectionIds];
    ids.splice(ids.indexOf(id) + 1, 0, copyId);
    return { ...source, sections: [...source.sections, { ...section, id: copyId }], pages: source.pages.map(entry => entry === page ? { ...entry, sectionIds: ids } : entry) };
  }
  if (command.controlId === "arrange") {
    const ids = [...page.sectionIds];
    const index = ids.indexOf(id);
    const target = command.value === "front" ? 0 : command.value === "forward" ? index - 1 : command.value === "backward" ? index + 1 : command.value === "back" ? ids.length - 1 : index;
    if (target < 0 || target >= ids.length || target === index) return source;
    ids.splice(index, 1);
    ids.splice(target, 0, id);
    return reorderWebsiteSections(source, pageId, ids);
  }
  return source;
}
