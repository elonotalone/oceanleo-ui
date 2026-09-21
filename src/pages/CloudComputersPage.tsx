"use client";

import { useEffect, useRef, useState } from "react";
import {
  COMPUTER_EVENT_KIND_LABEL,
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
import {
  computerDisplayState,
  isConnectedComputer,
  isPendingComputer,
  type ComputerDisplayState,
} from "../shell/cloud-computer/computer-state";

export interface CloudComputersPageProps {
  client?: CloudComputerClient;
}

export interface CloudComputersSectionProps {
  client?: CloudComputerClient;
  autoFocus?: boolean;
}

const CONNECTED_CHIP: Record<
  Extract<ComputerDisplayState, "ready" | "offline" | "stopped" | "unpaid">,
  string
> = {
  ready: "在线",
  offline: "离线",
  stopped: "已停机",
  unpaid: "欠费",
};

const PENDING_NEXT_STEP: Record<
  Extract<
    ComputerDisplayState,
    "provisioning" | "pending_install" | "pending_confirm" | "error"
  >,
  string
> = {
  provisioning: "正在开通",
  pending_install: "安装命令还没在服务器上运行",
  pending_confirm: "节点已上线，请核对指纹后确认",
  error: "开通失败",
};

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

function chipClass(state: ComputerDisplayState): string {
  if (state === "ready") return "bg-emerald-50 text-emerald-700";
  if (state === "unpaid" || state === "error") return "bg-rose-50 text-rose-700";
  if (state === "pending_confirm" || state === "pending_install" || state === "provisioning") {
    return "bg-amber-100 text-amber-900";
  }
  return "bg-neutral-100 text-neutral-600";
}

export function CloudComputersSection({
  client,
  autoFocus = false,
}: CloudComputersSectionProps) {
  const api = client ?? cloudComputerApi;
  const tt = useUI();
  const cn = currentDomainFamily() === "cn";
  const sectionRef = useRef<HTMLElement | null>(null);
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

  const connected = computers.filter(isConnectedComputer);
  const pending = computers.filter(isPendingComputer);
  const selected = connected.find((item) => item.id === selectedId) ?? null;

  async function refresh() {
    const data = await api.listComputers();
    const items = data.items || [];
    setComputers(items);
    setPageError(null);
    return items;
  }

  useEffect(() => {
    if (!autoFocus) return;
    const node = sectionRef.current;
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ block: "start" });
    }
  }, [autoFocus]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
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
  }, [api]);

  useEffect(() => {
    if (!selected) {
      setEvents([]);
      setUsage(null);
      return;
    }
    let alive = true;
    Promise.all([
      api.listComputerEvents(selected.id),
      api.getUsage(selected.id).catch(() => null),
    ])
      .then(([eventPayload, usagePayload]) => {
        if (!alive) return;
        setEvents(eventPayload.items || []);
        setUsage(usagePayload);
      })
      .catch(() => {
        if (!alive) return;
        setEvents([]);
      });
    return () => {
      alive = false;
    };
  }, [api, selected]);

  async function saveRename(computer: Computer) {
    const next = renameValue.trim();
    if (!next) return;
    await api.renameComputer(computer.id, next);
    setRenameId(null);
    await refresh();
  }

  async function act(computer: Computer, op: "start" | "stop" | "delete") {
    try {
      if (op === "start") await api.startComputer(computer.id);
      if (op === "stop") await api.stopComputer(computer.id);
      if (op === "delete") await api.deleteComputer(computer.id);
      setConfirmRelease(null);
      const items = await refresh();
      if (op === "delete") {
        const still = items.filter(isConnectedComputer);
        setSelectedId((current) =>
          current === computer.id ? (still[0]?.id ?? null) : current,
        );
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

  const empty = !loading && connected.length === 0 && pending.length === 0;

  return (
    <section
      ref={sectionRef}
      id="oceanleo-cloud-computers"
      className="space-y-4"
      data-oceanleo-cc-section
      data-oceanleo-cc-page=""
    >
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
          client={api}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            void refresh();
          }}
        />
      )}
      {connectOpen && (
        <ConnectServerDialog
          key={connectResume?.id ?? "new"}
          client={api}
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-neutral-900">
          {tt("云电脑")}
        </h2>
        {!cn && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-oceanleo-cc-buy
              onClick={() => setCreateOpen(true)}
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px]"
            >
              {tt("购买云电脑")}
            </button>
            <button
              type="button"
              data-oceanleo-cc-connect
              onClick={() => openConnect(null)}
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px]"
            >
              {tt("连接我的服务器")}
            </button>
          </div>
        )}
        {cn && (
          <button
            type="button"
            data-oceanleo-cc-connect
            onClick={() => openConnect(null)}
            className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px]"
          >
            {tt("连接我的服务器")}
          </button>
        )}
      </div>

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
      ) : (
        <>
          {pending.length > 0 && (
            <div
              className="space-y-2"
              data-oceanleo-cc-pending-list
            >
              <h3 className="text-[13px] font-medium text-neutral-700">
                {tt("接入中")}
              </h3>
              {pending.map((computer) => {
                const state = computerDisplayState(computer);
                return (
                  <div
                    key={computer.id}
                    data-oceanleo-cc-card={computer.id}
                    data-oceanleo-cc-card-kind="pending"
                    data-oceanleo-cc-card-status={computer.status}
                    data-oceanleo-cc-display-state={state}
                    className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[14px] font-medium text-neutral-900">
                        {computer.name}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] ${chipClass(state)}`}
                      >
                        {computer.source === "aliyun"
                          ? tt("阿里云")
                          : tt("自有服务器")}
                      </span>
                    </div>
                    <p className="mt-2 text-[12px] text-neutral-700">
                      {tt(
                        PENDING_NEXT_STEP[
                          state as keyof typeof PENDING_NEXT_STEP
                        ] || state,
                      )}
                    </p>
                    {state === "provisioning" && (
                      <p
                        className="mt-2 text-[12px] text-neutral-500"
                        data-oceanleo-cc-provisioning
                      >
                        {tt("正在开通")}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {state === "pending_install" && (
                        <button
                          type="button"
                          className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-[12px]"
                          data-oceanleo-cc-view-command
                          onClick={() => openConnect(computer)}
                        >
                          {tt("查看安装命令")}
                        </button>
                      )}
                      {state === "pending_confirm" && (
                        <button
                          type="button"
                          className="rounded-lg bg-amber-900 px-3 py-1.5 text-[12px] font-medium text-white"
                          data-oceanleo-cc-confirm-open
                          onClick={() => openConnect(computer)}
                        >
                          {tt("核对并确认")}
                        </button>
                      )}
                      {(state === "pending_install" ||
                        state === "pending_confirm" ||
                        state === "error") && (
                        <button
                          type="button"
                          className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-[12px] text-rose-700"
                          data-oceanleo-cc-pending-cancel
                          onClick={() => void act(computer, "delete")}
                        >
                          {state === "error" ? tt("移除") : tt("取消")}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {empty && (
            <div
              className="rounded-2xl border border-neutral-200 bg-white p-6"
              data-oceanleo-cc-empty
            >
              <h3 className="text-[15px] font-semibold text-neutral-900">
                {tt("还没有云电脑")}
              </h3>
              <p className="mt-1 text-[12px] text-neutral-500">
                {tt("按阿里云成本价开通一台，或把已有服务器接进来。")}
              </p>
            </div>
          )}
          {connected.length > 0 && (
            <div
              className="grid gap-3 sm:grid-cols-2"
              data-oceanleo-cc-connected-list
            >
              {connected.map((computer) => {
                const state = computerDisplayState(computer);
                const chip =
                  CONNECTED_CHIP[
                    state as keyof typeof CONNECTED_CHIP
                  ] || state;
                return (
                  <div
                    key={computer.id}
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      setSelectedId((current) =>
                        current === computer.id ? computer.id : computer.id,
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedId(computer.id);
                      }
                    }}
                    data-oceanleo-cc-card={computer.id}
                    data-oceanleo-cc-card-kind="connected"
                    data-oceanleo-cc-card-status={computer.status}
                    data-oceanleo-cc-display-state={state}
                    className={`rounded-2xl border p-4 text-left ${
                      selectedId === computer.id
                        ? "border-neutral-900"
                        : "border-neutral-200 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[14px] font-medium text-neutral-900">
                        {computer.name}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] ${chipClass(state)}`}
                      >
                        {tt(chip)}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1 text-[12px] text-neutral-500">
                      <div>
                        {computer.source === "aliyun"
                          ? tt("阿里云")
                          : tt("自有服务器")}
                      </div>
                      <div>
                        {tt("公网 IP")}{" "}
                        {computer.node_public_ip ||
                          computer.public_ip ||
                          tt("暂无")}
                      </div>
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
                    <div
                      className="mt-3 flex flex-wrap gap-2"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      {computer.source === "aliyun" && (
                        <>
                          {state === "stopped" && (
                            <button
                              type="button"
                              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px]"
                              onClick={() => void act(computer, "start")}
                            >
                              {tt("开机")}
                            </button>
                          )}
                          {(state === "ready" || state === "offline") && (
                            <button
                              type="button"
                              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px]"
                              onClick={() => void act(computer, "stop")}
                            >
                              {tt("停机")}
                            </button>
                          )}
                          <button
                            type="button"
                            className="rounded-lg border border-rose-200 px-3 py-1.5 text-[12px] text-rose-700"
                            onClick={() => setConfirmRelease(computer)}
                          >
                            {tt("释放")}
                          </button>
                        </>
                      )}
                      {computer.source === "byo" && (
                        <button
                          type="button"
                          className="rounded-lg border border-rose-200 px-3 py-1.5 text-[12px] text-rose-700"
                          onClick={() => void act(computer, "delete")}
                        >
                          {tt("移除")}
                        </button>
                      )}
                      <button
                        type="button"
                        className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px]"
                        onClick={() => {
                          setRenameId(computer.id);
                          setRenameValue(computer.name);
                        }}
                      >
                        {tt("改名")}
                      </button>
                    </div>
                    {renameId === computer.id && (
                      <form
                        className="mt-2 flex gap-2"
                        onClick={(event) => event.stopPropagation()}
                        onSubmit={(event) => {
                          event.preventDefault();
                          void saveRename(computer);
                        }}
                      >
                        <input
                          value={renameValue}
                          onChange={(event) =>
                            setRenameValue(event.target.value)
                          }
                          className="rounded-lg border border-neutral-200 px-2 py-1 text-[13px]"
                          aria-label={tt("名字")}
                        />
                        <button type="submit" className="text-[12px]">
                          {tt("保存")}
                        </button>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {selected && (
        <section
          className="rounded-2xl border border-neutral-200 bg-white p-5"
          data-oceanleo-cc-detail
        >
          <h3 className="text-[15px] font-semibold">{selected.name}</h3>
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
    </section>
  );
}

export function CloudComputersPage({
  client = cloudComputerApi,
}: CloudComputersPageProps) {
  const tt = useUI();
  return (
    <div className="px-8 py-6">
      <PageHeader title={tt("云电脑")} backHref="/" />
      <div className="mx-auto mt-7 max-w-4xl">
        <CloudComputersSection client={client} autoFocus />
      </div>
    </div>
  );
}
