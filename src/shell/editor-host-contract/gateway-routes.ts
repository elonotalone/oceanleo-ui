/**
 * Gateway surface of the six editors and the works workbench. This is also the
 * input to oceanleo-app/scripts/generate-editor-gateway-routes.mjs. Add a route
 * here with its transport/offline policy before using it in an editor.
 * Signed storage URLs stay outside the authenticated gateway bridge.
 */
export type EditorGatewayRoute = {
  method: string;
  path: string;
  body: "json" | "binary" | "multipart";
  response: "json" | "binary" | "stream";
  purpose: string;
  label: string;
  scope: "account" | "artifact";
  maxRequestBytes: number;
  offline: "cacheable-read" | "queueable-write" | "online-only";
  fresh?: boolean;
  retry: "safe" | "idempotent-key" | "versioned" | "never-blind" | "never";
};
const MiB = 1024 * 1024;
function route(method: string, path: string, purpose: string, options: Partial<EditorGatewayRoute> = {}): EditorGatewayRoute {
  const read = method === "GET";
  return { method, path, purpose, body: "json", response: "json", label: purpose,
    scope: "account", maxRequestBytes: read || method === "DELETE" ? 0 : 2 * MiB,
    offline: "online-only", retry: read ? "safe" : "never", ...options };
}
const read = (path: string, purpose: string, options: Partial<EditorGatewayRoute> = {}) =>
  route("GET", path, purpose, { offline: "cacheable-read", ...options });
const post = (path: string, purpose: string, options: Partial<EditorGatewayRoute> = {}) => route("POST", path, purpose, options);
const live = { offline: "online-only" as const };
const stream = { response: "stream" as const, ...live };
const scoped = { scope: "artifact" as const };

