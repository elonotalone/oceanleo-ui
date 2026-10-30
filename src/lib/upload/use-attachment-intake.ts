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
//   2. **压缩**：默认开、只碰图片（`image-compress.ts`）。压缩期间文件挂在 `pending`
//      里，输入框先画成「上传中」方块。
//   3. **粘贴与拖拽同一条入口**（P4）：两者都落到这里的 `emit`。
//
// 【为什么「在传」这件事由读数驱动，而不是由「我交出去了」驱动】
// 宿主完全可能拿了文件却不上传（比如它只想读一读内容，或者压根没接上传）。
// 若一交出去就挂一行进度，那一行会永远停在 0%——比没有进度更糟。所以 `inFlight`
// 只在**总线真的报了数之后**才有内容，`done`/`failed` 即撤。没人报数时它是空数组，
// 方块上就是不确定态小圈。
//
// 2026-10-31：输入框里的「已压缩：A → B · 用原图」回执与整行进度已撤（操作员：
// 上传过程要简洁，只显示图片）。进度只画在方块上的小圆环里。
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
  /**
   * 正在压缩、还没交给宿主的那几个文件（2026-10-31）。输入框用它先画出
   * 「上传中」缩略块，用户粘贴/拖入的那一刻就看得见，不再另起一行「正在压缩图片…」。
   */
  pending: readonly File[];
  /** 正在传的那几个（读数驱动，见文件头）。 */
  inFlight: readonly UploadInFlight[];
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
  const [pending, setPending] = useState<readonly File[]>([]);
  const [inFlight, setInFlight] = useState<readonly UploadInFlight[]>([]);

  // 回调与开关都走 ref：`emit` 会被挂在 DOM 事件上，闭包里读到的必须是此刻的值，
  // 而不是这一轮渲染冻住的那份。
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;
  const compressEnabledRef = useRef(options.compressImages !== false);
  compressEnabledRef.current = options.compressImages !== false;

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
    (payload: File[]) => {
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
        deliver(files);
        return;
      }
      setCompressing(true);
      setPending((prev) => [...prev, ...files]);
      void compressImageFiles(files)
        .then((outcomes) => {
          deliver(outcomes.map((outcome) => outcome.upload));
        })
        .catch(() => {
          // `compressImageFiles` 按契约不抛。真抛了也绝不能把用户的文件吞掉。
          deliver(files);
        })
        .finally(() => {
          if (!aliveRef.current) return;
          setCompressing(false);
          setPending((prev) => prev.filter((file) => !files.includes(file)));
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

  return {
    emit,
    handlePaste,
    compressing,
    pending,
    inFlight,
  };
}
