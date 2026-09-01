// ============================================================================
// @oceanleo/ui — 富文档审阅侧栏：批注线程 + 待处理修订
// ----------------------------------------------------------------------------
// 「与正文位置对齐」不是靠算像素：`commentViews` 已经按锚点位置排好序，
// 侧栏按同一个顺序渲染，点一条就把正文选区挪过去。做绝对定位对齐要在每次
// 编辑后测量每个锚点的屏幕坐标，那是一条会随字体、缩放、折行系统性错位的路。
//
// 样式由本组件自带 `<style>` 注入（`RICHDOC_REVIEW_CSS`）——谁用谁带，
// 不给没开审阅的站增加字节。过渡只引 `var(--leo-dur-2)`，不写裸时长（红线 9）。
//
// **按钮一律不传 `size`（W42，2026-09-01）。** 这里九个动作按钮原先写的是
// `size="sm"`(36)，`W29` 把侧栏挂上之后它们才第一次真的出现在屏幕上——
// 36px 在手机上点不中，而「解决 / 删除 / 全部拒绝」这一排里点错一个是要命的。
// 回默认档 `lg`(44) 之后卡片会高一点，这是**预期的**：侧栏本来就是竖着滚的，
// 换来的是三个动作之间不再互相误触（动作行的 gap 同时从 6px 抬到 8px）。
// 宽度算得过来：`max-width:320px` 的侧栏减去两层内边距还剩 274px，
// 三枚 44 高的两字按钮横排约 190px，不需要折行。
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import { Button } from "../../../ui/Button";
import { RICHDOC_REVIEW_CSS } from "./review-marks";
import type { RichDocCommentView } from "./review-types";
import type { RichDocChangeView } from "./track-changes";

const RAIL_CSS = `
.oleo-review-rail{display:flex;flex-direction:column;gap:12px;width:100%;max-width:320px;padding:12px;overflow-y:auto}
.oleo-review-rail__group{display:flex;flex-direction:column;gap:8px}
.oleo-review-rail__title{font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;opacity:.62}
.oleo-review-rail__empty{font-size:13px;opacity:.6;padding:8px 0}
.oleo-review-card{border:1px solid var(--leo-review-card-line,rgba(120,120,120,.28));border-radius:10px;padding:10px;background:var(--leo-review-card-bg,rgba(127,127,127,.06));transition:border-color var(--leo-dur-2) var(--leo-ease-standard),background-color var(--leo-dur-2) var(--leo-ease-standard);cursor:pointer}
.oleo-review-card:hover{border-color:var(--leo-review-card-line-hover,rgba(120,120,120,.5))}
.oleo-review-card[data-active="1"]{border-color:var(--leo-review-comment-line,rgba(202,138,4,.65));background:var(--leo-review-comment-bg,rgba(250,204,21,.18))}
.oleo-review-card[data-orphaned="1"]{border-style:dashed;opacity:.78}
.oleo-review-card__head{display:flex;align-items:baseline;gap:8px;font-size:12px}
.oleo-review-card__who{font-weight:600}
.oleo-review-card__when{opacity:.55;font-variant-numeric:tabular-nums}
.oleo-review-card__quote{margin:6px 0;font-size:12px;opacity:.7;border-left:2px solid currentColor;padding-left:6px;overflow-wrap:anywhere}
.oleo-review-card__body{font-size:13px;line-height:1.5;overflow-wrap:anywhere;white-space:pre-wrap}
.oleo-review-card__flag{display:inline-block;font-size:11px;padding:1px 6px;border-radius:999px;background:var(--leo-review-del-bg,rgba(185,28,28,.12));color:var(--leo-review-del,#b91c1c)}
.oleo-review-card__replies{display:flex;flex-direction:column;gap:6px;margin-top:8px;padding-top:8px;border-top:1px dashed var(--leo-review-card-line,rgba(120,120,120,.28))}
.oleo-review-card__reply{font-size:12px;line-height:1.45;overflow-wrap:anywhere;white-space:pre-wrap}
.oleo-review-card__actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.oleo-review-reply-form{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.oleo-review-reply-form textarea{width:100%;min-height:56px;resize:vertical;font:inherit;font-size:12px;padding:6px;border-radius:8px;border:1px solid var(--leo-review-card-line,rgba(120,120,120,.28));background:transparent;color:inherit}
.oleo-review-change{display:flex;flex-direction:column;gap:6px}
.oleo-review-change__kind{font-size:11px;padding:1px 6px;border-radius:999px;background:var(--leo-review-fmt-bg,rgba(37,99,235,.12));color:var(--leo-review-fmt,#1d4ed8)}
.oleo-review-change__text{font-size:12px;overflow-wrap:anywhere}
`;

