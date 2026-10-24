# Integrated repair

Parent integration covers skill-library category dropdown beside search, moving message privacy copy from Settings to the LeoChat Help article, session-based model-settings initialization with one catalog fetch, deferred first mounting of unused model/BYOK panes while preserving visited forms, and account-specific model-manager state.

Verified shared UI and portal TypeScript checks. Parent reran focused DOM tests for project payer/history, model groups/search, connector lifecycle/catalog and skill library, settings initialization and model contracts. Portal project tests passed; backend project/MCP/catalog checks passed, including explicit auth failure vs temporary failure, credential reuse target binding, per-request BYOK isolation and gzip negotiation. Development HTTP checks cover original project URL, settings URL, help article and model catalog. No browser automation was used.

Model catalog initially timed out after 25 seconds. After eliminating repeated classification and preset scans, localhost warm response was 0.118s; its 2,236,065-byte uncompressed payload required additional catalog-only gzip. Developer preview continues linking the shared workspace package, with no stale slots.
