<script lang="ts">
  import { SvelteMap } from 'svelte/reactivity';
  import { renderSvg } from './render/svg';
  import type { graleGraph, DebugLayer, DebugNode } from '../api/types';

  let {
    graph = null,
    debug = false,
    padding = 24,
  }: { graph?: unknown; debug?: boolean; padding?: number } = $props();

  function safeParse(s: string): unknown {
    try {
      return JSON.parse(s);
    } catch {
      return { __error: 'Invalid JSON' };
    }
  }

  const model = $derived(
    typeof graph === 'string' ? (graph.trim() ? safeParse(graph) : null) : (graph ?? null),
  );

  // overlay categories — the `debug` prop turns on the default set
  let ov = $state({
    positions: debug,
    diagramArea: debug,
    boxCenters: debug,
    linkPoints: debug,
    bends: debug,
    crossings: debug,
    branches: debug,
    normals: false,
    linkIds: false,
  });

  const result = $derived.by(() => {
    if (!model) return { svg: '', error: 'No graph loaded' };
    if (typeof (model as { __error?: string }).__error === 'string')
      return { svg: '', error: (model as { __error: string }).__error };
    try {
      return { svg: renderSvg(model as graleGraph, { ...ov, padding }), error: '' };
    } catch (e) {
      return { svg: '', error: e instanceof Error ? e.message : String(e) };
    }
  });

  // make the rendered SVG scale to fill (and centre within) the canvas
  const responsive = (svg: string): string =>
    svg.replace(
      /(<svg\b[^>]*?)\s+width="[^"]*"\s+height="[^"]*"/,
      '$1 width="100%" height="100%" preserveAspectRatio="xMidYMid meet"',
    );

  // --- debug layers ---
  const layers = $derived(
    ((model && typeof model === 'object' ? (model as graleGraph).debug : undefined) ?? []) as DebugLayer[],
  );
  const childLayers = (l: DebugLayer): DebugLayer[] =>
    l.children.filter((c: DebugNode): c is DebugLayer => c.kind === 'layer');

  // user toggle overrides (path -> visible); absent = use the layer's own `visible`
  const overrides = new SvelteMap<string, boolean>();

  const hidden = $derived.by(() => {
    const set = new Set<string>();
    const walk = (nodes: DebugLayer[], prefix: string) => {
      for (const l of nodes) {
        const path = prefix ? `${prefix}/${l.name}` : l.name;
        const visible = overrides.has(path) ? overrides.get(path)! : l.visible !== false;
        if (!visible) set.add(path);
        walk(childLayers(l), path);
      }
    };
    walk(layers, '');
    return set;
  });

  // apply layer visibility to the rendered <g data-layer-path> groups (a DOM side effect)
  $effect(() => {
    result.svg; // re-run after each re-render
    const hide = hidden; // re-run on toggle
    const root = stageEl;
    if (!root) return;
    for (const el of root.querySelectorAll<SVGElement>('[data-layer-path]')) {
      const p = el.getAttribute('data-layer-path');
      el.style.display = p && hide.has(p) ? 'none' : '';
    }
  });

  const toggle = (path: string) => overrides.set(path, hidden.has(path));

  // --- full screen ---
  let rootEl = $state<HTMLDivElement | undefined>(undefined);
  let isFull = $state(false);

  $effect(() => {
    const onChange = () => {
      isFull = !!document.fullscreenElement && (document.fullscreenElement === rootEl || !!rootEl?.contains(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  });

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else rootEl?.requestFullscreen?.();
  }

  // --- pan & zoom ---
  let stageEl = $state<HTMLDivElement | undefined>(undefined);
  let panelOpen = $state(true);
  let scale = $state(1);
  let tx = $state(0);
  let ty = $state(0);
  let panning = false;
  let startX = 0;
  let startY = 0;
  let baseTx = 0;
  let baseTy = 0;

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const next = Math.min(8, Math.max(0.1, scale * Math.exp(-e.deltaY * 0.0015)));
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    tx = cx - (cx - tx) * (next / scale);
    ty = cy - (cy - ty) * (next / scale);
    scale = next;
  }

  function onPointerDown(e: PointerEvent) {
    panning = true;
    dragMoved = false;
    downLink = linkIdOf(e); // capture the link under the press (reliable; click target can be misdirected by capture)
    startX = e.clientX;
    startY = e.clientY;
    baseTx = tx;
    baseTy = ty;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  function onPointerMove(e: PointerEvent) {
    if (!panning) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragMoved = true;
    tx = baseTx + dx;
    ty = baseTy + dy;
  }

  function onPointerUp() {
    if (panning && !dragMoved) selectedLink = downLink && downLink === selectedLink ? null : downLink; // click: toggle / switch / clear
    panning = false;
  }

  function reset() {
    scale = 1;
    tx = 0;
    ty = 0;
  }

  // --- link click-select + hover highlight ---
  let selectedLink = $state<string | null>(null);
  let hoveredLink = $state<string | null>(null);
  let dragMoved = false;
  let downLink: string | null = null;

  const linkIdOf = (e: Event): string | null =>
    (e.target as Element)?.closest?.('[data-link-id]')?.getAttribute('data-link-id') ?? null;

  function onMove(e: MouseEvent) {
    const id = linkIdOf(e);
    if (id !== hoveredLink) hoveredLink = id;
  }
  const clearHover = () => (hoveredLink = null);

  // restore-on-change z-raise of the active link's line + id badges
  let raised: Element[] = [];
  const anchors = new WeakMap<Element, { parent: Node; next: Node | null }>();
  function raiseActive(svg: SVGSVGElement | null, id: string | null) {
    for (const el of raised) { const a = anchors.get(el); if (a && (a.parent as Element).isConnected) (a.parent as Element).insertBefore(el, a.next && a.next.isConnected ? a.next : null); }
    raised = [];
    if (!svg || !id) return;
    for (const el of svg.querySelectorAll(`[data-link-id="${CSS.escape(id)}"]`)) {
      anchors.set(el, { parent: el.parentNode!, next: el.nextSibling });
      svg.appendChild(el); // last in document order ⇒ on top
      raised.push(el);
    }
  }

  // apply hover/sel classes and z-raise after each re-render or state change
  $effect(() => {
    result.svg;
    const sel = selectedLink, hov = hoveredLink;
    const root = stageEl;
    if (!root) return;
    for (const g of root.querySelectorAll<SVGElement>('.grale-link')) {
      const id = g.getAttribute('data-link-id');
      g.classList.toggle('sel', id === sel);
      g.classList.toggle('hover', id === hov);
    }
    // enlarge the active link's id badge(s) (when the link-ids overlay is on)
    for (const b of root.querySelectorAll<SVGElement>('.link-id')) {
      const id = b.getAttribute('data-link-id');
      b.classList.toggle('act', id != null && (id === hov || id === sel));
    }
    raiseActive(root.querySelector('svg'), hov ?? sel);
  });
</script>

{#snippet layerTree(nodes: DebugLayer[], prefix: string)}
  <ul>
    {#each nodes as layer (layer.name)}
      {@const path = prefix ? `${prefix}/${layer.name}` : layer.name}
      {@const kids = childLayers(layer)}
      <li>
        <label>
          <input type="checkbox" checked={!hidden.has(path)} onchange={() => toggle(path)} />
          {layer.name}
        </label>
        {#if kids.length}{@render layerTree(kids, path)}{/if}
      </li>
    {/each}
  </ul>
{/snippet}

<div class="grale-view" bind:this={rootEl}>
  <button class="fs" title={isFull ? 'exit full screen' : 'full screen'} onclick={toggleFullscreen}>
    {isFull ? '🗗' : '⛶'}
  </button>
  <div
    class="canvas"
    role="application"
    aria-label="grale layout"
    onwheel={onWheel}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointerleave={onPointerUp}
    ondblclick={reset}
    onmousemove={onMove}
    onmouseleave={clearHover}
  >
    {#if result.svg}
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      <div class="stage" bind:this={stageEl} style="transform: translate({tx}px, {ty}px) scale({scale});">
        {@html responsive(result.svg)}
      </div>
    {:else}
      <div class="empty">{result.error}</div>
    {/if}
  </div>

  <div class="panel">
    <button class="panel-head" onclick={() => (panelOpen = !panelOpen)}>
      {panelOpen ? '▾' : '▸'} debug
    </button>
    {#if panelOpen}
      <div class="panel-body">
        <div class="sub">overlays</div>
        <label><input type="checkbox" bind:checked={ov.positions} /> positions</label>
        <label><input type="checkbox" bind:checked={ov.diagramArea} /> diagram area</label>
        <label><input type="checkbox" bind:checked={ov.boxCenters} /> box centers</label>
        <label><input type="checkbox" bind:checked={ov.linkPoints} /> link points</label>
        <ul>
          <li><label><input type="checkbox" bind:checked={ov.bends} /> bend points</label></li>
          <li><label><input type="checkbox" bind:checked={ov.crossings} /> crossings</label></li>
          <li><label><input type="checkbox" bind:checked={ov.branches} /> branch points</label></li>
        </ul>
        <label><input type="checkbox" bind:checked={ov.normals} /> normals</label>
        <label><input type="checkbox" bind:checked={ov.linkIds} /> link ids</label>
        {#if layers.length}
          <div class="sub">layers</div>
          {@render layerTree(layers, '')}
        {/if}
      </div>
    {/if}
  </div>

  <div class="hud">{Math.round(scale * 100)}% · drag · dbl-click resets</div>
</div>

<style>
  .grale-view {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 200px;
    background: #f8fafc;
    overflow: hidden;
  }
  .grale-view:fullscreen {
    width: 100%;
    height: 100%;
  }
  .canvas {
    position: absolute;
    inset: 0;
    cursor: grab;
    touch-action: none;
  }
  .canvas:active {
    cursor: grabbing;
  }
  .stage {
    position: absolute;
    inset: 0;
    transform-origin: 0 0;
  }
  /* link interactivity (rendered SVG is injected, so target globally) */
  :global(.grale-link) { cursor: pointer; }
  :global(.grale-link.hover .link-line) { stroke: #38bdf8 !important; stroke-width: 3 !important; }
  :global(.grale-link.sel .link-line) { stroke: #f59e0b !important; stroke-width: 3.5 !important; }
  /* enlarge the active link's id badge in place (scale around its own bbox centre) */
  :global(.link-id) { transition: transform 80ms ease-out; }
  :global(.link-id.act) { transform: scale(1.9); transform-box: fill-box; transform-origin: center; }
  .empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: #94a3b8;
    font: 13px system-ui, sans-serif;
  }
  .panel {
    position: absolute;
    top: 8px;
    left: 8px;
    max-height: calc(100% - 16px);
    display: flex;
    flex-direction: column;
    background: #ffffffe6;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    font: 12px system-ui, sans-serif;
    color: #334155;
    box-shadow: 0 1px 3px #0000001a;
    overflow: hidden;
  }
  .panel-head {
    border: none;
    background: #f1f5f9;
    text-align: left;
    padding: 5px 10px;
    cursor: pointer;
    font: 600 12px system-ui, sans-serif;
    color: #475569;
  }
  .panel-body {
    padding: 5px 10px 8px;
    overflow: auto;
  }
  .switch {
    display: flex;
    gap: 5px;
    align-items: center;
    font-weight: 600;
    color: #475569;
  }
  .sub {
    margin: 6px 0 2px;
    color: #94a3b8;
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.04em;
  }
  .panel ul {
    list-style: none;
    margin: 0;
    padding: 0 0 0 12px;
  }
  .panel-body > ul {
    padding-left: 0;
  }
  .panel label {
    display: flex;
    gap: 5px;
    align-items: center;
    padding: 2px 0;
    cursor: pointer;
    white-space: nowrap;
  }
  .panel input {
    margin: 0;
  }
  .fs {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 1;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    background: #ffffffe6;
    color: #475569;
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
    box-shadow: 0 1px 3px #0000001a;
  }
  .fs:hover {
    background: #eef2ff;
  }
  .hud {
    position: absolute;
    right: 8px;
    bottom: 6px;
    padding: 2px 6px;
    border-radius: 4px;
    background: #ffffffcc;
    color: #64748b;
    font: 11px system-ui, sans-serif;
    pointer-events: none;
  }
</style>
