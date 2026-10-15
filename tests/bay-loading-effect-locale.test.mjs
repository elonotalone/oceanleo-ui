import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// Execute the production component setup, callbacks, async effects, and error
// JSX expressions. Like d25-viewer-effects, this is a hook bench, not a browser
// or a substitute for visual acceptance. Dependencies use React's Object.is
// comparison; state setters, callback memoization, refs and cleanups persist.
const cases = [
  ["appfeedback/FeedbackManagePanel.tsx", "FeedbackManagePanel", ["listBayAppThreads", "getBayAppDigest", "listBayAppFeedbackInbox"], ["settingsError", "digestError", "error"]],
  ["apppaid/AppPurchaseBar.tsx", "AppPurchaseBar", ["getBayAppAccess"], ["loadError"]],
  ["appreleases/AppReleases.tsx", "AppReleases", ["listBayAppReleases"], ["error"]],
  ["apps/AppEditorPane.tsx", "AppEditorPane", ["listMyBayApps"], ["load.error"]],
  ["apps/AppVerifyPanel.tsx", "AppVerifyPanel", ["startBayAppVerification"], ["loadError"]],
  ["apps/MyAppsPane.tsx", "MyAppsPane", ["listMyBayApps"], ["load.error"]],
  ["form/BaySelectMembers.tsx", "BaySelectMembers", ["listContacts", "fetchConversations"], ["error"]],
  ["lessons/BundleEditorPane.tsx", "BundleEditorPane", ["listMyBayLessons", "listMyBayLessonBundles"], ["load.error"]],
  ["lessons/LessonEditorPane.tsx", "LessonEditorPane", ["getBayLesson"], ["load.error"]],
  ["lessons/MyBoughtLessonsPane.tsx", "MyBoughtLessonsPane", ["listPurchasedBayLessons"], ["load.error"]],
  ["lessons/MyLessonsPane.tsx", "MyLessonsPane", ["listMyBayLessons"], ["load.error"]],
];
// List panes reload on sign-in instead, and the member picker has no entity.
const entityCases = cases.filter(([, name]) => !name.startsWith("My") && name !== "BaySelectMembers");

const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const tick = () => new Promise((resolve) => setImmediate(resolve));

