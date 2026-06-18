/**
 * Render a grale *result* graph to an SVG string.
 *
 * Pure and DOM-free: the same function backs the CLI (`grale-to-svg`) and the
 * Svelte web component, so both emit byte-identical SVG. It reads only the
 * grale output fields (`x`/`y`, `points`, `tree`, …) plus renderer hints under
 * each label's `meta` (`color`, `fill`, `label`, `dashed`, `rx`, `textColor`)
 * — the layouter never reads `meta`, but a renderer is exactly its audience
 * (grale spec §"Opaque metadata").
 *
 * `debug: true` overlays the diagnostics a layout author wants: waypoint dots,
 * per-point normals, crossings, node centres/coords, the layout bounding box,
 * and the `diagnostics.warnings` list.
 */

import type { EdgeLabel, NodeLabel, MarkerDef, graleGraph, DebugLayer, DebugNode, DebugShape } from '../../api/types';

export interface RenderOptions {
  /** Master switch turning on the default overlay set (positions, diagram area,
   * box centers, link points). The granular flags below override it. */
  debug?: boolean;
  /** Node coordinate text labels. */
  positions?: boolean;
  /** Layout bounding box + diagnostics warnings. */
  diagramArea?: boolean;
  /** A dot at each node centre. */
  boxCenters?: boolean;
  /** A dot at every routed link waypoint (all of them, incl. comb points). */
  linkPoints?: boolean;
  /** Rings at link bend vertices. */
  bends?: boolean;
  /** Rings at link crossings. */
  crossings?: boolean;
  /** Dots at hyperedge branch (Steiner) points. */
  branches?: boolean;
  /** Per-point normal ticks. */
  normals?: boolean;
  /** Badge each link with its `id` (or its index when it has none) — for referencing
   * individual links (e.g. in a screenshot). */
  linkIds?: boolean;
  /** Blank margin around the layout bounding box (px). Default 24. */
  padding?: number;
  /** Background fill. Default `'#ffffff'`. Use `'none'` for transparent. */
  background?: string;
  /** Root `font-family`. Default a system UI stack. */
  fontFamily?: string;
}

// --- small helpers ---------------------------------------------------------

type V = { x: number; y: number };

const f = (n: number): string => {
  if (!Number.isFinite(n)) return '0';
  const r = Math.round(n * 100) / 100;
  return (Object.is(r, -0) ? 0 : r).toString();
};

const ESC: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c] as string);

const metaOf = (v: { meta?: Record<string, unknown> } | undefined, k: string): unknown =>
  v?.meta?.[k];
const str = (x: unknown, d = ''): string => (typeof x === 'string' ? x : d);
const numv = (x: unknown, d: number): number => (typeof x === 'number' ? x : d);

const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: V, s: number): V => ({ x: a.x * s, y: a.y * s });
const hyp = (a: V): number => Math.hypot(a.x, a.y) || 1;
const unit = (a: V): V => mul(a, 1 / hyp(a));
const perp = (a: V): V => ({ x: -a.y, y: a.x });
/** Turn angle (deg) at vertex b, between a→b and b→c. */
const turnDeg = (a: V, b: V, c: V): number => {
  const u = sub(b, a), w = sub(c, b);
  return (Math.atan2(Math.abs(u.x * w.y - u.y * w.x), u.x * w.x + u.y * w.y) * 180) / Math.PI;
};

// --- bounding box ----------------------------------------------------------

interface Box { minX: number; minY: number; maxX: number; maxY: number; }

