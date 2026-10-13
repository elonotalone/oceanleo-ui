"use client";

// 管理作品 → 更新日志：发布、编辑、删除。标题和正文只当文本渲染。
import { useCallback, useEffect, useState, type ReactElement } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import {
  createBayAppRelease,
  deleteBayAppRelease,
  listBayAppReleases,
  updateBayAppRelease,
  type BayAppRelease,
} from "../../../lib/bay/app-releases";
import { BayRevealForm } from "../form";
import { errorText } from "../supply/use-bay-resource";
import { applyFollowFromReleasePage, useFollowSnapshot } from "./follow-store";
import {
  emptyReleaseDraft,
  formatReleaseDay,
  publishReleaseNotice,
  releaseFormProblem,
  toReleaseCreateInput,
  toReleasePatch,
  type ReleaseDraft,
} from "./releases-model";

const FIELD = "mt-1 w-full rounded-full border border-neutral-900 bg-white px-2 py-1.5 text-[13px]";

function ReleaseFields({
  draft,
  onChange,
  disabled,
}: {
  draft: ReleaseDraft;
  onChange: (next: ReleaseDraft) => void;
  disabled: boolean;
}): ReactElement {
  const tt = useUI();
  const version = draft.version.trim();
  const title = draft.title.trim();
  const body = draft.body.trim();
  return (
    <BayRevealForm
      items={[
        {
          id: "version",
          label: tt("版本号"),
          done: Boolean(version),
          optional: true,
          summary: version || undefined,
          children: (
            <input
              value={draft.version}
              maxLength={40}
              disabled={disabled}
              onChange={(event) => onChange({ ...draft, version: event.target.value })}
              className={FIELD}
            />
          ),
        },
        {
          id: "title",
          label: tt("标题"),
          done: title.length >= 2,
          summary: title || undefined,
          children: (
            <input
              value={draft.title}
              maxLength={120}
              disabled={disabled}
              onChange={(event) => onChange({ ...draft, title: event.target.value })}
              className={FIELD}
            />
          ),
        },
        {
          id: "body",
          label: tt("内容"),
          done: body.length >= 1,
          summary: body || undefined,
          children: (
            <textarea
              value={draft.body}
              maxLength={4000}
              rows={5}
              disabled={disabled}
              onChange={(event) => onChange({ ...draft, body: event.target.value })}
              className={FIELD}
            />
          ),
        },
      ]}
    />
  );
}

