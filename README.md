# grale - a Graph Layout Engine API

grale is a **gra**ph **l**ayout **e**ngine API, defined as JSON input and output specifications.

It takes the serialised form of a
dagre graph (graphlib's `json.write` format) and returns the same structure with positions
filled in — plus a set of capabilities dagre lacks. Any dagre graph is a valid grale request
**unchanged**; grale only adds optional fields.

```ts
import { layout } from 'grale';

const out = layout(graphJson);   // graleGraph -> graleGraph (positions filled in)
```

> **Status: specification — version 1.0.0.** This repository defines the API. The full normative
> spec lives in [`doc/graph-layout-api.adoc`](doc/graph-layout-api.adoc); the dagre baseline it
> supersets is in [`doc/dagre-js.adoc`](doc/dagre-js.adoc). See
> [`CHANGELOG.md`](CHANGELOG.md) for the release history.

---

## Why

dagre is the de-facto layered graph layout for JS, but its open issues has some things it
can't yet do: pinning nodes, keeping a layout stable as the graph changes, controlling edge
direction, ports, reporting crossings, returning diagnostics. 
grale keeps dagre's exact data
shape so existing code drops in, and adds those capabilities as optional fields.

It is a superset of the **interface**.

## Install

```bash
npm install graph-layout-api
```

## The shape of a request

grale uses the dagre / graphlib serialised envelope — `options`, a graph label `value`, and
`nodes` / `edges` whose `value` is the node/edge label:

```json5
{
  "options": { "directed": true, "multigraph": false, "compound": false },
  "value": { "rankdir": "LR" },
  "nodes": [
    { "v": "a", "value": { "width": 60, "height": 40 } },
    { "v": "b", "value": { "width": 60, "height": 40 } }
  ],
  "edges": [
    { "v": "a", "w": "b", "value": { "minlen": 1, "weight": 1 } }
  ]
}
```

`layout()` returns the same structure with `x`/`y` on nodes, `points` on edges, and
`width`/`height` on the graph label filled in.

## Drop-in for dagre

Any dagre/graphlib graph becomes a grale request by serialising it — no change to how the
graph was built:

```ts
import * as graphlib from '@dagrejs/graphlib';
import { layout } from 'grale';

const out = layout(graphlib.json.write(g));   // serialise dagre graph -> grale
const g2  = graphlib.json.read(out);          // back to a graph, positions in the labels
```

## What grale adds (all optional)

Every addition is an optional field on a label; set none and the request reduces exactly to
dagre.

| Group | Fields |
|---|---|
| **Positioning** | `pinned` (hard-fix a node at its `x`/`y`), `focus` (centre the layout on a node or set) |
| **Stability** | `prevLayouts` + `stability` — keep nodes near where they were across turns, even after a node disappears and returns |
| **Edge direction** | `prefDir` (per-edge, rotates with `rankdir`), `hidden` links (constrain layout, not drawn), `weight: 0` (drawn, doesn't constrain) |
| **Attachment** | `ports` (per-side, counter-clockwise) + `fromPort`/`toPort`; `markers` (reusable, reserve space, SVG-defs style) + `startMarker`/`endMarker` |
| **Edges** | `lineWidth`, `cornerRadius`, self-loops, edges across cluster boundaries, optional `id` |
| **Hyperedges** | n-ary `hyperedges[]` — a set of node endpoints, routed as a point-tree |
| **Output** | per-point `normals`, edge `crossings`, `zIndex`, and a `diagnostics` object (warnings, timing, displacement) — none of which dagre returns |
| **Passthrough** | `meta` on any label for renderer data the layouter ignores |
| **Debug** | `logLevel`, `visualDebug` |

See the [full specification](doc/graph-layout-api.adoc) for every field, its type, default, and
semantics, plus the TypeScript definitions and the compatibility matrix.

## TypeScript types

The JSON input/output types are realised as TypeScript in [`src/grale/`](src/grale) — the
`graleGraph` envelope and the graph / node / edge / hyperedge labels — and re-exported from the
package root:

```ts
import type { graleGraph, GraphLabel, NodeLabel, EdgeLabel, Hyperedge, Diagnostics } from 'grale';
```

## Rendering, CLI & viewer

A grale **result** graph (positions filled in) renders to SVG through one shared, DOM-free
function, so the command line and the browser produce identical output.

```ts
import { renderSvg } from 'grale/render';

const svg = renderSvg(resultGraph, { debug: true });   // -> SVG string
```

**CLI** — convert a result JSON to an `.svg` file, with a live `--watch` mode:

```bash
npx grale-to-svg layout.out.json            # -> layout.out.svg
npx grale-to-svg layout.out.json -d --watch # debug overlays, re-render on change
# options: -o <file>, -w/--watch, -d/--debug, --padding <px>, --bg <color>
```

`--debug` overlays waypoints, per-point `normals`, `crossings`, node centres/coords, the layout
bounding box, and the `diagnostics.warnings`.

**Web component** — a Svelte/Vite viewer exposing a `<grale-view>` custom element with pan/zoom:

```bash
npm run dev          # demo: render examples/sample.out.json with the viewer
npm run build:viewer # bundle the viewer (and the <grale-view> element)
```

```html
<grale-view debug></grale-view>
<script type="module">
  document.querySelector('grale-view').graph = resultGraph;  // set the JSON property
</script>
```

See [`examples/sample.out.json`](examples/sample.out.json) for a result graph exercising
markers, ports, a hyperedge, crossings and diagnostics.

## Engine adapters

grale ships two engines as CLI **adapters** that read a grale graph on stdin (or a file-path
argument) and write the laid-out grale JSON on stdout — the
[engine contract](doc/engine-contract.adoc):

```bash
npx grale-dagre layout.json   # dagre (@dagrejs/dagre)
npx grale-elk   layout.json   # elk.js — see doc/grale-elk.adoc
```

Both report their pure layout time in `diagnostics.elapsedMicros`. Any command that follows the
same stdin → stdout contract (`{}` in the command = the input file path) is a grale engine, so
cale or your own engine drops in the same way.

## Evaluation

Measuring layout quality and comparing engines — **metrics**, timestamped **snapshot runs**, and
the side-by-side **compare app** — lives in the separate
**[grale-eval](../grale-eval)** repo, which depends on this package (`file:` link). Go there to
score layouts (`computeMetrics`), run dagre / elk / cale over the
[graph-test-data](https://github.com/Calpano/graph-test-data) datasets, and diff two runs
visually. This package stays focused on the grale API, the renderer, the engine adapters, and the
`<grale-view>` component that grale-eval renders with.

## Documentation

| File                                                 | What                                                       |
|------------------------------------------------------|------------------------------------------------------------|
| [`doc/graph-layout-api.adoc`](doc/graph-layout-api.adoc) | The normative grale API specification                   |
| [`doc/engine-contract.adoc`](doc/engine-contract.adoc) | What a layout engine must do to be a grale engine          |
| [`doc/grale-elk.adoc`](doc/grale-elk.adoc)           | grale ↔ ELK (elk.js) comparison + adapter plan             |
| [`doc/dagre-js.adoc`](doc/dagre-js.adoc)             | The dagre serialised-JSON baseline grale supersets         |
| [`doc/dagre-issues.adoc`](doc/dagre-issues.adoc)     | Snapshot of open dagre issues that motivated the additions |
| [`CHANGELOG.md`](CHANGELOG.md)                        | Release history; current version **1.0.0**                 |

## License

[MIT](LICENSE) © Max Völkel
