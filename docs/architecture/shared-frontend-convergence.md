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
