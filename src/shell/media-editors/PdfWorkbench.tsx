"use client";

import type { LibraryItem } from "../library-data";
import { usePluginTheme } from "../plugin-theme";
import { PdfControls } from "./PdfControls";
import { PdfStage } from "./PdfStage";
import { usePdfWorkbench } from "./use-pdf-workbench";

export interface PdfWorkbenchProps {
  item: LibraryItem;
  siteId?: string;
  accent?: string;
}

/** 不经外壳的独立组合：左侧页面栏 + 基础档舞台（同一个查看器实例）。 */
export function PdfWorkbench({ item, siteId = "", accent = "#4f46e5" }: PdfWorkbenchProps) {
  const editor = usePdfWorkbench(item, siteId);
  const dark = usePluginTheme("pdf").theme === "dark";
  return (
    <div className="flex h-full min-h-0 bg-[var(--awb-stage-bg)]">
      {editor.bridge ? (
        <PdfControls
          pageCount={editor.pageCount}
          currentPage={editor.currentPage}
          version={editor.thumbVersion}
          aspect={(index) => {
            const page = editor.bridge?.pages()[index];
            return page ? page.size.height / page.size.width : 1.414;
          }}
          renderThumb={(index) => editor.bridge!.renderThumb(index, 1)}
          readOnly={false}
          busy={editor.processing}
          onGoTo={editor.goToPage}
          onRotate={(index) => void editor.rotatePage(index)}
          onDelete={(index) => void editor.deletePage(index)}
          onMove={(from, to) => void editor.movePage(from, to)}
        />
      ) : null}
      <main className="min-h-0 min-w-0 flex-1">
        <PdfStage
          bytes={editor.initialBytes}
          name={`${item.title || "document"}.pdf`}
          mode="basic"
          accent={accent}
          dark={dark}
          onHandle={editor.attach}
          onFailure={editor.setError}
        />
      </main>
    </div>
  );
}
