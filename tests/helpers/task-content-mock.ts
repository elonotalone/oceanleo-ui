import type { TaskContentClient, TaskInlineArtifact } from "../../src/shell/access/task-content-client";

/** Typed mock of the exact task-scoped byte and safe-inline-content interface. */
export function createMockTaskContentClient(overrides: Partial<TaskContentClient> = {}): TaskContentClient {
  const artifact: TaskInlineArtifact = { id: "output", kind: "document", title: "Output", content: "Visible text" };
  return {
    async attachment() { return new Blob(["visible bytes"], { type: "text/plain" }); },
    async artifacts() { return [artifact]; },
    async artifact() { return artifact; },
    ...overrides,
  };
}
