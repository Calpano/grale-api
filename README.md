# grale api -- a Graph Layout Engine API

**A graph-layout API for TypeScript — a strict superset of [dagre](https://github.com/dagrejs/dagre).**

Grale is defined as a **data format**: JSON in, JSON out. It takes the serialised form of a
dagre graph (graphlib's `json.write` format) and returns the same structure with positions
filled in — plus a set of capabilities dagre lacks. Any dagre graph is a valid grale request
**unchanged**; grale only adds optional fields.

```ts
import { layout } from 'grale';

const out = layout(graphJson);   // graleGraph -> graleGraph (positions filled in)
```

> **Status: specification.** This repository defines the API. The full normative spec lives in
> [`doc/spec-grale-api.adoc`](doc/spec-grale-api.adoc); the dagre baseline it supersets is in
> [`doc/dagre-js.adoc`](doc/dagre-js.adoc).

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

See the [full specification](doc/spec-grale-api.adoc) for every field, its type, default, and
semantics, plus the TypeScript definitions and the compatibility matrix.

## Documentation

| File                                                 | What                                                       |
|------------------------------------------------------|------------------------------------------------------------|
| [`doc/spec-grale-api.adoc`](doc/spec-grale-api.adoc) | The normative grale API specification                      |
| [`doc/dagre-js.adoc`](doc/dagre-js.adoc)             | The dagre serialised-JSON baseline grale supersets         |
| [`doc/dagre-issues.adoc`](doc/dagre-issues.adoc)     | Snapshot of open dagre issues that motivated the additions |

## License

[MIT](LICENSE) © Max Völkel
