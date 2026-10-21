# W02 journal — shared editor save

## 2026-10-22

- `bash /opt/cursor-workspaces/oceandino/scripts/agent-bootstrap.sh` passed: main-only policy and 5-repo check succeeded.
- Read the common repair rules, W02 task book, OceanLeo code map, typed-artifact-editing nav slice, and the adopted-editor plan. Work remains on `main`; no production files changed yet.
- The initial broad symbol listing was too noisy due the large artifact client; follow-up is bounded to the save-related declarations and routes.
- `oceanleo-library --target dev get` downloaded the named private fixture; `file` identified DOCX and `sha256sum` matched Library metadata. A read-only Supabase helper query showed the artifact head is native/editable and integrity-ready with the same source digest; the original remains untouched.
- Parent’s API access-log slice (2026-10-21 16:27–16:32 UTC) found no save/upload request at all, only collab ticket POSTs. This points to failure before the save producer reaches HTTP; it does not establish which frontend step failed.
- Read the Umo host flow: `RichDocHostedRoute` only handles `recovery-snapshot` when `message.ok` is true, and also drops a successful response with no payload or a revision mismatch without settling the pending save. Its host flush cannot reach `persistUmoPayload` until that gate resolves. This is a concrete no-network failure path consistent with the logs; a runtime regression is still needed before attributing the screenshot to it.
- Parent expanded W02 ownership to the hosted save/recovery handshake in `RichDocHostedRoute.tsx` and `EmbeddedRoute.tsx`, and focused tests. Design/video adapters remain owned by W03/W04.
- Parent additionally authorized the shared save-gate helper `editor-handoff.ts` for a backward-compatible rejection API.
- Inspected adopted Umo bridge source read-only: host `recovery-capture` calls Umo `getJSON()` and emits either a revisioned snapshot or explicit `ok:false` when JSON is unavailable. I have not captured an actual browser Umo failure; screenshot attribution remains unconfirmed.
- Confirmed a route-level race candidate from the source: every Umo `dirty` event clears `capturesRef`, including an active hosted-save capture. If a newer edit arrives before the save snapshot, the valid older response becomes uncorrelated and the route never reaches `persistUmoPayload` (consistent with no API save request). The handler also ignores explicit negative recovery snapshots. Next step is a runtime regression that proves the no-network failure and a retry to the latest durable revision; this is not yet a causal fix or completion claim.
- First baseline invocation omitted the repo’s TS extension loader and failed module resolution; reran with the `package.json` test loader flags under `run-light`. The selected save-contract, revision-integrity, autosave runtime, session-registration, and Umo migration tests passed 53/53. Parent ran the shared typecheck; W02 did not duplicate it.
