#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { loadScopes, findScope } from './endpoints.js';
import { generators, getGenerator } from './generators/index.js';

const HELP = `azlocal-endpoints - browse Azure Local endpoints and generate firewall Terraform

Usage:
  node src/cli.js scopes                        List regions and OEM vendors
  node src/cli.js vendors                       List firewall generators
  node src/cli.js list <scope> [options]        List endpoints of a scope (e.g. westeurope, dell)
  node src/cli.js generate <vendor> <scope> [options]

Options:
  -s, --search <text>     Filter by text in URL, component or notes
  -p, --port <n>          Filter by port
  -r, --required <text>   Filter by requiredFor (e.g. Deployment)
      --json              Output JSON (list)
      --prefix <name>     Resource name prefix (default azlocal)
      --action <a>        allow | deny (default allow)
      --source-zone <z>   Source zone (default trust)
      --dest-zone <z>     Destination zone (default untrust)
      --source-address <a> Source address/object (default any)
  -o, --out <dir>         Write generated files to a directory instead of stdout
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    search: { type: 'string', short: 's' },
    port: { type: 'string', short: 'p' },
    required: { type: 'string', short: 'r' },
    json: { type: 'boolean' },
    prefix: { type: 'string' },
    action: { type: 'string' },
    'source-zone': { type: 'string' },
    'dest-zone': { type: 'string' },
    'source-address': { type: 'string' },
    out: { type: 'string', short: 'o' },
    help: { type: 'boolean', short: 'h' }
  }
});

const fail = (msg) => { console.error(msg); process.exit(1); };

export function filterEndpoints(endpoints, { search, port, required }) {
  const s = search?.toLowerCase();
  return endpoints.filter((e) =>
    (!s || `${e.url} ${e.component} ${e.notes}`.toLowerCase().includes(s)) &&
    (!port || e.ports.includes(Number(port))) &&
    (!required || e.requiredFor.some((r) => r.toLowerCase().includes(required.toLowerCase()))));
}

function pickScope(scopes, name) {
  if (!name) fail('Missing <scope>. Run "scopes" to see the options.');
  return findScope(scopes, name) ?? fail(`Unknown scope "${name}".`);
}

const [cmd, ...rest] = positionals;
if (!cmd || values.help) {
  console.log(HELP);
} else if (cmd === 'scopes') {
  const scopes = loadScopes();
  console.table(scopes.map(({ type, name, updated, count }) => ({ type, name, updated, endpoints: count })));
} else if (cmd === 'vendors') {
  generators.forEach((g) => console.log(`${g.id.padEnd(12)} ${g.name} - ${g.description}`));
} else if (cmd === 'list') {
  const scope = pickScope(loadScopes(), rest[0]);
  const eps = filterEndpoints(scope.endpoints, values);
  if (values.json) {
    console.log(JSON.stringify(eps, null, 2));
  } else {
    console.table(eps.map((e) => ({
      id: e.id, component: e.component, endpoint: e.url, port: e.ports.join(','),
      required: e.requiredFor.join('/'), wildcard: e.wildcard ? 'yes' : ''
    })));
    console.log(`${eps.length} of ${scope.count} endpoints (${scope.type}/${scope.name}, updated ${scope.updated})`);
  }
} else if (cmd === 'generate') {
  const gen = getGenerator(rest[0]) ?? fail(`Unknown vendor "${rest[0]}". Available: ${generators.map((g) => g.id).join(', ')}`);
  const scope = pickScope(loadScopes(), rest[1]);
  const files = gen.generate(filterEndpoints(scope.endpoints, values), {
    prefix: values.prefix, action: values.action, sourceZone: values['source-zone'],
    destinationZone: values['dest-zone'], sourceAddress: values['source-address'], scope: scope.name
  });
  if (values.out) {
    mkdirSync(values.out, { recursive: true });
    for (const f of files) {
      writeFileSync(join(values.out, f.filename), f.content);
      console.error(`Wrote ${join(values.out, f.filename)}`);
    }
  } else {
    files.forEach((f) => console.log(f.content));
  }
} else {
  fail(`Unknown command "${cmd}".\n\n${HELP}`);
}
