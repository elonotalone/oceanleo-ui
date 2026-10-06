"use client";

// 群资料与群规则：名字、简介、头像、入群审批、成员能否拉人、leo 开关。只有 owner / admin 看得到可改的表单。

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { Switch } from "../../../ui";
import { patchConversation } from "../../../lib/im/groups-api";
import { reasonOf } from "../../../lib/im/people-api";
import type { ImConversationDetail } from "../../../lib/im/types";
import { UploadError, uploadAttachment } from "../composer/upload";
import { GroupAvatar } from "./GroupAvatar";

export interface GroupSettingsFormProps {
  detail: ImConversationDetail;
  canEdit: boolean;
  /** 已保存，让上层重新拉详情 */
  onSaved: () => void;
}

export function GroupSettingsForm({ detail, canEdit, onSaved }: GroupSettingsFormProps) {
  const tt = useUI();
  const [title, setTitle] = useState(detail.title);
  const [description, setDescription] = useState(detail.description);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(detail.title);
    setDescription(detail.description);
  }, [detail.title, detail.description]);

  async function save(patch: Parameters<typeof patchConversation>[1]) {
    setBusy(true);
    setNote(null);
    try {
      await patchConversation(detail.id, patch);
      onSaved();
    } catch (e) {
      setNote(reasonOf(e, tt("没成功，请稍后再试。")));
      // 恢复成服务端当前值
      setTitle(detail.title);
      setDescription(detail.description);
    } finally {
      setBusy(false);
    }
  }

  async function pickAvatar(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setNote(null);
    try {
      // 走 W09 的 upload.ts：init → 直传 → finalize，不另写一套
      const attachment = await uploadAttachment(file, { kind: "image" });
      await patchConversation(detail.id, { avatar_url: attachment.url });
      onSaved();
    } catch (e) {
      if (e instanceof UploadError) {
        setNote(e.code === "too_large" ? tt("图片太大了，请换一张。") : tt("头像上传失败，请稍后再试。"));
      } else {
        setNote(reasonOf(e, tt("没成功，请稍后再试。")));
      }
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const dirty = title.trim() !== detail.title || description.trim() !== detail.description;

  if (!canEdit) {
    return (
      <div className="px-3 py-2" data-group-settings="readonly">
        {detail.description ? (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-neutral-600">{detail.description}</p>
        ) : (
          <p className="text-[12px] text-neutral-400">{tt("还没有群简介。")}</p>
        )}
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3 px-3 py-2"
      data-group-settings="editable"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        void save({ title: title.trim(), description: description.trim() });
      }}
    >
      <div className="flex items-center gap-3">
        <GroupAvatar name={detail.title} src={detail.avatar_url} seed={detail.id} size={48} />
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          data-field="avatar-file"
          onChange={(e) => void pickAvatar(e.target.files?.[0])}
        />
        <button
          type="button"
          disabled={busy}
          data-action="upload-avatar"
          onClick={() => fileInput.current?.click()}
          className="rounded-lg border border-neutral-200 px-2.5 py-1 text-[12px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          {tt("更换头像")}
        </button>
      </div>
      <label className="flex flex-col gap-1 text-[12px] text-neutral-600">
        {tt("群名称")}
        <input
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
          data-field="title"
          className="rounded-lg border border-neutral-200 px-3 py-2 text-[13px] text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
        />
      </label>
      <label className="flex flex-col gap-1 text-[12px] text-neutral-600">
        {tt("群简介")}
        <textarea
          value={description}
          maxLength={500}
          rows={3}
          onChange={(e) => setDescription(e.target.value)}
          data-field="description"
          className="resize-none rounded-lg border border-neutral-200 px-3 py-2 text-[13px] text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
        />
      </label>
      <div className="flex justify-end">
        <button type="submit" disabled={busy || !dirty || !title.trim()} data-action="save-profile" className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-40">
          {tt("保存")}
        </button>
      </div>

      {detail.kind === "group" && (
        <>
          <Row label={tt("进群需要管理员审批")}>
            <Switch checked={detail.join_approval} disabled={busy} label={tt("进群需要管理员审批")} onChange={(v) => save({ join_approval: v })} />
          </Row>
          <Row label={tt("允许成员拉人进群")}>
            <Switch checked={detail.members_can_add} disabled={busy} label={tt("允许成员拉人进群")} onChange={(v) => save({ members_can_add: v })} />
          </Row>
        </>
      )}
      <Row label={tt("让 leo 加入这个群")}>
        <Switch checked={detail.leo_enabled} disabled={busy} label={tt("让 leo 加入这个群")} onChange={(v) => save({ leo_enabled: v })} />
      </Row>
      {note && (
        <p role="alert" data-settings-note className="text-[12px] text-red-600">
          {note}
        </p>
      )}
    </form>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between text-[13px] text-neutral-700">
      <span>{label}</span>
      {children}
    </div>
  );
}
