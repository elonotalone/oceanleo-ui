# BYOK session-age restriction removed

Operator requested comparison with Manus and removal of the repeated-login BYOK flow. Manus's official Flex announcement describes connecting a key and selecting a model without documenting a two-hour reauthentication step: https://manus.im/blog/introducing-manus-flex . This is evidence about its documented normal flow, not proof that its internal risk controls never request extra verification.

OceanLeo BYOK create/update/delete/probe now depend on the normal authenticated-user dependency rather than require_recent_auth. No cookie, encryption, account-binding, SSRF, or normal token validation changes. Other sensitive workflows retain their existing gates. The BYOK frontend no longer offers the extra forced sign-out/relogin action.

Backend regression: old valid sessions can save, edit, delete, and probe without session-age queries; missing/invalid authentication still returns 401 for every affected route. Focused backend checks 30 passed; BYOK UI checks 13 passed. Parent owns shared typecheck and LeoDev integration.
