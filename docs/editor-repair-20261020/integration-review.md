# Parent integration review (open items, not acceptance)

## W4 delivered

Parent verified commit 70380329 file diff and ran W4-conversation-anchor: 5 passed. Generated CSS still required. W3 standalone fallback aside must stretch the PluginThemeScope child as well (see W4 delivery requests).

## W5 delivered: needs follow-up review

Parent read code: EditBarCommandDispatcher has no production importer (rg within src/shell returns only definition; tests consume it). Remove unused machinery or wire a demonstrated need, rather than leaving a new unused bus. Its handler exceptions are currently swallowed and async rejections unhandled.

SelectionCommandGate now retains lastContext through reconcile(null) and cancelAll. This is wider than a toolbar press: a cleared selection can authorize a later matching command indefinitely. Preserve the toolbar interaction without converting genuine deselection / document change into a stale target. Add negative tests for explicit clear, document/editor switch, and delayed command after release. The parent has not changed this owner file.

useEditBarSelectionSession schedules a self-repeating 50 ms timer while any anchored popover exists, without timer cleanup or owner scoping. Require cleanup on unmount, and scope to the originating toolbar/popover so another unrelated overlay cannot hold an old selection.

## Security gate during active changes

Untrusted embed render test failed on a test stub missing officeExtensionForItem export, not an origin weakening (W1 dependency). Fix test compilation while retaining all sandbox/origin assertions. Full gate also reports pre-existing live DB grant drift involving im remarks and tmp_seed_operator_library_batch; no DB authorization modifications made in this task. Full log /tmp/oceanleo-security-gate-rJeBEW.
