/**
 * W6-r4: remaining host-side families load stored source, honor a shown
 * command, serialize the mutation, and reopen it. Missing/unreadable source
 * stays fail-closed. Game play preview has no host edit model.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { PDFDocument } from "pdf-lib";

import {
  pdfSourcePersistenceAdmitted,
} from "../src/shell/advanced-routes/non-richdoc-source-gate.ts";
import {
  createBlankPdf,
  inspectPdf,
  rotatePdfPage,
} from "../src/shell/media-editors/pdf-operations.ts";
import { loadInitialPdfSource } from "../src/shell/media-editors/pdf-source.ts";
import {
  addClipToTrack,
  createEmptyDoc,
  docDurationMs,
  findClip,
  isTimelineDoc,
  patchClipIn,
} from "../src/shell/video-editor/timeline-model.ts";
import {
  VIDEO_TIMELINE_MISSING_MEDIA,
  VIDEO_TIMELINE_MISSING_PROJECT,
  hydrateVideoTimelineDoc,
  planVideoTimelineSource,
  serializeVideoProjectEnvelope,
} from "../src/shell/video-editor/video-timeline-source.ts";
import { parseVideoProjectEnvelope } from "../src/shell/media-editors/source-integrity.mjs";

function stubCommit(payload) {
  return { revisionId: "rev-next", payload };
}

async function pageRotation(bytes, pageIndex = 0) {
  const document = await PDFDocument.load(bytes);
  return document.getPage(pageIndex).getRotation().angle;
}

// 10-23 D4：单实例 PDF 编辑器的指令面（media-editors/pdf-command-surface.ts）。
function livePdfEditor(initialBytes, pageCount) {
  let bytes = initialBytes;
  const editor = {
    bridge: {
      goToPage: () => undefined,
      searchHits: async () => [],
      revealHit: () => undefined,
      createAnnotation: () => true,
      pages: () => Array.from({ length: pageCount }, (_, index) => ({ index, size: { width: 595, height: 842 }, rotation: 0 })),
      annotationCount: () => 0,
    },
    loading: false,
    processing: false,
    pageCount,
    currentPage: 1,
    zoom: 100,
    dirty: false,
    error: "",
    editRevision: 0,
    currentBytes: () => bytes,
    async rotatePage(pageIndex, clockwise = true) {
      bytes = await rotatePdfPage(bytes, pageIndex, clockwise ? 90 : -90);
      editor.editRevision += 1;
      editor.dirty = true;
      return true;
    },
    async deletePage() {
      return false;
    },
  };
  return editor;
}

function liveVideoEditor(initialDoc) {
  let doc = structuredClone(initialDoc);
  const editor = {
    loadingSource: false,
    sourceReady: true,
    exporting: false,
    error: "",
    dirty: false,
    editRevision: 0,
    playheadMs: 0,
    playing: false,
    selectedClipId: "",
    get doc() {
      return doc;
    },
    get durationMs() {
      return docDurationMs(doc);
    },
    patchClip(clipId, patch) {
      doc = patchClipIn(doc, clipId, patch);
      editor.editRevision += 1;
      editor.dirty = true;
    },
    deleteClip() {
      return false;
    },
    cutRange() {
      return false;
    },
    setClipSpeed() {},
    async addMediaUrl() {},
    seek(ms) {
      editor.playheadMs = ms;
    },
  };
  return editor;
}
