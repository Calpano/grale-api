#!/usr/bin/env node
/**
 * grale engine adapter for elk.js (Eclipse Layout Kernel).
 *
 * Reads a grale graph on stdin (or a file arg), lays it out with elkjs, and
 * writes the laid-out grale graph on stdout — wrapping ELK in the grale engine
 * contract. See doc/grale-elk.adoc for the model mapping.
 *
 *   cat graph.json | grale-elk            # stdin → stdout
 *   grale-elk graph.json
 *
 * Engine knobs ride in `value.data.grale.engine` (keeps grale engine-agnostic):
 *   { "algorithm": "layered"|"force"|"stress"|"mrtree"|"radial"|…,
 *     "edgeRouting": "orthogonal"|"polyline"|"spline",   // overrides value.edgeRouting
 *     "layoutOptions": { "elk.…": "…" } }
 *
 * Ports map to fixed-order ELK ports (side + clockwise index) and edge
 * `weight` to ELK's layered priorities. grale features ELK has no mapping for
 * (pins, markers, stability, …) are accepted and echoed, each with an
 * `UNSUPPORTED` warning — see `engine-common.ts`.
 *
 * Hyperedges: ELK's algorithms only route *simple* edges ("Passed edge is not
 * 'simple'"), so each grale hyperedge is decomposed into a small dummy hub node
 * (a Steiner point ELK places) plus one simple edge per endpoint; the arm routes
 * are recombined into the grale hyperedge `tree` (hub → branch point, each arm →
 * endpoint, with bends in between).
 */
import ELK from 'elkjs/lib/elk.bundled.js';
import type { graleGraph, HyperedgePoint, HyperedgeSegment, Warning } from '../types.js';
import { inspectRequest, isMain, runEngineCli } from './engine-common.js';

type Pt = { x: number; y: number };
interface ElkP { id: string; width?: number; height?: number; layoutOptions?: Record<string, string>; }
interface ElkN { id: string; width?: number; height?: number; x?: number; y?: number; children?: ElkN[]; ports?: ElkP[]; edges?: ElkE[]; layoutOptions?: Record<string, string>; }
interface ElkSection { startPoint: Pt; endPoint: Pt; bendPoints?: Pt[]; }
interface ElkE { id: string; sources: string[]; targets: string[]; sections?: ElkSection[]; layoutOptions?: Record<string, string>; }

const directionOf = (r?: string): string => (r === 'BT' ? 'UP' : r === 'LR' ? 'RIGHT' : r === 'RL' ? 'LEFT' : 'DOWN');
const normalAngle = (a: Pt, b: Pt): number => Math.atan2(b.x - a.x, -(b.y - a.y)); // perpendicular to a→b

type Arm = { edgeId: string; node: string; marker?: string };
type HyperPlan = { hub: string; arms: Arm[] };

/** grale features elk.js ignores — echoed, warned about, never honoured.
 * (`ports`/`fromPort`/`toPort` and `weight` ARE mapped; `minlen` above the
 * constraint-free default 1 has no ELK equivalent — see doc/grale-elk.adoc.) */
const IGNORED = ['pinned', 'markers', 'startMarker', 'endMarker', 'stability', 'prevLayouts', 'focus', 'prefDir', 'lineWidth', 'visualDebug', 'weight0', 'minlen>1', 'align', 'edgesep', 'marginx', 'marginy', 'acyclicer', 'ranker'] as const;

// grale sides are absolute (CSS naming), like ELK's — no rankdir rotation.
const SIDE_ELK: Record<string, string> = { top: 'NORTH', right: 'EAST', bottom: 'SOUTH', left: 'WEST' };
const portId = (node: string, side: string, index: number): string => `${node}__p_${side}${index}`;