function computeBox(g: graleGraph): Box {
  const b: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const grow = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    b.minX = Math.min(b.minX, x); b.minY = Math.min(b.minY, y);
    b.maxX = Math.max(b.maxX, x); b.maxY = Math.max(b.maxY, y);
  };
  const gw = g.value?.width, gh = g.value?.height;
  if (typeof gw === 'number' && typeof gh === 'number') { grow(0, 0); grow(gw, gh); }
  for (const n of g.nodes ?? []) {
    const v = n.value; if (!v || v.x == null || v.y == null) continue;
    const w = numv(v.width, 40), h = numv(v.height, 24);
    grow(v.x - w / 2, v.y - h / 2); grow(v.x + w / 2, v.y + h / 2);
  }
  for (const e of g.edges ?? []) for (const p of e.value?.points ?? []) grow(p.x, p.y);
  for (const he of g.hyperedges ?? []) for (const p of he.value?.tree?.points ?? []) grow(p.x, p.y);
  for (const layer of g.debug ?? []) eachDebugShape(layer, (s) => {
    if (s.kind === 'line') { grow(s.x1, s.y1); grow(s.x2, s.y2); }
    else if (s.kind === 'circle') { grow(s.cx - s.r, s.cy - s.r); grow(s.cx + s.r, s.cy + s.r); }
    else if (s.kind === 'rect') { grow(s.x, s.y); grow(s.x + s.width, s.y + s.height); }
    else grow(s.x, s.y);
  });
  if (!Number.isFinite(b.minX)) { b.minX = 0; b.minY = 0; b.maxX = 100; b.maxY = 100; }
  return b;
}

// --- geometry → svg --------------------------------------------------------

/** Polyline through `pts`, with corners rounded to radius `r` (0 = sharp). */
function polyPath(pts: V[], r: number): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${f(pts[0].x)} ${f(pts[0].y)}`;
  if (r <= 0 || pts.length === 2) return 'M ' + pts.map((p) => `${f(p.x)} ${f(p.y)}`).join(' L ');
  let d = `M ${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1], cur = pts[i], next = pts[i + 1];
    const ri = Math.min(r, hyp(sub(cur, prev)) / 2, hyp(sub(next, cur)) / 2);
    const enter = sub(cur, mul(unit(sub(cur, prev)), ri));
    const exit = add(cur, mul(unit(sub(next, cur)), ri));
    d += ` L ${f(enter.x)} ${f(enter.y)} Q ${f(cur.x)} ${f(cur.y)} ${f(exit.x)} ${f(exit.y)}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L ${f(last.x)} ${f(last.y)}`;
}

/** A marker glyph: a triangle (default) or a disc (`dot`/`circle` ids), with its
 * tip at `tip` pointing along `dir`. The MarkerDef sizes the box. */
function markerSvg(tip: V, dir: V, def: MarkerDef, id: string, color: string): string {
  const w = def.width || 10, h = def.height || 8, u = unit(dir);
  if (/dot|circle/i.test(id)) {
    const rad = Math.min(w, h) / 2, c = sub(tip, mul(u, rad));
    return `<circle cx="${f(c.x)}" cy="${f(c.y)}" r="${f(rad)}" fill="${color}" />`;
  }
  const base = sub(tip, mul(u, w)), p = perp(u);
  const a = add(base, mul(p, h / 2)), b = sub(base, mul(p, h / 2));
  return `<path d="M ${f(tip.x)} ${f(tip.y)} L ${f(a.x)} ${f(a.y)} L ${f(b.x)} ${f(b.y)} Z" fill="${color}" />`;
}

function textLabel(x: number, y: number, text: string, color: string, halo: boolean): string {
  const t = esc(text);
  const w = text.length * 6.2 + 8;
  const bg = halo
    ? `<rect x="${f(x - w / 2)}" y="${f(y - 9)}" width="${f(w)}" height="18" rx="3" fill="#ffffffd9" />`
    : '';
  return `${bg}<text x="${f(x)}" y="${f(y)}" text-anchor="middle" dominant-baseline="central" font-size="11" fill="${color}">${t}</text>`;
}

/** A tiny pill labelling a link with its id/index, centred at (x, y). */
function linkBadge(x: number, y: number, text: string): string {
  const w = text.length * 4.4 + 6;
  return (
    `<g><rect x="${f(x - w / 2)}" y="${f(y - 5)}" width="${f(w)}" height="10" rx="5" ` +
    `fill="#eef2ff" stroke="#6366f1" stroke-width="0.5" />` +
    `<text x="${f(x)}" y="${f(y + 0.3)}" text-anchor="middle" dominant-baseline="central" ` +
    `font-size="6.5" fill="#4338ca">${esc(text)}</text></g>`
  );
}

