export const WEB_PORTS = new Set([80, 443]);

/** True when every port of the endpoint is HTTP/HTTPS (URL-filterable). */
export const isWeb = (e) => e.ports.length > 0 && e.ports.every((p) => WEB_PORTS.has(p));

/** Terraform-safe identifier / name fragment. */
export function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'x';
}

export const q = (s) => JSON.stringify(String(s));

export const list = (items, indent = 4) =>
  items.length ? `[\n${items.map((i) => `${' '.repeat(indent)}${i},`).join('\n')}\n${' '.repeat(indent - 2)}]` : '[]';

/** Firewalls only accept whole-label wildcards: "azgn*.x.com" becomes "*.x.com" (slightly broader). */
export const wholeLabelWildcard = (host) => host.replace(/^[^.]*\*[^.]*(?=\.)/, '*');

export const unique = (a) => [...new Set(a)];

/**
 * Renders attribute lines the way `terraform fmt` does: `=` is aligned within runs of
 * consecutive single-line attributes; a multi-line value ends the run and is not padded.
 */
export function attrs(indent, entries) {
  const pad = ' '.repeat(indent);
  const lines = [];
  let run = [];
  const flush = () => {
    const w = Math.max(...run.map(([k]) => k.length));
    run.forEach(([k, v]) => lines.push(`${pad}${k.padEnd(w)} = ${v}`));
    run = [];
  };
  for (const [k, v] of entries) {
    if (String(v).includes('\n')) { flush(); lines.push(`${pad}${k} = ${v}`); } else run.push([k, v]);
  }
  if (run.length) flush();
  return lines.join('\n');
}

export function defaults(options = {}) {
  return {
    prefix: options.prefix ?? 'azlocal',
    sourceZone: options.sourceZone ?? 'trust',
    destinationZone: options.destinationZone ?? 'untrust',
    sourceAddress: options.sourceAddress ?? 'any',
    scope: options.scope ?? '',
    dataUpdated: options.dataUpdated ?? '',
    fetched: options.fetched ?? '',
    sourceUrl: options.sourceUrl ?? ''
  };
}

/** Provenance as a Terraform comment block: data date, fetch time, source and a caveat. */
export function provenanceComment(o) {
  const when = [o.dataUpdated && `Data last updated: ${o.dataUpdated}`, o.fetched && `fetched ${o.fetched}`].filter(Boolean).join(' · ');
  return [
    when && `# ${when}`,
    o.sourceUrl && `# Data source: ${o.sourceUrl}`,
    '# Endpoints can vary by Azure Local version; the official Microsoft documentation is authoritative.'
  ].filter(Boolean).join('\n');
}

/** Short text for provider description/comment attributes (kept well under common length limits). */
export function descr(o, what) {
  const label = o.scope ? ` (${o.scope})` : '';
  return `${what}${label}${o.dataUpdated ? `, data updated ${o.dataUpdated}` : ''}`;
}

/** Distinct (protocol, port) groups of non-web endpoints. */
export function nonWebGroups(endpoints) {
  const groups = new Map();
  for (const e of endpoints) {
    if (isWeb(e) || e.ports.length === 0) continue;
    for (const port of e.ports) {
      const key = `${e.protocol}-${port}`;
      if (!groups.has(key)) groups.set(key, { protocol: e.protocol, port, endpoints: [] });
      groups.get(key).endpoints.push(e);
    }
  }
  return [...groups.values()].sort((a, b) => a.port - b.port);
}
