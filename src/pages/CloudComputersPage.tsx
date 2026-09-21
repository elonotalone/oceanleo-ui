"use client";

import { useEffect, useState } from "react";
import {
  COMPUTER_EVENT_KIND_LABEL,
  COMPUTER_STATUS_LABEL,
  CloudComputerError,
  cloudComputerApi,
  type CloudComputerClient,
  type Computer,
  type ComputerEvent,
  type UsageResponse,
} from "../lib/cloud-computer-api";
import { currentDomainFamily } from "../contracts/domain-family";
import { formatMinor } from "../lib/money";
import { useUI } from "../i18n/ui/useUI";
import { ConfirmDialog } from "../ui";
import { PageHeader } from "./PageHeader";
import { ConnectServerDialog } from "../shell/cloud-computer/ConnectServerDialog";
import { CreateComputerDialog } from "../shell/cloud-computer/CreateComputerDialog";

export interface CloudComputersPageProps {
  client?: CloudComputerClient;
}

function statusLabel(computer: Computer): string {
  return COMPUTER_STATUS_LABEL[computer.status] || computer.status;
}

function formatMemBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—";
  const gib = bytes / 1073741824;
  if (gib >= 1) {
    const rounded = Math.round(gib * 10) / 10;
    return `${rounded} GiB`;
  }
  const mib = bytes / 1048576;
  if (mib >= 1) return `${Math.round(mib)} MiB`;
  return `${Math.round(bytes)} B`;
}

function eventKindLabel(kind: string): string {
  return COMPUTER_EVENT_KIND_LABEL[kind] || kind;
}

