import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { compileModule, dataModule } from "./module-bench.mjs";

const require = createRequire(import.meta.url);

/** Test composition: the real data hook and the shared toolbar. No product wrapper. */
export async function compileSelectionAdapterHost(path, hookName, exportedName, overrides = {}) {
  const hook = await compileModule(path, overrides);
  const toolbar = overrides["../SelectionToolbar"] ?? await compileModule("src/shell/SelectionToolbar.tsx", overrides);
  const resolver = await compileModule("src/shell/selection-adapter.ts", overrides);
  return dataModule(`
    import React from ${JSON.stringify(pathToFileURL(require.resolve("react")).href)};
    import { ${hookName} } from ${JSON.stringify(hook)};
    import { SelectionToolbar } from ${JSON.stringify(toolbar)};
    import { resolveSelectionAdapterContext } from ${JSON.stringify(resolver)};
    export function ${exportedName}(props) {
      const adapter = ${hookName}(props);
      return React.createElement(SelectionToolbar, {context:resolveSelectionAdapterContext(adapter.context), onCommand:adapter.dispatch, accent:props.accent});
    }
  `);
}

export async function compileDocumentToolsHost(overrides = {}) {
  const builder = await compileModule("src/shell/plugin-chrome/EditBarDocumentSegment.tsx", overrides);
  const creation = await compileModule("src/shell/creation-tools.ts", overrides);
  const toolbar = await compileModule("src/shell/SelectionToolbar.tsx", overrides);
  return dataModule(`
    import React from ${JSON.stringify(pathToFileURL(require.resolve("react")).href)};
    import { editBarDocumentTools } from ${JSON.stringify(builder)};
    import { creationToolControl } from ${JSON.stringify(creation)};
    import { SelectionToolbar } from ${JSON.stringify(toolbar)};
    export function EditBarDocumentSegment(props) {
      const actions = (props.actions || []).map(action => ({...action, onTrigger:()=>props.onTrigger ? props.onTrigger(action) : action.onTrigger?.()}));
      const tools = editBarDocumentTools({...props, actions});
      const context = {version:1,kind:'creation',id:'test-creation',controls:tools.map(tool=>creationToolControl(tool))};
      return React.createElement(SelectionToolbar, {context, onOpenPanel:(id,_action,anchor)=>props.onToggleDrawer ? props.onToggleDrawer(id,anchor) : props.onTrigger?.(actions.find(action=>action.panelId===id),anchor),onCommand:(command,anchor)=>tools.find(tool=>tool.id===command.controlId)?.execute?.(anchor)});
    }
  `);
}
