/** ACP mandates stdio MCP; GN1 supplies its bridge when HTTP is not advertised.
 * Shared task-composer controls. Program names never decide capabilities. */
export type ComposerSessionCapabilities = {
  /** OceanLeo's MCP transport is available for this session. */
  mcp?: boolean;
};

export function composerCapsFor(pane: "cloud" | "acp", sessionCapabilities: ComposerSessionCapabilities = { mcp: true }) {
  const cloud = pane === "cloud";
  return {
    leoSuggest: true,
    mentions: true,
    quickChips: true,
    getHelp: true,
    showPlugins: cloud || sessionCapabilities.mcp === true,
    showAppsBar: cloud || sessionCapabilities.mcp === true,
    showPayerSelector: cloud,
  };
}

/** A title remains useful before the model has named the task. */
export function taskHeaderTitle(title: string, firstUserMessage: string | null | undefined, emptyLabel: string): string {
  return title.trim() || firstUserMessage?.replace(/\s+/g, " ").trim() || emptyLabel;
}

/** The caller translates the template; the displayed program comes from data. */
export function taskComposerPlaceholder(custom: string | undefined, agentLabel: string, toolsOn: boolean,
  tt: (text: string, vars?: Record<string, string>) => string): string {
  return custom?.replace(/OceanLeo|\{agent\}/gi, agentLabel) ?? (toolsOn
    ? tt("继续追问，或上传文件让 {agent} 分析…", { agent: agentLabel })
    : tt("继续追问"));
}
