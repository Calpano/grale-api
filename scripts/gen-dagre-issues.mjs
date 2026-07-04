#!/usr/bin/env node
/**
 * Regenerate `api/doc/dagre-issues.adoc` — the snapshot of open dagre issues
 * that motivated the grale additions — from the live GitHub API, so the doc
 * can be refreshed by script instead of by hand.
 *
 *   node scripts/gen-dagre-issues.mjs                 # rewrite api/doc/dagre-issues.adoc
 *   node scripts/gen-dagre-issues.mjs -o out.adoc     # write elsewhere
 *   GITHUB_TOKEN=… node scripts/gen-dagre-issues.mjs  # authenticated (higher rate limit)
 *
 * Shape matches the existing document: abstract with the issue count, a label
 * distribution table, then one section per issue sorted by comment count
 * (engagement proxy), body verbatim in a literal block, truncated when long.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = process.env.DAGRE_REPO ?? 'dagrejs/dagre';
const MAX_BODY = 4000; // chars of verbatim body kept per issue
const outArg = process.argv.indexOf('-o');
const OUT = outArg > -1 ? process.argv[outArg + 1] : join(dirname(fileURLToPath(import.meta.url)), '..', 'api', 'doc', 'dagre-issues.adoc');

async function fetchAllOpenIssues() {
  const issues = [];
  for (let page = 1; ; page++) {
    const res = await fetch(`https://api.github.com/repos/${REPO}/issues?state=open&per_page=100&page=${page}`, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'grale-api gen-dagre-issues',
        ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
    const batch = await res.json();
    issues.push(...batch.filter((i) => !i.pull_request)); // /issues also returns PRs
    if (batch.length < 100) return issues;
  }
}

const day = (iso) => (iso ?? '').slice(0, 10);

/** Body as a safe AsciiDoc literal block: a line of only dots would terminate
 * the `....` block early, so it is defused; long bodies are truncated. */
function literalBody(body) {
  let text = (body ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) return '_no body_';
  if (text.length > MAX_BODY) text = text.slice(0, MAX_BODY) + '\n[… truncated …]';
  text = text.replace(/^\.{4,}$/gm, (m) => `​${m}`);
  return `....\n${text}\n....`;
}

const issues = (await fetchAllOpenIssues()).sort((a, b) => b.comments - a.comments || a.number - b.number);

const labelCounts = new Map();
for (const i of issues) for (const l of i.labels ?? []) labelCounts.set(l.name, (labelCounts.get(l.name) ?? 0) + 1);
const labelRows = [...labelCounts.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => `| \`${name}\` | ${n}`).join('\n\n');

const sections = issues.map((i) => {
  const labels = (i.labels ?? []).map((l) => `\`${l.name}\``).join(' ') || '_none_';
  return `[[issue-${i.number}]]
=== #${i.number} — ${i.title.trim()}

${labels} | comments: ${i.comments} | created: ${day(i.created_at)} | ${i.html_url}

${literalBody(i.body)}
`;
});

const doc = `= dagre — open issues (snapshot)
Dr. Max Völkel <mv@maxvoelkel.de>
:revdate: ${day(new Date().toISOString())}
:toc: left
:toclevels: 2

[abstract]
Snapshot of all ${issues.length} open issues in https://github.com/${REPO}[${REPO}], pulled for design inspiration for \`xref:graph-layout-api.adoc[grale]\`. Sorted by comment count (engagement proxy). Bodies are verbatim; long ones truncated. Regenerate with \`npm run gen:dagre-issues\`.

== Label distribution

[cols="3,1",frame=ends]
|===
| Label | Count

${labelRows}
|===

== Issues

${sections.join('\n')}`;

writeFileSync(OUT, doc);
console.log(`wrote ${OUT} (${issues.length} issues, ${doc.length} bytes)`);