function buildElk(g: graleGraph): { root: ElkN; layoutOptions: Record<string, string>; hypers: HyperPlan[] } {
  const engine = ((g.value?.data as { grale?: { engine?: Record<string, unknown> } } | undefined)?.grale?.engine ?? {}) as Record<string, unknown>;
  const layoutOptions: Record<string, string> = {
    'elk.algorithm': String(engine.algorithm ?? 'layered'),
    'elk.direction': directionOf(g.value?.rankdir),
  };
  // graph-level edgeRouting (spec §"Edge routing"); data.grale.engine overrides
  const routing = engine.edgeRouting ?? g.value?.edgeRouting;
  if (routing) layoutOptions['elk.edgeRouting'] = String(routing).toUpperCase();
  if (typeof g.value?.nodesep === 'number') layoutOptions['elk.spacing.nodeNode'] = String(g.value.nodesep);
  if (typeof g.value?.ranksep === 'number') layoutOptions['elk.layered.spacing.nodeNodeBetweenLayers'] = String(g.value.ranksep);
  // arbitrary ELK options: either as a `layoutOptions` map, or as raw `elk.*` keys
  for (const [k, val] of Object.entries(engine)) if (k.startsWith('elk.') || k.startsWith('org.eclipse.elk.')) layoutOptions[k] = String(val);
  if (engine.layoutOptions && typeof engine.layoutOptions === 'object') for (const [k, val] of Object.entries(engine.layoutOptions as Record<string, unknown>)) layoutOptions[k] = String(val);
  if (g.options?.compound) layoutOptions['elk.hierarchyHandling'] = 'INCLUDE_CHILDREN';

  const byId = new Map<string, ElkN>();
  for (const n of g.nodes ?? []) {
    const en: ElkN = { id: n.v, width: n.value?.width ?? 40, height: n.value?.height ?? 30 };
    // grale ports (slot counts per side) -> fixed-order ELK ports. grale's CCW
    // ring (top: right->left, left: top->bottom, bottom: left->right,
    // right: bottom->top) maps to ELK's clockwise index (top-left start,
    // sides top,right,bottom,left) by reversing each side's slots.
    const ports = n.value?.ports;
    if (ports) {
      const counts = { top: ports.top ?? 0, right: ports.right ?? 0, bottom: ports.bottom ?? 0, left: ports.left ?? 0 };
      const cwBase = { top: 0, right: counts.top, bottom: counts.top + counts.right, left: counts.top + counts.right + counts.bottom };
      en.ports = [];
      for (const side of ['top', 'right', 'bottom', 'left'] as const)
        for (let i = 0; i < counts[side]; i++)
          en.ports.push({ id: portId(n.v, side, i), width: 1, height: 1, layoutOptions: { 'elk.port.side': SIDE_ELK[side], 'elk.port.index': String(cwBase[side] + (counts[side] - 1 - i)) } });
      en.layoutOptions = { 'elk.portConstraints': 'FIXED_ORDER' };
    }
    byId.set(n.v, en);
  }
  const roots: ElkN[] = [];
  for (const n of g.nodes ?? []) {
    const en = byId.get(n.v)!;
    const parent = n.parent && byId.has(n.parent) ? byId.get(n.parent)! : null;
    if (parent) (parent.children ??= []).push(en);
    else roots.push(en);
  }

  // a valid port ref (declared side + in-range index) attaches the edge end to
  // the port; anything else falls back to the node centre (BAD_PORT is warned
  // by inspectRequest).
  const portCounts = new Map((g.nodes ?? []).map((n) => [n.v, n.value?.ports]));
  const endId = (node: string, ref: { side: 'top' | 'left' | 'bottom' | 'right'; index: number } | undefined): string =>
    ref && ref.index >= 0 && ref.index < (portCounts.get(node)?.[ref.side] ?? 0) ? portId(node, ref.side, ref.index) : node;

  const edges: ElkE[] = [];
  (g.edges ?? []).forEach((e, i) => {
    if (!byId.has(e.v) || !byId.has(e.w)) return; // dangling: warned by inspectRequest, echoed without points
    const ee: ElkE = { id: e.id ?? `__e${i}`, sources: [endId(e.v, e.value?.fromPort)], targets: [endId(e.w, e.value?.toPort)] };
    // weight = importance: higher-weight edges are kept shorter/straighter.
    // Mapped to ELK's layered priorities; the non-constraining weight 0 has no
    // ELK equivalent and stays flagged UNSUPPORTED ('weight0').
    const w = e.value?.weight;
    if (typeof w === 'number' && w > 0 && w !== 1) {
      const p = String(Math.max(1, Math.round(w)));
      ee.layoutOptions = { 'elk.layered.priority.direction': p, 'elk.layered.priority.straightness': p };
    }
    edges.push(ee);
  });

  // decompose each hyperedge: dummy hub + one simple edge per endpoint
  const hypers: HyperPlan[] = [];
  (g.hyperedges ?? []).forEach((he, hi) => {
    const hub = `__hub${hi}`;
    const arms: Arm[] = [];
    (he.endpoints ?? []).forEach((ep, k) => {
      if (!byId.has(ep.node)) return; // dangling endpoint: warned by inspectRequest
      const edgeId = `__h${hi}_${k}`;
      edges.push({ id: edgeId, sources: [hub], targets: [endId(ep.node, ep.port)] });
      arms.push({ edgeId, node: ep.node, marker: ep.marker });
    });
    if (arms.length) { roots.push({ id: hub, width: 6, height: 6 }); hypers.push({ hub, arms }); }
  });

  return { root: { id: 'root', layoutOptions, children: roots, edges }, layoutOptions, hypers };
}