export const EDITOR_GATEWAY_ROUTES: readonly EditorGatewayRoute[] = [
  read("/v1/library/items/{artifact_id}", "item"),
  post("/v1/library/items/{artifact_id}/renditions/{purpose}/url", "resign"),
  read("/v1/artifacts/{artifact_id}/revisions/{revision_id}/renditions/{purpose}", "rendition", live),
  read("/v1/artifacts/{artifact_id}/source", "source-grant", live),
  read("/v1/artifacts/{artifact_id}/revisions/{revision_id}/source-dependencies/{dependency_path+}", "dependency", stream),
  read("/v1/artifacts/{artifact_id}/edit-capability", "edit-capability", { ...scoped, ...live }),
  read("/v1/editor-sources/{digest}", "editor-source", stream),
  read("/v1/editor-drafts/{digest}", "editor-draft"),
  read("/v1/artifact-renditions/access/public", "public-rendition", stream),
  read("/v1/artifact-renditions/access/{grant}", "signed-rendition", stream),
  post("/v1/artifacts/{artifact_id}/staging", "staging", { ...scoped, body: "multipart", maxRequestBytes: 48 * MiB }),
  post("/v1/artifacts/{artifact_id}/revisions", "publish", { ...scoped, maxRequestBytes: 48 * MiB, retry: "never-blind" }),
  post("/v1/artifacts/ensure", "ensure", { retry: "idempotent-key", offline: "queueable-write" }),
  post("/v1/artifacts/{artifact_id}:fork", "fork", scoped),
  read("/v1/editor-working-copies/{artifact_id}", "working-copy", { ...scoped, fresh: true }),
  // CAS receipts are synchronous. A queued 202 must never look like a saved copy.
  route("PUT", "/v1/editor-working-copies/{artifact_id}", "working-copy-save", { ...scoped, body: "binary", maxRequestBytes: 48 * MiB, retry: "never-blind" }),
  post("/v1/editor-working-copies/{artifact_id}/published", "working-copy-published", scoped),
  post("/v1/database/upload", "upload", { body: "multipart", maxRequestBytes: 24 * MiB }),
  post("/v1/database/private-upload", "private-upload", { body: "multipart", maxRequestBytes: 24 * MiB }),
  post("/v1/media/upload/init", "upload-init"),
  post("/v1/media/upload/finalize", "upload-finalize"),
  post("/v1/media/import", "media-import"),
  post("/v1/editor-sources", "editor-source-save", { body: "multipart", maxRequestBytes: 48 * MiB }),
  read("/v1/library/uploads/{upload_id}", "library-upload-status", live),
  post("/v1/library/uploads", "library-upload-init"),
  post("/v1/library/uploads/{upload_id}/complete", "library-upload-complete"),
  read("/v1/folders/{folder_id}", "folder"),
  read("/v1/folders", "folders"),
  post("/v1/folders", "folder-create"),
  read("/v1/media/proxy", "media-proxy", stream),
  // Task membership is checked on every read; revoked content never uses an offline cache.
  read("/v1/tasks/{task_id}/artifacts", "task-artifacts", { ...live, fresh: true }),
  read("/v1/tasks/{task_id}/artifacts/{artifact_id}", "task-artifact", { ...live, fresh: true }),
  read("/v1/tasks/{task_id}/messages/{message_id}/attachments/{artifact_id}", "task-message-attachment", { ...live, response: "binary", fresh: true }),
  read("/v1/tasks/{task_id}/frames/{row_id}/attachments/{artifact_id}", "task-frame-attachment", { ...live, response: "binary", fresh: true }),
  read("/v1/convert/capabilities", "convert-capabilities"),
  post("/v1/convert/save", "convert-save", { ...live, body: "multipart", maxRequestBytes: 48 * MiB }),
  ...["office", "image", "media"].map(kind => post(`/v1/convert/${kind}`, `convert-${kind}`, { ...stream, body: "multipart", maxRequestBytes: 48 * MiB })),
  post("/v1/images/generate", "canvas-image-generate"),
  post("/v1/chat", "canvas-text"),
  post("/v1/audio/tts", "canvas-speech"),
  post("/v1/music/generate", "canvas-music"),
  post("/v1/video/render-timeline", "render-timeline", { maxRequestBytes: 8 * MiB }),
  read("/v1/video/render-timeline/{job_id}", "render-status", live),
  route("DELETE", "/v1/video/render-timeline/{job_id}", "render-cancel"),
  post("/v1/collab/tickets", "collab-ticket"),
  post("/v1/collab/rooms/{room_key}/grants", "collab-grant"),
  read("/v1/im/conversations", "collab-conversations", live),
  read("/v1/library/primary", "library-primary"),
  read("/v1/library/search", "library-search"),
  read("/v1/library/task-attachments/context", "library-task-attachments"),
  read("/v1/library/editable-shelf", "library-shelf"),
  read("/v1/library/mine", "library-mine"),
  read("/v1/library/favorites", "library-favorites"),
  post("/v1/artifact-bindings:batch", "material-bindings"),
  read("/v1/template-materials", "templates"),
  read("/v1/template-materials/{template_id}/preview", "template-preview", stream),
  read("/v1/template-materials/{template_id}/download", "template-download", stream),
  read("/v1/assets/library/starters/{asset_id}/view", "starter-asset", stream),
  read("/v1/assets/library/{asset_id}/view", "library-asset", stream),
  ...["edit", "upscale", "remove-bg"].map(action => post(`/v1/images/${action}`, `image-${action}`)),
  post("/v1/audio/asr", "transcribe"),
  post("/v1/audio/asr/status/{job_id}", "transcribe-status"),
  read("/v1/works/kinds", "work-kinds"),
  read("/v1/works", "works"),
  post("/v1/works/open", "work-open"),
  post("/v1/works/links", "work-link"),
  read("/v1/works/embed-check", "work-embed", live),
  read("/v1/works/{work_id}", "work"),
  route("PATCH", "/v1/works/{work_id}", "work-update"),
  route("DELETE", "/v1/works/{work_id}", "work-delete"),
  read("/v1/works/{work_id}/preview-source", "work-preview-source", live),
  route("PUT", "/v1/works/{work_id}/preview-source", "work-preview-source-save"),
  post("/v1/works/{work_id}/preview", "work-preview"),
  post("/v1/works/{work_id}/stop", "work-stop"),
  read("/v1/artifacts/{artifact_id}/website-source.zip", "work-source", stream),
  read("/v1/artifacts/{artifact_id}/website-preview", "work-artifact-preview", live),
  route("PUT", "/v1/artifacts/{artifact_id}/favorite", "favorite", scoped),
  post("/v1/creations", "legacy-publication", { maxRequestBytes: 8 * MiB }),
  post("/v1/database/thumbnail", "thumbnail"),
  read("/v1/link-icon", "link-icon", stream),
  read("/v1/template-materials/{template_id}/preview/manifest", "template-manifest"),
  read("/v1/devices", "work-preview-devices", live),
  read("/v1/devices/cloud-agent", "agent-computers", live),
  read("/v1/devices/{device_id}/tasks", "device-tasks", live),
  read("/v1/devices/tasks/{task_id}", "device-task", live),
  read("/v1/agent/tasks/{task_id}", "editor-task", live),
  read("/v1/agent/sessions", "editor-sessions"),
  read("/v1/agent/sessions/{session_id}", "editor-session", { fresh: true }),
  post("/v1/agent/sessions", "editor-session-create"),
  route("PUT", "/v1/agent/sessions/{session_id}/snapshot", "editor-session-snapshot", { retry: "versioned", offline: "queueable-write", maxRequestBytes: 8 * MiB }),
  route("PATCH", "/v1/agent/sessions/{session_id}/metadata", "editor-session-metadata"),
  post("/v1/agent/sessions/{session_id}/archive", "editor-session-archive"),
  read("/v1/orgs/{org_id}/mcp/connections", "work-connectors", live),
  read("/v1/mcp/apps/tools", "connector-tools", live),
  post("/v1/mcp/apps/resources/read", "connector-interface"),
  post("/v1/mcp/apps/tools/call", "connector-call"),
  post("/v1/im/conversations/{conversation_id}/messages", "collab-invite"),
  read("/v1/bay/assets/{asset_id}/open", "material-open", live),
  // Works use the same base-service panels as the website. Enumerate each verb;
  // a prefix allowlist here would also grant unrelated device/account actions.
  ...["", "/capabilities", "/access", "/create-flow/history", "/source/files", "/source/file",
    "/database/usage", "/database/schema", "/deployments", "/storage/binding", "/storage/buckets",
    "/storage/objects", "/domains", "/settings/secrets", "/settings/usage", "/analytics/summary",
    "/database/auth/users", "/runtime", "/runtime/logs", "/panels", "/connectors", "/publication"]
    .map(suffix => read(`/v1/website-projects/{project_id}${suffix}`, `work-service${suffix || "/project"}`, live)),
  ...["/create-flow/save", "/preview", "/database/query", "/deployments", "/storage/objects/sign-download",
    "/domains", "/domains/{domain}/verify", "/deployments/{deployment_id}/rollback", "/runtime/start",
    "/runtime/stop", "/runtime/restart", "/runtime/fix", "/runtime/checkpoint", "/panels/{panel_id}/wire",
    "/connectors/preset", "/publication/stop", "/publication/unpublish"]
    .map(suffix => post(`/v1/website-projects/{project_id}${suffix}`, `work-service${suffix}`)),
  route("PATCH", "/v1/website-projects/{project_id}/published-site-access", "work-access-save"),
  route("PUT", "/v1/website-projects/{project_id}/connectors/{slot_id}", "work-connector-save"),
  route("DELETE", "/v1/website-projects/{project_id}/storage/objects", "work-storage-delete", { maxRequestBytes: 2 * MiB }),
  route("DELETE", "/v1/website-projects/{project_id}/domains/{domain}", "work-domain-delete"),
  read("/v1/website-projects/{project_id}/panels/{panel_id}/data", "work-panel", live),
  read("/v1/website-projects/{project_id}/exports/code", "work-code-export", stream),
  read("/v1/website-projects/{project_id}/exports/database", "work-database-export", stream),
  // Screen previews are the existing remote-desktop interface, including its
  // consent checks at the gateway. These never bypass the device's own grants.
  post("/v1/devices/controllers", "screen-controller"),
  read("/v1/devices/{device_id}/settings", "screen-settings", live),
  route("DELETE", "/v1/devices/{device_id}/controllers/{grant_id}", "screen-controller-revoke"),
  route("PATCH", "/v1/devices/{device_id}/controllers/{grant_id}", "screen-controller-expiry"),
  post("/v1/devices/{device_id}/settings/operations", "screen-settings-action"),
  read("/v1/devices/{device_id}/settings/operations/{operation_id}", "screen-settings-status", live),
  read("/v1/devices/{device_id}/remote-desktop/status", "screen-status", live),
  post("/v1/devices/{device_id}/remote-desktop/sessions", "screen-session"),
  read("/v1/devices/{device_id}/remote-desktop/sessions/{session_id}/frame", "screen-frame", stream),
  post("/v1/devices/{device_id}/remote-desktop/sessions/{session_id}/input", "screen-input"),
  post("/v1/devices/{device_id}/remote-desktop/sessions/{session_id}/media", "screen-media"),
  route("DELETE", "/v1/devices/{device_id}/remote-desktop/sessions/{session_id}", "screen-close"),
  post("/v1/devices/remote-desktop/quality", "screen-quality"),
  post("/v1/devices/remote-desktop/quality/windows", "screen-windows-quality"),
  read("/v1/secure-broker/devices/{device_id}/status", "screen-broker-status", live),
  post("/v1/secure-broker/devices/{device_id}/sessions", "screen-broker-session"),
  read("/v1/secure-broker/devices/{device_id}/sessions/{session_id}/frame", "screen-broker-frame", stream),
  post("/v1/secure-broker/devices/{device_id}/sessions/{session_id}/input", "screen-broker-input"),
  route("DELETE", "/v1/secure-broker/devices/{device_id}/sessions/{session_id}", "screen-broker-close"),

  route("DELETE", "/v1/artifacts/{artifact_id}", "artifact-delete", scoped),
  route("DELETE", "/v1/agent/sessions/{session_id}", "editor-session-delete"),
  read("/v1/replays/work", "work-replays", live),
  read("/v1/mcp/catalog", "material-connectors", live),
  read("/v1/orgs/mcp/available", "organization-connectors", live),
  read("/v1/orgs", "organizations", live),
  read("/v1/orgs/{org_id}", "organization", live),
  read("/v1/personalization", "editor-preferences", live),
  route("PATCH", "/v1/personalization", "editor-preferences-save"),
  read("/v1/computers/{computer_id}/programs/{program}/choice", "editor-program-choice", live),
  route("PUT", "/v1/computers/{computer_id}/programs/{program}/choice", "editor-program-choice-save"),
  read("/v1/agent/approvals", "editor-approvals", live),
  read("/v1/agent/approvals/{approval_id}", "editor-approval", live),
  post("/v1/agent/approvals/{approval_id}/decide", "editor-approval-decision"),
  post("/v1/devices/{device_id}/tasks", "editor-device-task"),
  ...["/terminals", "/terminals/{session_id}/record", "/node", "/agent-settings", "/oceanleo-agent",
    "/cli/programs", "/cli/sessions", "/agent/cli-tools"]
    .map(suffix => read(`/v1/computers/{computer_id}${suffix}`, `editor-computer${suffix}`, live)),
  ...["/terminals", "/node/upgrade", "/oceanleo-agent/install", "/cli/launch"]
    .map(suffix => post(`/v1/computers/{computer_id}${suffix}`, `editor-computer${suffix}`)),
  route("PATCH", "/v1/computers/{computer_id}/agent-settings", "editor-agent-settings-save"),
  route("PUT", "/v1/computers/{computer_id}/agent/cli-tools", "editor-cli-tools-save"),
  route("PUT", "/v1/computers/{computer_id}/inbox", "editor-computer-inbox"),
  route("DELETE", "/v1/computers/{computer_id}/terminals/{session_id}/record", "editor-terminal-record-delete"),
  route("DELETE", "/v1/computers/{computer_id}/oceanleo-agent", "editor-computer-agent-remove"),
  // The optional Vault panel assigns references; secret material stays sealed.
  read("/v1/vault", "work-vault", live),
  read("/v1/vault/fence-status", "work-vault-fences", live),
  post("/v1/vault/recover", "work-vault-recovery"),
  route("DELETE", "/v1/vault/browser-bindings/{binding_id}", "work-vault-browser-unbind"),
  read("/v1/website-projects/{project_id}/vault/references", "work-vault-references", live),
  post("/v1/website-projects/{project_id}/vault/references", "work-vault-reference-add"),
  route("DELETE", "/v1/website-projects/{project_id}/vault/references/{reference_id}", "work-vault-reference-remove"),
  read("/v1/website-projects/{project_id}/hosting/aliyun/account", "work-hosting-account", live),
  route("PUT", "/v1/website-projects/{project_id}/hosting/aliyun/account", "work-hosting-connect"),
  post("/v1/website-projects/{project_id}/hosting/aliyun/configure", "work-hosting-configure"),
  read("/v1/website-projects/{project_id}/hosting/aliyun/deployments", "work-hosting-deployments", live),
  post("/v1/website-projects/{project_id}/hosting/aliyun/deployments", "work-hosting-publish"),
  ...["refresh", "rollback", "unpublish"].map(action => post(`/v1/website-projects/{project_id}/hosting/aliyun/deployments/{deployment_id}/${action}`, `work-hosting-${action}`)),
  route("DELETE", "/v1/website-projects/{project_id}/hosting/aliyun/deployments/{deployment_id}", "work-hosting-delete", { maxRequestBytes: 2 * MiB }),

];

