/**
 * grale JSON input/output types.
 *
 * grale is a **gra**ph **l**ayout **e**ngine API, defined as a *data format* —
 * JSON in, JSON out — and a *strict superset of the dagre serialised JSON
 * structure* (graphlib's `json.write` format). Every type here is the
 * TypeScript realisation of the data model in `doc/graph-layout-api.adoc`
 * (§"TypeScript types"); the dagre baseline it supersets is
 * `doc/dagre-js.adoc`. Section references below (e.g. §ports) point into the
 * grale spec.
 *
 * The dagre label fields are repeated here so the grale label types are
 * self-contained; their authoritative semantics live in `dagre-js.adoc`.
 * Every grale addition is an *optional* field — when none are present a
 * document reduces byte-for-byte to a dagre document (§"Reduction to dagre").
 */

import type { Point } from './geometry';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/**
 * Preferred edge direction (§"Preferred edge direction").
 *
 * Authored in the default top-down frame (`rankdir: 'TB'`), where `down` runs
 * along the rank flow; selecting another `rankdir` rotates every `prefDir`
 * with the drawing so it keeps the same meaning relative to the flow.
 */
export type Direction = 'up' | 'down' | 'left' | 'right';

/**
 * A node side, named as in CSS (§ports). The side order is itself
 * counter-clockwise: `top → left → bottom → right`.
 */
export type Side = 'top' | 'left' | 'bottom' | 'right';

/**
 * A reference to one of a node's ports (§ports): a side plus a zero-based
 * slot index. A side declaring `k` ports has slots `0 … k-1`, running
 * counter-clockwise.
 */
export interface PortRef {
  side: Side;
  index: number;
}

/**
 * A reusable edge-end marker (§markers), declared once in the graph-level
 * registry and referenced by id like an SVG `<defs>` entry. It describes the
 * *rectangular space* the marker occupies; its appearance lives renderer-side
 * (see {@link GraphLabel.meta} and friends).
 */
export interface MarkerDef {
  /** Reserved space along the edge (px). */
  width: number;
  /** Reserved space across the edge (px). */
  height: number;
  /** Side of the marker box that meets the line; default `'right'`. */
  dock?: Side;
}

/**
 * One past layout frame (§"Respecting previous layouts"): a map from node id
 * to that node's centre. `prevLayouts` is an array of these, oldest first.
 */
export type NodePositions = Record<string, Point>;

// ---------------------------------------------------------------------------
// Graph label — JsonGraph.value (§"Graph label additions")
// ---------------------------------------------------------------------------

/**
 * The graph-level label (`JsonGraph.value`). The dagre options are unchanged
 * from the baseline; grale adds the optional fields below. `width`/`height`
 * remain *outputs* (the layout bounding box).
 */
export interface GraphLabel {
  // --- dagre ---
  rankdir?: 'TB' | 'BT' | 'LR' | 'RL';
  align?: 'UL' | 'UR' | 'DL' | 'DR';
  nodesep?: number;
  edgesep?: number;
  ranksep?: number;
  marginx?: number;
  marginy?: number;
  acyclicer?: 'greedy';
  ranker?: 'network-simplex' | 'tight-tree' | 'longest-path';
  /** _out_: layout bounding-box width. */
  width?: number;
  /** _out_: layout bounding-box height. */
  height?: number;

