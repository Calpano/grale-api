# grale — a Graph Layout Engine API

grale is a **gra**ph **l**ayout **e**ngine API, defined as JSON input and output specifications:
it takes the serialised form of a dagre graph (graphlib's `json.write` format) and returns the
same structure with positions filled in — plus a set of capabilities dagre lacks. Any dagre graph
is a valid grale request **unchanged**; grale only adds optional fields.

This repository has **two core parts**, each in its own directory with its own README:

| Part | Directory | What it is |
|---|---|---|
| **Layout API** | [`api/`](api/) — [README](api/README.md) | The JSON layout contract (the `graleGraph` types), the engine **adapters** that fulfil it (`grale-dagre`, `grale-elk`, or any stdin→stdout command), and the normative spec. *What a layout is, and how engines produce one.* |
| **Engine-independent runner** | [`viewer/`](viewer/) — [README](viewer/README.md) | The DOM-free SVG **renderer** and the `<grale-view>` web component that draw a grale result from **any** engine, plus the `grale-to-svg` CLI. *How a layout — whoever produced it — gets viewed.* |

```
   api/  ── grale JSON contract + engine adapters ──▶  a grale result graph
                                                              │
   viewer/ ── renderer + <grale-view> web component ──────────┘  (engine-independent)
```

```ts
import type { graleGraph } from 'grale';        // the layout contract (api/)
import { renderSvg } from 'grale/render';        // draw any result to SVG (viewer/)
```

> **Status: specification — version 1.0.0.** The full normative spec lives in
> [`api/doc/graph-layout-api.adoc`](api/doc/graph-layout-api.adoc); the dagre baseline it supersets
> is in [`api/doc/dagre-js.adoc`](api/doc/dagre-js.adoc). See [`CHANGELOG.md`](CHANGELOG.md) for the
> release history.

## Related

The **evaluation framework** — layout-quality metrics, snapshot runs, and the side-by-side compare
app — lives in the separate **[grale-eval](../grale-eval)** repo, which depends on this package and
renders with the `<grale-view>` component from `viewer/`.

## License

[MIT](LICENSE) © Max Völkel
