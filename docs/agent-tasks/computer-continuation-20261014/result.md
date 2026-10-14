# Computer conversation continuation

Continues the latest Claude session (2026-10-14) and the operator's follow-up.
Parallel owners hit account usage limits before final reports; parent verified
partial UI artifacts and finished sequentially under the capacity exception.

Scope: recover Claude transcripts whose cwd falls after the SDK's first 64KiB;
consume paginated ACP history; New conversation above Past conversations;
copy the current computer/program/session URL; follow streamed Markdown height
changes while retaining manual history position; remember each computer/agent's
model, mode and tuning, including the actual first-prompt configuration.
Existing historical sessions retain their own adapter configuration.

Fresh-install checks repair Node20/missing-npm bootstrap and readable node
configuration without sudo. The node preserves environment names through sudo
without putting key values in command arguments, and missing cwd fails with
status 2. Already installed nodes still upgrade through the product's Upgrade
action; this continuation does not restart user nodes or active agent processes.

Verification: 45 UI behavioral tests, shared UI tsc, 61 gateway tests with 39
subtests, full node Go tests, and a real harmless sudo environment probe. No
browser or existing user conversation prompts. Release source is isolated from
the unrelated uncommitted LeoBay work before regenerating CSS and pinning the
twin with the standard bump preflights. Production release remains untouched.

Follow-up screenshot: a transient computer_offline error permanently disabled
reconnection. Recovery now closes the rejected connection and retries with
backoff; only a valid status response resets backoff and clears stale offline
state/notices. A computer-wide error also applies when an existing history
view is focused. No prompt is automatically resent. Focused regression is now
46 behavioral tests, including recovery without clicking Retry. This UI-only
follow-up does not replace the gateway again.