/** A small filled arrowhead centred at `p`, pointing along `dir` — shows link direction. */
function dirArrow(p: V, dir: V, color: string): string {
  const u = unit(dir), pp = perp(u), len = 9, half = 3;
  const tip = add(p, mul(u, len / 2)), base = sub(p, mul(u, len / 2));
  const a = add(base, mul(pp, half)), b = sub(base, mul(pp, half));
  return `<path d="M ${f(tip.x)} ${f(tip.y)} L ${f(a.x)} ${f(a.y)} L ${f(b.x)} ${f(b.y)} Z" fill="${color}" />`;
}

/** Point on a box boundary (centre `c`, size w×h) in direction `dir` from the centre. */
function boundaryPoint(c: V, w: number, h: number, dir: V): V {
  const u = unit(dir);
  const tx = u.x !== 0 ? (w / 2) / Math.abs(u.x) : Infinity;
  const ty = u.y !== 0 ? (h / 2) / Math.abs(u.y) : Infinity;
  const t = Math.min(tx, ty);
  return { x: c.x + u.x * t, y: c.y + u.y * t };
}

/** A filled arrowhead with its *tip* at `tip`, pointing along `dir` (body behind the tip). */
function arrowAtTip(tip: V, dir: V, color: string): string {
  const u = unit(dir), pp = perp(u), len = 9, half = 3.5;
  const base = sub(tip, mul(u, len));
  const a = add(base, mul(pp, half)), b = sub(base, mul(pp, half));
  return `<path d="M ${f(tip.x)} ${f(tip.y)} L ${f(a.x)} ${f(a.y)} L ${f(b.x)} ${f(b.y)} Z" fill="${color}" />`;
}

type NodeBox = { c: V; w: number; h: number };

/** Clip segment a→b against an axis-aligned box (Liang–Barsky); return the point
 * where the segment first enters the box (the parameter closest to `a`), or null
 * if the segment misses the box entirely. */
function segBoxCrossing(a: V, b: V, box: NodeBox): V | null {
  const hw = box.w / 2, hh = box.h / 2;
  const L = box.c.x - hw, R = box.c.x + hw, T = box.c.y - hh, Bm = box.c.y + hh;
  const dx = b.x - a.x, dy = b.y - a.y;
  let t0 = 0, t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;          // parallel to this pair of edges
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  if (clip(-dx, a.x - L) && clip(dx, R - a.x) && clip(-dy, a.y - T) && clip(dy, Bm - a.y))
    return { x: a.x + dx * t0, y: a.y + dy * t0 };
  return null;
}

/** Where a routed link (travelling start→end) crosses INTO the target box, found
 * from the link's *real geometry* so the direction arrowhead always sits on the
 * link no matter how an engine routes it (centre-aimed, port-offset, orthogonal,
 * or ending short of the box). Falls back to the link's last point. */
function targetEntry(pts: V[], box: NodeBox | undefined): { tip: V; dir: V } {
  const last = pts[pts.length - 1], prev = pts[pts.length - 2];
  if (!box) return { tip: last, dir: sub(last, prev) };
  const hw = box.w / 2, hh = box.h / 2;
  const inside = (p: V) => Math.abs(p.x - box.c.x) <= hw + 0.01 && Math.abs(p.y - box.c.y) <= hh + 0.01;
  // scan from the end for the segment that crosses the boundary (outside → inside)
  for (let i = pts.length - 1; i > 0; i--) {
    const a = pts[i - 1], b = pts[i];
    if (inside(b) && !inside(a)) {
      const cr = segBoxCrossing(a, b, box);
      if (cr) return { tip: cr, dir: sub(b, a) };
    }
  }
  // entire tail is inside the box: project a centre-ray back to the boundary
  if (inside(last)) {
    const u = sub(last, prev);
    const dir = hyp(u) < 0.01 ? sub(last, pts[0]) : u;
    return { tip: boundaryPoint(box.c, box.w, box.h, mul(unit(dir), -1)), dir };
  }
  // link never enters the box: put the arrow at the link's actual end
  return { tip: last, dir: sub(last, prev) };
}

