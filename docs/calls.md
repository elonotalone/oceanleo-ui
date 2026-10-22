# Audio and video calls

## Person to person calls

Calls are Slack-style huddles: one tap on the headset button ("通话", Call)
joins straight away — no preview, no microphone check, no invitation or
approval, no host. Talent (trade) conversations have no call. During the
development phase the platform absorbs the supplier cost; the client shows no
balance or billing wording (the gateway still meters usage).

The engine has no UI. It lives in `src/shell/messages/call/engine/`
(`index.ts` is the public surface, `controller.ts` the state machine with all
dependencies injected) and the gateway client in `src/lib/im/calls-api.ts`
(`/v1/im/conversations/{cid}/call`, `/v1/im/calls/{call_id}/join|leave|token|heartbeat|decline`,
`/v1/im/calls/test-token`). There is one engine per browser tab, so moving
between pages keeps the call; the floating dock and the enlarged stage only
render `useCall()` and drive `callActions`.

Joining: the ARTC Web SDK (`aliyun-rtc-sdk` 7.3.8, bundled through
`import("aliyun-rtc-sdk")`; falls back to the Aliyun CDN script) is loaded
first, then the gateway is asked to start or join, then a fresh SDK instance
(`AliRtcEngine.createInstance()`) is set to interactive-live mode with the
broadcaster role and joins with the gateway's single-parameter base64 token
(`joinChannel(token, name)`), the same settings as the Android, iOS and
HarmonyOS bridges. Defaults are microphone on and camera off; the last choices
and the selected microphone, camera and speaker are remembered locally (only
choices the user made — a refused permission is not remembered). The SDK calls
`authInfoWillExpire` 30 s before the token lapses; the engine fetches a new
token for the same participant and calls `refreshAuthInfo(token)`. An expired
token or a failed connection triggers a rejoin with a new SDK instance; the
dock shows "reconnecting" meanwhile.

Who is in the call follows the SDK's remote online/offline and track events.
The server `call` event only adds names, avatars and media state. Someone the
SDK reports as timed out but the server still lists is shown as reconnecting
for at most two minutes. Remote audio is always received and played by the
SDK. Video is received only for tiles on screen (`setViewport`), plus the
sharer's screen while the enlarged stage is open; "audio only" stops all
incoming video. Tiles keep their entry order with yourself first; speaking
lights a tile without moving it. When the dock (4 tiles) is full, a hidden
person who speaks for 2.5 s takes the slot of the tile silent the longest,
swaps are at least 5 s apart, and anyone who spoke in the last 3 s is never
swapped out. The stage pages the same order (9 tiles, 4 on phones).

While in a call the engine sends a heartbeat every 30 s with microphone,
camera and screen state (and soon after any change). Alone for 10 minutes, it
starts a 60 s countdown and then leaves unless cancelled. A missed or declined
one-to-one ring ends the caller's empty call. Removal from the conversation
(`call_kicked`), the server ending the call, or the same participant joining
in another tab ends the local call with a reason. At most 25 cameras may be
on at once; the 26th gets a `video_full` notice instead of turning on.
Incoming rings (`call_ring`) appear as `incoming` on every page; accepting
joins that call, declining tells the gateway.

Notices (`issues`) cover refused or missing devices, a microphone that stays at
zero level for 8 s, an unplugged device (the engine falls back to the default
or first remaining device), and poor or lost network. Network bars and
`getStats()` come only from SDK statistics (round trip from the candidate pair,
throughput from byte deltas, download loss from the SDK quality report);
values the SDK does not expose, such as upload loss, stay `null`. A separate
SDK instance (`createDiagnosticsEngine()`) runs the connection test without
touching an active call. Leo realtime calls and person to person calls share
one claim, so only one of them can hold the microphone.

Real microphone, camera, screen and network behaviour must be verified against
the configured LeoDev gateway in a browser; unit tests replace the SDK.

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
