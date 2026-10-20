/**
 * W6-r2: hosted deck selection-command carries a human origin stamp;
 * format/insert reaches the adopted postMessage envelope; stale/read-only
 * stay rejected. Puck/Fabric/workflow command helpers actually mutate.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  buildDeckHostedCommandSurface,
  hostedDeckFormatFillCommand,
  hostedDeckHumanOrigin,
  hostedDeckInsertTextCommand,
  hostedDeckSelectionCommandEnvelope,
} from "../src/shell/advanced-routes/deck-hosted-selection-command.ts";
import { applyWebsiteCommand } from "../src/shell/website-local/website-command-surface.ts";
import { existingWebsiteSource } from "../src/shell/website-local/blank-website-source.ts";
import { applyDesignCommand } from "../src/shell/design-canvas/design-command-surface.ts";
import { blankDesignDocument } from "../src/shell/design-canvas/blank-design-document.ts";
import { addVideoCanvasNode } from "../src/shell/workflow-carrier/video-canvas-local-session.ts";
import { dispatchWorkflowAgentChip } from "../src/shell/workflow-carrier/agent-route.ts";

const hosted = readFileSync(
  "src/shell/advanced-routes/DeckHostedRoute.tsx",
  "utf8",
);

test("DeckHostedRoute sends selection-command with a human origin stamp", () => {
  const sends = [...hosted.matchAll(/type:\s*["']selection-command["']/g)];
  assert.ok(sends.length > 0);
  assert.match(hosted, /origin:\s*["']user["']/);
  assert.equal(hostedDeckHumanOrigin("agent"), null);
  assert.equal(hostedDeckHumanOrigin("user"), "user");
});

test("hosted deck insert/format commands reach the adopted envelope; stale and read-only stay rejected", () => {
  const insert = hostedDeckInsertTextCommand({
    selectionId: "slide-1",
    text: "新标题",
  });
  const format = hostedDeckFormatFillCommand({
    selectionId: "slide-1",
    color: "#ff00aa",
  });
  const sent = [];
  const surface = buildDeckHostedCommandSurface({
    ready: true,
    readOnly: false,
    hasSource: true,
    liveSelectionId: "slide-1",
    send: (envelope) => {
      sent.push(envelope);
      return true;
    },
  });
  const inserted = surface.run("deck.insert-text", { text: "新标题", origin: "user" });
  assert.equal(inserted.ok, true);
  assert.equal(sent[0].type, "selection-command");
  assert.equal(sent[0].origin, "user");
  assert.equal(sent[0].command.controlId, "edit-text");
  const filled = surface.run("deck.format-fill", { color: "#ff00aa", origin: "l1" });
  assert.equal(filled.ok, true);
  assert.equal(sent[1].command.controlId, "fill");
  assert.ok(insert);
  assert.ok(format);

  const stale = hostedDeckSelectionCommandEnvelope({
    command: insert,
    origin: "user",
    ready: true,
    readOnly: false,
    liveSelectionId: "other-el",
  });
  assert.equal(stale.ok, false);
  assert.match(stale.error, /选择已变化/);

  const readOnly = hostedDeckSelectionCommandEnvelope({
    command: insert,
    origin: "user",
    ready: true,
    readOnly: true,
    liveSelectionId: "slide-1",
  });
  assert.equal(readOnly.ok, false);
  assert.match(readOnly.error, /只读/);

  const noStamp = hostedDeckSelectionCommandEnvelope({
    command: insert,
    origin: "agent",
    ready: true,
    readOnly: false,
    liveSelectionId: "slide-1",
  });
  assert.equal(noStamp.ok, false);
  assert.match(noStamp.error, /人类来源章/);
});

test("website Puck commands and design Fabric title command mutate the document", () => {
  const site = existingWebsiteSource("操作员已有的网站工程");
  const paged = applyWebsiteCommand(site, "website.add-page", {});
  assert.equal(paged.ok, true);
  assert.equal(paged.source.pages.length, site.pages.length + 1);
  const themed = applyWebsiteCommand(paged.source, "website.set-theme-accent", {
    accent: "#00aa88",
  });
  assert.equal(themed.ok, true);
  assert.equal(themed.source.theme.accent, "#00aa88");

  const design = blankDesignDocument("本地设计稿 W10");
  const titled = applyDesignCommand(design, "design-canvas.set-title", {
    text: "画布标题已经改过",
  });
  assert.equal(titled.ok, true);
  assert.equal(titled.project.title, "画布标题已经改过");
});

test("workflow add-node mutates; agent chips without a human stamp do not write the graph", () => {
  const graph = { nodes: [], edges: [] };
  const next = addVideoCanvasNode(graph, "filter", "n1", "处理");
  assert.equal(next.nodes.length, 1);
  assert.equal(graph.nodes.length, 0);
  const parked = dispatchWorkflowAgentChip({
    chipId: "workflow.chip.gen",
    graph: next,
    revision: 1,
    proposedGraph: addVideoCanvasNode(next, "output", "out", "输出"),
  });
  assert.equal(parked.parked, true);
  assert.equal(parked.graph.nodes.length, 1);
  const executed = dispatchWorkflowAgentChip({
    chipId: "workflow.chip.gen",
    origin: "user",
    graph: next,
    revision: 1,
    proposedGraph: addVideoCanvasNode(next, "output", "out", "输出"),
  });
  assert.equal(executed.parked, false);
  assert.equal(executed.graph.nodes.at(-1).id, "out");
});
