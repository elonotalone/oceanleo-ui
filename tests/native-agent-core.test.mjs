import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const entry = path.join(root, "src/native-agent-core/index.ts");
const browserNames = new Set([
  "window", "document", "navigator", "localStorage", "sessionStorage", "indexedDB",
  "File", "Blob", "FileReader", "URL", "URLSearchParams", "WebSocket", "XMLHttpRequest",
  "fetch", "AbortController", "Window", "Document", "HTMLElement", "React",
  "requestAnimationFrame",
]);

// A complete no-DOM TypeScript compilation also follows type-only imports.
// A runtime-only import test would miss File or a web API's type dependencies.
test("the public core's complete type/import closure compiles without DOM, React or web APIs", () => {
  const program = ts.createProgram([entry, path.join(root, "tests/fixtures/native-agent-core/no-dom-consumer.ts")], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ["lib.es2023.d.ts"],
    types: [],
    strict: true,
    noEmit: true,
    skipLibCheck: false,
  });
  const errors = ts.getPreEmitDiagnostics(program);
  assert.equal(errors.length, 0, ts.formatDiagnostics(errors, {
    getCanonicalFileName: (name) => name,
    getCurrentDirectory: () => root,
    getNewLine: () => "\n",
  }));
  const sources = program.getSourceFiles().filter((source) => !program.isSourceFileDefaultLibrary(source));
  assert.ok(sources.some((source) => source.fileName.endsWith("/reduce.ts")));
  assert.ok(sources.some((source) => source.fileName.endsWith("/map-dialog.ts")));
  assert.ok(sources.some((source) => source.fileName.endsWith("/merge.ts")));
  for (const source of sources) {
    assert.ok(source.fileName.startsWith(root), `External dependency in core closure: ${source.fileName}`);
    assert.ok(!/\.(jsx|tsx)$/.test(source.fileName), `UI module in core closure: ${source.fileName}`);
    const visit = (node) => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
        const specifier = node.moduleSpecifier.text;
        assert.ok(specifier.startsWith(".") || specifier === "@oceanleo/ui/native-agent-core", `External import: ${specifier}`);
      }
      if (ts.isIdentifier(node)) {
        assert.ok(!browserNames.has(node.text), `Browser/React API ${node.text} in ${source.fileName}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
});

test("the package export runs the shared reducer, mapper, merge and Stop without browser globals", async () => {
  // Initialize Node's lazy fetch internals before guarding File/Blob globals.
  // They are loader plumbing, not imports made by the protocol core.
  void globalThis.Response;
  const previous = new Map();
  try {
    for (const name of browserNames) {
      previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
      Object.defineProperty(globalThis, name, {
        configurable: true,
        get() { throw new Error(`Core accessed browser API ${name}`); },
      });
    }
    const core = await import("@oceanleo/ui/native-agent-core");
    const { applyDialog } = await import("../src/shell/cloud-computer/legacy-dialog/reduce.ts");
    const { dialogToAgentMessages } = await import("../src/shell/task-native/map-dialog.ts");
    const { mergeSavedAndLive } = await import("../src/shell/task-native/merge.ts");
    assert.equal(core.applyDialog, applyDialog, "the phone and web use exactly the same reducer");
    assert.equal(core.dialogToAgentMessages, dialogToAgentMessages);
    assert.equal(core.mergeSavedAndLive, mergeSavedAndLive);
    const state = core.applyDialog(core.initialDialogState(), { type: "program", program: "codex" });
    assert.equal(state.program, "codex");
    const messages = [{ kind: "user", id: "u", text: "Hello" }];
    const saved = core.mergeSavedAndLive(messages, messages);
    assert.equal(saved.messages.length, 1);
    assert.equal(core.mergeTranscriptPages(saved.messages, messages).length, 1);
    assert.equal(core.dialogToAgentMessages(saved.messages, { live: false })[0].content, "Hello");
    const session = { id: "cts_native", program: "codex", created_at: "2026-11-03T00:00:00Z", native_session_id: "native" };
    assert.deepEqual(core.mapNativeTranscript(session, []), []);
    assert.equal(core.mergeNativeThreadMessages([{ session, messages: core.dialogToAgentMessages(messages, { live: false }) }]).length, 1);
    assert.equal(core.stopMachine(core.idleStop(), { type: "begin", stopId: core.newStopId(), session: "native" }).phase, "stopping");
    const legacy = await import("../src/shell/cloud-computer/legacy-dialog/types.ts");
    assert.equal(legacy.WS_PROGRAMS, core.WS_PROGRAMS);
    assert.equal(legacy.PROGRAM_LABEL, core.PROGRAM_LABEL);
  } finally {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});