/** 注入一次就够；同一个 stage 上可能挂着不止一个编辑器。 */
function useReviewStyles() {
  useEffect(() => {
    const id = "oleo-richdoc-review-css";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `${RICHDOC_REVIEW_CSS}\n${RAIL_CSS}`;
    document.head.appendChild(style);
  }, []);
}

function shortWhen(value: string): string {
  // 时间戳只在侧栏里做辅助信息，长度比精度重要。
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 16);
  return `${parsed.getMonth() + 1}/${parsed.getDate()} ${String(
    parsed.getHours(),
  ).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`;
}

export interface RichDocCommentRailProps {
  comments: RichDocCommentView[];
  changes: RichDocChangeView[];
  activeCommentId: string;
  trackChangesEnabled: boolean;
  onFocusComment: (commentId: string) => void;
  onReply: (commentId: string, body: string) => void;
  onResolve: (commentId: string, resolved: boolean) => void;
  onRemove: (commentId: string) => void;
  onAcceptChange: (changeId: string) => void;
  onRejectChange: (changeId: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
}

export function RichDocCommentRail(props: RichDocCommentRailProps) {
  const tt = useUI();
  useReviewStyles();
  const [replyingTo, setReplyingTo] = useState("");
  const [replyDraft, setReplyDraft] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const activeRef = useRef<HTMLDivElement | null>(null);

  const { open, resolved } = useMemo(() => {
    const openList: RichDocCommentView[] = [];
    const resolvedList: RichDocCommentView[] = [];
    for (const view of props.comments) {
      (view.resolved ? resolvedList : openList).push(view);
    }
    return { open: openList, resolved: resolvedList };
  }, [props.comments]);

  // 正文 → 侧栏跳转的另一半：被点亮的那条要自己滚进可视区。
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [props.activeCommentId]);

