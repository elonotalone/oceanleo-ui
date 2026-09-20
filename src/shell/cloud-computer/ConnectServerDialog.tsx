"use client";

import { useEffect, useState } from "react";
import {
  CloudComputerError,
  type CloudComputerClient,
} from "../../lib/cloud-computer-api";
import { useUI } from "../../i18n/ui/useUI";
import { Modal } from "../../ui";

export function ConnectServerDialog({
  client,
  onClose,
  onCreated,
}: {
  client: CloudComputerClient;
  onClose: () => void;
  onCreated: () => void;
}) {
  const tt = useUI();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installCommand, setInstallCommand] = useState<string | null>(null);
  const [computerId, setComputerId] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!computerId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const row = await client.getComputer(computerId);
        if (!cancelled && row.node_online) setOnline(true);
      } catch {
        /* keep waiting */
      }
    };
    const timer = setInterval(() => void tick(), 5000);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [client, computerId]);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(tt("请填写电脑名字"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await client.createByoComputer({ name: trimmed });
      setInstallCommand(created.install_command);
      setComputerId(created.computer.id);
      onCreated();
    } catch (err) {
      setError(err instanceof CloudComputerError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function copyCommand() {
    if (!installCommand) return;
    try {
      await navigator.clipboard.writeText(installCommand);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-lg" labelledBy="oceanleo-cc-byo-title">
      <div className="p-5" data-oceanleo-cc-connect-dialog>
        <h2
          id="oceanleo-cc-byo-title"
          className="text-[15px] font-semibold text-neutral-900"
        >
          {tt("接入我的服务器")}
        </h2>
        {!installCommand ? (
          <div className="mt-4 space-y-4">
            <label className="block text-[12px] text-neutral-600">
              {tt("名字")}
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-[13px] outline-none"
                aria-label={tt("名字")}
              />
            </label>
            {error && <p className="text-[12px] text-rose-600">{tt(error)}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-neutral-200 px-3.5 py-1.5 text-[13px]"
              >
                {tt("取消")}
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy}
                className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
              >
                {busy ? tt("生成命令中…") : tt("生成安装命令")}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-[12px] text-neutral-500">
              {tt("在自己的服务器上运行下面这一行，跑完这台机器会出现在列表并显示在线。")}
            </p>
            <pre className="overflow-x-auto rounded-xl bg-neutral-950 px-3 py-2 text-[11px] text-neutral-100">
              {installCommand}
            </pre>
            <button
              type="button"
              onClick={() => void copyCommand()}
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px]"
            >
              {copied ? tt("已复制") : tt("复制")}
            </button>
            <p
              className="text-[12px] text-neutral-500"
              data-oceanleo-cc-waiting-online
            >
              {online ? tt("节点已上线") : tt("等待上线…")}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
