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

## [Unreleased]

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

### Added
- **`grale-dagre` adapter** — dagre as a stdin/stdout CLI engine (mirrors
  `grale-elk`), reporting pure layout time in `diagnostics.elapsedMicros`.

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

[1.0.0]: https://github.com/dagrejs/graph-layout-api/releases/tag/v1.0.0
