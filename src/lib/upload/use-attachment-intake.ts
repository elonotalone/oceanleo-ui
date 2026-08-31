"use client";

// ============================================================================
// 附件入口 hook —— 「不负责上传」的组件怎么拿到进度，以及压缩该在哪一层做
// ----------------------------------------------------------------------------
// `InputCard` 与 `LeoComposer` 的文件头都写着「本组件不负责上传」：它们只把 File
// 交给业务，业务（`src/shell/useAttachments.ts`）再去调 `uploadFile`。于是这两个
// 组件手里没有任何返回值可以看进度——今天缩略条上那个转圈是个纯不确定态，
// 传 200MB 和传 200KB 长得一模一样。
//
// 这个 hook 把三件事收在一处，让两个组件逐字共用同一套行为：
//
//   1. **进度**：订阅 `progress.ts` 的进度总线。总线按 **File 对象身份** 挂键，而
//      `useAttachments.handleAttachFiles` 恰好把收到的那个 File **原样**传给
//      `uploadFile`（`useAttachments.ts:63`），所以两边的键天然对得上——
//      **不必改业务侧一个字，也不必让 31 个站改调用。**
//   2. **压缩**：默认开、只碰图片、永远留着原图（`image-compress.ts`）。
//   3. **粘贴与拖拽同一条入口**（P4）：两者都落到这里的 `emit`。
//
// 【为什么「在传」这件事由读数驱动，而不是由「我交出去了」驱动】
// 宿主完全可能拿了文件却不上传（比如它只想读一读内容，或者压根没接上传）。
// 若一交出去就挂一行进度，那一行会永远停在 0%——比没有进度更糟。所以 `inFlight`
// 只在**总线真的报了数之后**才有内容，`done`/`failed` 即撤。没人报数时它是空数组，
// 渲染层因此一个字节都不变，35 个站的现状零回归。
//
// 【「用原图」在这里为什么是「重新交一次」而不是「换掉那一次」】
// 这两个组件不持有附件状态，也拿不到在飞的那次上传的 AbortSignal——它们没有
// 「取消并替换」这个能力。所以本 hook 的 `useOriginals()` 做两件它做得到的事：
// 关掉后续压缩 + 把原图重新交给宿主。宿主（`useAttachments`）会因此**多出一条
// 附件**而不是替换掉旧的那条，用户需要自己把压缩那条删掉。
// 要做到真正的一键替换，得让 `useAttachments` 暴露一个「按 id 替换」的口子——
// 那份文件不在 W08 独占面上，已写进 `signals/W08-request.md`。
// 真上传方（`AdvancedWorkbenchBlankStage`）自己持有 AbortController，那边是真替换。
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";

import { compressImageFiles } from "./image-compress";
import { filesFromPaste, transferHasFiles } from "./intake";
import {
  latestUploadProgress,
  subscribeUploadProgress,
  type UploadProgressSnapshot,
} from "./progress";

/** 一个正在传的文件。**只有总线报过数的才在这里面。** */
export interface UploadInFlight {
  file: File;
  name: string;
  snapshot: UploadProgressSnapshot;
}

/** 这一批里真被压过的那些的合计。一个都没压就是 `null`。 */
export interface CompressionSummary {
  /** 真被压过的文件数。 */
  files: number;
  originalBytes: number;
  uploadBytes: number;
}

export interface AttachmentIntakeOptions {
  /** 默认压。传 false 表示宿主自己另有压缩策略，这里原图直出。 */
  compressImages?: boolean;
}

/** 只接受带 `clipboardData` 的事件，React 合成事件与原生事件都吃得下。 */
export interface PasteLike {
  clipboardData: DataTransfer | null;
  preventDefault: () => void;
}

export interface AttachmentIntake {
  /** 选择 / 拖拽 / 粘贴**共用**的唯一入口。 */
  emit: (files: FileList | readonly File[] | null | undefined) => void;
  /** 粘贴：有文件才拦，没有一律放过（粘贴文字必须照常插入）。 */
  handlePaste: (event: PasteLike) => void;
  /** 正在压缩。调用方要把它算进「发送键禁用」里。 */
  compressing: boolean;
  /** 正在传的那几个（读数驱动，见文件头）。 */
  inFlight: readonly UploadInFlight[];
  /** 最近一批压缩的前后字节；没压过是 `null`。 */
  compression: CompressionSummary | null;
  /** 压缩开关的当前值（用户点过「用原图」就是 false）。 */
  compressEnabled: boolean;
  /** 「用原图」：关掉后续压缩，并把原图重新交给宿主。 */
  useOriginals: () => void;
}

function toFileArray(
  input: FileList | readonly File[] | null | undefined,
): File[] {
  if (!input) return [];
  return Array.from(input as ArrayLike<File>);
}