export function CloudComputersPage({
  client = cloudComputerApi,
}: CloudComputersPageProps) {
  const tt = useUI();
  const cn = currentDomainFamily() === "cn";
  const [computers, setComputers] = useState<Computer[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [events, setEvents] = useState<ComputerEvent[]>([]);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectResume, setConnectResume] = useState<Computer | null>(null);
  const [confirmRelease, setConfirmRelease] = useState<Computer | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  async function refresh() {
    const data = await client.listComputers();
    setComputers(data.items || []);
    setPageError(null);
    return data.items || [];
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    client
      .listComputers()
      .then((data) => {
        if (!alive) return;
        setComputers(data.items || []);
        setPageError(null);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setPageError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [client]);

  const selected = computers.find((item) => item.id === selectedId) ?? null;
  const visibleComputers = computers.filter(
    (item) => item.status !== "removed" && item.status !== "released",
  );

  useEffect(() => {
    if (!selected) {
      setEvents([]);
      setUsage(null);
      return;
    }
    let alive = true;
    Promise.all([
      client.listComputerEvents(selected.id),
      client.getUsage(selected.id).catch(() => null),
    ]).then(([eventPayload, usagePayload]) => {
      if (!alive) return;
      setEvents(eventPayload.items || []);
      setUsage(usagePayload);
    }).catch(() => {
      if (!alive) return;
      setEvents([]);
    });
    return () => {
      alive = false;
    };
  }, [client, selected]);

  async function saveRename(computer: Computer) {
    const next = renameValue.trim();
    if (!next) return;
    await client.renameComputer(computer.id, next);
    setRenameId(null);
    await refresh();
  }

  async function act(
    computer: Computer,
    op: "start" | "stop" | "delete",
  ) {
    try {
      if (op === "start") await client.startComputer(computer.id);
      if (op === "stop") await client.stopComputer(computer.id);
      if (op === "delete") await client.deleteComputer(computer.id);
      setConfirmRelease(null);
      const items = await refresh();
      if (op === "delete") {
        setSelectedId(items[0]?.id ?? null);
      }
    } catch (err) {
      setPageError(
        err instanceof CloudComputerError ? err.message : String(err),
      );
    }
  }

  function openConnect(resume: Computer | null) {
    setConnectResume(resume);
    setConnectOpen(true);
  }

  return (
    <div className="px-8 py-6" data-oceanleo-cc-page>
      <PageHeader title={tt("云电脑")} backHref="/" />

      {confirmRelease && (
        <ConfirmDialog
          title={tt(`释放「${confirmRelease.name}」？`)}
          body={tt("按阿里云规则释放，数据不可恢复")}
          confirmLabel={tt("确认释放")}
          danger
          onConfirm={() => act(confirmRelease, "delete")}
          onCancel={() => setConfirmRelease(null)}
        />
      )}
      {createOpen && (
        <CreateComputerDialog
          client={client}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            void refresh();
          }}
        />
      )}
      {connectOpen && (
        <ConnectServerDialog
          key={connectResume?.id ?? "new"}
          client={client}
          resumeComputer={connectResume}
          onClose={() => {
            setConnectOpen(false);
            setConnectResume(null);
          }}
          onCreated={() => {
            void refresh();
          }}
        />
      )}

      <div className="mx-auto mt-7 max-w-4xl space-y-6">
        {cn && (
          <p className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-[13px] text-neutral-600">
            {tt("此功能在当前站点不可用")}
          </p>
        )}
        {pageError && (
          <p className="text-[13px] text-rose-600">{tt(pageError)}</p>
        )}
        {loading ? (
          <p className="text-[13px] text-neutral-500">{tt("加载中…")}</p>
        ) : visibleComputers.length === 0 ? (
          <section
            className="rounded-2xl border border-neutral-200 bg-white p-6"
            data-oceanleo-cc-empty
          >
            <h2 className="text-[15px] font-semibold text-neutral-900">
              {tt("还没有云电脑")}
            </h2>
            <p className="mt-1 text-[12px] text-neutral-500">
              {tt("按阿里云成本价开通一台，或把已有服务器接进来。")}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {!cn && (
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="rounded-lg bg-neutral-900 px-3.5 py-2 text-[13px] font-medium text-white"
                >
                  {tt("创建云电脑")}
                </button>
              )}
              <button
                type="button"
                onClick={() => openConnect(null)}
                className="rounded-lg border border-neutral-200 px-3.5 py-2 text-[13px]"
              >
                {tt("接入我的服务器")}
              </button>
            </div>
          </section>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {!cn && (
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px]"
                >
                  {tt("创建云电脑")}
                </button>
              )}
              <button
                type="button"
                onClick={() => openConnect(null)}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px]"
              >
                {tt("接入我的服务器")}
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {visibleComputers.map((computer) => (
                <div
                  key={computer.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(computer.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedId(computer.id);
                    }
                  }}
                  data-oceanleo-cc-card={computer.id}
                  data-oceanleo-cc-card-status={computer.status}
                  className={`rounded-2xl border p-4 text-left ${
                    selectedId === computer.id
                      ? "border-neutral-900"
                      : "border-neutral-200 bg-white"
                  } ${computer.status === "enrolled" ? "border-amber-400 bg-amber-50" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[14px] font-medium text-neutral-900">
                      {computer.name}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] ${
                        computer.status === "enrolled"
                          ? "bg-amber-200 text-amber-900"
                          : "bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {tt(statusLabel(computer))}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1 text-[12px] text-neutral-500">
                    <div>
                      {computer.source === "aliyun"
                        ? tt("阿里云")
                        : tt("自有")}
                    </div>
                    <div>
                      {tt("公网 IP")}{" "}
                      {computer.node_public_ip ||
                        computer.public_ip ||
                        tt("暂无")}
                    </div>
                    <div>
                      {tt("节点")}{" "}
                      {computer.node_online ? tt("在线") : tt("离线")}
                    </div>
                    {computer.node_fingerprint && (
                      <div>
                        {tt("指纹")}{" "}
                        <span
                          className="break-all font-mono text-[12px] text-neutral-800"
                          data-oceanleo-cc-fingerprint
                        >
                          {computer.node_fingerprint}
                        </span>
                      </div>
                    )}
                    {computer.status === "active" && computer.node_run_as && (
                      <div data-oceanleo-cc-run-as>
                        {tt("运行身份")} {computer.node_run_as}
                      </div>
                    )}
                    <div>
                      {tt("到目前费用")}{" "}
                      {computer.cost_to_date
                        ? formatMinor(
                            computer.cost_to_date.amount_minor,
                            computer.cost_to_date.currency,
                          )
                        : tt("暂无")}
                    </div>
                  </div>
                  {computer.status === "pending" && (
                    <button
                      type="button"
                      className="mt-3 rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px]"
                      data-oceanleo-cc-view-command
                      onClick={(event) => {
                        event.stopPropagation();
                        openConnect(computer);
                      }}
                    >
                      {tt("等待安装 · 查看命令")}
                    </button>
                  )}
                  {computer.status === "enrolled" && (
                    <button
                      type="button"
                      className="mt-3 rounded-lg bg-amber-900 px-3 py-1.5 text-[12px] font-medium text-white"
                      data-oceanleo-cc-confirm-open
                      onClick={(event) => {
                        event.stopPropagation();
                        openConnect(computer);
                      }}
                    >
                      {tt("确认")}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {selected && (
          <section
            className="rounded-2xl border border-neutral-200 bg-white p-5"
            data-oceanleo-cc-detail
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              {renameId === selected.id ? (
                <form
                  className="flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveRename(selected);
                  }}
                >
                  <input
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    className="rounded-lg border border-neutral-200 px-2 py-1 text-[13px]"
                    aria-label={tt("名字")}
                  />
                  <button type="submit" className="text-[12px]">
                    {tt("保存")}
                  </button>
                </form>
              ) : (
                <h2 className="text-[15px] font-semibold">{selected.name}</h2>
              )}
              <button
                type="button"
                className="text-[12px] text-neutral-500"
                onClick={() => {
                  setRenameId(selected.id);
                  setRenameValue(selected.name);
                }}
              >
                {tt("改名")}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {selected.source === "aliyun" && (
                <>
                  {selected.status === "stopped" && (
                    <button
                      type="button"
                      className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px]"
                      onClick={() => void act(selected, "start")}
                    >
                      {tt("开机")}
                    </button>
                  )}
                  {selected.status === "running" && (
                    <button
                      type="button"
                      className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px]"
                      onClick={() => void act(selected, "stop")}
                    >
                      {tt("停机")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded-lg border border-rose-200 px-3 py-1.5 text-[12px] text-rose-700"
                    onClick={() => setConfirmRelease(selected)}
                  >
                    {tt("释放")}
                  </button>
                </>
              )}
              {selected.source === "byo" && (
                <>
                  {selected.status === "pending" && (
                    <button
                      type="button"
                      className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px]"
                      onClick={() => openConnect(selected)}
                    >
                      {tt("等待安装 · 查看命令")}
                    </button>
                  )}
                  {selected.status === "enrolled" && (
                    <button
                      type="button"
                      className="rounded-lg bg-amber-900 px-3 py-1.5 text-[12px] font-medium text-white"
                      onClick={() => openConnect(selected)}
                    >
                      {tt("确认")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded-lg border border-rose-200 px-3 py-1.5 text-[12px] text-rose-700"
                    onClick={() => void act(selected, "delete")}
                  >
                    {tt("移除")}
                  </button>
                </>
              )}
            </div>
            {selected.node_fingerprint && (
              <p className="mt-3 break-all font-mono text-[13px] text-neutral-800">
                {tt("指纹")} {selected.node_fingerprint}
              </p>
            )}
            {selected.node_run_as && (
              <p className="mt-1 text-[12px] text-neutral-600">
                {tt("运行身份")} {selected.node_run_as}
                {selected.node_cpus != null || selected.node_mem_bytes
                  ? ` · ${selected.node_cpus ?? "—"} / ${formatMemBytes(selected.node_mem_bytes)}`
                  : ""}
              </p>
            )}
            {usage && (
              <div className="mt-4 text-[12px] text-neutral-600">
                {tt("用量")}{" "}
                {formatMinor(usage.total.amount_minor, usage.total.currency)}
                {" · "}
                {tt("当前每小时")}{" "}
                {formatMinor(
                  usage.hourly_now.amount_minor,
                  usage.hourly_now.currency,
                )}
              </div>
            )}
            <ol className="mt-4 space-y-2" data-oceanleo-cc-events>
              {events.map((event) => (
                <li key={event.id} className="text-[12px] text-neutral-500">
                  <span className="text-neutral-400">{event.created_at}</span>{" "}
                  {tt(eventKindLabel(event.kind))}
                </li>
              ))}
              {events.length === 0 && (
                <li className="text-[12px] text-neutral-400">
                  {tt("还没有事件")}
                </li>
              )}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
