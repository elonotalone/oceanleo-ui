# Shared 12-feature capability plane

## Product outcome

All OceanLeo consumers use one `@oceanleo/ui` feature → artifact → editor
capability → adapter matrix. A site key selects an exact material context; it
never enables, disables, or changes an editor. Contextual App shelves may
require an exact revision-pinned binding, while the global More Materials shelf
may route any otherwise valid typed artifact.

## Dispatch architecture comparison

| Candidate | Mature components and interoperability | Guarantees and environment fit | Moving parts and known failure modes |
| --- | --- | --- | --- |
| **A. Immutable typed matrix with derived indexes** | TypeScript literal/discriminated-union checking, standard `Map` indexes, the existing `oceanleo.artifact.v1` projection, and existing React lazy route adapters. The matrix is exported through `@oceanleo/ui`; dispatch consumes the existing artifact/revision/source receipt. | One package identity for all consumers, deterministic fail-closed dispatch, no network discovery, negligible CPU/memory, and no browser/NAT dependency. Exact-context policy remains an orthogonal input. | One matrix, derived adapter registry, and one resolver. A producer that cannot emit the declared typed capability/source receipt is rejected rather than guessed. |
| B. Runtime adapter plugin negotiation | React dynamic imports plus a versioned editor-manifest handshake. Interoperates through runtime registration and protocol negotiation. | Extensible without rebuilding the matrix, but route identity depends on registration order and loaded chunks. | Plugin lifecycle, version negotiation, timeout/error states, and fallback policy. Missing or duplicated registration can make identical consumers resolve differently. |
| C. Shared base with per-site capability overlays | Static site manifests merged with a shared registry. Interoperates through consumer configuration. | Can tailor each front door, but makes the site key a feature boundary and multiplies rollout state across every consumer. | Base matrix plus one overlay per site. Drift, stale package pins, and contradictory allow/deny rules are expected failure modes. |

## Decision

Choose candidate A. The canonical matrix is authoritative; presentation
metadata, route registries, and lookup indexes are projections of it. Dispatch
matches typed artifact fields and source integrity first, then applies either
exact-context policy or global policy without changing the chosen feature or
adapter. Document, grid, and deck rows target the lightweight `richdoc`, `grid`,
and `deck` adapters; `office`/native Chrome is not a routable matrix target.

Rejected B has more runtime states without a product requirement for third-party
plugins. Rejected C directly violates the shared capability-plane invariant.

## Falsifying assumption

The chosen chain is invalid if any of the 12 feature rows requires a different
adapter for the same valid artifact receipt merely because the consumer site
key changes.

## Proof and acceptance

Before production edits, a throwaway matrix proof must enumerate all 12 rows
against the 32 shared-UI consumer contexts and show one adapter identity per
feature, including distinct `design-canvas`, `image`, and `video-canvas`
adapters and lightweight `richdoc`, `grid`, and `deck` document adapters.

Production acceptance then enumerates the same feature/context cross-product,
rejects incompatible source/capability pairs, distinguishes exact-context from
global routeability, and keeps `artifactId + revisionId` in the successful
dispatch receipt.

Pre-edit proof result on 2026-07-23: **PASS** — 12 feature rows × 32 consumer
contexts = 384 host-independent dispatches; no row targeted `office`, while
document, grid, and deck targeted `richdoc`, `grid`, and `deck`.

## Shared integration closure

`office` is absent from the canonical adapter registry, `EditorRoute` output,
and the advanced workbench host. Historical `office` metadata, App snapshots,
and inline-editor heads are compatibility inputs only: typed Office sources
upgrade to `richdoc`, `grid`, or `deck`; ambiguous sources fail closed. The
compatibility `OfficeRoute` module is therefore not reachable from shared
dispatch.

Timeline and 3D director contracts enter the package only through Owner 9's
`video-editor/capabilities` and `media-editors/model3d-capabilities` barrels.
The shared shell, package root, and workbench facade re-export those barrels;
none re-export Owner 9 implementation modules directly.