  // --- grale ---
  /** How strongly to honour previous positions, `0..1` (default `0`). */
  stability?: number;
  /** Layout history, oldest first; newest last (§"Respecting previous layouts"). */
  prevLayouts?: NodePositions[];
  /** Node id(s) the layout organises around (§focus). */
  focus?: string | string[];
  /** Round every edge turn to this radius (px), default `0` (§"Self-loops and corner rounding"). */
  cornerRadius?: number;
  /** Marker registry (SVG-`<defs>` style); referenced via `startMarker`/`endMarker` (§markers). */
  markers?: Record<string, MarkerDef>;
  /** Log verbosity / diagnostics detail, default `'WARN'` (§"Debug settings"). */
  logLevel?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  /** Include debug overlays in the output, default `false` (§"Debug settings"). */
  visualDebug?: boolean;
  /** Opaque passthrough, ignored by the layouter (§meta). */
  meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Node label — JsonNode.value (§"Node label additions")
// ---------------------------------------------------------------------------

/**
 * A node-level label (`JsonNode.value`). The dagre fields are unchanged; note
 * that under grale `x`/`y` are *also read as input* when the node is
 * {@link NodeLabel.pinned} (§"Pinned nodes").
 */
export interface NodeLabel {
  // --- dagre ---
  width?: number;
  height?: number;
  /** _out_ — and _in_ when {@link NodeLabel.pinned}. Node centre (px). */
  x?: number;
  y?: number;

  // --- grale ---
  /**
   * Hard pin: treat this node's `x`/`y` as input and place its centre there.
   * `x`/`y` must be present, else a `PINNED_NO_COORDS` warning (§"Pinned nodes").
   */
  pinned?: boolean;
  /** Number of attachment ports per side; edges reference them by `{ side, index }` (§ports). */
  ports?: { top?: number; left?: number; bottom?: number; right?: number };
  /** Draw order (in/out); higher draws on top (§"Waypoint normals, crossings, and z-order"). */
  zIndex?: number;
  /** Opaque passthrough, ignored by the layouter (§meta). */
  meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Edge label — JsonEdge.value (§"Edge label additions")
// ---------------------------------------------------------------------------

/**
 * A binary-edge label (`JsonEdge.value`). The dagre fields are unchanged;
 * grale honours `weight` as edge *importance* (§"Edge weight and lineWidth")
 * and adds the fields below.
 */
export interface EdgeLabel {
  // --- dagre ---
  minlen?: number;
  weight?: number;
  /** dagre *label* box width (px) — distinct from {@link EdgeLabel.lineWidth}. */
  width?: number;
  /** dagre *label* box height (px). */
  height?: number;
  labelpos?: 'l' | 'c' | 'r';
  labeloffset?: number;
  /** _out_: routed polyline; a `hidden` edge gets none. */
  points?: Point[];
  /** _out_: edge-label centre (px), when the edge declares label `width`/`height`. */
  x?: number;
  y?: number;

