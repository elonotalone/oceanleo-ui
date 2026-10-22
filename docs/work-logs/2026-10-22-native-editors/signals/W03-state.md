# W03 state
- Facts: threed default core = legacy (Model3DModelRoute, three.js workbench w/ collab/playblast). Pro = Model3DNextStage (model-viewer + hosted three.js editor iframe), reachable via PluginModeSwitchGate and flag next.
- Plan: route renders only Model3DModelRoute; delete NextStage + hosted frame/embed + next-only helpers not used elsewhere; remove usePluginMode/mode gate/w19 handoff in route; rewrite tests; add regression test.
- Current step: analysis -> edit route.
- Repro: node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/model3d-*.test.mjs