export function ReleasesManagePanel({ appId }: { appId: string }): ReactElement | null {
  const tt = useUI();
  const follow = useFollowSnapshot(appId);
  const [items, setItems] = useState<BayAppRelease[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<ReleaseDraft>(emptyReleaseDraft);
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeN, setNoticeN] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ReleaseDraft>(emptyReleaseDraft);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [rowError, setRowError] = useState("");

  const loadFirst = useCallback(() => {
    if (!appId) return;
    let live = true;
    setLoading(true);
    setError("");
    listBayAppReleases(appId, { limit: 20 }).then(
      (page) => {
        if (!live) return;
        applyFollowFromReleasePage(appId, page);
        setItems(page.items || []);
        setNextOffset(page.next_offset);
        setLoading(false);
      },
      (err: unknown) => {
        if (!live) return;
        setError(errorText(err) || tt("没读到更新日志，请稍后再试。"));
        setLoading(false);
      },
    );
    return () => {
      live = false;
    };
  }, [appId, tt]);

  useEffect(() => loadFirst(), [loadFirst]);

  async function loadMore() {
    if (!appId || loadingMore || nextOffset == null) return;
    setLoadingMore(true);
    setError("");
    try {
      const page = await listBayAppReleases(appId, { offset: nextOffset, limit: 20 });
      applyFollowFromReleasePage(appId, page);
      setItems((prev) => [...prev, ...(page.items || [])]);
      setNextOffset(page.next_offset);
    } catch (err) {
      setError(errorText(err) || tt("没读到更新日志，请稍后再试。"));
    } finally {
      setLoadingMore(false);
    }
  }

  async function publish() {
    if (publishing) return;
    const problem = releaseFormProblem(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setPublishing(true);
    setError("");
    setNotice("");
    try {
      const result = await createBayAppRelease(appId, toReleaseCreateInput(draft));
      setItems((prev) => [result.release, ...prev.filter((item) => item.id !== result.release.id)]);
      setDraft(emptyReleaseDraft());
      setNotice(publishReleaseNotice({ notify: draft.notify, notified: result.notified }));
      setNoticeN(result.notified);
    } catch (err) {
      setError(errorText(err) || tt("发布没成功，请稍后再试。"));
    } finally {
      setPublishing(false);
    }
  }

  function startEdit(release: BayAppRelease) {
    setEditingId(release.id);
    setEditDraft({ version: release.version, title: release.title, body: release.body, notify: false });
    setRowError("");
    setConfirmDeleteId(null);
  }

  async function saveEdit() {
    if (!editingId || saving) return;
    const problem = releaseFormProblem(editDraft);
    if (problem) {
      setRowError(problem);
      return;
    }
    setSaving(true);
    setRowError("");
    try {
      const result = await updateBayAppRelease(editingId, toReleasePatch(editDraft));
      setItems((prev) => prev.map((item) => (item.id === result.release.id ? result.release : item)));
      setEditingId(null);
    } catch (err) {
      setRowError(errorText(err) || tt("保存没成功，请稍后再试。"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(releaseId: string) {
    if (deletingId) return;
    setDeletingId(releaseId);
    setRowError("");
    try {
      await deleteBayAppRelease(releaseId);
      setItems((prev) => prev.filter((item) => item.id !== releaseId));
      setConfirmDeleteId(null);
      if (editingId === releaseId) setEditingId(null);
    } catch (err) {
      setRowError(errorText(err) || tt("删除没成功，请稍后再试。"));
    } finally {
      setDeletingId(null);
    }
  }

  if (!appId) return null;
  const count = follow?.follower_count ?? 0;

  return (
    <div data-bay-releases-manage className="space-y-4">
      <p data-bay-follower-count className="text-[13px] text-neutral-600">
        {tt("{n} 人关注", { n: count })}
      </p>
      <form
        data-bay-release-form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void publish();
        }}
      >
        <ReleaseFields draft={draft} onChange={setDraft} disabled={publishing} />
        <label className="flex items-start gap-2 text-[12px] text-neutral-700">
          <input
            type="checkbox"
            data-bay-notify-followers
            checked={draft.notify}
            disabled={publishing}
            onChange={(event) => setDraft({ ...draft, notify: event.target.checked })}
            className="mt-0.5"
          />
          <span>{tt("通知关注的人（每 24 小时最多通知一次）")}</span>
        </label>
        {error ? <p className="text-[12px] text-rose-600">{tt(error)}</p> : null}
        {notice ? <p className="text-[12px] text-emerald-700">{tt(notice, { n: noticeN })}</p> : null}
        <button
          type="submit"
          data-bay-action="publish-release"
          disabled={publishing}
          className="rounded-full bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {publishing ? tt("正在发布…") : tt("发布")}
        </button>
      </form>

      {loading ? <p className="text-[13px] text-neutral-500">{tt("正在读取更新日志…")}</p> : null}
      {!loading && items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-center text-[13px] text-neutral-500">
          {tt("还没有更新日志。写一条，让访客知道作品还在维护")}
        </p>
      ) : null}
      <ul className="space-y-3">
        {items.map((release) => {
          const editing = editingId === release.id;
          const version = release.version.trim();
          const day = formatReleaseDay(release.created_at);
          return (
            <li key={release.id} data-bay-app-release={release.id} className="py-2">
              {editing ? (
                <div className="space-y-2">
                  <ReleaseFields draft={editDraft} onChange={setEditDraft} disabled={saving} />
                  {rowError ? <p className="text-[12px] text-rose-600">{tt(rowError)}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      data-bay-action="save-release"
                      disabled={saving}
                      onClick={() => void saveEdit()}
                      className="rounded-full bg-neutral-900 px-3 py-1.5 text-[12px] text-white disabled:opacity-60"
                    >
                      {saving ? tt("正在保存…") : tt("保存")}
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => setEditingId(null)}
                      className="rounded-full border border-neutral-900 bg-white px-3 py-1.5 text-[12px] text-neutral-700 disabled:opacity-60"
                    >
                      {tt("取消")}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    {version ? <span className="text-[12px] font-medium text-neutral-500">{version}</span> : null}
                    <span className="break-words text-[13px] font-semibold text-neutral-900">{release.title}</span>
                    {day ? <span className="text-[12px] text-neutral-600">{day}</span> : null}
                  </div>
                  {release.body ? (
                    <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-6 text-neutral-700">{release.body}</p>
                  ) : null}
                  {rowError && (confirmDeleteId === release.id || editingId === release.id) ? (
                    <p className="mt-2 text-[12px] text-rose-600">{tt(rowError)}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      data-bay-action="edit-release"
                      onClick={() => startEdit(release)}
                      className="rounded-full border border-neutral-900 bg-white px-3 py-1.5 text-[12px] text-neutral-700 hover:bg-neutral-50"
                    >
                      {tt("编辑")}
                    </button>
                    <button
                      type="button"
                      data-bay-action="delete-release"
                      onClick={() => {
                        setConfirmDeleteId(release.id);
                        setRowError("");
                      }}
                      className="rounded-full border border-neutral-900 bg-white px-3 py-1.5 text-[12px] text-neutral-700 hover:bg-neutral-50"
                    >
                      {tt("删除")}
                    </button>
                  </div>
                  {confirmDeleteId === release.id ? (
                    <div data-bay-confirm="delete-release" className="mt-3 space-y-2">
                      <p className="text-[13px] text-neutral-800">{tt("确定删除这条更新？")}</p>
                      {rowError ? <p className="mt-1 text-[12px] text-rose-600">{tt(rowError)}</p> : null}
                      <div className="mt-2 flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          disabled={deletingId === release.id}
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-full border border-neutral-900 bg-white px-3 py-1.5 text-[12px] text-neutral-700 disabled:opacity-60"
                        >
                          {tt("取消")}
                        </button>
                        <button
                          type="button"
                          data-bay-action="confirm-delete-release"
                          disabled={deletingId === release.id}
                          onClick={() => void remove(release.id)}
                          className="rounded-full bg-neutral-900 px-3 py-1.5 text-[12px] text-white disabled:opacity-60"
                        >
                          {deletingId === release.id ? tt("正在删除…") : tt("删除")}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </li>
          );
        })}
      </ul>
      {nextOffset != null ? (
        <button
          type="button"
          data-bay-action="load-more-releases"
          disabled={loadingMore}
          onClick={() => void loadMore()}
          className="w-full rounded-full border-0 bg-neutral-200 py-2 text-[13px] text-neutral-700 hover:bg-neutral-100 disabled:opacity-60"
        >
          {loadingMore ? tt("正在加载…") : tt("查看全部")}
        </button>
      ) : null}
    </div>
  );
}
