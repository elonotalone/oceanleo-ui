// ============================================================================
// @oceanleo/ui — leo 面板与宿主输入框之间的读写桥（从旧 LeoAssistant.tsx 搬出）
// ----------------------------------------------------------------------------
// 主输入框是 Tiptap 编辑器（contentEditable div，带 data-oc-slot-editor + 读写桥），
// 旧式 textarea/input 也支持。读走桥的 __ocGetText / .value；写回走桥的 __ocSetText
// （进 undo），textarea/input 用原生 setter 绕过 React 的 value 追踪再派 input 事件。
// ============================================================================

export type HostInput = HTMLTextAreaElement | HTMLInputElement;
export type HostTarget = HostInput | HTMLElement;

interface OcEditorBridge {
  __ocGetText?: () => string;
  __ocSetText?: (v: string) => void;
}

/** 是否是我们的 Tiptap 主编辑器（带桥）。 */
export function isSlotEditor(el: Element | null): el is HTMLElement & OcEditorBridge {
  return !!el && el instanceof HTMLElement && el.hasAttribute("data-oc-slot-editor");
}

/** 读宿主输入内容：编辑器走桥的 __ocGetText，textarea/input 走 .value。 */
export function getHostText(el: HostTarget | null): string {
  if (!el) return "";
  if (isSlotEditor(el)) return (el.__ocGetText?.() || "").trim();
  return ((el as HostInput).value || "").trim();
}

/** 面板外的可编辑输入（leo 自己的面板不算）。 */
export function isEditableInput(el: Element | null): el is HostTarget {
  if (!el) return false;
  if (el.closest("[data-ai-assistant-root]")) return false; // ignore our own UI
  if (isSlotEditor(el)) return true; // Tiptap 主编辑器
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName === "INPUT") {
    const t = (el as HTMLInputElement).type;
    return t === "" || t === "text" || t === "search";
  }
  return false;
}

// 写回宿主输入。编辑器走桥的 __ocSetText（作为普通文本、进 undo）；textarea/input 用原生
// setter 绕过 React 内部 value 追踪 + 派发 input 事件让受控组件 onChange 收到变化。
export function setHostValue(el: HostTarget, value: string): void {
  if (isSlotEditor(el)) {
    el.__ocSetText?.(value);
    return;
  }
  const input = el as HostInput;
  const proto =
    input.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
