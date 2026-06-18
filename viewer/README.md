# grale viewer — the engine-independent runner

This directory draws a grale **result** graph — positions filled in by *any* engine — to SVG. It
is engine-independent: it reads only the grale output ([`api/`](../api)), never how the layout was
produced. Two front-ends share one renderer, so the command line and the browser produce identical
output.

- [`render/svg.ts`](render/svg.ts) — the pure, DOM-free renderer (`renderSvg`)
- [`grale-to-svg.ts`](grale-to-svg.ts) — the CLI that writes an `.svg` file
- [`GraleView.svelte`](GraleView.svelte) / [`GraleElement.svelte`](GraleElement.svelte) — the
  `<grale-view>` web component (pan/zoom, overlays, link interaction)

## Renderer

```ts
import { renderSvg } from 'grale/render';

const svg = renderSvg(resultGraph, { debug: true });   // -> SVG string
```

`debug: true` (and the granular overlay flags) overlay waypoints, per-point `normals`, `crossings`,
node centres/coords, the layout bounding box, link-id badges, and `diagnostics.warnings`.

## CLI

Convert a result JSON to an `.svg` file, with a live `--watch` mode:

```bash
npx grale-to-svg layout.out.json            # -> layout.out.svg
npx grale-to-svg layout.out.json -d --watch # debug overlays, re-render on change
# options: -o <file>, -w/--watch, -d/--debug, --padding <px>, --bg <color>
```

## Web component

`<grale-view>` is a custom element with pan/zoom, toggleable overlay categories (positions, box
centers, link points, bends, crossings, branches, normals, link ids), engine debug layers
(`graph.debug`), full-screen, and link click/hover highlighting.

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

To embed `GraleView` inside another Svelte app, import it from the package:

```ts
import GraleView from 'grale/viewer/GraleView.svelte';
```

(this is exactly how the [grale-eval](../../grale-eval) compare app renders its panes.)

See [`../examples/sample.out.json`](../examples/sample.out.json) for a result graph exercising
markers, ports, a hyperedge, crossings and diagnostics.
