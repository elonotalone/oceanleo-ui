# Hosted video mounted-close integration

Outcome: Back, editor Close and Mine item switching must not destroy the only iframe serializer before an unsaved video obtains its durable revision receipt.

Chains considered:

1. Existing immediate background handoff: appropriate for self-contained/local serializers, but the iframe and Stage unmount immediately, cancelling the pending hosted waiter. Rejected for hosted video only.
2. Capture/restore a portable draft before teardown: existing recovery is mature for supported editor faces, but live video has no ready draft tier. Adding another serializer/timer would duplicate the new typed save and introduce stale capture races. Not selected.
3. Opt-in mounted flush using the existing shared autosave controller, then the same close helper: selected. It reuses serial in-flight/latest-revision draining and existing retry/error display. Normal editors remain nonblocking/background. No choice menu or new save timer.

The persistence adapter declares `requiresMountedFlush`. Only that path awaits `autoSave.flushLatest()` and keeps its stage mounted/inert meanwhile. Failure retains the editor and re-enables interaction; a successful result closes it. The header Close path cannot bypass the guard through rightPaneSlot; Mine activation uses the same guard. Browser forced navigation/crash is not claimed durable; existing beforeunload warning remains.

Falsifying assumption: the real Inline shell's guard still unmounts its iframe while flush is in flight or failed. `tests/inline-mounted-leave-runtime.test.mjs` mounts the actual Inline shell, actual autosave hook/controller and actual leave helper (visual/session leaves controlled): edit→Close leaves the only iframe mounted/inert; failed flush keeps it; retry via Back then successful durable flush unmounts exactly once. **1/1 passed**. The adjacent leave/pipeline/native/Image-route group passed **15/15**. Initial harness imports failed because overly broad visual stubs omitted transitive exports; the stubs were removed and the actual registered runtime test subsequently executed green. No skipped/missing test was counted as proof.

W04 separately owns Stage save/receipt integration and W06 the real iframe hook lifecycle/races. Those tests, final shared/video typechecks and V01 review remain required before full acceptance.

## Observation and source-lifetime hardening

V01 independently reproduced the passive-observation gap: newly rendered edit2 could be absent from the controller when a close gate awaited edit1. A real hook regression first failed with observedAtClose1 rather than2. Explicit flush/retry/handoff now synchronously use the same render observation and mutation/draft/recovery guards as passive autosave. An explicit drain rechecks after its receipt and drains again if the rendered revision changed. It fails closed across a source switch.

V01 also reproduced two real cross-source failures: A's covered numeric revision1 falsely covered dirty B1, and A's scheduled debounce handed off after switching to clean B called B's serializer. Source-keyed inner refs now pin the originating flush/session/revision/draft/recovery/ledger for background callbacks; retired source receipts do not update the new source's UI. Parent real-hook tests passed7/7; V01 independently repeated both A→B repros and observed exactly[A,B] for two genuine edits and exactly[A] for scheduled A→clean B.

The mounted leave/navigation hook is extracted into `use-inline-workbench-leave.ts`, preserving one close path and the existing600-line component boundary. The real Inline mounted-close, normal leave, pipeline, native editor, structural contracts and Library Image runtime group passed19/19 after extraction. This is runtime/component proof, not browser scheduling or crash durability.