export function useAttachmentIntake(
  onFiles: ((files: File[]) => void) | undefined,
  options: AttachmentIntakeOptions = {},
): AttachmentIntake {
  const [compressing, setCompressing] = useState(false);
  const [inFlight, setInFlight] = useState<readonly UploadInFlight[]>([]);
  const [compression, setCompression] = useState<CompressionSummary | null>(null);
  const [compressEnabled, setCompressEnabled] = useState(
    options.compressImages !== false,
  );

  // 回调与开关都走 ref：`emit` 会被挂在 DOM 事件上，闭包里读到的必须是此刻的值，
  // 而不是这一轮渲染冻住的那份。
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;
  const compressEnabledRef = useRef(compressEnabled);
  compressEnabledRef.current = compressEnabled;

  /** 上一批交出去的原图，供「用原图」重交。 */
  const originalsRef = useRef<File[]>([]);
  const subscriptionsRef = useRef(new Map<File, () => void>());
  /** 卸载之后不许再 setState（上传比组件活得久是常态）。 */
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    const subscriptions = subscriptionsRef.current;
    return () => {
      aliveRef.current = false;
      for (const unsubscribe of subscriptions.values()) unsubscribe();
      subscriptions.clear();
    };
  }, []);

  const drop = useCallback((file: File) => {
    const unsubscribe = subscriptionsRef.current.get(file);
    if (unsubscribe) {
      unsubscribe();
      subscriptionsRef.current.delete(file);
    }
    setInFlight((prev) =>
      prev.some((entry) => entry.file === file)
        ? prev.filter((entry) => entry.file !== file)
        : prev,
    );
  }, []);

  const watch = useCallback(
    (files: readonly File[]) => {
      for (const file of files) {
        if (subscriptionsRef.current.has(file)) continue;
        // 已经结束的就别订了：`subscribeUploadProgress` 订阅即回放，
        // 回放一条 done 只会让 UI 闪一下再撤。
        const known = latestUploadProgress(file);
        if (known && (known.done || known.failed)) continue;

        // 回放发生在 `subscribeUploadProgress` 返回**之前**，那一刻退订函数还没进
        // map，`drop` 会漏掉它。用这个标记把「订阅过程中就结束了」这一种接住。
        let settledWhileSubscribing = false;
        const unsubscribe = subscribeUploadProgress(file, (snapshot) => {
          if (!aliveRef.current) return;
          if (snapshot.done || snapshot.failed) {
            if (subscriptionsRef.current.has(file)) drop(file);
            else settledWhileSubscribing = true;
            return;
          }
          setInFlight((prev) => {
            const at = prev.findIndex((entry) => entry.file === file);
            const next = { file, name: file.name, snapshot };
            // 原位替换而不是「删了再 push」：后者会让列表每报一次数就重排一次。
            if (at < 0) return [...prev, next];
            const updated = prev.slice();
            updated[at] = next;
            return updated;
          });
        });
        if (settledWhileSubscribing) unsubscribe();
        else subscriptionsRef.current.set(file, unsubscribe);
      }
    },
    [drop],
  );

  const deliver = useCallback(
    (payload: File[], originals: File[], summary: CompressionSummary | null) => {
      originalsRef.current = originals;
      if (aliveRef.current) setCompression(summary);
      // 先订阅再交出去：宿主可能在同一个 tick 里就把请求发出去了。
      watch(payload);
      onFilesRef.current?.(payload);
    },
    [watch],
  );

  const emit = useCallback(
    (input: FileList | readonly File[] | null | undefined) => {
      const files = toFileArray(input);
      if (!files.length || !onFilesRef.current) return;
      if (!compressEnabledRef.current) {
        deliver(files, files, null);
        return;
      }
      setCompressing(true);
      void compressImageFiles(files)
        .then((outcomes) => {
          const squeezed = outcomes.filter((outcome) => outcome.compressed);
          deliver(
            outcomes.map((outcome) => outcome.upload),
            outcomes.map((outcome) => outcome.original),
            squeezed.length
              ? {
                  files: squeezed.length,
                  originalBytes: squeezed.reduce((n, o) => n + o.originalBytes, 0),
                  uploadBytes: squeezed.reduce((n, o) => n + o.uploadBytes, 0),
                }
              : null,
          );
        })
        .catch(() => {
          // `compressImageFiles` 按契约不抛。真抛了也绝不能把用户的文件吞掉。
          deliver(files, files, null);
        })
        .finally(() => {
          if (aliveRef.current) setCompressing(false);
        });
    },
    [deliver],
  );

  const handlePaste = useCallback(
    (event: PasteLike) => {
      if (!onFilesRef.current) return;
      // 没有文件就一个字都不拦——粘贴纯文本必须照常插入。
      if (!transferHasFiles(event.clipboardData)) return;
      const files = filesFromPaste(event.clipboardData);
      if (!files.length) return;
      event.preventDefault();
      emit(files);
    },
    [emit],
  );

  const useOriginals = useCallback(() => {
    setCompressEnabled(false);
    compressEnabledRef.current = false;
    setCompression(null);
    const originals = originalsRef.current;
    if (!originals.length || !onFilesRef.current) return;
    watch(originals);
    onFilesRef.current(originals);
  }, [watch]);

  return {
    emit,
    handlePaste,
    compressing,
    inFlight,
    compression,
    compressEnabled,
    useOriginals,
  };
}
