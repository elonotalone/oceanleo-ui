"use client";

import { useCallback, useState } from "react";

import { accessToken } from "../../lib/auth/client";
import { GATEWAY_BASE } from "../../lib/auth/config";
import { uploadFile } from "../../lib/database";
import { useUI } from "../../i18n/ui/useUI";
import { AudioTranscriptPanel } from "./AudioTranscriptPanel";
import {
  cutPlanForSentence,
  pollBailianAsr,
  sentencesFromAsrStatus,
  submitBailianAsr,
  type AudioTranscriptSentence,
} from "./audio-transcript";
import type { AudioWorkbenchState } from "./audio-workbench-state";

async function postGatewayJson(path: string, body: unknown): Promise<unknown> {
  const token = await accessToken();
  if (!token) throw new Error("请先登录再转写。");
  const response = await fetch(`${GATEWAY_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    credentials: "include",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(data?.detail || `转写失败（${response.status}）`));
  }
  return data;
}

/** 转写稿：上传当前音频 → 百炼转写 → 按句删。删句走编辑器自己的 editRange，进撤销栈。 */
export function AudioTranscriptSection({
  editor,
  title,
  siteId,
  readOnly = false,
}: {
  editor: AudioWorkbenchState;
  title: string;
  siteId: string;
  readOnly?: boolean;
}) {
  const tt = useUI();
  const [sentences, setSentences] = useState<AudioTranscriptSentence[]>([]);
  const [estimated, setEstimated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { wavBlob, editRange, duration } = editor;

  const transcribe = useCallback(async () => {
    const wav = wavBlob();
    if (!wav) {
      setError(tt("还没有音频可转写。"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const uploaded = await uploadFile(
        new File([wav], `${title || "audio"}.wav`, { type: "audio/wav" }),
        { siteId, title: title || "audio" },
      );
      const fileUrl = String(uploaded.data?.file?.url || "");
      if (!uploaded.ok || !fileUrl) {
        throw new Error(uploaded.error || tt("转写前没能保存一份音频地址。"));
      }
      const submitted = await submitBailianAsr(
        { postJson: postGatewayJson },
        { siteId, fileUrls: [fileUrl] },
      );
      let payload: unknown = { status: "PENDING" };
      let status = "PENDING";
      for (let attempt = 0; attempt < 24; attempt += 1) {
        payload = await pollBailianAsr({ postJson: postGatewayJson }, submitted.taskId);
        status = String((payload as { status?: string })?.status || "").toUpperCase();
        if (status === "SUCCEEDED" || status === "FAILED") break;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      if (status === "FAILED") throw new Error(tt("转写失败"));
      if (status !== "SUCCEEDED") throw new Error(tt("转写超时，请稍后再试。"));
      const parsed = sentencesFromAsrStatus(payload, duration);
      setSentences(parsed.sentences);
      setEstimated(parsed.estimated);
      if (!parsed.sentences.length) {
        setError(parsed.text ? tt("转写没有切出句子。") : tt("转写是空的。"));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tt("转写失败"));
    } finally {
      setBusy(false);
    }
  }, [duration, siteId, title, tt, wavBlob]);

  const cutSentence = useCallback(
    (sentence: AudioTranscriptSentence) => {
      const plan = cutPlanForSentence(sentence, duration);
      if (!plan) {
        setError(tt("这一句对不上时间轴。"));
        return;
      }
      void editRange("delete", plan.start, plan.end).then((done) => {
        if (!done) {
          setError(tt("这一句没能删掉。"));
          return;
        }
        // 删掉一句后，后面所有句子的时间都前移，旧时间轴已失效：清空，要求重新转写。
        setSentences([]);
        setError(tt("已删除这一句。时间轴已变化，请重新转写后再按句剪辑。"));
      });
    },
    [duration, editRange, tt],
  );

  return (
    <AudioTranscriptPanel
      sentences={sentences}
      estimated={estimated}
      busy={busy || readOnly || editor.loading}
      error={error}
      onTranscribe={() => {
        void transcribe();
      }}
      onCutSentence={cutSentence}
    />
  );
}
