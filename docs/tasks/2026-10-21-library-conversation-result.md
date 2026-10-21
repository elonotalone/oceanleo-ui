# Library split and conversation delivery

## Result

Full Library editing and task Library editing use AgentChat -> SplitWorkspace. Opening the agent reveals the same conversation pane; the editor keeps its mounted identity across save, agent visibility, maximize, close and reopen. Close only hides the right pane; Back exits the editor. Shared top-row contract now permits both maximize and close independently.

Home submission mounts the actual conversation immediately, while task creation continues. Canonical task URL changes retain the live component. New Task resets busy/input/attachments; history restoration resumes an existing task without creating another. The old holding-page copy is removed.

Active received replies reveal Unicode graphemes progressively, with a bounded catch-up buffer. Stop/completion flush immediately; completed and initially restored text is never replayed. Active streaming rows keep a 200ms poll cadence instead of idle backoff. Engine persistence still batches about every 330ms/120 characters; model inference and backend transport were not changed.

Save registration retains transport status and retries temporary failures using the already committed artifact/revision. Failed history registration no longer falsely acknowledges success. Explicit CAS conflicts remain protected.

Right-pane render failures are contained locally with retry/close and originating component-stack logging; real injected React render-loop coverage proves the left composer remains mounted.

## Parent verification

- Shared UI typecheck passed. Portal source typecheck passed with peer paths resolved to the portal versions while the dev workspace symlink was active; the unmodified default command exposed existing duplicate Supabase/Next package nominal-type incompatibility between the two checkouts.
- Broader parent regression run: 161 tests, initially 158 passed and 3 rejected the newly simultaneous close slot. Canonical GLOBAL_ROW_SLOTS and its strict tests were corrected; both failed files rerun 6/6 passed. Other checks included actual React split/AgentChat, save retry, deep item success/network failure, Markdown buffering, session safety, Library stability/virtualization and pane keepalive.
- Portal route/home runtime tests: 4/4 passed, including delayed creation, retained composer, New Task reset, existing-task restoration and second submission.
- Public API snapshot and git diff whitespace checks passed. Theme CSS regenerated.
- Current LeoDev homepage, Library item URL and task URL returned HTTP 200. Four running slots were FRESH(dev), zero STALE, all workspace UI linked.
- No browser or screenshot automation was used.

## Evidence limits

The historical generic route-error stack did not identify the original render-loop component, and its precise trigger has not been reproduced. Current deep-item/network-failure scenarios pass; the new pane boundary prevents that class of right-pane crash from replacing the entire conversation. This is containment and tested recovery, not proof of the historical trigger's elimination. Likewise the historical autosave HTTP status was not recorded, so the corrected transient-error classification must not be represented as a proven response code from that incident.

Twin package pin and deployment verification are recorded after completion below.