/** Arc-length midpoint of a polyline, plus the local travel direction there. */
function pathMidpoint(pts: V[]): { p: V; dir: V } {
  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) { const d = hyp(sub(pts[i], pts[i - 1])); segs.push(d); total += d; }
  let half = total / 2;
  for (let i = 1; i < pts.length; i++) {
    const d = segs[i - 1];
    if (half <= d) { const t = d ? half / d : 0; return { p: { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t }, dir: sub(pts[i], pts[i - 1]) }; }
    half -= d;
  }
  return { p: pts[0], dir: sub(pts[pts.length - 1], pts[0]) };
}

/** A normal tick (perpendicular to the local tangent) at point `i` of a polyline.
 * Uses the engine-supplied normal angle when present, else computes it. */
function normalTick(pts: V[], i: number, provided?: number | null): string {
  let n: V;
  if (typeof provided === 'number') n = { x: Math.cos(provided), y: Math.sin(provided) };
  else {
    const t = i === 0 ? sub(pts[1], pts[0]) : i === pts.length - 1 ? sub(pts[i], pts[i - 1]) : sub(pts[i + 1], pts[i - 1]);
    n = perp(unit(t));
  }
  const p = pts[i], d = mul(n, 7);
  return `<line x1="${f(p.x - d.x)}" y1="${f(p.y - d.y)}" x2="${f(p.x + d.x)}" y2="${f(p.y + d.y)}" stroke="#0ea5e9" stroke-width="0.75" />`;
}

/** Even-spaced port anchors on the node boundary, ordered counter-clockwise
 * per the grale spec (§ports). */
function portPoints(v: NodeLabel): { x: number; y: number; side: string; index: number }[] {
  const out: { x: number; y: number; side: string; index: number }[] = [];
  if (!v.ports || v.x == null || v.y == null) return out;
  const w = numv(v.width, 40), h = numv(v.height, 24);
  const L = v.x - w / 2, R = v.x + w / 2, T = v.y - h / 2, B = v.y + h / 2;
  const place = (k: number | undefined, fn: (t: number) => V, side: string) => {
    for (let i = 0; k && i < k; i++) { const p = fn((i + 0.5) / k); out.push({ ...p, side, index: i }); }
  };
  place(v.ports.top, (t) => ({ x: R - (R - L) * t, y: T }), 'top');       // right → left
  place(v.ports.left, (t) => ({ x: L, y: T + (B - T) * t }), 'left');     // top → bottom
  place(v.ports.bottom, (t) => ({ x: L + (R - L) * t, y: B }), 'bottom'); // left → right
  place(v.ports.right, (t) => ({ x: R, y: B - (B - T) * t }), 'right');   // bottom → top
  return out;
}

// --- element renderers -----------------------------------------------------

type EdgeEntry = graleGraph['edges'][number];
type NodeEntry = graleGraph['nodes'][number];
type HyperEntry = NonNullable<graleGraph['hyperedges']>[number];

function renderNode(n: NodeEntry): string {
  const v = n.value; if (!v || v.x == null || v.y == null) return '';
  const w = numv(v.width, 40), h = numv(v.height, 24);
  const x = v.x - w / 2, y = v.y - h / 2;
  const fill = str(metaOf(v, 'fill'), '#eef2ff');
  const stroke = str(metaOf(v, 'color') ?? metaOf(v, 'stroke'), '#3b5bdb');
  const rx = numv(metaOf(v, 'rx'), 5);
  let s = `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(rx)}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" />`;
  for (const p of portPoints(v)) s += `<rect x="${f(p.x - 2.5)}" y="${f(p.y - 2.5)}" width="5" height="5" fill="${stroke}" />`;
  const label = str(metaOf(v, 'label'), n.v);
  if (label) s += textLabel(v.x, v.y, label, str(metaOf(v, 'textColor'), '#1e293b'), false);
  return s;
}

