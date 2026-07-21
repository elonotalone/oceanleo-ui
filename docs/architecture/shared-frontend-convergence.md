# Shared frontend convergence

## Product goal

Make `@oceanleo/ui` a stable thin-host platform for every OceanLeo front door
without assigning capabilities to site names and without rewriting the mature
artifact, embedded-editor, session, or cloud-browser wire protocols.

## Candidate architectures

1. **Additive facades with a strangler adapter (chosen).** Keep existing public
   components and protocol implementations, introduce typed domain contracts
   and pure controllers beside them, then route legacy props through one
   adapter. This follows the Strangler Fig and Ports-and-Adapters patterns:
   callers can migrate incrementally, while dependency rules and API snapshots
   make the new boundary enforceable. Failure mode: compatibility code can
   linger, so it must live in one named legacy module and be directly tested.
2. **Split into multiple npm packages immediately.** Artifact, library,
   workspace, session, workbench, and browser packages would make dependency
   direction physically explicit. This is mature monorepo practice, but it
   changes installation, peer-dependency, bundling, and release behavior for 31
   consumers at once. It is a poor fit for a no-version-bump convergence pass.
3. **Rewrite the shared shell around a new store/router.** A hard cutover could
   remove historical shapes quickly, but it would reimplement proven artifact
   and browser protocols and make behavioral parity difficult to demonstrate.
   The blast radius and rollback cost are too high.

## Chosen boundaries

`site-manifest` is the thin-host input. It normalizes canonical `siteKey`,
brand, shell/auth/credits, catalog aliases, canonical and legacy workspace
routes, declared adapters, and shared app context. Adapter declarations describe
integration points; they never grant or remove platform capabilities.

Public domain facades are `artifact`, `library`, `workspace`, `session`,
`workbench`, and `browser`. Facades may depend on contracts and existing
implementation modules. Domain implementations must not import facades, and
facades must not import each other. The checked dependency graph and public API
snapshot are executable architecture constraints.

`WorkspaceSurfaceModel` is the canonical right-pane model. Existing `CanvasTab`
callers pass through one `legacy-workspace-surface-adapter`; all label/id
guessing and React component-name reflection stay there until consumers adopt
typed slots and entries.

Library data/query/controller/thumbnail/view modules remain behind compatible
`WorkspaceLibrary` and `MaterialLibrary` component facades. Catalog navigation
and history decisions move to a pure controller. `TRUSTED_EDITOR_REGISTRY`
owns artifact-capability aliases and route descriptors. Cloud-browser transport
keeps its wire protocol but feeds decoded events into a pure reducer with an
explicit legal transition table.

Package exports use Node's explicit `exports` allow-list. Every subpath observed
in the authoritative 31-consumer scan remains available through a deliberate
compatibility export; the wildcard is removed.

## Falsifiable assumption

The core assumption is that current behavior can be represented by pure route,
surface, registry, and browser-state functions while existing components remain
compatibility facades. Before component wiring, a focused smoke imports and
executes the existing pure workspace route helpers; each extracted controller
then gets behavior tests before the facade delegates to it.

## July 2026 hot-path consolidation

### Canonical artifact context identity

Three chains were compared:

1. **One pure helper in `@oceanleo/ui/shell` (chosen).** Every site adapter
   delegates percent encoding and `olctx:v1` assembly to
   `canonicalArtifactContextId`. This uses the ECMAScript
   `encodeURIComponent` contract already shipped to all consumers, adds no
   service dependency, and leaves each adapter responsible only for its
   site/app policy. Failure mode: a consumer pinned before the helper exists
   cannot migrate, so package availability is checked before adapter edits.
2. **Server-issued context IDs only.** This makes the gateway the sole runtime
   issuer, but adds a request to otherwise local catalog navigation and removes
   the fail-closed context fallback used while a workspace is hydrating.
3. **Generated per-site context builders.** A manifest generator could keep
   formulas synchronized, but still emits duplicated production logic and
   couples every context change to generation plus a multi-repository rollout.

The invalidating assumption is that the shared helper does not reproduce the
authoritative rollout identities. A throwaway Node proof compared the real
helper with all 711 app contexts in the rollout inventory and found zero
mismatches, including trimmed and percent-encoded edge cases.

### Canonical creations client

Three chains were compared:

1. **One shared creations implementation with compatibility aliases (chosen).**
   `listCreations`, `saveCreations`, and `deleteCreation` own the
   `/v1/creations` transport and types. The historical works names are
   identity-equal aliases, not a second HTTP client, while currently deployed
   consumers converge through normal package releases. The image-site private
   client is deleted.
2. **Hard-rename every consumer in one pass.** This removes old names fastest,
   but seven TSV-resolved consumers currently import them and are pinned to a
   package version that does not export the new names. Changing those consumers
   before a shared-package release would fail type checking and deployment.
3. **Generate a new OpenAPI client per site.** OpenAPI generation is mature,
   but per-site output would recreate the ownership split, duplicate auth/error
   policy, and add generator/version alignment to a two-endpoint client.

The invalidating assumption is that the existing shared authenticated transport
cannot preserve the creations mixed-success envelope. A throwaway VM proof
executed the real client against a one-saved/one-failed response and preserved
the request body, stable identities, saved item, and `artifact_errors` on the
single `/v1/creations` endpoint. Regression tests additionally require the
legacy aliases to reference the canonical functions directly.

### Acceptance fixture boundary

Three chains were compared:

1. **Test-only fixture builders and orchestration support (chosen).** Keep the
   deterministic builders and fake-driven seed-engine regressions beneath
   `backend/tests/fixtures`, while deleting the production `app` modules, live
   Supabase acceptance test, and executable seeder. Production has no fixture
   import or command surface, and isolated tests retain the exact byte,
   checkpoint, binding, and reconciliation contracts.
2. **Leave the modules in `app` and hide only the CLI.** This removes the most
   obvious entrypoint but still ships 2,764 lines of fixture construction and
   database-capable orchestration beside runtime code.
3. **Delete the builders and all seed-engine coverage.** This minimizes source
   size, but discards deterministic regression coverage for source closures,
   durable blob verification, idempotent checkpoints, and exact bindings.

The invalidating assumption is that the same support cannot execute after
crossing the production/test boundary. A throwaway Python proof loaded all 14
fixtures and the seed engine under a `tests.*` namespace; the focused suite
also asserts that the former `app` modules and executable seeder are absent.

### Cloud-browser protocol authority

The already-shipped shared-browser chain remains the selected design:

1. **One shared package client, transport, and pure protocol reducer (chosen).**
   Hosts render `CloudBrowserPanel`; `cloud-browser-transport.ts` alone creates
   the browser WebSocket, and the protocol model owns decoding and transitions.
2. **Site-local browser hooks.** This would copy ticket, reconnect, paint-gate,
   and lease fencing into adapters and let pinned sites diverge.
3. **A second generated browser SDK beside the shared shell.** Generation would
   formalize schemas but create two live state machines and two release
   authorities for the same React surface.

The invalidating assumption is that an active host bypasses the shared
transport. A bounded source probe found one cloud-browser WebSocket constructor
in the shared package, one decoder/reducer authority, and no cloud-browser
protocol client in the affected TSV-resolved adapters. Protocol v2 remains a
deliberate gateway transition island, not a copied site client.
