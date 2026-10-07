"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  addMailSender,
  addMailWorkflow,
  deleteMailSender,
  deleteMailWorkflow,
  getMail,
  renameMailAddress,
  type MailApiCode,
  type MailSnapshot,
} from "../../../lib/mail-api";
import { writeClipboardText } from "../../../shell/share/share-clipboard";
import { AuthPanel } from "../../AuthDialog";
import { FIELD, Note } from "../personalization/parts";

type MailState =
  | { status: "loading" }
  | { status: "ready"; data: MailSnapshot }
  | { status: "failed"; code: MailApiCode };

type Editor = "none" | "address" | "workflow" | "sender";

const RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))]/45";
const QUIET_BTN =
  `rounded-lg border border-neutral-200 bg-white px-3.5 py-1.5 text-[13px] font-medium text-neutral-800 transition hover:bg-neutral-50 ${RING}`;
const ROW = "flex items-start justify-between gap-4 py-3";

export function MailSection({ variant = "page" }: { variant?: "page" | "pane" } = {}) {
  const tt = useUI();
  const pane = variant === "pane";
  const [state, setState] = useState<MailState>({ status: "loading" });
  const [reload, setReload] = useState(0);
  const [copied, setCopied] = useState(false);
  const [editor, setEditor] = useState<Editor>("none");
  const [prefix, setPrefix] = useState("");
  const [sender, setSender] = useState("");
  const [workflow, setWorkflow] = useState({ local_part: "", name: "", instructions: "" });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "error" | "ok"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void getMail().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setState({ status: "ready", data: result.data });
        setPrefix(result.data.address.local_part);
      } else {
        setState({ status: "failed", code: result.error });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const apply = useCallback((result: Awaited<ReturnType<typeof getMail>>) => {
    if (result.ok) {
      setState({ status: "ready", data: result.data });
      setPrefix(result.data.address.local_part);
      setEditor("none");
      setSender("");
      setWorkflow({ local_part: "", name: "", instructions: "" });
      setNote({ kind: "ok", text: tt("已保存") });
    } else {
      setNote({ kind: "error", text: errorCopy(tt, result.error) });
    }
  }, [tt]);

  async function run(action: () => Promise<Awaited<ReturnType<typeof getMail>>>) {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      apply(await action());
    } finally {
      setBusy(false);
    }
  }

  if (state.status === "failed" && state.code === "signed_out") {
    return (
      <div className="space-y-4" data-settings-pane="mail" data-variant={pane ? "pane" : "page"}>
        <p className="text-[14px] text-neutral-600">{tt("登录后才能使用邮件")}</p>
        <AuthPanel onSuccess={() => setReload((n) => n + 1)} />
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <p data-settings-pane="mail" data-variant={pane ? "pane" : "page"} role="status" className="text-[13px] text-neutral-500">
        {tt("加载中")}
      </p>
    );
  }

  if (state.status === "failed") {
    return (
      <div className="space-y-3" data-settings-pane="mail" data-variant={pane ? "pane" : "page"}>
        <Note kind="error" text={errorCopy(tt, state.code)} />
        <button type="button" className={QUIET_BTN} onClick={() => setReload((n) => n + 1)}>
          {tt("重试")}
        </button>
      </div>
    );
  }

  const data = state.data;
  const ignored = data.ignored ?? null;
  return (
    <div className="space-y-1" data-settings-pane="mail" data-variant={pane ? "pane" : "page"} data-mail-editor={editor}>
      {note ? <Note kind={note.kind} text={note.text} /> : null}

      <MailRow
        title={tt("OceanLeo 的邮箱")}
        detail={
          <>
            <p data-mail-address="" className="mt-0.5 truncate text-[13px] text-neutral-500">
              {data.address.email}
            </p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-neutral-400">
              {tt("把邮件发到这个地址，就会创建任务。")}
            </p>
          </>
        }
        action={
          <button
            type="button"
            data-mail-copy=""
            className={QUIET_BTN}
            onClick={() => {
              void writeClipboardText(data.address.email).then((ok) => {
                if (!ok) return;
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? tt("已复制") : tt("复制")}
          </button>
        }
      />

      {editor === "address" ? (
        <form
          data-mail-address-form=""
          className={`${ROW} items-end`}
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => renameMailAddress(prefix));
          }}
        >
          <label className="min-w-0 flex-1 text-[13px] font-medium text-neutral-900">
            {tt("自定义地址")}
            <span className="mt-1 flex items-center gap-1">
              <input
                data-mail-prefix=""
                className={FIELD}
                value={prefix}
                onChange={(event) => setPrefix(event.target.value)}
                autoComplete="off"
              />
              <span className="shrink-0 text-[13px] font-normal text-neutral-500">@{data.domain}</span>
            </span>
            <span className="mt-1 block text-[12px] font-normal leading-relaxed text-neutral-400">
              {tt("每 7 天可改一次前缀")}
            </span>
          </label>
          <div className="flex shrink-0 gap-2">
            <button type="button" className={QUIET_BTN} onClick={() => {
              setPrefix(data.address.local_part);
              setEditor("none");
            }}>
              {tt("取消")}
            </button>
            <button type="submit" data-mail-save-address="" className={QUIET_BTN} disabled={busy}>
              {tt("保存")}
            </button>
          </div>
        </form>
      ) : (
        <MailRow
          title={tt("自定义地址")}
          detail={
            <>
              <p data-mail-custom-address="" className="mt-0.5 truncate text-[13px] text-neutral-500">
                {data.address.email}
              </p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-neutral-400">
                {tt("每 7 天可改一次前缀")}
              </p>
            </>
          }
          action={
            <button type="button" data-mail-change-address="" className={QUIET_BTN} onClick={() => {
              setPrefix(data.address.local_part);
              setEditor("address");
            }}>
              {tt("更改")}
            </button>
          }
        />
      )}

      <div className="pt-2">
        <MailRow
          title={tt("工作流邮箱")}
          detail={
            <p className="mt-0.5 text-[12px] leading-relaxed text-neutral-400">
              {tt("发到这个地址时，会按你写的指令处理。")}
            </p>
          }
          action={
            editor === "workflow" ? (
              <button type="button" data-mail-cancel-workflow="" className={QUIET_BTN} onClick={() => {
                setWorkflow({ local_part: "", name: "", instructions: "" });
                setEditor("none");
              }}>
                {tt("取消")}
              </button>
            ) : (
              <button type="button" data-mail-add-workflow="" className={QUIET_BTN} onClick={() => setEditor("workflow")}>
                {tt("添加")}
              </button>
            )
          }
        />
        {editor === "workflow" ? (
          <form
            data-mail-workflow-form=""
            className="space-y-2 pb-3"
            onSubmit={(event) => {
              event.preventDefault();
              void run(() => addMailWorkflow(workflow));
            }}
          >
            <input
              data-mail-workflow-prefix=""
              className={FIELD}
              placeholder={tt("地址前缀")}
              value={workflow.local_part}
              onChange={(event) => setWorkflow((current) => ({ ...current, local_part: event.target.value }))}
            />
            <input
              data-mail-workflow-name=""
              className={FIELD}
              placeholder={tt("名称")}
              value={workflow.name}
              onChange={(event) => setWorkflow((current) => ({ ...current, name: event.target.value }))}
            />
            <textarea
              data-mail-workflow-instructions=""
              className={FIELD}
              rows={3}
              placeholder={tt("指令")}
              value={workflow.instructions}
              onChange={(event) => setWorkflow((current) => ({ ...current, instructions: event.target.value }))}
            />
            <div className="flex justify-end">
              <button type="submit" data-mail-save-workflow="" className={QUIET_BTN} disabled={busy}>
                {tt("保存")}
              </button>
            </div>
          </form>
        ) : null}
        {data.workflows.map((item) => (
          <MailRow
            key={item.id}
            title={item.email}
            detail={
              item.name || item.instructions ? (
                <p className="mt-0.5 text-[12px] leading-relaxed text-neutral-400">
                  {item.name || item.instructions}
                </p>
              ) : null
            }
            action={
              <button
                type="button"
                data-mail-delete-workflow={item.id}
                className={QUIET_BTN}
                disabled={busy}
                onClick={() => void run(() => deleteMailWorkflow(item.id))}
              >
                {tt("删除")}
              </button>
            }
          />
        ))}
      </div>

      <div className="pt-2">
        <MailRow
          title={tt("已批准的发件人")}
          detail={
            <p className="mt-0.5 text-[12px] leading-relaxed text-neutral-400">
              {tt("只有这些邮箱发来的信会创建任务。")}
            </p>
          }
          action={
            editor === "sender" ? (
              <button type="button" data-mail-cancel-sender="" className={QUIET_BTN} onClick={() => {
                setSender("");
                setEditor("none");
              }}>
                {tt("取消")}
              </button>
            ) : (
              <button type="button" data-mail-add-sender="" className={QUIET_BTN} onClick={() => setEditor("sender")}>
                {tt("添加")}
              </button>
            )
          }
        />
        {editor === "sender" ? (
          <form
            data-mail-sender-form=""
            className={`${ROW} items-center`}
            onSubmit={(event) => {
              event.preventDefault();
              void run(() => addMailSender(sender));
            }}
          >
            <input
              data-mail-sender-email=""
              className={FIELD}
              type="email"
              placeholder={tt("添加发件人")}
              value={sender}
              onChange={(event) => setSender(event.target.value)}
            />
            <button type="submit" data-mail-save-sender="" className={QUIET_BTN} disabled={busy}>
              {tt("保存")}
            </button>
          </form>
        ) : null}
        {ignored ? (
          <MailRow
            title={ignored.from}
            detail={
              <p data-mail-ignored={ignored.reason} className="mt-0.5 text-[12px] leading-relaxed text-neutral-400">
                {ignored.reason === "not_approved"
                  ? tt("这个地址发来的信没有处理，因为它还不在批准名单里。")
                  : tt("收到一封自称来自这个地址的信，但核实不了是本人发的，没有处理。")}
              </p>
            }
            action={
              ignored.reason === "not_approved" ? (
                <button
                  type="button"
                  data-mail-approve-ignored=""
                  className={QUIET_BTN}
                  disabled={busy}
                  onClick={() => void run(() => addMailSender(ignored.from))}
                >
                  {tt("批准")}
                </button>
              ) : null
            }
          />
        ) : null}
        {data.senders.map((item) => (
          <MailRow
            key={item.id}
            title={item.email}
            action={
              <button
                type="button"
                data-mail-delete-sender={item.id}
                className={QUIET_BTN}
                disabled={busy}
                onClick={() => void run(() => deleteMailSender(item.id))}
              >
                {tt("删除")}
              </button>
            }
          />
        ))}
      </div>

      <div className="pt-2">
        <MailRow
          title={tt("最近由邮件创建的任务")}
          detail={
            data.inbox.length === 0 ? (
              <p data-mail-inbox-empty="" className="mt-0.5 text-[12px] leading-relaxed text-neutral-400">
                {tt("还没有由邮件创建的任务")}
              </p>
            ) : null
          }
        />
        {data.inbox.map((item) => (
          <MailRow
            key={item.id}
            title={item.subject || item.from}
            detail={
              item.from && item.subject ? (
                <p className="mt-0.5 truncate text-[12px] text-neutral-400">{item.from}</p>
              ) : null
            }
            action={
              item.task_id ? (
                <a
                  data-mail-open-task={item.task_id}
                  className={QUIET_BTN}
                  href={`/history?task=${encodeURIComponent(item.task_id)}`}
                >
                  {tt("打开任务")}
                </a>
              ) : null
            }
          />
        ))}
      </div>
    </div>
  );
}

function MailRow({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={ROW}>
      <div className="min-w-0 pr-4">
        <p className="text-[13px] font-medium text-neutral-900">{title}</p>
        {detail}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function errorCopy(tt: (key: string) => string, code: MailApiCode): string {
  if (code === "signed_out") return tt("登录后才能使用邮件");
  if (code === "not_available") return tt("邮件还没启用");
  if (code === "rename_cooldown") return tt("改不了，7 天内已改过");
  if (code === "address_taken") return tt("这个地址已被使用");
  if (code === "rate_limited") return tt("次数用完了，稍后再试");
  if (code === "invalid") return tt("请检查填写的内容");
  return tt("网络失败，请稍后再试。");
}