function applyElk(g: graleGraph, res: ElkN, plan: { warnings: Warning[]; hypers: HyperPlan[] }, micros: number): graleGraph {
  const abs = new Map<string, { x: number; y: number; w: number; h: number }>();
  const walk = (node: ElkN, ox: number, oy: number) => {
    for (const c of node.children ?? []) {
      const ax = ox + (c.x ?? 0), ay = oy + (c.y ?? 0);
      abs.set(c.id, { x: ax, y: ay, w: c.width ?? 0, h: c.height ?? 0 });
      walk(c, ax, ay);
    }
  };
  walk(res, 0, 0);

  for (const n of g.nodes ?? []) {
    const a = abs.get(n.v); if (!a) continue;
    const v = (n.value ??= {});
    v.x = a.x + a.w / 2; v.y = a.y + a.h / 2;
    if (v.width == null) v.width = a.w;
    if (v.height == null) v.height = a.h;
  }

  const elkEdges = new Map<string, ElkE>();
  for (const ee of res.edges ?? []) elkEdges.set(ee.id, ee);
  const armPolyline = (edgeId: string): Pt[] => {
    const ee = elkEdges.get(edgeId);
    if (!ee?.sections?.length) return [];
    const pts: Pt[] = [];
    for (const sec of ee.sections) pts.push(sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint);
    return pts;
  };

  (g.edges ?? []).forEach((e, i) => {
    const v = (e.value ??= {});
    if (v.hidden) return; // hidden: constrained the layout, but draw nothing
    const pts = armPolyline(e.id ?? `__e${i}`);
    if (pts.length) v.points = pts;
  });

  // recombine hyperedge arms into a tree (branch at the hub, endpoints at nodes)
  (g.hyperedges ?? []).forEach((he, hi) => {
    const plan_i = plan.hypers.find((_, idx) => plan.hypers[idx]?.hub === `__hub${hi}`);
    const hubAbs = abs.get(`__hub${hi}`);
    const v = (he.value ??= {});
    if (v.hidden || !plan_i || !hubAbs) return;
    const branch: Pt = { x: hubAbs.x + hubAbs.w / 2, y: hubAbs.y + hubAbs.h / 2 };
    const points: HyperedgePoint[] = [{ kind: 'branch', x: branch.x, y: branch.y }];
    const segments: HyperedgeSegment[] = [];
    const seg = (i: number, j: number) => segments.push({ ends: [i, j], normals: [normalAngle(points[i], points[j]), normalAngle(points[j], points[i])] });
    for (const arm of plan_i.arms) {
      let line = armPolyline(arm.edgeId);                 // hub-side → endpoint-side
      if (line.length && line[0] && Math.hypot(line[0].x - branch.x, line[0].y - branch.y) < 1) line = line.slice(1); // drop near-hub start
      let prev = 0;                                       // branch index
      for (let k = 0; k < line.length - 1; k++) { points.push({ kind: 'bend', x: line[k].x, y: line[k].y }); seg(prev, points.length - 1); prev = points.length - 1; }
      const end = line[line.length - 1] ?? branch;
      points.push({ kind: 'endpoint', x: end.x, y: end.y, node: arm.node, ...(arm.marker ? { marker: arm.marker } : {}) });
      seg(prev, points.length - 1);
    }
    v.tree = { points, segments };
    v.x = branch.x; v.y = branch.y;
  });

  g.value = { ...(g.value ?? {}), width: res.width ?? g.value?.width, height: res.height ?? g.value?.height };
  g.diagnostics = { elapsedMicros: micros, warnings: plan.warnings };
  return g;
}

/** Lay out a grale graph with elk.js. Exported so the eval app can run it in a
 * worker thread without spawning a subprocess. */
export async function layout(g: graleGraph): Promise<graleGraph> {
  const out = structuredClone(g); // layout MUST NOT mutate its argument
  const warnings = inspectRequest('grale-elk', out, IGNORED);
  const { root, layoutOptions, hypers } = buildElk(out);
  const elk = new (ELK as unknown as { new (): { layout(n: ElkN, a?: { layoutOptions?: Record<string, string> }): Promise<ElkN> } })();
  const t0 = process.hrtime.bigint();
  const res = await elk.layout(root, { layoutOptions });
  const micros = Number(process.hrtime.bigint() - t0) / 1e3;
  return applyElk(out, res, { warnings, hypers }, micros);
}

if (isMain(import.meta.url)) runEngineCli('grale-elk', layout);