  const renderCard = (view: RichDocCommentView) => {
    const isActive = view.id === props.activeCommentId;
    return (
      <div
        key={view.id}
        ref={isActive ? activeRef : undefined}
        className="oleo-review-card"
        data-active={isActive ? "1" : "0"}
        data-orphaned={view.orphaned ? "1" : "0"}
        data-comment-id={view.id}
        role="button"
        tabIndex={0}
        onClick={() => props.onFocusComment(view.id)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          props.onFocusComment(view.id);
        }}
      >
        <div className="oleo-review-card__head">
          <span className="oleo-review-card__who">
            {view.authorName || view.author || tt("匿名")}
          </span>
          <span className="oleo-review-card__when">
            {shortWhen(view.createdAt)}
          </span>
          {view.orphaned ? (
            <span className="oleo-review-card__flag">
              {tt("锚定文字已被删除")}
            </span>
          ) : null}
        </div>
        {view.quotedText ? (
          <div className="oleo-review-card__quote">{view.quotedText}</div>
        ) : null}
        <div className="oleo-review-card__body">{view.body}</div>
        {view.replies.length ? (
          <div className="oleo-review-card__replies">
            {view.replies.map((reply) => (
              <div key={reply.id} className="oleo-review-card__reply">
                <strong>{reply.authorName || reply.author}</strong>
                {": "}
                {reply.body}
              </div>
            ))}
          </div>
        ) : null}
        <div
          className="oleo-review-card__actions"
          onClick={(event) => event.stopPropagation()}
        >
          <Button
            variant="ghost"
            onClick={() => {
              setReplyingTo(replyingTo === view.id ? "" : view.id);
              setReplyDraft("");
            }}
          >
            {tt("回复")}
          </Button>
          <Button
            variant="ghost"
            onClick={() => props.onResolve(view.id, !view.resolved)}
          >
            {view.resolved ? tt("重开") : tt("解决")}
          </Button>
          <Button
            variant="ghost"
            onClick={() => props.onRemove(view.id)}
          >
            {tt("删除")}
          </Button>
        </div>
        {replyingTo === view.id ? (
          <div
            className="oleo-review-reply-form"
            onClick={(event) => event.stopPropagation()}
          >
            <textarea
              value={replyDraft}
              onChange={(event) => setReplyDraft(event.target.value)}
              aria-label={tt("回复内容")}
            />
            <Button
              variant="primary"
              disabled={!replyDraft.trim()}
              onClick={() => {
                props.onReply(view.id, replyDraft);
                setReplyDraft("");
                setReplyingTo("");
              }}
            >
              {tt("发送回复")}
            </Button>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <aside className="oleo-review-rail" aria-label={tt("批注与修订")}>
      <div className="oleo-review-rail__group">
        <div className="oleo-review-rail__title">
          {tt("批注")}
          {open.length ? ` (${open.length})` : ""}
        </div>
        {open.length ? (
          open.map(renderCard)
        ) : (
          <div className="oleo-review-rail__empty">
            {tt("选中一段文字即可插入批注。")}
          </div>
        )}
      </div>

      {resolved.length ? (
        <div className="oleo-review-rail__group">
          <Button
            variant="ghost"
            onClick={() => setShowResolved((value) => !value)}
          >
            {showResolved
              ? tt("收起已解决（{n}）", { n: resolved.length })
              : tt("展开已解决（{n}）", { n: resolved.length })}
          </Button>
          {showResolved ? resolved.map(renderCard) : null}
        </div>
      ) : null}

      <div className="oleo-review-rail__group">
        <div className="oleo-review-rail__title">
          {tt("待处理修订")}
          {props.changes.length ? ` (${props.changes.length})` : ""}
          {props.trackChangesEnabled ? "" : ` · ${tt("修订模式已关闭")}`}
        </div>
        {props.changes.length ? (
          <>
            <div className="oleo-review-card__actions">
              <Button variant="secondary" onClick={props.onAcceptAll}>
                {tt("全部接受")}
              </Button>
              <Button variant="secondary" onClick={props.onRejectAll}>
                {tt("全部拒绝")}
              </Button>
            </div>
            {props.changes.map((change) => (
              <div
                key={change.changeId}
                className="oleo-review-card oleo-review-change"
              >
                <div className="oleo-review-card__head">
                  <span className="oleo-review-change__kind">
                    {change.kind === "insertion"
                      ? tt("插入")
                      : change.kind === "deletion"
                        ? tt("删除")
                        : tt("格式")}
                  </span>
                  <span className="oleo-review-card__who">
                    {change.authorName || change.author || tt("匿名")}
                  </span>
                  <span className="oleo-review-card__when">
                    {shortWhen(change.at)}
                  </span>
                </div>
                {change.text ? (
                  <div className="oleo-review-change__text">{change.text}</div>
                ) : null}
                <div className="oleo-review-card__actions">
                  <Button
                    variant="ghost"
                    onClick={() => props.onAcceptChange(change.changeId)}
                  >
                    {tt("接受")}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => props.onRejectChange(change.changeId)}
                  >
                    {tt("拒绝")}
                  </Button>
                </div>
              </div>
            ))}
          </>
        ) : (
          <div className="oleo-review-rail__empty">
            {tt("没有待处理的修订。")}
          </div>
        )}
      </div>
    </aside>
  );
}