  // --- grale ---
  /** Per-edge preferred direction (§"Preferred edge direction"). */
  prefDir?: Direction;
  /** Constrains the layout but is not drawn — no output `points` (§"Hidden links"). */
  hidden?: boolean;
  /** Reserved corridor / drawn line width (px); distinct from dagre's label `width`. */
  lineWidth?: number;
  /** Attach the source end to a node port (§ports). */
  fromPort?: PortRef;
  /** Attach the target end to a node port (§ports). */
  toPort?: PortRef;
  /** Id into {@link GraphLabel.markers}, placed at the source end (§markers). */
  startMarker?: string;
  /** Id into {@link GraphLabel.markers}, placed at the target end (§markers). */
  endMarker?: string;
  /** Draw order (in/out); higher draws on top. */
  zIndex?: number;
  /** _out_: outward-normal angle (rad) per `points` entry, or `null` where undefined. */
  normals?: (number | null)[];
  /** _out_: positions where this edge unavoidably crosses another. */
  crossings?: Point[];
  /** Opaque passthrough, ignored by the layouter (§meta). */
  meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Diagnostics — output only (§diagnostics)
// ---------------------------------------------------------------------------

/**
 * A single layout diagnostic. The well-known `code`s are enumerated; the
 * `string` fallback keeps the set open for engine-specific notes.
 */
export interface Warning {
  code:
    | 'DANGLING_EDGE'
    | 'PIN_CONFLICT'
    | 'PINNED_NO_COORDS'
    | 'BAD_PORT'
    | 'BAD_MARKER'
    | 'BAD_FOCUS'
    | 'UNKNOWN_FIELD'
    | (string & {});
  message: string;
  /** Node id this warning concerns, when applicable. */
  node?: string;
  /** Edge identity this warning concerns, when applicable. */
  edge?: { v: string; w: string; name?: string };
}

/**
 * The diagnostics object attached to every result (§diagnostics). dagre
 * returns none.
 */
export interface Diagnostics {
  /** Layout wall-time (µs). Excluded from the determinism guarantee. */
  elapsedMicros: number;
  /** Empty on a clean run. */
  warnings: Warning[];
  /** Present when `prevLayouts` was honoured (`stability > 0`, non-empty history). */
  displacement?: { moved: number; totalDx: number; totalDy: number };
}

// ---------------------------------------------------------------------------
// Debug overlays — output only (§debug-layers)
// ---------------------------------------------------------------------------

/**
 * Minimal styling for a debug shape — a small subset of SVG presentation
 * attributes. All optional; an omitted value is the renderer's choice.
 * Coordinates and sizes are in the grale coordinate model (px, origin
 * top-left, y down) — see {@link graleGraph}.
 */
export interface DebugStyle {
  /** Stroke / outline colour (any CSS colour). */
  stroke?: string;
  /** Stroke width (px). */
  strokeWidth?: number;
  /** Fill colour; `'none'` for no fill. */
  fill?: string;
  /** 0..1. */
  opacity?: number;
  /** Dashed stroke. */
  dashed?: boolean;
}

/** A straight segment, like SVG `<line>`. */
export interface DebugLine extends DebugStyle {
  kind: 'line';
  x1: number; y1: number; x2: number; y2: number;
}

/** A circle, like SVG `<circle>`. */
export interface DebugCircle extends DebugStyle {
  kind: 'circle';
  cx: number; cy: number; r: number;
}

/** An axis-aligned rectangle (`x`/`y` = top-left), like SVG `<rect>`. */
export interface DebugRect extends DebugStyle {
  kind: 'rect';
  x: number; y: number; width: number; height: number;
  /** Corner radius (px). */
  rx?: number;
}

/** A text label anchored at `(x, y)`, like SVG `<text>` (`fill` = text colour). */
export interface DebugText extends DebugStyle {
  kind: 'text';
  x: number; y: number;
  text: string;
  /** Font size (px). */
  fontSize?: number;
  /** Horizontal anchor; default `'start'`. */
  anchor?: 'start' | 'middle' | 'end';
}

/** A leaf debug primitive — the JSON analogue of a simple SVG shape. */
export type DebugShape = DebugLine | DebugCircle | DebugRect | DebugText;

/**
 * A named, nestable group of debug items — the JSON analogue of an SVG `<g>`.
 * A renderer draws the leaves and a viewer can toggle a group on/off by the
 * *path of layer names* (e.g. `["grid"]`, `["nodes", "centres"]`).
 */
export interface DebugLayer {
  kind: 'layer';
  /** Layer name; unique among its siblings so a path identifies it. */
  name: string;
  /** Initial toggle state; default `true`. */
  visible?: boolean;
  /** Group opacity, 0..1. */
  opacity?: number;
  /** Nested layers and/or leaf shapes, drawn in order. */
  children: DebugNode[];
}

/** A node in the debug tree: a nested {@link DebugLayer} or a leaf {@link DebugShape}. */
export type DebugNode = DebugLayer | DebugShape;

// ---------------------------------------------------------------------------
// Hyperedges — n-ary (§hyperedges)
// ---------------------------------------------------------------------------

/**
 * One end of a hyperedge: a node, with an optional per-end marker and port.
 * `endpoints` is an *unordered set* of these.
 */
export interface Endpoint {
  /** Node id. */
  node: string;
  /** Id into {@link GraphLabel.markers}, placed at this end. */
  marker?: string;
  /** Dock this spoke to a node port. */
  port?: PortRef;
}

/** The kind tag on a {@link HyperedgePoint}. */
export type HyperedgePointKind = 'endpoint' | 'branch' | 'bend' | 'crossing';

/**
 * One routed point of a hyperedge tree. `endpoint` (degree 1) sits at a node;
 * `branch` (degree ≥ 3) is a Steiner junction; `bend` (degree 2) is a corner;
 * `crossing` (degree 2) is where this hyperedge crosses another link.
 */
export interface HyperedgePoint {
  kind: HyperedgePointKind;
  x: number;
  y: number;
  /** _out_: set on `'endpoint'` points. */
  node?: string;
  /** _out_: echoed on `'endpoint'` points. */
  marker?: string;
}

/**
 * One tree edge of a hyperedge route: the two point indices it joins, plus the
 * tangent normal (rad) at each end (`ni` leaving `i` toward `j`, `nj` leaving
 * `j` toward `i`). Normals live on segment ends, not on points.
 */
export interface HyperedgeSegment {
  ends: [number, number];
  normals: [number, number];
}

/**
 * _out_: the routing result of a hyperedge — a tree of points, not a polyline.
 * A tree over N points has N − 1 segments; the topology may branch arbitrarily.
 */
export interface HyperedgeTree {
  points: HyperedgePoint[];
  segments: HyperedgeSegment[];
}

/**
 * A hyperedge label. Carries the *whole-edge* properties shared with
 * {@link EdgeLabel}; the per-*end* binary fields do not apply (their job is
 * done by per-endpoint `marker`/`port` and by the output `tree`).
 */
export interface HyperedgeLabel {
  // --- shared with EdgeLabel (whole-hyperedge) ---
  minlen?: number;
  weight?: number;
  hidden?: boolean;
  lineWidth?: number;
  prefDir?: Direction;
  labelpos?: 'l' | 'c' | 'r';
  labeloffset?: number;
  zIndex?: number;
  meta?: Record<string, unknown>;

