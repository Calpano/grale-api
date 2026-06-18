#!/usr/bin/env node
/**
 * grale-to-svg — convert a grale result JSON (`*.out.json`) to an SVG file.
 *
 *   grale-to-svg <input.json> [-o out.svg] [--watch] [--debug] [--padding N]
 *
 * In `--watch` mode it re-renders whenever the input changes; a parse/render
 * error is reported and watching continues.
 */
import { readFileSync, writeFileSync, watch } from 'node:fs';
import { renderSvg, type RenderOptions } from './render/index.js';
import type { graleGraph } from '../api/types.js';

interface Args extends RenderOptions {
  input: string;
  output: string;
  watch: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { input: '', output: '', watch: false, help: false, debug: false, padding: 24 };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    switch (t) {
      case '-w': case '--watch': a.watch = true; break;
      case '-d': case '--debug': a.debug = true; break;
      case '-h': case '--help': a.help = true; break;
      case '-o': case '--output': a.output = argv[++i] ?? ''; break;
      case '--padding': a.padding = Number(argv[++i]); break;
      case '--bg': case '--background': a.background = argv[++i]; break;
      default:
        if (t.startsWith('-')) { console.error(`unknown option: ${t}`); process.exit(2); }
        else if (!a.input) a.input = t;
    }
  }
  return a;
}

const USAGE = `grale-to-svg — render a grale result JSON to SVG

Usage:
  grale-to-svg <input.json> [options]

Options:
  -o, --output <file>   output path (default: input with .json -> .svg)
  -w, --watch           re-render on input changes
  -d, --debug           draw debug overlays (waypoints, normals, crossings, warnings)
      --padding <px>    margin around the layout (default 24)
      --bg <color>      background fill, or "none" (default #ffffff)
  -h, --help            show this help
`;

const stamp = (): string => new Date().toLocaleTimeString();

function build(input: string, output: string, opts: RenderOptions): void {
  const graph = JSON.parse(readFileSync(input, 'utf8')) as graleGraph;
  const svg = renderSvg(graph, opts);
  writeFileSync(output, svg);
  const warns = graph.diagnostics?.warnings?.length ?? 0;
  console.log(`[${stamp()}] wrote ${output} (${svg.length} bytes${warns ? `, ${warns} warning(s)` : ''})`);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.input) { process.stdout.write(USAGE); process.exit(args.input ? 0 : 1); }
  const output = args.output || args.input.replace(/\.json$/i, '') + '.svg';
  const opts: RenderOptions = { debug: args.debug, padding: args.padding, background: args.background };

  const safeBuild = () => {
    try { build(args.input, output, opts); }
    catch (e) { console.error(`[${stamp()}] error: ${e instanceof Error ? e.message : String(e)}`); }
  };

  if (!args.watch) {
    try { build(args.input, output, opts); }
    catch (e) { console.error(`error: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); }
    return;
  }

  safeBuild();
  console.log(`[${stamp()}] watching ${args.input} … (Ctrl-C to stop)`);
  let timer: NodeJS.Timeout | null = null;
  watch(args.input, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(safeBuild, 50); // debounce editor multi-fire
  });
}

main();
