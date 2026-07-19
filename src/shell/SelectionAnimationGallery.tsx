"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CompositionEvent,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { AdvancedEditorIcon } from "./AdvancedEditorIcon";
import {
  ANIMATION_PRESET_IDS,
  selectionRequestId,
  type SelectionCommand,
  type SelectionContext,
  type SelectionControl,
  type SelectionControlValue,
} from "./selection-context";

const COMMAND_ID = /^[a-z0-9][a-z0-9_.:-]{0,79}$/i;

export function SelectionAnimationGallery({
  control,
  selection,
  onCommand,
  accent,
}: {
  control: SelectionControl;
  selection: Pick<SelectionContext, "id" | "revision" | "epoch">;
  onCommand: (command: SelectionCommand) => void;
  accent: string;
}) {
  const gallery = control.animationGallery;
  const launcherRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(new Set<string>());
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const dialogId = `selection-animation-${useId().replace(/:/g, "")}`;
  const presets = useMemo(
    () =>
      (gallery?.presets || []).filter(
        (preset) =>
          ANIMATION_PRESET_IDS.includes(preset.id) &&
          COMMAND_ID.test(preset.applyCommandId),
      ),
    [gallery?.presets],
  );
  const current = presets.find((preset) => preset.current);
  const accessibleLabel =
    control.disabled && control.unavailableReason
      ? `${control.label}：${control.unavailableReason}`
      : control.label;

  const emit = (
    commandId: string,
    value?: SelectionControlValue,
    history: "document" | "view" = "document",
  ) => {
    if (!COMMAND_ID.test(commandId)) return;
    onCommand({
      requestId: selectionRequestId(),
      selectionId: selection.id,
      controlId: commandId,
      ...(value !== undefined ? { value } : {}),
      ...(selection.revision !== undefined
        ? { selectionRevision: selection.revision }
        : {}),
      ...(selection.epoch !== undefined
        ? { selectionEpoch: selection.epoch }
        : {}),
      ...(history === "view" ? { history } : {}),
    });
  };

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const launcher = launcherRef.current?.getBoundingClientRect();
      if (!launcher) return;
      const viewport = window.visualViewport;
      const viewportLeft = viewport?.offsetLeft || 0;
      const viewportTop = viewport?.offsetTop || 0;
      const viewportRight = viewportLeft + (viewport?.width || window.innerWidth);
      const viewportBottom =
        viewportTop + (viewport?.height || window.innerHeight);
      const width = Math.min(448, viewportRight - viewportLeft - 16);
      const left = Math.min(
        Math.max(viewportLeft + 8, launcher.left),
        viewportRight - width - 8,
      );
      const estimatedHeight = Math.min(560, viewportBottom - viewportTop - 16);
      const below = launcher.bottom + 8;
      const top =
        below + estimatedHeight <= viewportBottom
          ? below
          : Math.max(viewportTop + 8, launcher.top - estimatedHeight - 8);
      setPosition({ left, top });
    };
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        launcherRef.current?.contains(target) ||
        dialogRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      launcherRef.current?.focus();
    };
    updatePosition();
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", keydown);
    window.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);
    queueMicrotask(() =>
      dialogRef.current
        ?.querySelector<HTMLElement>("button:not(:disabled), input, select")
        ?.focus(),
    );
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", keydown);
      window.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
    composingRef.current.clear();
  }, [selection.id, selection.epoch, selection.revision]);

  if (!gallery || !presets.length) return null;

  const finishComposition = (
    parameterId: string,
    commandId: string,
    event: CompositionEvent<HTMLInputElement>,
  ) => {
    composingRef.current.delete(parameterId);
    const value = Number(event.currentTarget.value);
    if (Number.isFinite(value)) emit(commandId, value);
  };

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        disabled={control.disabled}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl outline-none transition hover:bg-[var(--surface-hover,rgba(0,0,0,.06))] focus-visible:ring-2 focus-visible:ring-[var(--accent,#7c3aed)]/40"
        aria-label={accessibleLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        title={accessibleLabel}
        onClick={() => {
          if (!control.disabled) setOpen((value) => !value);
        }}
        style={current ? { color: accent } : undefined}
      >
        <AdvancedEditorIcon name={control.icon || "animate"} />
      </button>
      {open &&
        createPortal(
          <div
            ref={dialogRef}
            id={dialogId}
            role="dialog"
            aria-label={control.label}
            data-selection-animation-gallery
            data-reduced-motion-preview="explicit-only"
            className="fixed z-[2147483600] grid max-h-[min(35rem,calc(100dvh-1rem))] w-[min(28rem,calc(100dvw-1rem))] gap-3 overflow-y-auto rounded-2xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] p-3 text-[var(--fg,#292524)] shadow-2xl"
            style={{ ...position, "--accent": accent } as CSSProperties}
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {presets.map((preset) => (
                <div
                  key={preset.id}
                  data-animation-preset={preset.id}
                  data-animation-current={preset.current || undefined}
                  className="grid gap-1 rounded-xl border border-[var(--border,#e7e5e4)] p-1.5"
                >
                  <button
                    type="button"
                    className="grid min-h-16 place-items-center rounded-lg bg-[var(--surface-hover,rgba(0,0,0,.05))] px-2 text-center text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
                    aria-label={`应用${preset.label}`}
                    aria-pressed={preset.current || false}
                    onClick={() => emit(preset.applyCommandId, preset.id)}
                  >
                    <span aria-hidden="true" className="text-lg">
                      {preset.label.slice(0, 2)}
                    </span>
                    <span>{preset.label}</span>
                  </button>
                  {preset.preview &&
                    COMMAND_ID.test(preset.preview.commandId) && (
                      <button
                        type="button"
                        className="min-h-11 rounded-lg px-2 text-[11px] outline-none hover:bg-[var(--surface-hover,rgba(0,0,0,.06))] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
                        data-animation-preview-duration={
                          preset.preview.durationMs
                        }
                        onClick={() =>
                          emit(
                            preset.preview!.commandId,
                            preset.id,
                            "view",
                          )
                        }
                      >
                        预览
                      </button>
                    )}
                </div>
              ))}
            </div>
            {current?.parameters?.length ? (
              <div
                role="group"
                aria-label={`${current.label}参数`}
                className="grid gap-2 border-t border-[var(--divider,#e7e5e4)] pt-3"
              >
                {current.parameters
                  .filter((parameter) => COMMAND_ID.test(parameter.commandId))
                  .map((parameter) => (
                    <label
                      key={parameter.id}
                      className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-3 text-xs"
                    >
                      <span>{parameter.label}</span>
                      {parameter.kind === "select" ? (
                        <select
                          value={String(parameter.value)}
                          onChange={(event) =>
                            emit(parameter.commandId, event.target.value)
                          }
                          className="h-11 rounded-lg border border-[var(--border,#e7e5e4)] bg-transparent px-2"
                        >
                          {parameter.options?.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="number"
                          value={Number(parameter.value)}
                          min={parameter.min}
                          max={parameter.max}
                          step={parameter.step}
                          onCompositionStart={() =>
                            composingRef.current.add(parameter.id)
                          }
                          onCompositionEnd={(event) =>
                            finishComposition(
                              parameter.id,
                              parameter.commandId,
                              event,
                            )
                          }
                          onChange={(event) => {
                            if (
                              (event.nativeEvent as InputEvent).isComposing ||
                              composingRef.current.has(parameter.id)
                            ) {
                              return;
                            }
                            const value = Number(event.target.value);
                            if (Number.isFinite(value)) {
                              emit(parameter.commandId, value);
                            }
                          }}
                          className="h-11 rounded-lg border border-[var(--border,#e7e5e4)] bg-transparent px-2"
                        />
                      )}
                    </label>
                  ))}
              </div>
            ) : null}
            {(gallery.removeCommandId || gallery.clearCommandId) && (
              <div className="flex justify-end gap-2 border-t border-[var(--divider,#e7e5e4)] pt-3">
                {current &&
                  gallery.removeCommandId &&
                  COMMAND_ID.test(gallery.removeCommandId) && (
                    <button
                      type="button"
                      className="min-h-11 rounded-lg px-3 text-xs hover:bg-[var(--surface-hover,rgba(0,0,0,.06))]"
                      onClick={() =>
                        emit(gallery.removeCommandId!, current.id)
                      }
                    >
                      移除当前动效
                    </button>
                  )}
                {gallery.clearCommandId &&
                  COMMAND_ID.test(gallery.clearCommandId) && (
                    <button
                      type="button"
                      className="min-h-11 rounded-lg px-3 text-xs hover:bg-[var(--surface-hover,rgba(0,0,0,.06))]"
                      onClick={() => emit(gallery.clearCommandId!)}
                    >
                      清除动效
                    </button>
                  )}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