function renderEdge(e: EdgeEntry, markers: Record<string, MarkerDef>, radius: number, directed: boolean, nodeMap: Map<string, NodeBox>, id: string): string {
  const v: EdgeLabel = e.value ?? {};
  const pts = v.points;
  if (v.hidden || !pts || pts.length < 2) return '';
  const color = str(metaOf(v, 'color'), '#64748b');
  const lw = numv(v.lineWidth, 1.5);
  const dash = metaOf(v, 'dashed') ? ` stroke-dasharray="${f(Math.max(4, lw * 3))} ${f(Math.max(3, lw * 2))}"` : '';
  const d = polyPath(pts, radius);
  let s = `<path class="link-hit" d="${d}" fill="none" stroke="transparent" stroke-width="12" pointer-events="stroke" />`;
  s += `<path class="link-line" d="${d}" fill="none" stroke="${color}" stroke-width="${f(lw)}" stroke-linejoin="round" stroke-linecap="round"${dash} />`;
  // direction arrowhead where the link enters the target node box (skip if an explicit endMarker shows direction)
  if (directed && !(v.endMarker && markers[v.endMarker])) {
    const { tip, dir } = targetEntry(pts, nodeMap.get(e.w));
    s += arrowAtTip(tip, dir, color);
  }
  if (v.endMarker && markers[v.endMarker]) {
    const tip = pts[pts.length - 1];
    s += markerSvg(tip, sub(tip, pts[pts.length - 2]), markers[v.endMarker], v.endMarker, color);
  }
  if (v.startMarker && markers[v.startMarker]) {
    s += markerSvg(pts[0], sub(pts[0], pts[1]), markers[v.startMarker], v.startMarker, color);
  }
  const label = str(metaOf(v, 'label'));
  if (label) {
    const mid = pts[Math.floor(pts.length / 2)];
    s += textLabel(numv(v.x, mid.x), numv(v.y, mid.y), label, str(metaOf(v, 'textColor'), '#334155'), true);
  }
  return `<g class="grale-link" data-link-id="${esc(id)}">${s}</g>`;
}

function renderHyperedge(he: HyperEntry, markers: Record<string, MarkerDef>, id: string): string {
  const v = he.value ?? {};
  const tree = v.tree;
  if (v.hidden || !tree) return '';
  const color = str(metaOf(v, 'color'), '#9333ea');
  const lw = numv(v.lineWidth, 1.5);
  const dash = metaOf(v, 'dashed') ? ` stroke-dasharray="${f(Math.max(4, lw * 3))} ${f(Math.max(3, lw * 2))}"` : '';
  let s = '';
  for (const seg of tree.segments) {
    const a = tree.points[seg.ends[0]], b = tree.points[seg.ends[1]];
    if (!a || !b) continue;
    s += `<line class="link-hit" x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(b.x)}" y2="${f(b.y)}" stroke="transparent" stroke-width="12" pointer-events="stroke" />`;
    s += `<line class="link-line" x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(b.x)}" y2="${f(b.y)}" stroke="${color}" stroke-width="${f(lw)}" stroke-linecap="round"${dash} />`;
  }
  for (let i = 0; i < tree.points.length; i++) {
    const p = tree.points[i];
    if (p.kind === 'endpoint' && p.marker && markers[p.marker]) {
      const seg = tree.segments.find((sg) => sg.ends[0] === i || sg.ends[1] === i);
      if (seg) {
        const nb = tree.points[seg.ends[0] === i ? seg.ends[1] : seg.ends[0]];
        s += markerSvg(p, sub(p, nb), markers[p.marker], p.marker, color);
      }
    }
  }
  const label = str(metaOf(v, 'label'));
  if (label && v.x != null && v.y != null)
    s += textLabel(v.x, v.y, label, str(metaOf(v, 'textColor'), '#6b21a8'), true);
  return `<g class="grale-link" data-link-id="${esc(id)}">${s}</g>`;
}

