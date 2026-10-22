# W11 state
Facts: engine runtime is a string passed to buildSandboxDocument({engineRuntime}) (game lib/ugc/bundle.ts, DIRTY - not mine).
Stored play fetches /leoplay-engine.js via lib/ugc/stored-play.ts (untracked, not mine). Callers UgcGameFrame/UgcArtifactPlayer/SandboxPreviewHost are dirty.
Plan: new files only in game repo: lib/engine3d/build-three-runtime.mjs (+generated, public/leoplay-three.js), lib/ugc/three-runtime.ts (detect + compose into engineRuntime string, no bundle.ts change), tests/ugc-three-runtime.test.ts.
Backend: app/game_generation.py prompt/lint/exemplar + pytest. UI: GameRoute single mode.
Current step: 1 build runtime. Next: ts helper+tests, backend, GameRoute, delivery.
Repro: cd /root/projects/game && node lib/engine3d/build-three-runtime.mjs --check
