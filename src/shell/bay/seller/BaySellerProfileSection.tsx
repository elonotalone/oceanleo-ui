"use client";

// 设置里「LeoBay」的卖家资料 + 作品集。按窄宽度排版。不做所在时区。
// 作品集从「我的库」挑作品（pickLibraryWork）；弹窗宿主由外壳挂。

import { useCallback, useEffect, useState } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import {
  addShowcaseWork,
  getSellerProfile,
  hiddenCaseFor,
  listMyContentCases,
  listMyShowcase,
  removeShowcaseItem,
  saveSellerProfile,
  sellerProfileBody,
  type BayContentCase,
  type BaySellerProfile,
  type BaySellerProfileInput,
  type BayShowcaseItem,
} from "../../../lib/bay/seller";
import { pickLibraryWork } from "../needs/LibraryWorkPicker";
import { HiddenByPlatformNotice, INPUT_CLASS, PRIMARY_BUTTON, SECONDARY_BUTTON, SellerCard, SellerField, SellerNotice, TEXTAREA_CLASS } from "./seller-ui";

function splitList(value: string): string[] {
  return value.split(/[,，\n]+/).map((item) => item.trim()).filter(Boolean);
}

function joinList(items: string[] | undefined): string {
  return (items || []).join("，");
}

/** `onSaved`：保存成功后把新资料交给外面（「个人卡片」用它当场刷新上面的预览）。 */
export function BaySellerProfileSection({ onSaved }: { onSaved?: (profile: BaySellerProfile) => void } = {}) {
  const tt = useUI();
  const [profile, setProfile] = useState<BaySellerProfile | null>(null);
  const [showcase, setShowcase] = useState<BayShowcaseItem[]>([]);
  const [cases, setCases] = useState<BayContentCase[]>([]);
  const [form, setForm] = useState<BaySellerProfileInput>({ handle: "", display_name: "", published: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    void Promise.all([getSellerProfile(), listMyShowcase().catch(() => ({ items: [] as BayShowcaseItem[] })), listMyContentCases().catch(() => [] as BayContentCase[])]).then(
      ([{ profile: next }, works, caseRows]) => {
        setProfile(next);
        setShowcase(works.items || []);
        setCases(caseRows);
        setForm({
          handle: next?.handle || "",
          display_name: next?.display_name || "",
          avatar_url: next?.avatar_url || "",
          headline: next?.headline || "",
          bio: next?.bio || "",
          categories: next?.categories || [],
          skills: next?.skills || [],
          languages: next?.languages || [],
          availability: next?.availability || "open",
          engagement_kinds: next?.engagement_kinds || ["fixed"],
          hourly_rate_fen: next?.hourly_rate_fen ?? null,
          min_budget_fen: next?.min_budget_fen ?? null,
          published: Boolean(next?.published),
        });
        setLoading(false);
      },
      (err: unknown) => {
        setError(err instanceof Error ? err.message : "");
        setLoading(false);
      },
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const saved = await saveSellerProfile(sellerProfileBody(form));
      setProfile(saved.profile);
      onSaved?.(saved.profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "");
    } finally {
      setSaving(false);
    }
  }

  async function importWork() {
    if (importing) return;
    setImporting(true);
    setError("");
    try {
      const work = await pickLibraryWork({ title: tt("从我的库挑一件作品") });
      if (!work) return;
      const next = await addShowcaseWork(work);
      setShowcase(next.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "");
    } finally {
      setImporting(false);
    }
  }

  async function remove(id: string) {
    setError("");
    try {
      await removeShowcaseItem(id);
      setShowcase((items) => items.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "");
    }
  }

  if (loading) return <section data-bay-seller-profile className="max-w-xl p-1 text-[13px] text-stone-500">{tt("正在加载…")}</section>;

  const hidden = hiddenCaseFor(cases, "talent_profile", profile?.handle || profile?.user_id);
  const hiddenWork = showcase.find((item) => item.moderation_hidden);

  return (
    <section data-bay-seller-profile className="mx-auto w-full max-w-xl space-y-4">
      {hidden ? <HiddenByPlatformNotice what="profile" caseRow={hidden} /> : null}
      {hiddenWork ? <HiddenByPlatformNotice what="showcase" caseRow={hiddenCaseFor(cases, "talent_showcase", hiddenWork.id)} /> : null}
      {error ? <SellerNotice tone="error">{tt(error)}</SellerNotice> : null}

      <SellerCard title={tt("卖家资料")} hint={tt("买家在主页上看到的那几项。公开后才能上架服务。")}>
        <SellerField label={tt("主页地址")}>
          <input data-bay-field="handle" className={INPUT_CLASS} value={form.handle} maxLength={32} onChange={(event) => setForm({ ...form, handle: event.target.value })} />
        </SellerField>
        <SellerField label={tt("显示名")}>
          <input data-bay-field="display_name" className={INPUT_CLASS} value={form.display_name} maxLength={80} onChange={(event) => setForm({ ...form, display_name: event.target.value })} />
        </SellerField>
        <SellerField label={tt("头像地址")} hint={tt("https:// 开头")}>
          <input data-bay-field="avatar_url" className={INPUT_CLASS} value={form.avatar_url || ""} onChange={(event) => setForm({ ...form, avatar_url: event.target.value })} />
        </SellerField>
        <SellerField label={tt("一句话介绍")}>
          <input data-bay-field="headline" className={INPUT_CLASS} value={form.headline || ""} maxLength={200} onChange={(event) => setForm({ ...form, headline: event.target.value })} />
        </SellerField>
        <SellerField label={tt("简介")}>
          <textarea data-bay-field="bio" className={TEXTAREA_CLASS} rows={5} value={form.bio || ""} maxLength={5000} onChange={(event) => setForm({ ...form, bio: event.target.value })} />
        </SellerField>
        <SellerField label={tt("技能")} hint={tt("逗号分隔")}>
          <input data-bay-field="skills" className={INPUT_CLASS} value={joinList(form.skills)} onChange={(event) => setForm({ ...form, skills: splitList(event.target.value) })} />
        </SellerField>
        <SellerField label={tt("语言")} hint={tt("逗号分隔")}>
          <input data-bay-field="languages" className={INPUT_CLASS} value={joinList(form.languages)} onChange={(event) => setForm({ ...form, languages: splitList(event.target.value) })} />
        </SellerField>
        <label className="flex items-center gap-2 text-[13px] text-stone-800">
          <input type="checkbox" checked={Boolean(form.published)} onChange={(event) => setForm({ ...form, published: event.target.checked })} />
          {tt("公开这份资料")}
        </label>
        <button type="button" data-bay-save-profile disabled={saving} onClick={() => void save()} className={PRIMARY_BUTTON}>
          {saving ? tt("保存中…") : tt("保存资料")}
        </button>
      </SellerCard>

      <SellerCard title={tt("作品集")} hint={tt("从「我的库」挑作品放进去。买家在你的主页上能看到。")}>
        {showcase.length === 0 ? <p className="text-[12.5px] text-stone-500">{tt("还没有作品。")}</p> : null}
        <ul>
          {showcase.map((item) => (
            <li key={item.id} data-bay-showcase-item={item.id} className="flex items-start justify-between gap-2 border-b border-stone-100 py-2">
              <span className="min-w-0">
                <span className="block break-words text-[13px] font-medium text-stone-800">{item.title}</span>
                {item.summary ? <span className="mt-0.5 block break-words text-[12px] text-stone-500">{item.summary}</span> : null}
              </span>
              <button type="button" onClick={() => void remove(item.id)} className={SECONDARY_BUTTON}>
                {tt("移除")}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" data-bay-import-work disabled={importing} onClick={() => void importWork()} className={PRIMARY_BUTTON}>
          {importing ? tt("正在导入…") : tt("从我的库导入")}
        </button>
      </SellerCard>
    </section>
  );
}
