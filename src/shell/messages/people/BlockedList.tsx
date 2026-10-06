"use client";

// 拉黑名单：看到谁被我拉黑了，一键取消拉黑。

import { useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { listBlocks, reasonOf, unblockUser, useLoader } from "../../../lib/im/people-api";
import { PersonAvatar } from "../groups/GroupAvatar";

export function BlockedList() {
  const tt = useUI();
  const blocks = useLoader(listBlocks, []);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const items = blocks.data ?? [];

  async function unblock(userId: string) {
    setBusy(userId);
    setNote(null);
    try {
      await unblockUser(userId);
      blocks.reload();
    } catch (e) {
      setNote(reasonOf(e, tt("没成功，请稍后再试。")));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-0 overflow-y-auto" data-blocked-list>
      {note && (
        <p role="status" className="px-3 pb-2 text-[12px] text-red-600">
          {note}
        </p>
      )}
      {items.length === 0 ? (
        <p className="px-3 py-8 text-center text-[12px] text-neutral-400" data-blocked-empty>
          {blocks.loading ? tt("加载中…") : tt("你没有拉黑任何人。")}
        </p>
      ) : (
        <>
          <p className="px-3 pb-2 text-[12px] text-neutral-500">{tt("被拉黑的人不能私聊你、不能把你拉进群，也不能给你发联系人请求。")}</p>
          <ul>
            {items.map((p) => (
              <li key={p.user_id} data-blocked={p.user_id} className="flex items-center gap-3 px-3 py-2">
                <PersonAvatar name={p.display_name} src={p.avatar_url} seed={p.user_id} size={36} />
                <span className="min-w-0 flex-1 truncate text-[14px] text-neutral-900">{p.display_name}</span>
                <button
                  type="button"
                  disabled={busy === p.user_id}
                  data-action="unblock"
                  onClick={() => unblock(p.user_id)}
                  className="rounded-lg border border-neutral-200 px-2.5 py-1 text-[12px] text-neutral-700 hover:bg-white disabled:opacity-50"
                >
                  {tt("取消拉黑")}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
