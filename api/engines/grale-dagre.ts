/**
 * grale-dagre — dagre as a grale engine CLI.
 *
 * Reads grale JSON on stdin (or from a file path argument) and writes the
 * laid-out grale JSON on stdout, exactly like the elk adapter. The runner has
 * dagre built in (in-process) for speed; this CLI runs the *same* layout as a
 * subprocess so the runtime column can show the spawn/startup cost on equal
 * footing with external engines (e.g. JVM-based cale).
 *
 * Pure layout time is reported in `diagnostics.elapsedMicros` (µs), matching the
 * grale spec, so the runner can record an apples-to-apples algorithm time that
 * excludes process spawn, parse, and serialise.
 */
import dagre from '@dagrejs/dagre';
import { readFileSync } from 'node:fs';
import type { graleGraph } from '../types';

const DAGRE_OPTS = ['rankdir', 'align', 'nodesep', 'edgesep', 'ranksep', 'marginx', 'marginy', 'acyclicer', 'ranker'] as const;

function layout(input: graleGraph): graleGraph {
  const g = dagre.graphlib.json.read(structuredClone(input));
  const gl = (g.graph() ?? {}) as Record<string, unknown>;
  // honour dagre options passed via the run config (value.meta.engine.*)
  const ge = (input.value as { meta?: { engine?: Record<string, unknown> } } | undefined)?.meta?.engine;
  if (ge) for (const k of DAGRE_OPTS) if (ge[k] != null) gl[k] = ge[k];
  g.setGraph(gl);
  for (const v of g.nodes()) if (!g.node(v)) g.setNode(v, {});
  for (const e of g.edges()) if (!g.edge(e)) g.setEdge(e, {});
  const t = process.hrtime.bigint();
  dagre.layout(g);
  const elapsedMicros = Number(process.hrtime.bigint() - t) / 1e3;
  const out = dagre.graphlib.json.write(g) as graleGraph;
  out.diagnostics = { elapsedMicros, warnings: [] };
  return out;
}

function main(): void {
  const arg = process.argv[2];
  const text = arg && !arg.startsWith('-') ? readFileSync(arg, 'utf8') : readFileSync(0, 'utf8');
  const out = layout(JSON.parse(text) as graleGraph);
  process.stdout.write(JSON.stringify(out));
}

main();
