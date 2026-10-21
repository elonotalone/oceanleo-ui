# Audio and video calls

## Person to person meetings

The meeting panel is hosted by the global MessagesHost, so changing LeoChat
surface or conversation does not dispose an active SDK engine. Its minimized
button returns to the same meeting. Closing an idle panel releases the host;
ending, leaving, page unload, and a failed join stop local media and release
the server participant.

The panel loads the server's ARTC and metering readiness before enabling join.
Before joining, the caller can select the microphone and camera; those choices
are applied with the ARTC SDK's documented device enumeration/switch methods
([AliRtc device management](https://help.aliyun.com/zh/live/audio-and-video-equipment-management)).
Microphone permission is checked before joining. The SDK joins with microphone,
camera, and screen publication disabled; each control changes local UI state
only after the SDK promise settles. Remote audio and video subscriptions are
enabled independently, and the client preserves the other modality when one
changes. Invitations remain unbilled until accepted and joined.

Bills shown in the panel come from the meeting bill endpoint. They show
server-measured connected time, per-participant per-minute tariff, included
audio/video/screen modalities, settled amount, refundable/held reserve, and
whether reconciliation is pending. Raw provider events and the tariff snapshot
remain available as an advanced audit view. A reserve is not described as a
charge, and pending reconciliation is not described as final. Wallet balance is
only a prejoin hint; server admission and provider events remain authoritative.

## Leo realtime conversations

The Real-time call entry appears in the normal Leo assistant header when its
server-backed conversation is selected. It creates a separately admitted
server realtime session. The browser gets only the session identifier and
same-origin stream path, then authenticates the WebSocket in its first text
frame with the current Supabase access token. No provider key reaches the
browser.

Microphone PCM is captured through AudioWorklet, converted to signed 16 bit
little-endian mono, resampled to the server-provided input rate, and sent in
20 ms chunks. The browser queues server PCM output and flushes that queue when
the user interrupts Leo. Camera and screen capture are off by default; when
enabled, each sends separately labeled, reduced-size JPEG frames. Transcript
events are shown in the call panel.

Minimizing keeps the global call host and media session alive. End, remote
close, connection loss, and host unload stop local tracks and close the socket.
Reconnect creates a new admitted session. The end receipt is fetched from the
server ledger and separates settled charges from refundable/held reserves,
shows server usage and recognized token counts, and labels unresolved
reconciliation as pending. The page does not infer cost from elapsed time or
client usage.

Provider keys, exact supported tariffs, and real microphone/camera/screen
provider operation must be verified in the configured LeoDev environment.
Until then, the backend should return a precise unavailable/configuration
diagnostic and the UI leaves media stopped.
