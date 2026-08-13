"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { Modal as SharedModal } from "../ui";

const DESKTOP_QUERY = "(min-width: 1024px)";

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function subscribeToDesktop(change: () => void) {
  if (typeof window === "undefined") return () => {};
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
}

function desktopSnapshot() {
  return typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches;
}

function useDesktopLayout() {
  return useSyncExternalStore(subscribeToDesktop, desktopSnapshot, () => false);
}

export interface ProjectWorkspaceFrameProps {
  /** Top-level project identity, navigation, and page actions. */
  top?: ReactNode;
  /** Primary workspace content. */
  children: ReactNode;
  /** Configuration or supporting content shown beside the main workspace. */
  config?: ReactNode;
  /** Persistent content below the main workspace, such as a composer. */
  bottom?: ReactNode;
  className?: string;
  topClassName?: string;
  bodyClassName?: string;
  mainClassName?: string;
  configClassName?: string;
  bottomClassName?: string;
  /** Visible text for the narrow-screen configuration trigger. */
  mobileConfigLabel?: ReactNode;
  /** Accessible name for the configuration region. */
  configAriaLabel?: string;
  closeConfigLabel?: string;
  configId?: string;
  defaultConfigOpen?: boolean;
  configOpen?: boolean;
  onConfigOpenChange?: (open: boolean) => void;
}

/**
 * Project page geometry only. Data fetching and project state remain with the
 * consumer so the same frame can host every project-backed experience.
 */
