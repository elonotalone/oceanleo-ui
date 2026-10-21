# Library and conversation integration decision

The operator requires identical conversation/editor split UI whether editing from a task's Library or opening the agent from the full Library. Closing and maximizing the right pane must preserve the existing conversation and editor runtime. Home submission must immediately show the conversation; received text must reveal continuously.

## Host choice

Reuse React AgentChat -> SplitWorkspace with an explicit right-content slot. Existing task entries retain their current host; full Library installs that same host once. It uses the existing React context/portal interfaces and keeps editor identity stable while showing the conversation. Fit: current Next/React application, no extra process or network hop. Failure to test: hidden conversation accidentally remounts editor, or editor agent loses material context.

Rejected: copying SplitWorkspace CSS into a standalone assistant retains separate lifecycle/state ownership and guarantees visual drift. Rejected: embedding a complete AgentChat inside another SplitWorkspace nests two workspace controllers. Rejected: navigating Library edit to another site/history runtime loses current task/material identity. All three can render the same editor but cannot guarantee the same mounted conversation and pane controls.

## Streaming choice

Keep the existing durable task transcript transport, show the actual conversation immediately during task creation, and progressively reveal only the active received response by Unicode grapheme. Catch up within a bounded interval; completed history must display immediately. The engine persists partial content approximately every 0.33 seconds or 120 characters, while AgentChat currently polls. This batch does not substitute unrelated stateless chat SSE for durable task execution. Tests must distinguish display cadence from provider/model first-token latency; no claim of faster model inference follows from a UI fix.

## Save choice

Keep the existing committed-item identity, CAS session writes and persistence controller. Retry a transient session registration failure using the already committed item; preserve explicit conflicts and permanent errors. Re-uploading content on registration retry risks duplicate versions; swallowing registration failure falsely acknowledges a save. Neither is acceptable.

## Verification contract

Runtime React tests must exercise pane controls and mount preservation, task/Library context, delayed task creation, active response growth/completion, render-loop regression, and transient/permanent session failures. Typecheck shared UI and portal. Check the running LeoDev slots for linked current source. No browser automation or screenshots are authorized for this task.
