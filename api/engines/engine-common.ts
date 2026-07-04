/**
 * Shared plumbing for the engine adapters (`grale-dagre`, `grale-elk`).
 *
 * Two concerns live here:
 *
 * 1. The *process contract* boilerplate (`doc/engine-contract.adoc`): read the
 *    request from stdin or a file-path argument, write the result to stdout,
 *    errors to stderr, exit non-zero on failure.
 * 2. Request *diagnostics* every adapter owes the caller: `UNKNOWN_FIELD`,
 *    `DANGLING_EDGE`, `PINNED_NO_COORDS`, and one aggregated warning per grale
 *    feature the adapter accepts-and-echoes without honouring (the engine
 *    contract's "ideally with a diagnostics warning").
 */
import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { graleGraph, Layout, Warning } from '../types.js';

// --- process contract -------------------------------------------------------

/**
 * True when `metaUrl` (pass `import.meta.url`) is the directly executed
 * script — not an import (e.g. by a worker thread). `realpathSync` resolves
 * symlinks (`node_modules/grale-api` is a symlink) so the invoked path matches
 * `import.meta.url`, which Node reports as the real path.
 */
export const isMain = (metaUrl: string): boolean =>
  !!process.argv[1] && metaUrl === pathToFileURL(realpathSync(process.argv[1])).href;

/** Run a layout as a stdin→stdout (or file-arg) CLI per the engine contract. */
export function runEngineCli(name: string, layout: Layout): void {
  const arg = process.argv[2];
  const text = arg && !arg.startsWith('-') ? readFileSync(arg, 'utf8') : readFileSync(0, 'utf8');
  Promise.resolve(layout(JSON.parse(text) as graleGraph))
    .then((out) => process.stdout.write(JSON.stringify(out)))
    .catch((e) => {
      process.stderr.write(`${name}: ${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(1);
    });
}

// --- request diagnostics -----------------------------------------------------

// Every field the spec defines per label, inputs and outputs alike. Anything
// else (outside `data`) is an UNKNOWN_FIELD — likely a typo (spec §diagnostics).
const GRAPH_FIELDS = new Set(['rankdir', 'align', 'nodesep', 'edgesep', 'ranksep', 'marginx', 'marginy', 'acyclicer', 'ranker', 'width', 'height', 'stability', 'prevLayouts', 'focus', 'cornerRadius', 'edgeRouting', 'markers', 'logLevel', 'visualDebug', 'data']);
const NODE_FIELDS = new Set(['width', 'height', 'x', 'y', 'pinned', 'ports', 'zIndex', 'data']);
const EDGE_FIELDS = new Set(['minlen', 'weight', 'width', 'height', 'labelpos', 'labeloffset', 'points', 'x', 'y', 'prefDir', 'hidden', 'lineWidth', 'fromPort', 'toPort', 'startMarker', 'endMarker', 'zIndex', 'normals', 'crossings', 'data']);
const HYPEREDGE_FIELDS = new Set(['minlen', 'weight', 'hidden', 'lineWidth', 'prefDir', 'labelpos', 'labeloffset', 'zIndex', 'data', 'tree', 'x', 'y']);

/**
 * Inspect a request and return the diagnostics `warnings` an adapter owes:
 *
 * - `UNKNOWN_FIELD` — a label field the spec does not define (one warning per
 *   distinct field name; intentional passthrough belongs under `data`);
 * - `DANGLING_EDGE` — an edge / hyperedge endpoint referencing a missing node;
 * - `PINNED_NO_COORDS` — `pinned: true` without `x`/`y` (only when the engine
 *   honours pins, i.e. `'pinned'` is not in `ignored`);
 * - one aggregated warning per `ignored` feature that the request actually
 *   uses. Feature names are label field names, plus the pseudo-features
 *   `'hyperedges'` (the array is present and non-empty) and `'weight0'`
 *   (an edge declares the non-constraining `weight: 0`).
 */
export function inspectRequest(engine: string, g: graleGraph, ignored: readonly string[]): Warning[] {
  const warnings: Warning[] = [];
  const ignore = new Set(ignored);
  const nodeIds = new Set((g.nodes ?? []).map((n) => n.v));

  // unknown fields, one warning per distinct name
  const unknown = new Map<string, number>();
  const scan = (label: Record<string, unknown> | undefined, known: Set<string>, where: string) => {
    for (const k of Object.keys(label ?? {})) if (!known.has(k)) unknown.set(`${where}.${k}`, (unknown.get(`${where}.${k}`) ?? 0) + 1);
  };
  scan(g.value as Record<string, unknown> | undefined, GRAPH_FIELDS, 'graph');
  for (const n of g.nodes ?? []) scan(n.value as Record<string, unknown> | undefined, NODE_FIELDS, 'node');
  for (const e of g.edges ?? []) scan(e.value as Record<string, unknown> | undefined, EDGE_FIELDS, 'edge');
  for (const he of g.hyperedges ?? []) scan(he.value as Record<string, unknown> | undefined, HYPEREDGE_FIELDS, 'hyperedge');
  for (const [key, count] of unknown) {
    const [where, field] = key.split('.');
    warnings.push({ code: 'UNKNOWN_FIELD', message: `${count}× unknown ${where} label field '${field}' — ignored (put passthrough data under 'data')` });
  }

  // dangling references
  for (const e of g.edges ?? []) {
    const missing = [e.v, e.w].filter((id) => !nodeIds.has(id));
    if (missing.length) warnings.push({ code: 'DANGLING_EDGE', message: `edge ${e.v}->${e.w} references missing node(s) ${missing.map((m) => `'${m}'`).join(', ')}`, edge: { v: e.v, w: e.w, ...(e.name ? { name: e.name } : {}) } });
  }
  for (const he of g.hyperedges ?? [])
    for (const ep of he.endpoints ?? [])
      if (!nodeIds.has(ep.node)) warnings.push({ code: 'DANGLING_EDGE', message: `hyperedge${he.id ? ` '${he.id}'` : ''} endpoint references missing node '${ep.node}'`, node: ep.node });

  // pins without coordinates (only meaningful when pins are honoured)
  if (!ignore.has('pinned'))
    for (const n of g.nodes ?? [])
      if (n.value?.pinned && (n.value.x == null || n.value.y == null))
        warnings.push({ code: 'PINNED_NO_COORDS', message: `node '${n.v}' is pinned but has no x/y — pin ignored`, node: n.v });

  // accepted-but-not-honoured features, aggregated per feature
  const uses = (feature: string): number => {
    if (feature === 'hyperedges') return g.hyperedges?.length ?? 0;
    if (feature === 'weight0') return (g.edges ?? []).filter((e) => e.value?.weight === 0).length;
    let count = 0;
    if ((g.value as Record<string, unknown> | undefined)?.[feature] != null) count++;
    for (const n of g.nodes ?? []) if ((n.value as Record<string, unknown> | undefined)?.[feature] != null) count++;
    for (const e of g.edges ?? []) if ((e.value as Record<string, unknown> | undefined)?.[feature] != null) count++;
    for (const he of g.hyperedges ?? []) if ((he.value as Record<string, unknown> | undefined)?.[feature] != null) count++;
    return count;
  };
  for (const feature of ignored) {
    const n = uses(feature);
    if (n > 0) warnings.push({ code: 'UNSUPPORTED', message: `${n}× '${feature}' — not honoured by ${engine}; accepted and echoed` });
  }

  return warnings;
}
