# Changelog

All notable changes to the grale API specification are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Because grale is defined as a **data format** (JSON in, JSON out) rather than a
library, version numbers describe the specification, not a published package:

- **MAJOR** — a change that makes a previously valid request invalid, or changes
  the meaning of an existing field.
- **MINOR** — new optional fields or capabilities; every prior request stays valid.
- **PATCH** — clarifications, wording, and editorial fixes with no semantic change.

## [2.0.0] - 2026-07-04

### Changed (breaking)
- **`meta` → `data`.** The opaque passthrough field on every label (graph, node,
  edge, hyperedge) is renamed from `meta` to `data`. grale-reserved keys live
  under `data.grale`; engine-specific settings under `data.grale.engine` (e.g.
  the elk adapter's `algorithm` / `edgeRouting` / `layoutOptions`). A request
  still using `meta` now triggers an `UNKNOWN_FIELD` warning — this rename is
  the MAJOR change of this release.

### Added
- **`edgeRouting`** — graph-label routing-style hint
  `'orthogonal' | 'polyline' | 'spline'` (default `'polyline'`). A bias like
  `prefDir`: engines that cannot route the style fall back to their native one.
  Promoted from the ELK adapter analysis; the elk adapter maps it to
  `elk.edgeRouting`.
- **Adapter diagnostics.** Both adapters now emit the warnings the engine
  contract asks for: `UNKNOWN_FIELD` (typo detection), `DANGLING_EDGE`,
  and one aggregated `UNSUPPORTED` warning per accepted-but-not-honoured grale
  feature (shared `engines/engine-common.ts`).
- **`grale-dagre` adapter** — dagre as a stdin/stdout CLI engine (mirrors
  `grale-elk`), reporting pure layout time in `diagnostics.elapsedMicros`.
- **`SyncLayout` type** — `Layout` is now possibly-async
  (`graleGraph | Promise<graleGraph>`, matching the elk adapter); `SyncLayout`
  is the synchronous special case.
- **Renderer `<br>` support** — `renderSvg` honours the spec's one label markup
  and draws multi-line labels.
- **`<grale-view layers-visible>`** — the custom element now exposes the
  `layersVisible` prop of `GraleView`.

### Fixed
- **grale-dagre**: `hidden` edges no longer carry computed `points` (spec: a
  hidden edge constrains the layout but gets none); dangling edges are echoed
  and warned about instead of graphlib silently inventing the missing nodes.
- **grale-elk**: `layout` no longer mutates its argument (spec: pure function);
  `elapsedMicros` now has real microsecond resolution (`process.hrtime`)
  instead of `Date.now()` milliseconds ×1000.
- **Spec drift**: the spec's §"TypeScript types" no longer duplicates
  `api/types.ts` — the file is the single machine-readable source.

### Changed
- **Two-part layout.** The repo's two core parts are now top-level directories,
  each with its own README and a delegating root README: `api/` (the JSON layout
  contract types + the `grale-dagre` / `grale-elk` engine adapters + the spec
  docs) and `viewer/` (the engine-independent SVG renderer, the `grale-to-svg`
  CLI, and the `<grale-view>` web component). The `dist/` layout and the package
  `exports` / `bin` targets moved accordingly (`dist/api/…`, `dist/viewer/…`).
- **Repo split.** The evaluation framework (layout-quality metrics, the engine
  runner, snapshot runs, and the side-by-side compare app) moved to the separate
  `grale-eval` repo, which depends on this package via a `file:` link. This repo
  now contains the grale API, the SVG renderer, the dagre/elk engine adapters,
  and the reusable `<grale-view>` web component.
- **Test data** (in the `graph-test-data` repo) migrated `meta` → `data` and
  moved from `json/grale/grale-1.0.0/` to `json/grale/grale-2.0.0/`.

## [1.0.0] - 2026-06-16

First stable release of the grale API specification.

### Added
- **Positioning** — `pinned` (hard-fix a node at its `x`/`y`) and `focus`
  (centre the layout on a node or set).
- **Stability** — `prevLayouts` + `stability` to keep nodes near where they were
  across turns, even after a node disappears and returns.
- **Edge direction** — per-edge `prefDir` (rotates with `rankdir`), `hidden` links
  (constrain layout, not drawn), and `weight: 0` (drawn, doesn't constrain).
- **Attachment** — per-side `ports` (counter-clockwise) with `fromPort`/`toPort`;
  reusable `markers` (SVG-defs style, reserve space) with `startMarker`/`endMarker`.
- **Edges** — `lineWidth`, `cornerRadius`, self-loops, edges across cluster
  boundaries, and an optional `id`.
- **Hyperedges** — n-ary `hyperedges[]`, a set of node endpoints routed as a
  point-tree.
- **Output** — per-point `normals`, edge `crossings`, `zIndex`, and a
  `diagnostics` object (warnings, timing, displacement) that dagre does not return.
- **Passthrough** — `meta` on any label for renderer data the layouter ignores.
- **Debug** — `logLevel` and `visualDebug`.

### Compatibility
- Strict superset of the dagre serialised JSON envelope (graphlib's `json.write`
  format). Any serialised dagre graph is a valid grale request **unchanged**;
  grale only adds optional fields.

[2.0.0]: https://github.com/Calpano/grale-api/releases/tag/v2.0.0
[1.0.0]: https://github.com/Calpano/grale-api/releases/tag/v1.0.0
