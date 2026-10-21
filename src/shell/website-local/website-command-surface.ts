import type {
  PluginCommandResult,
  PluginAgentContext,
  PluginCommandSurfaceInput,
} from "../plugin-command/types";
import { boundedAgentContent } from "../plugin-command/bounded-agent-content";
import type { PluginCommandTarget } from "../plugin-command/types";
import type { WebsiteSectionKind, WebsiteSource } from "../website-source-carrier/website-source-schema";
import { WEBSITE_SECTION_KINDS } from "../website-source-carrier/website-source-schema";
import {
  addWebsitePage,
  addWebsiteSection,
  removeWebsitePage,
  setWebsiteTheme,
} from "./website-source-session";

export interface WebsiteCommandPort {
  source(): WebsiteSource;
  revision(): number;
  sourceReady(): boolean;
  apply(next: WebsiteSource): void;
  pageId?(): string;
  target?(): Omit<PluginCommandTarget, "workspaceScopeId" | "surfaceInstanceId"> | PluginCommandTarget | null;
}

function ok(message: string, revision?: number): PluginCommandResult {
  return {
    ok: true,
    message,
    ...(typeof revision === "number" ? { revision } : {}),
  };
}

function fail(message: string): PluginCommandResult {
  return { ok: false, message };
}

export function applyWebsiteCommand(
  source: WebsiteSource,
  id: string,
  params: Record<string, unknown> = {},
): { ok: true; source: WebsiteSource; message: string } | { ok: false; error: string } {
  if (id === "website.add-page") {
    const next = addWebsitePage(source, String(params.title || "新页面栏目"));
    if (next.pages.length === source.pages.length) {
      return { ok: false, error: "不能再加页面。" };
    }
    return { ok: true, source: next, message: `已加页面，现在共 ${next.pages.length} 页。` };
  }
  if (id === "website.add-section") {
    const pageId = String(params.pageId || source.pages[0]?.id || "");
    const kind = WEBSITE_SECTION_KINDS.includes(params.kind as WebsiteSectionKind)
      ? (params.kind as WebsiteSectionKind)
      : "content";
    const next = addWebsiteSection(source, pageId, kind);
    if (next.sections.length === source.sections.length) {
      return { ok: false, error: "不能再加区块。" };
    }
    return { ok: true, source: next, message: `已在当前页加入 ${kind} 区块。` };
  }
  if (id === "website.remove-page") {
    const pageId = String(params.pageId || source.pages.at(-1)?.id || "");
    const next = removeWebsitePage(source, pageId);
    if (next.pages.length === source.pages.length) {
      return { ok: false, error: "不能删掉这一页。" };
    }
    return { ok: true, source: next, message: `已删页面，现在共 ${next.pages.length} 页。` };
  }
  if (id === "website.set-theme-accent") {
    const accent = String(params.accent || "").trim();
    if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(accent)) {
      return { ok: false, error: "强调色要是 #RGB 或 #RRGGBB。" };
    }
    return {
      ok: true,
      source: setWebsiteTheme(source, { accent }),
      message: `已把强调色改成 ${accent}。`,
    };
  }
  return { ok: false, error: `网站编辑器没有「${id}」这条指令。` };
}

export function createWebsiteCommandSurface(
  port: WebsiteCommandPort,
): PluginCommandSurfaceInput {
  return {
    editorId: "website",
    ...(port.target ? { target: () => port.target?.() || null } : {}),
    agentContext: (): PluginAgentContext => {
      if (!port.sourceReady()) {
        return { ready: false, reason: "网站工程源尚未成功载入，当前页面结构不可读取。" };
      }
      const source = port.source();
      const selectedPageId = port.pageId?.() || source.pages[0]?.id || "";
      const selectedPage = source.pages.find((page) => page.id === selectedPageId) || null;
      return boundedAgentContent({
        selectedPageId,
        selectedPage,
        revision: port.revision(),
        // Keep the selected page before the whole site source so bounded
        // serialization cannot spend its budget on unrelated pages first.
        source,
      }, "这是当前 website-source 工程与所选页面的真实结构数据；没有打开或抓取站点预览，不能声称看见页面像素或运行时行为。");
    },
    describe() {
      if (!port.sourceReady()) return [];
      return [
        {
          id: "website.add-page",
          label: "加页面",
          summary: "在这份 website-source@1 工程里加一页。",
          mutates: true,
        },
        {
          id: "website.add-section",
          label: "加区块",
          summary: "在当前页加入一个结构化区块。",
          mutates: true,
          params: [
            {
              key: "kind",
              label: "区块种类",
              type: "enum",
              enumValues: WEBSITE_SECTION_KINDS.map((kind) => ({
                value: kind,
                label: kind,
              })),
            },
          ],
        },
        {
          id: "website.set-theme-accent",
          label: "改强调色",
          summary: "改主题强调色，写回同一份工程。",
          mutates: true,
          params: [{ key: "accent", label: "强调色", type: "string", required: true }],
        },
      ];
    },
    state() {
      const source = port.source();
      return {
        revision: port.revision(),
        sourceReady: port.sourceReady(),
        pages: source.pages.length,
        sections: source.sections.length,
        accent: source.theme.accent,
      };
    },
    run(id, params) {
      if (!port.sourceReady()) {
        return fail("网站工程还没载入，不能改。");
      }
      const applied = applyWebsiteCommand(port.source(), id, params || {});
      if (!applied.ok) return fail(applied.error);
      port.apply(applied.source);
      return ok(applied.message, port.revision());
    },
  };
}
