"use client";

import { type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { UITranslate } from "../../../i18n/ui/useUI";
import { snapshotDisplayTitle, yuanLabel, type BayPostSnapshot } from "./post-templates";
import { BayTypedPreview } from "./BayTypedPreview";
import { formatDeadline } from "./bay-deadline";
import { cleanGalleryUrls } from "./bay-gallery";

function deadlineLabelText(tt: UITranslate, value: string | undefined): string {
  const raw = (value || "").trim();
  if (!raw) return "";
  // 绝对时刻按看的人自己的时区显示；不是时刻的老文案原样给出。
  const shown = formatDeadline(raw);
  return shown ? tt("{date} 截止", { date: shown }) : raw;
}

function listingArtifactId(snap: BayPostSnapshot): string | undefined {
  return snap.previewArtifactId || snap.sampleArtifactId;
}

/** 别人打开这条发布时看到的页面长什么样。预览里能打开文件，购买键点不动。 */
export function BayListingPreview(props: { snapshot: BayPostSnapshot; live?: boolean }): ReactElement {
  const tt = useUI();
  const snap = props.snapshot;
  const title = snapshotDisplayTitle(snap);
  const empty = props.live && !snap.title.trim();
  const price = yuanLabel(snap.priceFen);
  const coverUrls = cleanGalleryUrls(snap.coverUrls, snap.coverUrl);
  const cover = coverUrls[0] || "";

  return (
    <article
      data-bay-listing-preview={snap.kind}
      data-bay-listing-artifact={listingArtifactId(snap) || undefined}
      data-bay-preview-live={props.live ? "" : undefined}
      className="rounded-2xl border border-neutral-200 bg-white p-4"
    >
      {empty ? (
        <p data-bay-preview-empty="" className="mb-3 text-[12px] text-neutral-600">
          {tt("还没填的部分，别人打开会空着")}
        </p>
      ) : null}
      {snap.kind === "need" ? (
        <NeedPreview title={tt(title)} snap={snap} price={price} />
      ) : snap.kind === "consult" ? (
        <ConsultPreview title={tt(title)} snap={snap} price={price} />
      ) : snap.kind === "app" ? (
        <AppPreview title={tt(title)} snap={snap} />
      ) : snap.kind === "lesson" ? (
        <LessonPreview title={tt(title)} snap={snap} cover={cover} price={price} />
      ) : (
        <GoodsPreview title={tt(title)} snap={snap} cover={cover} price={price} digital={snap.kind === "digital"} />
      )}
    </article>
  );
}

function Cover({
  urls,
  label,
  artifactId,
  workTitle,
}: {
  urls: string[];
  label: string;
  artifactId?: string;
  workTitle?: string;
}) {
  return (
    <div className="mb-4">
      <BayTypedPreview artifactId={artifactId} workTitle={workTitle} imageUrls={urls} emptyLabel={label} />
    </div>
  );
}

function GoodsPreview({
  title,
  snap,
  cover,
  price,
  digital,
}: {
  title: string;
  snap: BayPostSnapshot;
  cover: string;
  price: string;
  digital: boolean;
}) {
  const tt = useUI();
  const deadline = deadlineLabelText(tt, snap.deadlineLabel);
  const terms = snap.customTerms?.trim() || "";
  return (
    <div>
      <Cover
        urls={cleanGalleryUrls(snap.coverUrls, cover)}
        label={tt("卖家暂未上传作品图")}
        artifactId={listingArtifactId(snap)}
        workTitle={snap.previewWorkTitle}
      />
      <h2 className="break-words text-[18px] font-semibold text-neutral-950">{title}</h2>
      {snap.categoryLabel ? <p className="mt-1 text-[12px] text-neutral-500">{tt(snap.categoryLabel)}</p> : null}
      {snap.description ? <p className="mt-3 whitespace-pre-wrap break-words text-[13px] leading-6 text-neutral-700">{tt(snap.description)}</p> : null}
      <div className="mt-4 flex items-end justify-between gap-3">
        <p className="text-[16px] font-semibold text-neutral-900">{price ? (price === "免费" ? tt("免费") : price) : "—"}</p>
        <span className="rounded-full bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white">
          {digital ? tt("购买") : tt("立即下单")}
        </span>
      </div>
      {digital ? (
        <p data-bay-delivery className="mt-3 text-[13px] text-neutral-600">
          {tt("付款后立即交付")}
        </p>
      ) : (
        <p data-bay-delivery className="mt-3 text-[13px] text-neutral-600">
          {snap.deliveryDays ? tt("{n} 天交付", { n: snap.deliveryDays }) : tt("按约定时间交付")}
        </p>
      )}
      {deadline ? (
        <p data-bay-deadline className="mt-1 text-[13px] text-neutral-600">
          {deadline}
        </p>
      ) : null}
      {terms ? (
        <p data-bay-custom-terms className="mt-2 whitespace-pre-wrap break-words text-[13px] text-neutral-700">
          {terms}
        </p>
      ) : null}
    </div>
  );
}

function ConsultPreview({ title, snap, price }: { title: string; snap: BayPostSnapshot; price: string }) {
  const tt = useUI();
  const unit = snap.billing === "hour" ? tt("按小时") : tt("按次");
  return (
    <div>
      <p className="text-[11px] text-neutral-500">{unit}</p>
      <h2 className="mt-1 break-words text-[18px] font-semibold text-neutral-950">{title}</h2>
      {snap.categoryLabel ? <p className="mt-1 text-[12px] text-neutral-500">{tt(snap.categoryLabel)}</p> : null}
      <section className="mt-4">
        <h3 className="text-[13px] font-semibold text-neutral-900">{tt("能问什么")}</h3>
        {snap.description ? <p className="mt-1 whitespace-pre-wrap text-[13px] text-neutral-700">{tt(snap.description)}</p> : null}
        {snap.scopeNote ? <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-neutral-600">{tt(snap.scopeNote)}</p> : null}
      </section>
      <dl className="mt-4 grid gap-2 sm:grid-cols-3">
        <Fact label={tt("价格")} value={price ? `${price} · ${unit}` : unit} />
        <Fact
          label={tt("一次给到什么")}
          value={
            snap.billing === "hour"
              ? snap.consultMinutes
                ? tt("{n} 分钟", { n: snap.consultMinutes })
                : tt("按小时")
              : snap.consultRounds
                ? tt("{n} 轮问答", { n: snap.consultRounds })
                : tt("按次")
          }
        />
        <Fact label={tt("回复时限")} value={snap.responseWindow ? tt(snap.responseWindow) : "—"} />
      </dl>
      <span className="mt-4 inline-flex rounded-full bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white">{tt("预约答疑")}</span>
    </div>
  );
}

function AppPreview({ title, snap }: { title: string; snap: BayPostSnapshot }) {
  const tt = useUI();
  return (
    <div>
      <Cover
        urls={cleanGalleryUrls(snap.coverUrls, snap.coverUrl)}
        label={tt("封面")}
        artifactId={listingArtifactId(snap)}
        workTitle={snap.previewWorkTitle}
      />
      <h2 className="break-words text-[18px] font-semibold text-neutral-950">{title}</h2>
      {snap.summary ? <p className="mt-1.5 text-[13px] text-neutral-600">{tt(snap.summary)}</p> : null}
      {snap.description ? <p className="mt-3 whitespace-pre-wrap text-[13px] leading-6 text-neutral-700">{tt(snap.description)}</p> : null}
      <span className="mt-4 inline-flex rounded-full bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white">{tt("在新窗口打开")}</span>
    </div>
  );
}

function LessonPreview({
  title,
  snap,
  cover,
  price,
}: {
  title: string;
  snap: BayPostSnapshot;
  cover: string;
  price: string;
}) {
  const tt = useUI();
  return (
    <div>
      <Cover
        urls={cleanGalleryUrls(snap.coverUrls, cover)}
        label={tt("封面")}
        artifactId={listingArtifactId(snap)}
        workTitle={snap.previewWorkTitle}
      />
      <h2 className="break-words text-[18px] font-semibold text-neutral-950">{title}</h2>
      {snap.summary ? <p className="mt-1.5 text-[13px] text-neutral-600">{tt(snap.summary)}</p> : null}
      {snap.description ? <p className="mt-3 whitespace-pre-wrap text-[13px] leading-6 text-neutral-700">{tt(snap.description)}</p> : null}
      <div className="mt-4 flex items-center justify-between">
        <p className="text-[16px] font-semibold text-neutral-900">{price ? (price === "免费" ? tt("免费") : price) : "—"}</p>
        <span className="rounded-full bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white">{tt("购买")}</span>
      </div>
    </div>
  );
}

function NeedPreview({ title, snap, price }: { title: string; snap: BayPostSnapshot; price: string }) {
  const tt = useUI();
  const budget = snap.budgetFen != null ? yuanLabel(snap.budgetFen) : price;
  return (
    <div>
      {listingArtifactId(snap) ? (
        <Cover
          urls={cleanGalleryUrls(snap.coverUrls, snap.coverUrl)}
          label={tt("卖家暂未上传作品图")}
          artifactId={listingArtifactId(snap)}
          workTitle={snap.previewWorkTitle}
        />
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-[16px] font-semibold leading-6 text-neutral-900">{title}</h2>
          <p className="mt-1 flex flex-wrap gap-x-2 text-[12px] text-neutral-500">
            {snap.categoryLabel ? <span>{tt(snap.categoryLabel)}</span> : null}
            {snap.deadlineLabel ? <span>{tt(snap.deadlineLabel)}</span> : null}
          </p>
        </div>
        <span className="shrink-0 text-[14px] font-semibold text-neutral-900">{budget ? (budget === "免费" ? tt("免费") : budget) : "—"}</span>
      </div>
      {snap.description ? <p className="mt-3 whitespace-pre-wrap text-[13px] leading-6 text-neutral-700">{tt(snap.description)}</p> : null}
      {snap.skills?.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {snap.skills.map((skill) => (
            <span key={skill} className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[12px] text-neutral-600">
              {tt(skill)}
            </span>
          ))}
        </div>
      ) : null}
      <span className="mt-4 inline-flex rounded-full bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white">{tt("报价")}</span>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-neutral-50 px-2.5 py-2">
      <dt className="text-[11px] text-neutral-500">{label}</dt>
      <dd className="mt-0.5 break-words text-[13px] font-medium text-neutral-900">{value}</dd>
    </div>
  );
}
