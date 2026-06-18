# grale layout API

The **layout API** part of grale: the JSON input/output contract a layout engine implements, and
the reference engine **adapters** that fulfil it. The renderer and web component that *draw* a
result live in the sibling [`viewer/`](../viewer) directory.

```ts
import type { graleGraph, NodeLabel, EdgeLabel, Hyperedge, Diagnostics } from 'grale';
```

## Why

dagre is the de-facto layered graph layout for JS, but its open issues list things it can't yet
do: pinning nodes, keeping a layout stable as the graph changes, controlling edge direction,
ports, reporting crossings, returning diagnostics. grale keeps dagre's exact data shape so existing
code drops in, and adds those capabilities as optional fields. It is a superset of the
**interface**.

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

A layout returns the same structure with `x`/`y` on nodes, `points` on edges, and `width`/`height`
on the graph label filled in.

## Drop-in for dagre

Any dagre/graphlib graph becomes a grale request by serialising it — no change to how the graph was
built:

```ts
import * as graphlib from '@dagrejs/graphlib';

const req = graphlib.json.write(g);   // serialise dagre graph -> grale request
// ...lay it out with any engine adapter below...
const g2  = graphlib.json.read(out);  // back to a graph, positions in the labels
```

## What grale adds (all optional)

Every addition is an optional field on a label; set none and the request reduces exactly to dagre.

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

The JSON input/output types are realised as TypeScript in this directory — the `graleGraph`
envelope ([`types.ts`](types.ts)) and the graph / node / edge / hyperedge labels — and re-exported
from the package root ([`index.ts`](index.ts)):

```ts
import type { graleGraph, GraphLabel, NodeLabel, EdgeLabel, Hyperedge, Diagnostics } from 'grale';
```

## Engine adapters

grale ships two engines as CLI **adapters** ([`engines/`](engines)) that read a grale graph on
stdin (or a file-path argument) and write the laid-out grale JSON on stdout — the
[engine contract](doc/engine-contract.adoc):

```bash
npx grale-dagre layout.json   # dagre (@dagrejs/dagre)         — engines/grale-dagre.ts
npx grale-elk   layout.json   # elk.js (see doc/grale-elk.adoc) — engines/grale-elk.ts
```

Both report their pure layout time in `diagnostics.elapsedMicros`. Any command that follows the
same stdin → stdout contract (`{}` in the command = the input file path) is a grale engine, so cale
or your own engine drops in the same way.

## Documentation

| File | What |
|------|------|
| [`doc/graph-layout-api.adoc`](doc/graph-layout-api.adoc) | The normative grale API specification |
| [`doc/engine-contract.adoc`](doc/engine-contract.adoc) | What a layout engine must do to be a grale engine |
| [`doc/grale-elk.adoc`](doc/grale-elk.adoc) | grale ↔ ELK (elk.js) comparison + adapter plan |
| [`doc/dagre-js.adoc`](doc/dagre-js.adoc) | The dagre serialised-JSON baseline grale supersets |
| [`doc/dagre-issues.adoc`](doc/dagre-issues.adoc) | Snapshot of open dagre issues that motivated the additions |