export function ProjectWorkspaceFrame({
  top,
  children,
  config,
  bottom,
  className,
  topClassName,
  bodyClassName,
  mainClassName,
  configClassName,
  bottomClassName,
  mobileConfigLabel = "Configuration",
  configAriaLabel = "Configuration",
  closeConfigLabel = "Close configuration",
  configId,
  defaultConfigOpen = false,
  configOpen,
  onConfigOpenChange,
}: ProjectWorkspaceFrameProps) {
  const generatedConfigId = useId();
  const resolvedConfigId = configId ?? `${generatedConfigId}-config`;
  const hasConfig = config != null;
  const isDesktop = useDesktopLayout();
  const [uncontrolledConfigOpen, setUncontrolledConfigOpen] =
    useState(defaultConfigOpen);
  const isControlled = configOpen !== undefined;
  const resolvedConfigOpen = isControlled
    ? configOpen
    : uncontrolledConfigOpen;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousMobileOpenRef = useRef(false);

  const changeConfigOpen = useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) setUncontrolledConfigOpen(nextOpen);
      onConfigOpenChange?.(nextOpen);
    },
    [isControlled, onConfigOpenChange],
  );

  useEffect(() => {
    if (isDesktop) {
      previousMobileOpenRef.current = false;
      return;
    }
    const wasOpen = previousMobileOpenRef.current;
    if (resolvedConfigOpen && !wasOpen) {
      closeRef.current?.focus({ preventScroll: true });
    } else if (!resolvedConfigOpen && wasOpen) {
      triggerRef.current?.focus({ preventScroll: true });
    }
    previousMobileOpenRef.current = resolvedConfigOpen;
  }, [isDesktop, resolvedConfigOpen]);

  useEffect(() => {
    if (isDesktop || !resolvedConfigOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isDesktop, resolvedConfigOpen]);

  useEffect(() => {
    if (isDesktop || !resolvedConfigOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      changeConfigOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [changeConfigOpen, isDesktop, resolvedConfigOpen]);

  return (
    <div
      data-project-workspace-frame
      className={classNames(
        "flex min-h-0 min-w-0 flex-col bg-[var(--bg,#f7f7f5)] text-[var(--fg,#292524)]",
        className,
      )}
    >
      {(top != null || hasConfig) && (
        <header
          data-project-workspace-top
          className={classNames(
            "flex min-w-0 shrink-0 items-center gap-3 border-b border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-4 py-3",
            topClassName,
          )}
        >
          <div className="min-w-0 flex-1">{top}</div>
          {hasConfig && (
            <button
              ref={triggerRef}
              type="button"
              aria-controls={resolvedConfigId}
              aria-expanded={isDesktop || resolvedConfigOpen}
              aria-haspopup="dialog"
              data-project-config-trigger
              className="inline-flex shrink-0 items-center justify-center rounded-lg border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-3 py-2 text-sm font-medium text-[var(--fg,#292524)] transition hover:bg-[var(--surface,#f5f5f4)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent,#4f46e5)] lg:hidden"
              onClick={() => changeConfigOpen(true)}
            >
              {mobileConfigLabel}
            </button>
          )}
        </header>
      )}

      <div
        data-project-workspace-body
        className={classNames(
          "grid min-h-0 min-w-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_clamp(20rem,24vw,22.5rem)]",
          bodyClassName,
        )}
      >
        <main
          data-project-workspace-main
          className={classNames("min-h-0 min-w-0", mainClassName)}
        >
          {children}
        </main>

        {hasConfig && (
          <>
            <button
              type="button"
              tabIndex={-1}
              aria-hidden={!resolvedConfigOpen}
              aria-label={closeConfigLabel}
              data-project-config-backdrop
              className={classNames(
                "fixed inset-0 z-40 bg-black/40 transition-opacity lg:hidden",
                resolvedConfigOpen
                  ? "pointer-events-auto opacity-100"
                  : "pointer-events-none opacity-0",
              )}
              onClick={() => changeConfigOpen(false)}
            />
            <aside
              id={resolvedConfigId}
              role={isDesktop ? "complementary" : "dialog"}
              aria-modal={isDesktop ? undefined : true}
              aria-label={configAriaLabel}
              aria-hidden={!isDesktop && !resolvedConfigOpen}
              inert={!isDesktop && !resolvedConfigOpen ? true : undefined}
              tabIndex={-1}
              data-project-workspace-config
              data-mobile-open={resolvedConfigOpen || undefined}
              className={classNames(
                "fixed inset-y-0 right-0 z-50 flex w-[min(22.5rem,calc(100vw-2rem))] min-w-0 flex-col border-l border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] shadow-2xl transition-transform duration-200",
                resolvedConfigOpen
                  ? "translate-x-0"
                  : "translate-x-full",
                "lg:static lg:z-auto lg:h-full lg:w-auto lg:translate-x-0 lg:rounded-xl lg:border lg:shadow-sm lg:transition-none",
                configClassName,
              )}
            >
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border,#e7e5e4)] px-4 py-3 lg:hidden">
                <div className="min-w-0 truncate text-sm font-semibold">
                  {mobileConfigLabel}
                </div>
                <button
                  ref={closeRef}
                  type="button"
                  aria-label={closeConfigLabel}
                  data-project-config-close
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xl leading-none text-[var(--muted,#78716c)] transition hover:bg-[var(--surface,#f5f5f4)] hover:text-[var(--fg,#292524)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent,#4f46e5)]"
                  onClick={() => changeConfigOpen(false)}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">{config}</div>
            </aside>
          </>
        )}
      </div>

      {bottom != null && (
        <footer
          data-project-workspace-bottom
          className={classNames(
            "shrink-0 border-t border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)]",
            bottomClassName,
          )}
        >
          {bottom}
        </footer>
      )}
    </div>
  );
}

export interface ProjectTabItem<Value extends string = string> {
  id: Value;
  label: ReactNode;
  disabled?: boolean;
  tabId?: string;
  panelId?: string;
}

export interface ProjectTabNavProps<Value extends string = string> {
  tabs: readonly ProjectTabItem<Value>[];
  activeId: Value;
  onChange: (id: Value) => void;
  ariaLabel?: string;
  className?: string;
  tabClassName?: string;
}

/** A horizontally scrollable, roving-focus tab list. */
export function ProjectTabNav<Value extends string = string>({
  tabs,
  activeId,
  onChange,
  ariaLabel,
  className,
  tabClassName,
}: ProjectTabNavProps<Value>) {
  const generatedId = useId();
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const activateAt = (
    index: number,
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    const tab = tabs[index];
    if (!tab || tab.disabled) return;
    event.preventDefault();
    buttonRefs.current[index]?.focus({ preventScroll: true });
    onChange(tab.id);
  };

  const onTabKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) => {
    if (tabs.length === 0) return;
    if (event.key === "Home") {
      const first = tabs.findIndex((tab) => !tab.disabled);
      if (first >= 0) activateAt(first, event);
      return;
    }
    if (event.key === "End") {
      for (let index = tabs.length - 1; index >= 0; index -= 1) {
        if (!tabs[index]?.disabled) {
          activateAt(index, event);
          return;
        }
      }
      return;
    }
    const direction =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!direction) return;
    for (let distance = 1; distance <= tabs.length; distance += 1) {
      const index =
        (currentIndex + direction * distance + tabs.length) % tabs.length;
      if (!tabs[index]?.disabled) {
        activateAt(index, event);
        return;
      }
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      data-project-tab-nav
      className={classNames(
        "flex min-w-0 max-w-full items-stretch gap-1 overflow-x-auto overscroll-x-contain border-b border-[var(--border,#e7e5e4)]",
        className,
      )}
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === activeId;
        return (
          <button
            key={tab.id}
            ref={(node) => {
              buttonRefs.current[index] = node;
            }}
            id={tab.tabId ?? `${generatedId}-tab-${index}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={tab.panelId}
            tabIndex={selected ? 0 : -1}
            disabled={tab.disabled}
            data-project-tab={tab.id}
            className={classNames(
              "relative shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent,#4f46e5)] disabled:cursor-not-allowed disabled:opacity-50",
              selected
                ? "border-[var(--accent,#4f46e5)] text-[var(--fg,#292524)]"
                : "border-transparent text-[var(--muted,#78716c)] hover:border-[var(--border,#e7e5e4)] hover:text-[var(--fg,#292524)]",
              tabClassName,
            )}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onTabKeyDown(event, index)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export interface ProjectToolbarProps {
  search?: ReactNode;
  controls?: ReactNode;
  children?: ReactNode;
  ariaLabel?: string;
  className?: string;
  searchClassName?: string;
  controlsClassName?: string;
}

export function ProjectToolbar({
  search,
  controls,
  children,
  ariaLabel,
  className,
  searchClassName,
  controlsClassName,
}: ProjectToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label={ariaLabel}
      data-project-toolbar
      className={classNames(
        "flex min-w-0 flex-col gap-3 rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] p-3 sm:flex-row sm:items-center",
        className,
      )}
    >
      {search != null && (
        <div
          data-project-toolbar-search
          className={classNames("min-w-0 flex-1", searchClassName)}
        >
          {search}
        </div>
      )}
      {(controls != null || children != null) && (
        <div
          data-project-toolbar-controls
          className={classNames(
            "flex min-w-0 flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end",
            controlsClassName,
          )}
        >
          {controls}
          {children}
        </div>
      )}
    </div>
  );
}

export interface ProjectEmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function ProjectEmptyState({
  icon,
  title,
  description,
  action,
  children,
  className,
}: ProjectEmptyStateProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      data-project-empty-state
      className={classNames(
        "flex min-h-48 min-w-0 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-6 py-10 text-center",
        className,
      )}
    >
      {icon != null && (
        <div
          aria-hidden="true"
          data-project-empty-state-icon
          className="mb-3 text-3xl text-[var(--muted,#78716c)]"
        >
          {icon}
        </div>
      )}
      <h2
        id={titleId}
        className="text-base font-semibold text-[var(--fg,#292524)]"
      >
        {title}
      </h2>
      {description != null && (
        <div className="mt-1 max-w-xl text-sm leading-6 text-[var(--muted,#78716c)]">
          {description}
        </div>
      )}
      {children}
      {action != null && (
        <div data-project-empty-state-action className="mt-5">
          {action}
        </div>
      )}
    </section>
  );
}

export interface ProjectConfigCardAction {
  label: ReactNode;
  onClick: () => void;
  ariaLabel?: string;
  disabled?: boolean;
}

export interface ProjectConfigCardProps {
  title: ReactNode;
  count?: ReactNode;
  summary?: ReactNode;
  children?: ReactNode;
  addAction?: ProjectConfigCardAction;
  openAction?: ProjectConfigCardAction;
  className?: string;
}

export function ProjectConfigCard({
  title,
  count,
  summary,
  children,
  addAction,
  openAction,
  className,
}: ProjectConfigCardProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      data-project-config-card
      className={classNames(
        "rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] p-4 shadow-sm",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3
              id={titleId}
              className="min-w-0 truncate text-sm font-semibold text-[var(--fg,#292524)]"
            >
              {title}
            </h3>
            {count != null && (
              <span
                data-project-config-count
                className="shrink-0 rounded-full bg-[var(--surface,#f5f5f4)] px-2 py-0.5 text-xs font-medium text-[var(--muted,#78716c)]"
              >
                {count}
              </span>
            )}
          </div>
          {summary != null && (
            <div className="mt-1 text-sm leading-5 text-[var(--muted,#78716c)]">
              {summary}
            </div>
          )}
        </div>
        {addAction && (
          <button
            type="button"
            aria-label={addAction.ariaLabel}
            disabled={addAction.disabled}
            data-project-config-action="add"
            className="shrink-0 rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 py-1.5 text-sm font-medium text-[var(--fg,#292524)] transition hover:bg-[var(--surface,#f5f5f4)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent,#4f46e5)] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={addAction.onClick}
          >
            {addAction.label}
          </button>
        )}
      </div>
      {children != null && <div className="mt-3">{children}</div>}
      {openAction && (
        <button
          type="button"
          aria-label={openAction.ariaLabel}
          disabled={openAction.disabled}
          data-project-config-action="open"
          className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-[var(--accent,#4f46e5)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent,#4f46e5)] disabled:cursor-not-allowed disabled:opacity-50"
          onClick={openAction.onClick}
        >
          {openAction.label}
        </button>
      )}
    </section>
  );
}

export interface ProjectModalProps {
  open?: boolean;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
}

/** Project-neutral content structure over the package's accessible Modal. */
export function ProjectModal({
  open = true,
  title,
  children,
  footer,
  onClose,
  closeLabel = "Close",
  className,
  headerClassName,
  bodyClassName,
  footerClassName,
}: ProjectModalProps) {
  const titleId = useId();
  if (!open) return null;

  return (
    <SharedModal
      onClose={onClose}
      labelledBy={titleId}
      className={classNames(
        "max-h-[min(44rem,calc(100dvh-2rem))] max-w-2xl overflow-hidden bg-[var(--card,#fff)] text-[var(--fg,#292524)]",
        className,
      )}
    >
      <div className="flex max-h-[min(44rem,calc(100dvh-2rem))] min-h-0 flex-col">
        <header
          className={classNames(
            "flex shrink-0 items-center gap-3 border-b border-[var(--border,#e7e5e4)] px-5 py-4",
            headerClassName,
          )}
        >
          <h2 id={titleId} className="min-w-0 flex-1 text-base font-semibold">
            {title}
          </h2>
          <button
            type="button"
            aria-label={closeLabel}
            data-project-modal-close
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xl leading-none text-[var(--muted,#78716c)] transition hover:bg-[var(--surface,#f5f5f4)] hover:text-[var(--fg,#292524)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent,#4f46e5)]"
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div
          data-project-modal-body
          className={classNames(
            "min-h-0 flex-1 overflow-y-auto px-5 py-4",
            bodyClassName,
          )}
        >
          {children}
        </div>
        {footer != null && (
          <footer
            data-project-modal-footer
            className={classNames(
              "flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--border,#e7e5e4)] px-5 py-4",
              footerClassName,
            )}
          >
            {footer}
          </footer>
        )}
      </div>
    </SharedModal>
  );
}
