#!/usr/bin/env node
/**
 * grale-dagre — dagre as a grale engine CLI.
 *
 * Reads grale JSON on stdin (or from a file path argument) and writes the
 * laid-out grale JSON on stdout, exactly like the elk adapter. The grale-eval
 * runner has dagre built in (in-process) for speed; this CLI runs the *same*
 * layout as a subprocess so the runtime column can show the spawn/startup cost
 * on equal footing with external engines (e.g. cale).
 *
 * Pure layout time is reported in `diagnostics.elapsedMicros` (µs), matching the
 * grale spec, so the runner can record an apples-to-apples algorithm time that
 * excludes process spawn, parse, and serialise.
 *
 * Contract notes (see `engine-common.ts` for the shared plumbing):
 * - grale features dagre has no notion of (pins, ports, markers, stability,
 *   hyperedges, …) are accepted and echoed, each with an `UNSUPPORTED` warning;
 * - a `hidden` edge still constrains the layout but its computed `points` are
 *   stripped (spec: a hidden edge gets none);
 * - dangling edges are echoed without `points` and flagged `DANGLING_EDGE`
 *   (graphlib would otherwise silently invent the missing nodes).
 */
import dagre from '@dagrejs/dagre';
import type { graleGraph } from '../types.js';
import { inspectRequest, isMain, runEngineCli } from './engine-common.js';

const DAGRE_OPTS = ['rankdir', 'align', 'nodesep', 'edgesep', 'ranksep', 'marginx', 'marginy', 'acyclicer', 'ranker'] as const;

/** grale features dagre ignores — echoed, warned about, never honoured. */
const IGNORED = ['pinned', 'ports', 'markers', 'stability', 'prevLayouts', 'focus', 'edgeRouting', 'prefDir', 'fromPort', 'toPort', 'lineWidth', 'startMarker', 'endMarker', 'visualDebug', 'hyperedges', 'weight0'] as const;

/** Lay out a grale graph with dagre (in-process). Exported so the eval app can
 * run it in a worker thread without spawning a subprocess. */
export function layout(input: graleGraph): graleGraph {
  const out = structuredClone(input);
  const warnings = inspectRequest('grale-dagre', out, IGNORED);

  // ensure every element has a label object; dagre writes results into these
  // same objects (shared references), so `out` picks them up automatically.
  const gl = (out.value ??= {}) as Record<string, unknown>;
  for (const n of out.nodes ?? []) n.value ??= {};
  for (const e of out.edges ?? []) e.value ??= {};

  // honour dagre options passed via the run config (value.data.grale.engine.*)
  const ge = (out.value as { data?: { grale?: { engine?: Record<string, unknown> } } }).data?.grale?.engine;
  if (ge) for (const k of DAGRE_OPTS) if (ge[k] != null) gl[k] = ge[k];

  // keep dangling edges away from graphlib (it would auto-create the nodes)
  const ids = new Set((out.nodes ?? []).map((n) => n.v));
  const layoutable = (out.edges ?? []).filter((e) => ids.has(e.v) && ids.has(e.w));

  const g = dagre.graphlib.json.read({ ...out, edges: layoutable });
  const t = process.hrtime.bigint();
  dagre.layout(g);
  const elapsedMicros = Number(process.hrtime.bigint() - t) / 1e3;

  // spec: a hidden edge constrains the layout but gets no output points
  for (const e of out.edges ?? []) if (e.value?.hidden) delete e.value.points;

  out.diagnostics = { elapsedMicros, warnings };
  return out;
}

if (isMain(import.meta.url)) runEngineCli('grale-dagre', layout);