  // --- output ---
  tree?: HyperedgeTree;
  /** Label centre (px), out. */
  x?: number;
  y?: number;
}

/**
 * An n-ary hyperedge (§hyperedges): a set of node endpoints, living in the
 * envelope's own top-level array — distinct from binary `edges[]`.
 */
export interface Hyperedge {
  /** Optional identity for debugging / reference (§"Edge and hyperedge id"). */
  id?: string;
  /** Unordered set of `{ node, marker?, port? }`. */
  endpoints: Endpoint[];
  value?: HyperedgeLabel;
}

// ---------------------------------------------------------------------------
// The envelope — superset of graphlib JsonGraph (§"The graleGraph structure")
// ---------------------------------------------------------------------------

/**
 * A grale graph: the dagre `JsonGraph` envelope intact (same `options`,
 * `nodes[]`, `edges[]`, `value`, the same `{ v, w, name? }` edge identity,
 * the same `parent` for compound graphs), plus two purely-additive
 * extensions: an optional `id` on each edge and a top-level `hyperedges[]`.
 * A document that uses none of the grale additions is byte-for-byte a dagre
 * document.
 *
 * Spelt with a lower-case `g` to match the spec's `graleGraph` name exactly.
 */
export interface graleGraph {
  options: { directed: boolean; multigraph: boolean; compound: boolean };
  value?: GraphLabel;
  nodes: { v: string; value?: NodeLabel; parent?: string }[];
  edges: { v: string; w: string; name?: string; id?: string; value?: EdgeLabel }[];
  hyperedges?: Hyperedge[];
  /** _out_: diagnostics for the layout run. */
  diagnostics?: Diagnostics;
  /** _out_: named, nestable debug overlay layers (§debug-layers); present when
   * the engine produces them (typically under `value.visualDebug`). */
  debug?: DebugLayer[];
}

/**
 * The grale layout function: a pure function, JSON in / JSON out (§`layout`).
 * It returns a *new* envelope of the same shape with positions filled in;
 * `diagnostics.elapsedMicros` aside, equal request ⇒ equal output. It does not
 * mutate its argument.
 */
export type Layout = (graph: graleGraph) => graleGraph;
