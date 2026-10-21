# Hosted video mounted-close integration

Outcome: Back, editor Close and Mine item switching must not destroy the only iframe serializer before an unsaved video obtains its durable revision receipt.

Chains considered:

1. Existing immediate background handoff: appropriate for self-contained/local serializers, but the iframe and Stage unmount immediately, cancelling the pending hosted waiter. Rejected for hosted video only.
2. Capture/restore a portable draft before teardown: existing recovery is mature for supported editor faces, but live video has no ready draft tier. Adding another serializer/timer would duplicate the new typed save and introduce stale capture races. Not selected.
3. Opt-in mounted flush using the existing shared autosave controller, then the same close helper: selected. It reuses serial in-flight/latest-revision draining and existing retry/error display. Normal editors remain nonblocking/background. No choice menu or new save timer.

The persistence adapter declares `requiresMountedFlush`. Only that path awaits `autoSave.flushLatest()` and keeps its stage mounted/inert meanwhile. Failure retains the editor and re-enables interaction; a successful result closes it. The header Close path cannot bypass the guard through rightPaneSlot; Mine activation uses the same guard. Browser forced navigation/crash is not claimed durable; existing beforeunload warning remains.

Falsifying assumption: the real Inline shell's guard still unmounts its iframe while flush is in flight or failed. `tests/inline-mounted-leave-runtime.test.mjs` mounts the actual Inline shell, actual autosave hook/controller and actual leave helper (visual/session leaves controlled): edit→Close leaves the only iframe mounted/inert; failed flush keeps it; retry via Back then successful durable flush unmounts exactly once. **1/1 passed**. The adjacent leave/pipeline/native/Image-route group passed **15/15**. Initial harness imports failed because overly broad visual stubs omitted transitive exports; the stubs were removed and the actual registered runtime test subsequently executed green. No skipped/missing test was counted as proof.

W04 separately owns Stage save/receipt integration and W06 the real iframe hook lifecycle/races. Those tests, final shared/video typechecks and V01 review remain required before full acceptance.