function compileSetup(path, name, errorNames) {
  const source = readFileSync(new URL(`../src/shell/bay/${path}`, import.meta.url), "utf8");
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === name);
  const hookStatement = (s) => ts.isExpressionStatement(s) && ts.isCallExpression(s.expression)
    && s.expression.expression.getText(ast) === "useEffect";
  const end = component.body.statements.findLastIndex(hookStatement);
  assert.ok(end >= 0, `${name}: production effect must exist`);
  const setup = component.body.statements.slice(0, end + 1);
  const bindings = [];
  const bind = (node) => {
    if (ts.isIdentifier(node)) bindings.push(node.text);
    else if (ts.isArrayBindingPattern(node) || ts.isObjectBindingPattern(node)) {
      for (const element of node.elements) if (ts.isBindingElement(element)) bind(element.name);
    }
  };
  for (const statement of setup) {
    if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) bind(declaration.name);
  }
  // Use the actual expressions rendered for load errors, so storing an already
  // translated string or forgetting render-time translation fails behaviorally.
  const errorExpressions = new Map();
  const visit = (node) => {
    if (ts.isJsxExpression(node) && node.expression) {
      const expression = node.expression.getText(ast);
      for (const error of errorNames) {
        if (expression === error || expression === `tt(${error})`) errorExpressions.set(error, expression);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(component);
  for (const error of errorNames) assert.ok(errorExpressions.has(error), `${name}: find real error rendering for ${error}`);
  const imports = [];
  for (const statement of ast.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause || statement.importClause.isTypeOnly) continue;
    const named = statement.importClause.namedBindings;
    if (!named || !ts.isNamedImports(named)) continue;
    for (const element of named.elements) if (!element.isTypeOnly) imports.push(element.name.text);
  }
  const helpers = ast.statements.filter((s) => ts.isFunctionDeclaration(s) && s !== component).map((s) => s.getText(ast));
  const constants = ast.statements.filter(ts.isVariableStatement).map((s) => s.getText(ast));
  const params = component.parameters.map((p) => p.getText(ast)).join(",");
  const js = ts.transpileModule(`
    ${helpers.join("\n")}
    ${constants.join("\n")}
    return function(${params}) {
      ${setup.map((s) => s.getText(ast)).join("\n")}
      return { ${bindings.join(",")}, renderedErrors: [${[...errorExpressions.values()].join(",")}] };
    };
  `, { fileName: "bench.tsx", compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return (values) => new Function(...imports, "require", "exports", js)(...imports.map((key) => values[key]), () => values, {});
}

function bench(spec) {
  const [path, name, requests, errors] = spec;
  const calls = [];
  const pending = [];
  let locale = "en", signedIn = true, mode = "success", cursor = 0, dirty = false, snapshot;
  let props = {
    appId: "one", app: { id: "one", verified_at: null }, isOwner: true,
    onAccess() {}, onChanged() {}, selected: [], onChange() {},
    target: { kind: name === "BundleEditorPane" ? "bundle-editor" : name === "LessonEditorPane" ? "lesson-editor" : "app-editor", appId: "one", lessonId: "one", bundleId: "one" },
  };
  const slots = [], effects = [];
  const row = (id = "one") => ({ id, title: `saved ${id}`, status: "draft", lesson_ids: [], lessons: [] });
  const response = (api, args) => {
    if (api === "getBayLesson") return { lesson: row(args[0]), chapters: [] };
    if (api === "getBayAppDigest") return { digest: null };
    if (api === "listContacts") return [];
    if (api === "getBayAppAccess") return { currency: "USD" };
    if (api === "startBayAppVerification") return { meta_tag: "proof" };
    return { items: [row("one"), row("two")], next_offset: null, settings: {} };
  };
  const api = Object.fromEntries(requests.map((key) => [key, (...args) => {
    calls.push({ api: key, args });
    if (mode === "pending") return new Promise((resolve, reject) => pending.push({ resolve, reject, value: response(key, args) }));
    if (mode === "failure") return Promise.reject(new Error(""));
    return Promise.resolve(response(key, args));
  }]));
  const values = {
    ...api,
    // Fresh translator on EVERY render, including renders in the same locale.
    useUI: () => { const language = locale; return (key) => `${language}:${key}`; },
    useLocale: () => locale,
    useBaySignedIn: () => signedIn,
    useBayFilter: () => ({}), useBayCategories: () => ({ categories: [] }), useBayCategoryName: () => () => "",
    DEFAULT_CURRENCY: "USD", PAGE_SIZE: 20,
    emptyAudience: () => ({}), emptyBundleDraft: () => ({ title: "" }), emptyLessonDraft: () => ({ title: "" }),
    draftFromApp: (value) => ({ title: value.title }), draftFromLesson: (value) => ({ title: value.title }),
    cleanGalleryUrls: () => [], yuanText: () => "", inboxParams: (value) => value,
    actionErrorText: (error, fallback) => error.message || fallback,
    errorText: (error) => error.message || "", isAbort: () => false,
    applyFollowFromReleasePage() {}, RELEASE_PAGE_FIRST: 5,
    BayApiError: class extends Error {},
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) {
        const slot = { value: typeof initial === "function" ? initial() : initial };
        slot.set = (update) => {
          const next = typeof update === "function" ? update(slot.value) : update;
          if (!Object.is(slot.value, next)) { slot.value = next; dirty = true; }
        };
        slots[index] = slot;
      }
      return [slots[index].value, slots[index].set];
    },
    useRef(initial) {
      const index = cursor++;
      return (slots[index] ??= { current: initial });
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) slots[index] = { deps, callback };
      return slots[index].callback;
    },
    useEffect(callback, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) {
        slots[index]?.cleanup?.();
        const slot = { deps };
        slots[index] = slot;
        effects.push(() => { slot.cleanup = callback(); });
      }
    },
  };
  const renderSetup = compileSetup(path, name, errors)(values);
  function render() {
    cursor = 0;
    dirty = false;
    snapshot = renderSetup(props);
    for (const effect of effects.splice(0)) effect();
    return snapshot;
  }
  async function flush() {
    for (let i = 0; i < 20; i++) {
      await tick();
      if (!dirty) return snapshot;
      render();
    }
    assert.fail(`${name}: did not settle; possible unstable-translation effect loop`);
  }
  return {
    calls, pending, render, flush,
    get snapshot() { return snapshot; },
    get stateValues() { return slots.filter((slot) => slot?.set).map((slot) => slot.value); },
    setLocale(value) { locale = value; render(); },
    setMode(value) { mode = value; },
    setSignedIn(value) { signedIn = value; render(); },
    changeEntity() {
      props = { ...props, appId: "two", app: { ...props.app, id: "two" }, target: { ...props.target, appId: "two", lessonId: "two", bundleId: "two" } };
      render();
    },
    dispose() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

test("the bench covers all 11 repaired components, 7 of which switch entity", () => {
  assert.equal(cases.length, 11);
  assert.equal(entityCases.length, 7);
});

for (const spec of cases) {
  const [, name, requests] = spec;
  test(`${name}: unstable tt and locale changes preserve loads and editor drafts`, async () => {
    const b = bench(spec);
    b.render();
    await b.flush();
    for (const api of requests) assert.equal(b.calls.filter((c) => c.api === api).length, 1, `${api}: initial request`);
    if (b.snapshot.setDraft) {
      b.snapshot.setDraft((draft) => ({ ...draft, title: "unsaved input" }));
      await b.flush();
    }
    const count = b.calls.length;
    for (let i = 0; i < 3; i++) { b.render(); await b.flush(); }
    b.setLocale("ja");
    await b.flush();
    assert.equal(b.calls.length, count, "identity/locale changes must not restart loads, including indirect callbacks");
    if (b.snapshot.draft) assert.equal(b.snapshot.draft.title, "unsaved input");
    if (name !== "BaySelectMembers") {
      if (name.startsWith("My")) {
        b.setSignedIn(false); await b.flush();
        assert.equal(b.calls.length, count, "signed-out renders do not load");
        b.setSignedIn(true);
      } else b.changeEntity();
      await b.flush();
      assert.ok(b.calls.length > count, "real entity/auth dependency must still reload");
      if (b.snapshot.draft) assert.equal(b.snapshot.draft.title, "saved two");
    }
    if (b.snapshot.reload) {
      const before = b.calls.length;
      b.snapshot.reload(); await b.flush();
      assert.ok(b.calls.length > before, "explicit retry must reload");
    }
    if (b.snapshot.refreshAccess) {
      const before = b.calls.length;
      await b.snapshot.refreshAccess(); await b.flush();
      assert.equal(b.calls.length, before + 1, "access retry still reloads");
    }
    if (b.snapshot.setStatus) {
      const before = b.calls.length;
      b.snapshot.setStatus("answered"); await b.flush();
      assert.equal(b.calls.length, before + 1, "feedback status reloads inbox only");
      assert.equal(b.calls.at(-1).args[0].status, "answered");
    }
    b.dispose();
  });

  test(`${name}: pending failures display the CURRENT locale without refetching`, async () => {
    const b = bench(spec);
    b.setMode("pending");
    b.render();
    await b.flush();
    const count = b.calls.length;
    assert.ok(count > 0);
    b.setLocale("ja");
    await b.flush();
    assert.equal(b.calls.length, count, "locale change during request must not cancel/restart it");
    for (const request of b.pending.splice(0)) request.reject(new Error(""));
    await b.flush();
    for (const error of b.snapshot.renderedErrors) {
      assert.match(error, /^ja:[\u3400-\u9fff]/u, "rendered fallback must use the latest language, once");
    }
    b.setLocale("fr"); await b.flush();
    assert.equal(b.calls.length, count);
    for (const error of b.snapshot.renderedErrors) assert.match(error, /^fr:[\u3400-\u9fff]/u);
    b.dispose();
  });

  test(`${name}: cleanup ignores a late failed request`, async () => {
    const b = bench(spec);
    b.setMode("pending");
    b.render(); await b.flush();
    const before = b.snapshot.renderedErrors;
    b.dispose();
    for (const request of b.pending.splice(0)) request.reject(new Error(""));
    await b.flush();
    assert.deepEqual(b.snapshot.renderedErrors, before, "unmounted requests must not write an error");
    if (name === "AppPurchaseBar") assert.equal(b.calls[0].args[1].aborted, true, "access request is aborted on cleanup");
  });

  test(`${name}: cleanup ignores a late successful request`, async () => {
    const b = bench(spec);
    b.setMode("pending");
    b.render(); await b.flush();
    const before = structuredClone(b.stateValues);
    b.dispose();
    for (const request of b.pending.splice(0)) request.resolve(request.value);
    await b.flush();
    assert.deepEqual(b.stateValues, before, "unmounted requests must not apply loaded data");
  });
}

for (const spec of entityCases) {
  const [, name] = spec;
  test(`${name}: previous entity's late response cannot replace the new entity`, async () => {
    const b = bench(spec);
    b.setMode("pending"); b.render(); await b.flush();
    const old = b.pending.splice(0);
    b.setMode("success"); b.changeEntity(); await b.flush();
    const before = structuredClone(b.stateValues);
    for (const request of old) request.resolve(request.value);
    await b.flush();
    assert.deepEqual(b.stateValues, before);
    b.dispose();
  });
}