/** Patterns are closed paths, never caller-supplied regular expressions. */
export function editorGatewayPattern(route: EditorGatewayRoute, artifactId?: string): RegExp {
  const segment = "[A-Za-z0-9._~%:-]{1,255}";
  const parts = route.path.split(/(\{[^}]+\})/).map(part => {
    if (!part.startsWith("{")) return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const name = part.slice(1, -1);
    if (name === "artifact_id" && route.scope === "artifact" && artifactId !== undefined)
      return encodeURIComponent(artifactId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (name === "digest") return "[a-f0-9]{64}";
    if (name === "purpose") return "(?:thumbnail|preview|full|source|editor_manifest)";
    if (name.endsWith("+")) return `${segment}(?:/${segment}){0,15}`;
    return segment;
  });
  return new RegExp(`^${parts.join("")}$`);
}

export function editorGatewayRoute(method: string, path: string, artifactId?: string): EditorGatewayRoute | undefined {
  const pathname = path.split("?")[0];
  if (!pathname.startsWith("/v1/") || /[\\#\x00-\x20]/.test(path) || pathname.includes("//")) return undefined;
  // UC-6: paths must not acquire a different meaning when URL/fetch decodes them.
  let decoded: string;
  try { decoded = decodeURIComponent(pathname); } catch { return undefined; }
  if (/%(?:2f|5c|2e|25)/i.test(pathname) || decoded.split("/").some(part => part === "." || part === "..")) return undefined;
  const verb = method.toUpperCase() === "HEAD" ? "GET" : method.toUpperCase();
  return EDITOR_GATEWAY_ROUTES.find(route => route.method === verb && editorGatewayPattern(route, artifactId).test(pathname));
}
