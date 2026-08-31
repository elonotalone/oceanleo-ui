"use client";

// ============================================================================
// 本地文件入口 —— 粘贴与拖拽走的是这一条，不是两套
// ----------------------------------------------------------------------------
// W08 P4：「粘贴与拖拽走同一条入口函数，不要两套。」
//
// 拖拽给的是 `DataTransfer`，粘贴给的是 `ClipboardData`——**它们是同一个接口**
// （`DataTransfer`），`items` / `files` 两个字段都在。所以这里只有一个提取函数，
// 三个消费点的 `onPaste` 与 `onDrop` 都调它，落进各自**已有的**那一个
// `emitFiles(...)`，不新开第二条通路。
//
// 【为什么优先走 items 而不是 files】
// 截图粘贴（Win+Shift+S、macOS 截屏到剪贴板）在 `items` 里是一条
// `kind:"file"` 的项，`getAsFile()` 拿得到 Blob；而 `clipboardData.files`
// 在部分浏览器上对截图是空的。反过来，从文件管理器复制的真文件两边都有。
// 所以：先 items，拿不到再退 files，最后按 name+size 去重。
//
// 【为什么粘贴要挑掉纯文本】
// 用户在输入框里粘一段字是最常见的操作，绝不能被当成「上传一个 .txt」。
// 只有 `kind === "file"` 的项才算文件；`kind === "string"` 一律交回给
// 浏览器的默认行为（也就是照常插入文字），因此本函数在没有文件时返回空数组，
// **调用方必须据此决定不要 `preventDefault()`**。
// ============================================================================

/**
 * 从一次拖拽 / 粘贴里取出用户真正给的文件。
 *
 * @param transfer `event.dataTransfer`（拖拽）或 `event.clipboardData`（粘贴）。
 * @returns 去重后的文件；**没有文件时是空数组**——调用方据此放过默认行为。
 */
export function filesFromTransfer(
  transfer: DataTransfer | null | undefined,
): File[] {
  if (!transfer) return [];
  const collected: File[] = [];
  const seen = new Set<string>();

  const take = (file: File | null) => {
    if (!file) return;
    // 截图粘贴给的 File 常常 size 为 0 之外一切正常，但真正空的文件传上去没意义。
    if (file.size <= 0) return;
    const signature = `${file.name}\u0000${file.size}\u0000${file.lastModified}`;
    if (seen.has(signature)) return;
    seen.add(signature);
    collected.push(file);
  };

  const items = transfer.items;
  if (items && items.length > 0) {
    for (const item of Array.from(items)) {
      if (item.kind !== "file") continue;
      take(item.getAsFile());
    }
  }

  const files = transfer.files;
  if (files && files.length > 0) {
    for (const file of Array.from(files)) take(file);
  }

  return collected;
}

/**
 * 这次粘贴里有文件吗。
 *
 * 组件用它决定「要不要拦下这次 paste」：有文件才 `preventDefault()`，
 * 没有就让浏览器照常插入文字。**不要用 `filesFromTransfer(...).length > 0`
 * 代替它去做拦截判断**——那会在 Safari 上对纯文本也调 `getAsFile()`，
 * 而那条路径上 `items` 的存活期只到事件回调结束，白白多一次无效读取。
 */
export function transferHasFiles(
  transfer: DataTransfer | null | undefined,
): boolean {
  if (!transfer) return false;
  if (transfer.items && transfer.items.length > 0) {
    for (const item of Array.from(transfer.items)) {
      if (item.kind === "file") return true;
    }
  }
  return Boolean(transfer.files && transfer.files.length > 0);
}

/**
 * 截图粘贴出来的 Blob 往往叫 `image.png`，一整天粘十张就有十个同名文件。
 * 给它一个带时刻的名字，用户在文件库里分得清哪张是哪张。
 *
 * 只在**名字确实是通用占位**时改名——用户从文件管理器复制的 `设计稿-v3.png`
 * 必须原样保留。
 */
export function namedClipboardFile(file: File, now: Date = new Date()): File {
  if (!/^(image|screenshot|untitled|pasted)([ _-]?\d*)?\.[a-z0-9]+$/i.test(file.name)) {
    return file;
  }
  const extension = (file.name.split(".").pop() || "png").toLowerCase();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  return new File([file], `粘贴图片-${stamp}.${extension}`, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

/**
 * 一次粘贴 → 可以直接交给业务的文件数组。
 * 拖拽用 `filesFromTransfer` 即可（拖进来的文件本来就有真名字）。
 */
export function filesFromPaste(
  transfer: DataTransfer | null | undefined,
  now: Date = new Date(),
): File[] {
  return filesFromTransfer(transfer).map((file) => namedClipboardFile(file, now));
}
