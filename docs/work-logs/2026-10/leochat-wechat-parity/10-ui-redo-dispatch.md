# LeoChat UI redo dispatch — 2026-10-19

Operator explicitly rejected previous UI and requested three gpt-6-luna subagents. This is a UI implementation turn. Respect live kernel, workstation instructions, oceanleo/deploy/parallel-rollout packs; each child runs agent-bootstrap first. No browser, Playwright, screenshots, or real-device visual checks without task-specific approval. Existing screenshots are local references and should be inspected with `view_image`. Preserve dirty worktrees; do not commit unrelated edits. Work only on dev source and focus slot; no production release.

## W1 — Message geometry and sender identity

Owner: `src/shell/messages/conversation/MessageItem.tsx`, `MessageList.tsx`, `ConversationView.tsx`, associated focused message-layout tests (new or `tests/im-message-bubbles.test.mjs`). Do not edit profile, people, Inbox, group info, or backend files. Read-only inspection elsewhere allowed.

Reference: `/root/oceanleo-inbox/20261019T123106Z-image.png` is desired WeChat arrangement; `/root/oceanleo-inbox/20261019T124202Z-image.png` is old wrong state. User states previous fix still wrong. Verify actual ownership pipeline from `messagesApi.me()` through message DTO to rendered rows, including pending and thread. Own messages must be at the **far right edge** of the message pane, avatar at far right, bubble immediately to its left, not merely right-aligned text inside a left-side cluster. Others stay far left. Ensure a real full-width row and resilient flex/min-width geometry for long content, mobile, cards, receipts. Avoid a cosmetic test of class presence only; add focused tests for identity and row ordering/alignment contract. Diagnose concrete previous failure before patching; report it.

## W2 — People UI and profile card

Owner: `src/shell/messages/people/{ProfileCard,PeopleView,ContactList,RequestsList}.tsx`, relevant `tests/im-people-view.test.mjs` or new focused tests. Do not edit message, Inbox, group info, APIs, backend, or shared CSS. Read-only inspection elsewhere allowed.

Reference: new failed UI `/root/oceanleo-inbox/20261019T132101Z-image.png`; desired stranger `/root/oceanleo-inbox/20261019T124409Z-image.png`, friend `/root/oceanleo-inbox/20261019T124530Z-image.png`, more menu `/root/oceanleo-inbox/20261019T124710Z-image.png`, new friends `/root/oceanleo-inbox/20261019T123858Z-image.png`, request menu `/root/oceanleo-inbox/20261019T124008Z-image.png`. Build a compact, visually coherent person profile card rather than the current giant generic dialog/form. Friend: clear identity header, remark and metadata rows, mutual groups/source/add date, message action; star/delete/block/report tucked into right-top More menu with danger distinction/confirmation. Stranger: prominent add-to-contacts. Contact page: no Contact/Requests/Blocked tabs; first item New Friends, request history/status. Right-click delete history. Preserve behavior and accessible focus/keyboard semantics; do not invent unavailable WeChat fields. Resolve the mixed English/Chinese and random giant button layout in the screenshot.

## W3 — Chat chrome, details, and menus

Owner: `src/shell/messages/{Inbox,InboxRow}.tsx`, `src/shell/messages/groups/ConversationInfoPanel.tsx`, relevant `tests/im-inbox.test.mjs`, `tests/im-info-panel.test.mjs` or new focused tests. Do not edit message item/list/view, people, APIs, backend, or shared CSS. Read-only inspection elsewhere allowed.

References: group remark/nickname `/root/oceanleo-inbox/20261019T123332Z-image.png`, `/root/oceanleo-inbox/20261019T123418Z-image.png`, input `/root/oceanleo-inbox/20261019T123434Z-image.png`; chat menu `/root/oceanleo-inbox/20261019T124050Z-image.png`; chat-only Details `/root/oceanleo-inbox/20261019T124847Z-image.png`; person card overlay `/root/oceanleo-inbox/20261019T124923Z-image.png`. Improve spatial hierarchy, density, typography, affordances and interaction states of existing code. Chat Details is for conversation/history only, never contact deletion. Group remark and my nickname should be quiet display rows with pencil, click to a focused editor. Right-click menu must be compact and coherent. Do not change route/API contracts.

## Acceptance and handoff

Each child: inspect references and source, implement within ownership, run focused tests via IO guard, run `git diff --check` for owned files, send exact changed-file list, concrete visual/logic changes, test command/results, and remaining risks. Parent will independently inspect files, rerun focused tests/typecheck, verify dev slot freshness and HTTP. Do not claim visual browser acceptance.