// --- engine-supplied debug layers (§debug-layers) --------------------------

/** Walk every leaf shape under a debug node. */
function eachDebugShape(node: DebugNode, cb: (s: DebugShape) => void): void {
  if (node.kind === 'layer') for (const c of node.children) eachDebugShape(c, cb);
  else cb(node);
}

function shapeStyle(s: DebugShape): string {
  const isText = s.kind === 'text';
  const stroke = s.stroke ?? (isText ? undefined : '#3b82f6');
  const fill = s.fill ?? (isText ? '#111827' : 'none');
  let a = '';
  if (stroke) a += ` stroke="${esc(stroke)}" stroke-width="${f(s.strokeWidth ?? 1)}"`;
  else if (s.strokeWidth != null) a += ` stroke-width="${f(s.strokeWidth)}"`;
  a += ` fill="${esc(fill)}"`;
  if (s.opacity != null) a += ` opacity="${f(s.opacity)}"`;
  if (s.dashed) a += ` stroke-dasharray="4 3"`;
  return a;
}

function renderDebugShape(s: DebugShape): string {
  switch (s.kind) {
    case 'line':
      return `<line x1="${f(s.x1)}" y1="${f(s.y1)}" x2="${f(s.x2)}" y2="${f(s.y2)}"${shapeStyle(s)} />`;
    case 'circle':
      return `<circle cx="${f(s.cx)}" cy="${f(s.cy)}" r="${f(s.r)}"${shapeStyle(s)} />`;
    case 'rect':
      return `<rect x="${f(s.x)}" y="${f(s.y)}" width="${f(s.width)}" height="${f(s.height)}"${s.rx != null ? ` rx="${f(s.rx)}"` : ''}${shapeStyle(s)} />`;
    case 'text':
      return `<text x="${f(s.x)}" y="${f(s.y)}" font-size="${f(s.fontSize ?? 11)}" text-anchor="${s.anchor ?? 'start'}"${shapeStyle(s)}>${esc(s.text)}</text>`;
  }
}

/** A debug layer becomes an SVG `<g>` carrying its name and full path, so a
 * viewer can toggle it by `data-layer-path`. `visible:false` starts hidden. */
function renderDebugLayer(layer: DebugLayer, prefix: string): string {
  const path = prefix ? `${prefix}/${layer.name}` : layer.name;
  const op = layer.opacity != null ? ` opacity="${f(layer.opacity)}"` : '';
  const hidden = layer.visible === false ? ' style="display:none"' : '';
  const inner = layer.children
    .map((c) => (c.kind === 'layer' ? renderDebugLayer(c, path) : renderDebugShape(c)))
    .join('');
  return `<g data-layer="${esc(layer.name)}" data-layer-path="${esc(path)}"${op}${hidden}>${inner}</g>`;
}

// --- entry point -----------------------------------------------------------

