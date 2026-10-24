# Projects repair task

Own only project detail/import UI and src/shell/PayerSelector.tsx plus focused tests. Read live kernel, bootstrap, oceanleo pack; inspect navigation impact before edits. Fix oversized checkboxes in task import with explicit native compact dimensions, remove forced default folder icons from project names (preserve deliberately chosen user icons), restyle Personal wallet selector using the Projects All projects selector pattern at a compact flat size. Inspect shared CSS root causes. Do not modify shared general CSS, translation dictionaries, settings, model or connector code without coordinating. Preserve unrelated changes. No browser, deployment, push, dependency install or full suite. Run focused tests through agent-io-guard run-light; parent owns shared typecheck and integration. Return changed paths, evidence and remaining limitations. Do not commit product edits; parent integrates.

## Implementation / evidence

- Root cause: task import inputs set `min-h-11 min-w-11` (44px), overriding `h-4 w-4`. Both native inputs now have explicit 16px width, height and minima; labels retain 44px hit area.
- Project display removes fallback and legacy default folder emoji while preserving other selected emoji; new projects start without an icon, and backend creation preserves an empty icon. No stored project migration.
- PayerSelector uses CollectionFilterSelect, exactly the Projects selector menu/keyboard behavior; additive compact size keeps trigger at 28px. Parent approved collection-chrome and backend router ownership expansion.
- Changed portal files: app/projects/{page,new/page,[id]/join/page}.tsx, components/project/{ProjectTasksTab,ProjectWorkspace}.tsx, lib/projects.ts, backend/app/routers/projects_router.py. Focused tests: project-tasks-import, project-index-membership, backend test_project_core_contract.
- Changed shared files: src/shell/{PayerSelector,HistoryMasterDetail,collection-chrome}.tsx, tests/payer-selector.test.mjs, tests/sko-w11-history-projects.test.mjs.
- Payer behavioral suite: 12/12 green. Portal focused project tests: 26/26 green. Backend `.venv/bin/python -m pytest tests/test_project_core_contract.py -q`: 36 passed, 45 subtests passed. Host Python has broken FastAPI imports; existing backend venv works.
- Parent owns typecheck, dev freshness/rebuild and integration. No browser, restart, deployment, push, dependency installation or product commit performed.
