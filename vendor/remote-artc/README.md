# Receive-only remote viewer dependency

`aliyun-rtc-sdk.private.mjs` is mechanically generated from the project's
already pinned npm dependency `aliyun-rtc-sdk@7.3.8`, not a new RTC engine.
Upstream source digest:
`ef9c768984463027dad8aa064bda7180d1fecb23c037902b5bc264797dc6c74d`.

Regenerate with `node scripts/prepare-private-artc-sdk.mjs`. The generator
refuses any other input digest or unexpected patch anchors. Commit the output
so consumer builds receive the exact reviewed artifact without install hooks.
The existing package files list includes vendor/. SDK provenance and terms
remain those of the original Alibaba package; this patch makes no licensing
or redistribution entitlement claim.

The SDK's NONE setting only silences the console; its API collector still
serializes join/renew tokens and its structured logger has auth fields.
This copy disables both collectors before serialization and disables their
diagnostic STS/upload scheduling, independent RTS signed-URL reporter, and
ARMS error/health proxy. A module-local console sink suppresses direct RTS
retry logs without modifying the application's global console.
It does not change channel authentication,
media decoding, subscriptions or RTC statistics events. One signalling change:
the RTS edge SDP exchange (`artc://` subscribe / publish / data channel) always
uses `https://`; upstream copied the page scheme, which inside the Windows
desktop webview (`http://tauri.localhost`) meant clear-text SDP and tokens to
`http://<edge>` (refused by the desktop CSP, so the viewer never got video). The remote
viewer imports only this module and fails closed instead of loading an
unpatched npm/CDN fallback. The existing call loader is unchanged.

Test with the deterministic-output regression and the independent V sentinel
test against this actual generated file. Synthetic tests prove the specific
logging paths are disabled; they do not prove video rendering or performance.