export function renderSvg(graph: graleGraph, opts: RenderOptions = {}): string {
  const pad = opts.padding ?? 24;
  const markers = graph.value?.markers ?? {};
  const radius = graph.value?.cornerRadius ?? 0;
  const box = computeBox(graph);

  // node boxes (centre + size), for placing arrowheads and link-id badges
  const nodeMap = new Map<string, NodeBox>();
  for (const n of graph.nodes ?? []) { const v = n.value; if (v?.x != null && v?.y != null) nodeMap.set(n.v, { c: { x: v.x, y: v.y }, w: numv(v.width, 40), h: numv(v.height, 24) }); }

  // z-ordered body: edges/hyperedges default below nodes; explicit zIndex wins.
  const items: { z: number; i: number; svg: string }[] = [];
  let order = 0;
  const directed = graph.options?.directed !== false;
  (graph.edges ?? []).forEach((e, ei) => items.push({ z: numv(e.value?.zIndex, 0), i: order++, svg: renderEdge(e, markers, radius, directed, nodeMap, e.id ?? String(ei)) }));
  (graph.hyperedges ?? []).forEach((he, hi) => items.push({ z: numv(he.value?.zIndex, 0), i: order++, svg: renderHyperedge(he, markers, he.id ?? `h${hi}`) }));
  for (const n of graph.nodes ?? []) items.push({ z: numv(n.value?.zIndex, 1), i: order++, svg: renderNode(n) });
  items.sort((a, b) => a.z - b.z || a.i - b.i);
  let body = items.map((x) => x.svg).join('');

  // engine-supplied debug layers (toggleable by path)
  if (graph.debug?.length)
    body += `<g data-grale-debug="1">${graph.debug.map((l) => renderDebugLayer(l, '')).join('')}</g>`;

  // --- toggleable overlay categories (debug = the default set) ---
  const dbg = !!opts.debug;
  const show = {
    positions: opts.positions ?? dbg,
    diagramArea: opts.diagramArea ?? dbg,
    boxCenters: opts.boxCenters ?? dbg,
    linkPoints: opts.linkPoints ?? dbg,
    bends: opts.bends ?? dbg,
    crossings: opts.crossings ?? dbg,
    branches: opts.branches ?? dbg,
    normals: opts.normals ?? false,
    linkIds: opts.linkIds ?? false,
  };
  const ovl = (name: string, content: string) => (content ? `<g data-overlay="${esc(name)}">${content}</g>` : '');
  const dot = (p: V, r: number, fill: string) => `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(r)}" fill="${fill}" />`;
  const ring = (p: V, r: number, stroke: string) => `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(r)}" fill="none" stroke="${stroke}" stroke-width="1.2" />`;
  if (show.boxCenters) {
    let s = '';
    for (const n of graph.nodes ?? []) { const v = n.value; if (!v || v.x == null || v.y == null) continue; s += dot({ x: v.x, y: v.y }, 2, '#ef4444'); }
    body += ovl('box centers', s);
  }
  if (show.positions) {
    let s = '';
    for (const n of graph.nodes ?? []) { const v = n.value; if (!v || v.x == null || v.y == null) continue; const w = numv(v.width, 40), h = numv(v.height, 24); s += `<text x="${f(v.x - w / 2)}" y="${f(v.y - h / 2 - 3)}" font-size="9" fill="#ef4444">${f(v.x)},${f(v.y)}</text>`; }
    body += ovl('positions', s);
  }
  if (show.linkPoints) {
    let s = '';
    for (const e of graph.edges ?? []) { const pts = e.value?.points; if (e.value?.hidden || !pts) continue; for (const p of pts) s += dot(p, 1.8, '#0ea5e9'); }
    for (const he of graph.hyperedges ?? []) { const t = he.value?.tree; if (he.value?.hidden || !t) continue; for (const p of t.points) s += dot(p, 1.8, '#0ea5e9'); }
    body += ovl('link points', s);
  }
  if (show.bends) {
    let s = '';
    for (const e of graph.edges ?? []) { const pts = e.value?.points; if (e.value?.hidden || !pts || pts.length < 3) continue; for (let i = 1; i < pts.length - 1; i++) if (turnDeg(pts[i - 1], pts[i], pts[i + 1]) > 1) s += ring(pts[i], 3.5, '#1d4ed8'); }
    for (const he of graph.hyperedges ?? []) { const t = he.value?.tree; if (he.value?.hidden || !t) continue; for (const p of t.points) if (p.kind === 'bend') s += ring(p, 3.5, '#1d4ed8'); }
    body += ovl('bend points', s);
  }
  if (show.crossings) {
    let s = '';
    for (const e of graph.edges ?? []) for (const c of e.value?.crossings ?? []) s += ring(c, 4, '#ef4444');
    for (const he of graph.hyperedges ?? []) { const t = he.value?.tree; if (!t) continue; for (const p of t.points) if (p.kind === 'crossing') s += ring(p, 4, '#ef4444'); }
    body += ovl('crossings', s);
  }
  if (show.branches) {
    let s = '';
    for (const he of graph.hyperedges ?? []) { const t = he.value?.tree; if (he.value?.hidden || !t) continue; for (const p of t.points) if (p.kind === 'branch') s += dot(p, 3, '#9333ea'); }
    body += ovl('branch points', s);
  }
  if (show.normals) {
    let s = '';
    for (const e of graph.edges ?? []) { const v = e.value, pts = v?.points; if (v?.hidden || !pts || pts.length < 2) continue; pts.forEach((_, i) => { s += normalTick(pts, i, v.normals?.[i]); }); }
    for (const he of graph.hyperedges ?? []) { const t = he.value?.tree; if (he.value?.hidden || !t) continue; for (const seg of t.segments) { const pi = t.points[seg.ends[0]], pj = t.points[seg.ends[1]]; if (pi && pj) { s += normalTick([pi, pj], 0, seg.normals?.[0]); s += normalTick([pi, pj], 1, seg.normals?.[1]); } } }
    body += ovl('normals', s);
  }
  if (show.diagramArea) {
    let s = '';
    const gw = graph.value?.width, gh = graph.value?.height;
    if (typeof gw === 'number' && typeof gh === 'number') s += `<rect x="0" y="0" width="${f(gw)}" height="${f(gh)}" fill="none" stroke="#94a3b8" stroke-dasharray="4 4" stroke-width="1" />`;
    (graph.diagnostics?.warnings ?? []).forEach((w, i) => { s += `<text x="${f(box.minX + 4)}" y="${f(box.minY + 12 + i * 13)}" font-size="10" fill="#b45309">${esc('⚠ ' + w.code + ': ' + w.message)}</text>`; });
    body += ovl('diagram area', s);
  }
  if (show.linkIds) {
    let ids = '';
    // place the badge inside the node box, just inside the boundary on the link's side
    const pillInside = (node: NodeBox, attach: V, fallbackDir: V, text: string): string => {
      let dir = sub(attach, node.c);
      if (hyp(dir) < 1) dir = fallbackDir;
      const B = boundaryPoint(node.c, node.w, node.h, dir);
      const pos = sub(B, mul(unit(dir), 8)); // 8px inside the boundary
      // tag with the link id so a viewer can raise this link's badges to the top
      return `<g class="link-id" data-link-id="${esc(text)}">${linkBadge(pos.x, pos.y, text)}</g>`;
    };
    (graph.edges ?? []).forEach((e, i) => {
      const pts = e.value?.points; if (e.value?.hidden || !pts || pts.length < 2) return;
      const id = e.id ?? String(i);
      const sn = nodeMap.get(e.v), tn = nodeMap.get(e.w);
      if (sn) ids += pillInside(sn, pts[0], sub(pts[1], pts[0]), id);
      if (tn) ids += pillInside(tn, pts[pts.length - 1], sub(pts[pts.length - 2], pts[pts.length - 1]), id);
    });
    (graph.hyperedges ?? []).forEach((he, i) => {
      const t = he.value?.tree; if (he.value?.hidden || !t?.points?.length) return;
      const id = he.id ?? `h${i}`;
      for (const p of t.points) if (p.kind === 'endpoint' && p.node) { const n = nodeMap.get(p.node); if (n) ids += pillInside(n, { x: p.x, y: p.y }, sub(n.c, { x: p.x, y: p.y }), id); }
    });
    body += ovl('link ids', ids);
  }

  const vx = box.minX - pad, vy = box.minY - pad;
  const bw = box.maxX - box.minX + pad * 2, bh = box.maxY - box.minY + pad * 2;
  const bg = opts.background ?? '#ffffff';
  const font = opts.fontFamily ?? 'system-ui, -apple-system, Segoe UI, sans-serif';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(vx)} ${f(vy)} ${f(bw)} ${f(bh)}" ` +
    `width="${f(bw)}" height="${f(bh)}" font-family="${esc(font)}">` +
    (bg === 'none' ? '' : `<rect x="${f(vx)}" y="${f(vy)}" width="${f(bw)}" height="${f(bh)}" fill="${bg}" />`) +
    body +
    `</svg>`
  );
}
